/**
 * Ground tiles of a selected track ride, for the map outline (Build 1 polish; flat rides outline their footprint).
 * Every piece's tiles (the station included) and the entrance and exit gates, in piece order, without repeats.
 * Elevated pieces outline the ground tile under them. Cached per ride data and rebuilt only when the pieces or
 * the gates change, so a selected ride costs no allocations per frame. Reads GameState; never writes it.
 */
import { getTrackPieceDef } from '../../data/track';
import { inBounds, tileIndex } from '../../sim/map';
import { pieceWorldTiles } from '../../sim/rides/track/geometry';
import { troublePlaceOf, type TroublePlace } from '../../sim/rides/track/trouble';
import type { TestResult, TrackPieceInstance, TrackRideData } from '../../sim/rides/track/types';
import type { Ride } from '../../sim/rides/types';
import type { World } from '../../sim/types';

interface Entry {
  pieces: readonly TrackPieceInstance[];
  count: number;
  last: TrackPieceInstance | undefined;
  entrance: number;
  exit: number;
  width: number;
  tiles: readonly number[];
}

const NONE: readonly number[] = Object.freeze([]);
const cache = new WeakMap<TrackRideData, Entry>();

export function trackRideTiles(world: World, ride: Ride): readonly number[] {
  if (ride.kind !== 'track') return NONE;
  const data = world.state.track.rides[String(ride.id)];
  if (!data) return NONE;
  const map = world.state.map;
  const entrance = ride.entrance?.gate ?? -1;
  const exit = ride.exit?.gate ?? -1;
  const last = data.pieces[data.pieces.length - 1];
  const hit = cache.get(data);
  if (
    hit &&
    hit.pieces === data.pieces &&
    hit.count === data.pieces.length &&
    hit.last === last &&
    hit.entrance === entrance &&
    hit.exit === exit &&
    hit.width === map.width
  ) {
    return hit.tiles;
  }
  const seen = new Set<number>();
  for (const p of data.pieces) {
    if (!getTrackPieceDef(p.defId)) continue;
    for (const t of pieceWorldTiles(p)) if (inBounds(map, t.x, t.y)) seen.add(tileIndex(map, t.x, t.y));
  }
  const n = map.width * map.height;
  if (entrance >= 0 && entrance < n) seen.add(entrance);
  if (exit >= 0 && exit < n) seen.add(exit);
  const tiles = Object.freeze([...seen]);
  cache.set(data, { pieces: data.pieces, count: data.pieces.length, last, entrance, exit, width: map.width, tiles });
  return tiles;
}

const troubleCache = new WeakMap<TestResult, { place: TroublePlace | null; tiles: readonly number[] }>();

/**
 * R7 (owner 2026-11-12): the in-map tiles of the trouble piece of the ride's last test (the stall piece, or where the
 * strongest car passed a hard safety limit), for the danger outline while the ride is selected. Cached per stored
 * test result; `[]` when there is none.
 */
export function trackTroubleTiles(world: World, ride: Ride): readonly number[] {
  if (ride.kind !== 'track') return NONE;
  const data = world.state.track.rides[String(ride.id)];
  const test = data?.test;
  if (!data || !test) return NONE;
  const place = troublePlaceOf(world, data);
  const hit = troubleCache.get(test);
  if (hit && hit.place === place) return hit.tiles;
  let tiles: readonly number[] = NONE;
  const piece = place ? data.pieces[place.pieceIndex] : undefined;
  if (piece && getTrackPieceDef(piece.defId)) {
    const map = world.state.map;
    const seen = new Set<number>();
    for (const t of pieceWorldTiles(piece)) if (inBounds(map, t.x, t.y)) seen.add(tileIndex(map, t.x, t.y));
    tiles = Object.freeze([...seen]);
  }
  troubleCache.set(test, { place, tiles });
  return tiles;
}
