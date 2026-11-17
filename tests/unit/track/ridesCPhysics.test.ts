/**
 * New rides batch C physics (docs/superpowers/specs/2026-11-17-new-rides-design.md) on open layouts with one-car
 * trains: the launch drives a gravity train up to its type's launch speed at LAUNCH_ACCEL and never slows a faster
 * train; a type without a launch speed rolls over a launch piece as over a straight; the Log Flume's splashdown on the
 * Water Coaster brakes a coaster boat to 4 m/s as it brakes a log.
 */
import { describe, expect, it } from 'vitest';
import { getTrackTypeDef, type TrackTypeDef } from '../../../src/data/track';
import { DT, LAUNCH_ACCEL, SPLASH_MAX_V } from '../../../src/data/tuning/track';
import { pieceExitJoint } from '../../../src/sim/rides/track/geometry';
import { buildLayout } from '../../../src/sim/rides/track/layout';
import { newTrain, stepTrain, type StepContext } from '../../../src/sim/rides/track/physics';
import type { TrackPieceInstance, TrainState } from '../../../src/sim/rides/track/types';

function lay(ids: string[]): TrackPieceInstance[] {
  const out: TrackPieceInstance[] = [];
  let x = 10;
  let y = 30;
  let z = 20;
  let dir: 0 | 1 | 2 | 3 = 0;
  for (const id of ids) {
    const piece: TrackPieceInstance = { defId: id, x, y, z, dir, chain: false, brakeSpeed: null, cost: 0 };
    out.push(piece);
    const j = pieceExitJoint(piece);
    x = j.x;
    y = j.y;
    z = j.z;
    dir = j.dir;
  }
  return out;
}

function ctxFor(pieces: TrackPieceInstance[], type: TrackTypeDef): StepContext {
  return { layout: buildLayout(pieces), type, pieces, trainLenMm: type.vehicle.carLengthMm, cars: 1, carLenMm: type.vehicle.carLengthMm, laps: 1000, holdFrontMm: null, leader: null, slowFactor: 1 };
}

function trainAt(s: number, vMs: number): TrainState {
  const t = newTrain(1, s, 1, 4);
  t.v = Math.round(vMs * 1000);
  t.state = 'running';
  t.dist = 200_000;
  return t;
}

/** Speed (m/s) when the train's centre reaches `sEnd` mm. */
function speedAt(ctx: StepContext, t: TrainState, sEnd: number): number {
  for (let i = 0; i < 20_000; i++) {
    const r = stepTrain(ctx, t);
    if (r.stall) throw new Error(`stall ${r.stall}`);
    if (t.s >= sEnd) return t.v / 1000;
  }
  throw new Error('did not get there');
}

const LAUNCH = getTrackTypeDef('launch_coaster')!;

describe('launch', () => {
  it('drives the train at LAUNCH_ACCEL: v² = v0² + 2·a·d over the launch, within a tick', () => {
    const pieces = lay(['straight', 'launch', 'launch', 'launch', 'straight', 'straight']);
    const ctx = ctxFor(pieces, LAUNCH);
    const t = trainAt(2000, 2);
    // A one-car train is pushed while its centre is on the launch (4 m to 16 m), 12 m.
    const v = speedAt(ctx, t, 16_000);
    const want = Math.sqrt(4 + 2 * LAUNCH_ACCEL * 12);
    // Friction and drag take a little off (about 0.4 m/s² at 17 m/s); a tick of push may land either side of the end.
    expect(v).toBeGreaterThan(want - 0.5);
    expect(v).toBeLessThan(want + LAUNCH_ACCEL * DT);
  });

  it('stops at the launch speed (32 m/s) and never slows a faster train', () => {
    const pieces = lay(['straight', ...Array<string>(10).fill('launch'), 'straight', 'straight']);
    const ctx = ctxFor(pieces, LAUNCH);
    expect(speedAt(ctx, trainAt(2000, 2), 44_000)).toBe(32);
    const fast = trainAt(2000, 35);
    const v = speedAt(ctxFor(pieces, LAUNCH), fast, 20_000);
    expect(v).toBeGreaterThan(34);
    expect(v).toBeLessThan(35);
  });

  it('a type without a launch speed rolls over a launch piece as over a straight', () => {
    const steel = getTrackTypeDef('steel_coaster')!;
    const a = speedAt(ctxFor(lay(['straight', 'launch', 'launch', 'straight']), steel), trainAt(2000, 10), 14_000);
    const b = speedAt(ctxFor(lay(['straight', 'straight', 'straight', 'straight']), steel), trainAt(2000, 10), 14_000);
    expect(a).toBe(b);
  });
});

describe('splashdown on a rail type (Water Coaster)', () => {
  it('brakes a fast boat to 4 m/s by the end of the splashdown; a slow boat rolls through', () => {
    const wc = getTrackTypeDef('water_coaster')!;
    const pieces = lay(['straight', 'flume_splashdown', 'flume_straight', 'straight']);
    expect(speedAt(ctxFor(pieces, wc), trainAt(2000, 16), 12_000)).toBeLessThanOrEqual(SPLASH_MAX_V);
    const slow = speedAt(ctxFor(pieces, wc), trainAt(2000, 3), 12_000);
    // Under 4 m/s only friction and drag act (as on any rail piece).
    expect(slow).toBeGreaterThan(2);
    expect(slow).toBeLessThan(3);
  });
});
