/** Guest draw positions in continuous map coordinates. Owner: W1-A. */
import type { MapState } from '../sim/map';
import type { Guest } from '../sim/guests/types';

/** Phase 1 §8 `GUEST_WALK_TICKS_PER_TILE`. Mirrors the guests tuning value (W1-D) for interpolation only. */
export const GUEST_WALK_TICKS_PER_TILE = 10;

/** Sideways offsets (tiles) for lanes 0–3 so crowds spread across a path. */
export const LANE_OFFSETS: readonly number[] = [-0.27, -0.09, 0.09, 0.27];

/** Output record, reused by the caller to avoid allocation. `fx`, `fy`: map coordinates; `z`: height steps. */
export interface GuestPos {
  fx: number;
  fy: number;
  z: number;
  tile: number;
}

/**
 * Position of a walking or standing guest: interpolated from `tile` toward `nextTile` by
 * (progress + alpha) / GUEST_WALK_TICKS_PER_TILE, plus a lane offset perpendicular to the walk.
 */
export function guestPosition(map: MapState, g: Pick<Guest, 'tile' | 'nextTile' | 'progress' | 'lane' | 'dir'>, alpha: number, out: GuestPos): GuestPos {
  const w = map.width;
  const x = g.tile % w;
  const y = (g.tile - x) / w;
  let fx = x + 0.5;
  let fy = y + 0.5;
  let alongX: boolean;
  const n = map.width * map.height;
  const inMap = g.tile >= 0 && g.tile < n;
  let z = inMap ? (map.heights[g.tile] as number) : (map.heights[map.entranceTile] ?? 0);
  if (g.nextTile >= 0 && g.nextTile !== g.tile) {
    const nx = g.nextTile % w;
    const ny = (g.nextTile - nx) / w;
    let t = (g.progress + alpha) / GUEST_WALK_TICKS_PER_TILE;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    fx += (nx - x) * t;
    fy += (ny - y) * t;
    alongX = nx !== x;
    if (g.nextTile < n && inMap) z += ((map.heights[g.nextTile] as number) - z) * t;
  } else {
    alongX = g.dir === 1 || g.dir === 3;
  }
  const off = LANE_OFFSETS[g.lane & 3] as number;
  if (alongX) fy += off;
  else fx += off;
  out.fx = fx;
  out.fy = fy;
  out.z = z;
  out.tile = g.tile;
  return out;
}
