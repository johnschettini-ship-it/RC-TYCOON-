/**
 * Path auto-join masks (Phase 1 §7 visuals). Owner: W1-A.
 * Bits: N = 1, E = 2, S = 4, W = 8 (same order as `Dir`).
 */
import { Content, DIR_DX, DIR_DY, type MapState } from '../sim/map';
import type { Ride } from '../sim/rides/types';
import type { Stall } from '../sim/stalls/types';
import { entranceOuterDir } from './fence';

export const JOIN_N = 1;
export const JOIN_E = 2;
export const JOIN_S = 4;
export const JOIN_W = 8;

function findById<T extends { id: number }>(list: readonly T[], id: number): T | undefined {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = list[mid] as T;
    if (v.id === id) return v;
    if (v.id < id) lo = mid + 1;
    else hi = mid - 1;
  }
  // Fall back to a scan if the list is not sorted.
  for (const v of list) if (v.id === id) return v;
  return undefined;
}

function neighbourOf(map: MapState, i: number, d: number): number {
  const w = map.width;
  const x = (i % w) + (DIR_DX[d] as number);
  const y = Math.floor(i / w) + (DIR_DY[d] as number);
  return x >= 0 && y >= 0 && x < w && y < map.height ? y * w + x : -1;
}

/** Is building tile `b` the entrance gate of a ride whose queue starts at `outside`? */
function isEntranceGateFor(map: MapState, b: number, outside: number, rides: readonly Ride[]): boolean {
  const r = findById(rides, map.contentRef[b] as number);
  return !!r && !!r.entrance && r.entrance.gate === b && r.entrance.outside === outside;
}

/** Is building tile `b` a ride exit gate or a stall service side that opens onto `outside`? */
function isExitFor(map: MapState, b: number, outside: number, rides: readonly Ride[], stalls: readonly Stall[]): boolean {
  const id = map.contentRef[b] as number;
  const r = findById(rides, id);
  if (r) return !!r.exit && r.exit.gate === b && r.exit.outside === outside;
  const s = findById(stalls, id);
  return !!s && s.serviceTile === outside && s.x + s.y * map.width === b;
}

/**
 * Join mask of a queue tile. It joins queue neighbours and its ride's entrance gate. At a free end
 * (at most one other join) it also joins the first footpath neighbour in N, E, S, W order.
 */
function queueMask(map: MapState, i: number, rides: readonly Ride[]): number {
  let mask = 0;
  let joins = 0;
  for (let d = 0; d < 4; d++) {
    const j = neighbourOf(map, i, d);
    if (j < 0) continue;
    const c = map.content[j];
    if (c === Content.Queue || (c === Content.Building && isEntranceGateFor(map, j, i, rides))) {
      mask |= 1 << d;
      joins++;
    }
  }
  if (joins <= 1) {
    for (let d = 0; d < 4; d++) {
      const j = neighbourOf(map, i, d);
      if (j >= 0 && (map.content[j] === Content.Footpath || map.content[j] === Content.ParkEntrance)) {
        mask |= 1 << d;
        break;
      }
    }
  }
  return mask;
}

/** Auto-join mask for a footpath, queue, or park entrance tile (0 for anything else). */
export function pathJoinMask(map: MapState, i: number, rides: readonly Ride[], stalls: readonly Stall[]): number {
  const c = map.content[i];
  if (c === Content.Queue) return queueMask(map, i, rides);
  if (c !== Content.Footpath && c !== Content.ParkEntrance) return 0;
  let mask = 0;
  for (let d = 0; d < 4; d++) {
    const j = neighbourOf(map, i, d);
    if (j < 0) continue;
    const n = map.content[j];
    const back = 1 << ((d + 2) % 4);
    if (n === Content.Footpath || n === Content.ParkEntrance) mask |= 1 << d;
    else if (n === Content.Queue && (queueMask(map, j, rides) & back) !== 0) mask |= 1 << d;
    else if (n === Content.Building && c === Content.Footpath && isExitFor(map, j, i, rides, stalls)) mask |= 1 << d;
  }
  if (c === Content.ParkEntrance) {
    const outer = entranceOuterDir(map);
    if (outer >= 0) mask |= 1 << outer;
  }
  return mask;
}
