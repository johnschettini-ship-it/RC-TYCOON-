/** Guest draw positions in continuous map coordinates. Owner: W1-A, W3-G (heights). */
import type { MapState } from '../sim/map';
import type { Guest } from '../sim/guests/types';
import { surfaceHeight } from './iso';

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
 * Drawing height of a walker at (fx, fy) whose path node height is `z` (Phase 4 §5): a walker whose node is not
 * the ground of its tile stands on an elevated path at `z`; otherwise it stands on the ground surface (ramps
 * included). Records without a `z` (Build 1 test data) stand on the ground.
 */
export function walkerHeight(map: MapState, tile: number, z: number | undefined, fx: number, fy: number): number {
  const n = map.width * map.height;
  if (tile >= 0 && tile < n && z !== undefined && Number.isFinite(z) && z !== (map.heights[tile] as number)) return z;
  return surfaceHeight(map, fx, fy);
}

/**
 * Position of a walking or standing guest: interpolated from `tile` toward `nextTile` by
 * (progress + alpha) / GUEST_WALK_TICKS_PER_TILE, plus a lane offset perpendicular to the walk.
 * Height: `walkerHeight` (the ground surface, or the elevated path node `z`).
 */
export function guestPosition(
  map: MapState,
  g: Pick<Guest, 'tile' | 'nextTile' | 'progress' | 'lane' | 'dir'> & { z?: number },
  alpha: number,
  out: GuestPos,
): GuestPos {
  const w = map.width;
  const x = g.tile % w;
  const y = (g.tile - x) / w;
  let fx = x + 0.5;
  let fy = y + 0.5;
  let alongX: boolean;
  const n = map.width * map.height;
  const inMap = g.tile >= 0 && g.tile < n;
  if (g.nextTile >= 0 && g.nextTile !== g.tile) {
    const nx = g.nextTile % w;
    const ny = (g.nextTile - nx) / w;
    let t = (g.progress + alpha) / GUEST_WALK_TICKS_PER_TILE;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    fx += (nx - x) * t;
    fy += (ny - y) * t;
    alongX = nx !== x;
  } else {
    alongX = g.dir === 1 || g.dir === 3;
  }
  const off = LANE_OFFSETS[g.lane & 3] as number;
  if (alongX) fy += off;
  else fx += off;
  out.fx = fx;
  out.fy = fy;
  out.z = inMap ? walkerHeight(map, g.tile, g.z, fx, fy) : ((map.heights[map.entranceTile] as number | undefined) ?? 0);
  out.tile = g.tile;
  return out;
}
