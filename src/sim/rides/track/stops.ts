/**
 * Extra stations (Phase 6 §4.5 Monorail "up to 4 stations"; master R26: extra stations are stops only). Owner: W4-D.
 *
 * A type with `maxStations > 1` may lay more station runs after the first. The first run keeps the gates: guests board
 * and leave there only. Each later run is a stop: a train on its lap halts with its front 0.5 m before the run's exit
 * joint (like the first station), dwells STOP_DWELL_TICKS, and goes on. No new state: the stop a train is heading for
 * follows from `dist` (travel since dispatch), and a dwelling train is `held` with `dwellTicks` counting. Powered types
 * only (gravity types have one station; their `held` means a block brake).
 */
import { getTrackPieceDef, type TrackTypeDef } from '../../../data/track';
import { STATION_MAX_TILES, STOP_DWELL_TICKS } from '../../../data/tuning/track';
import { TRACK_ERR, fillTrackString } from '../../../data/strings/track';
import type { CircuitLayout } from './layout';
import { stepTrain, type StepContext, type StepResult } from './physics';
import type { TrackPieceInstance, TrainState } from './types';

/** True when this train stops at the layout's extra stations. */
export function usesStops(layout: CircuitLayout, type: TrackTypeDef): boolean {
  return layout.stops.length > 0 && type.drive !== 'gravity' && type.drive !== 'waterCurrent';
}

/**
 * Distance (mm) from the train's front to the next stop it has not served on this lap, or null. A train dwelling at a
 * stop (`held`) gets 0 there.
 */
export function stopHoldMm(layout: CircuitLayout, t: TrainState): number | null {
  for (const p of layout.stops) {
    const d = p - layout.stopFrontMm;
    if (d > t.dist) return d - t.dist;
    if (d === t.dist && t.state === 'held') return 0;
  }
  return null;
}

/**
 * One tick for a train on a circuit with stops: dwell at a stop (null: the train did not move), else step toward the
 * next stop or the first station. `ctx.holdFrontMm` is set here. The live test, the test lap, and operation use it.
 */
export function stepWithStops(ctx: StepContext, layout: CircuitLayout, t: TrainState): StepResult | null {
  if (t.state === 'held') {
    t.dwellTicks++;
    if (t.dwellTicks < STOP_DWELL_TICKS) return null;
    t.state = 'running';
    t.dwellTicks = 0;
  }
  ctx.holdFrontMm = stopHoldMm(layout, t);
  const r = stepTrain(ctx, t);
  if (r.stopped === 'hold') {
    t.state = 'held';
    t.dwellTicks = 0;
  }
  return r;
}

/** Lengths of the station runs of a piece list, in order (a run is a maximal block of station pieces). */
export function stationRunLengths(pieces: readonly TrackPieceInstance[]): number[] {
  const out: number[] = [];
  let run = 0;
  for (const p of pieces) {
    if (getTrackPieceDef(p.defId)?.special === 'station') run++;
    else if (run > 0) {
      out.push(run);
      run = 0;
    }
  }
  if (run > 0) out.push(run);
  return out;
}

/**
 * Why a station piece cannot be added at the track end now, or null. The first run takes up to 12 tiles; a type with
 * `maxStations > 1` may start a new run (up to `maxStations` runs) or lengthen the last one (up to 12 tiles).
 */
export function stationAppendBlock(pieces: readonly TrackPieceInstance[], type: TrackTypeDef): string | null {
  const runs = stationRunLengths(pieces);
  const last = pieces[pieces.length - 1];
  const lastIsStation = last !== undefined && getTrackPieceDef(last.defId)?.special === 'station';
  const allStations = pieces.length === (runs[0] ?? 0);
  if (allStations) return pieces.length >= STATION_MAX_TILES ? TRACK_ERR.doesNotFit : null;
  if (type.maxStations <= 1) return TRACK_ERR.doesNotFit;
  if (lastIsStation) return (runs[runs.length - 1] as number) >= STATION_MAX_TILES ? TRACK_ERR.doesNotFit : null;
  return runs.length >= type.maxStations ? fillTrackString(TRACK_ERR.tooManyStations, { n: type.maxStations }) : null;
}
