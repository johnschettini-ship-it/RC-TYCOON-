/**
 * The trouble place of a ride's last test (R7, owner 2026-11-12; plan ride-work-1 decision 7). Owner: W1-G.
 * Derived on demand, never saved: a failed test's stall piece, or for a passed test the piece where the strongest car
 * first passed a hard safety limit (a deterministic re-run of the lap, cached by the stored result).
 */
import { getTrackTypeDef } from '../../../data/track';
import { inBounds, tileIndex } from '../../map';
import type { World } from '../../types';
import { pieceWorldTiles } from './geometry';
import type { SafetyKind } from './safety';
import { testLapDetail } from './testRun';
import type { TestResult, TrackRideData } from './types';

export interface TroublePlace {
  /** 0-based piece. */
  pieceIndex: number;
  kind: SafetyKind | 'stall';
  /** The piece's first tile inside the map (the message and camera target). */
  tile: number;
  /** The strongest car's value (hundredths) for a safety kind; null for a stall. */
  value: number | null;
}

const places = new WeakMap<TestResult, TroublePlace | null>();

/** First in-map tile of piece `i`, or the first piece's when it has none. */
export function pieceTile(world: World, data: TrackRideData, i: number): number {
  const map = world.state.map;
  for (const pi of [i, 0]) {
    const p = data.pieces[pi];
    if (!p) continue;
    for (const t of pieceWorldTiles(p)) if (inBounds(map, t.x, t.y)) return tileIndex(map, t.x, t.y);
  }
  return 0;
}

/** Trouble place of the ride's stored test: null without a test or when it passed within the limits. */
export function troublePlaceOf(world: World, data: TrackRideData): TroublePlace | null {
  const t = data.test;
  if (!t) return null;
  if (places.has(t)) return places.get(t) ?? null;
  let place: TroublePlace | null = null;
  if (!t.passed) {
    const pieceIndex = Math.max(0, (t.failPiece ?? 1) - 1);
    place = { pieceIndex, kind: 'stall', tile: pieceTile(world, data, pieceIndex), value: null };
  } else {
    const type = getTrackTypeDef(data.typeId);
    const d = type ? testLapDetail(world.state.map, data, type, t) : null;
    if (d?.breach && d.breachPiece !== null) {
      place = { pieceIndex: d.breachPiece, kind: d.breach.kind, tile: pieceTile(world, data, d.breachPiece), value: d.breach.value };
    }
  }
  places.set(t, place);
  return place;
}
