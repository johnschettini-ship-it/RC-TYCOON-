/** Guest draw positions in continuous map coordinates. Owner: W1-A, W3-G (heights), W3-B (path node heights). */
import type { MapState } from '../sim/map';
import type { Guest } from '../sim/guests/types';
import { nodeZAfterStep } from '../sim/paths/api';
import { firstElevatedOnTile, nextElevatedOnTile, RAMP_MASK } from '../sim/paths/nodes';
import type { ElevatedPath } from '../sim/paths/types';
import type { World } from '../sim/types';
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
 * included). Records without a `z` (Build 1 test data) stand on the ground. Map-only fallback of `WalkerHeights`.
 */
export function walkerHeight(map: MapState, tile: number, z: number | undefined, fx: number, fy: number): number {
  const n = map.width * map.height;
  if (tile >= 0 && tile < n && z !== undefined && Number.isFinite(z) && z !== (map.heights[tile] as number)) return z;
  return surfaceHeight(map, fx, fy);
}

/**
 * Path node heights of the world being drawn (Phase 4 §4.2, W3-B): walkers are drawn on the walking surface of
 * their node `(tile, z)`, and a walking step changes node halfway, at the shared edge, to the node W3-B's
 * `nodeZAfterStep` gives. Linked nodes meet at the same edge height, so the drawn height is continuous: no dip
 * into the river when stepping onto a bridge, and decks that ramp draw their walkers rising.
 */
export interface WalkerHeights {
  /** Height of the node a walker enters stepping from `(tile, z)` to the neighbour `next`. */
  zAfterStep(tile: number, z: number, next: number): number;
  /** Height of the walking surface of node `(tile, z)` at map point (fx, fy). */
  surfaceAt(tile: number, z: number, fx: number, fy: number): number;
}

/** The elevated path on `tile` at exactly height `z`, or null. */
function elevatedAt(world: World, tile: number, z: number): ElevatedPath | null {
  for (let k = firstElevatedOnTile(world, tile); k >= 0; k = nextElevatedOnTile(world, k)) {
    const p = world.state.elevatedPaths[k] as ElevatedPath;
    if (p.z === z) return p;
  }
  return null;
}

/**
 * Walking surface height of node `(tile, z)` at (fx, fy): the ground surface for the ground node (`z` = the tile
 * base height, ground ramps included), else the deck at `z`, a ramp deck rising 1 step toward its `rampDir`.
 */
export function nodeSurfaceHeight(world: World, tile: number, z: number, fx: number, fy: number): number {
  const map = world.state.map;
  if (tile < 0 || tile >= map.width * map.height || z === (map.heights[tile] as number)) return surfaceHeight(map, fx, fy);
  const p = elevatedAt(world, tile, z);
  if (!p || p.rampDir < 0) return z;
  const x = tile % map.width;
  const y = (tile - x) / map.width;
  const u = Math.min(1, Math.max(0, fx - x));
  const v = Math.min(1, Math.max(0, fy - y));
  const m = RAMP_MASK[p.rampDir] as number;
  return z + (1 - u) * (1 - v) * (m & 1) + u * (1 - v) * ((m >> 1) & 1) + u * v * ((m >> 2) & 1) + (1 - u) * v * ((m >> 3) & 1);
}

const heightsOf = new WeakMap<World, WalkerHeights>();

/** `WalkerHeights` for `world` (one object per world, no allocation per frame). */
export function walkerHeights(world: World): WalkerHeights {
  let h = heightsOf.get(world);
  if (!h) {
    h = {
      zAfterStep: (tile, z, next) => nodeZAfterStep(world, tile, z, next),
      surfaceAt: (tile, z, fx, fy) => nodeSurfaceHeight(world, tile, z, fx, fy),
    };
    heightsOf.set(world, h);
  }
  return h;
}

/**
 * Drawing height of a walker on node `(tile, z)` at (fx, fy), `t` (0–1) of the way to `next` (−1 when standing):
 * its own node for the first half of a step, the node it enters for the second. Without `heights` (no world) or a
 * node height, the map-only `walkerHeight`.
 */
export function stepHeight(
  map: MapState,
  heights: WalkerHeights | undefined,
  tile: number,
  z: number | undefined,
  next: number,
  t: number,
  fx: number,
  fy: number,
): number {
  if (!heights || z === undefined || !Number.isFinite(z)) return walkerHeight(map, tile, z, fx, fy);
  const n = map.width * map.height;
  if (next >= 0 && next < n && next !== tile && t >= 0.5) return heights.surfaceAt(next, heights.zAfterStep(tile, z, next), fx, fy);
  return heights.surfaceAt(tile, z, fx, fy);
}

/**
 * Position of a walking or standing guest: interpolated from `tile` toward `nextTile` by
 * (progress + alpha) / GUEST_WALK_TICKS_PER_TILE, plus a lane offset perpendicular to the walk.
 * Height: the walking surface of the guest's path node (`stepHeight`; `walkerHeight` without `heights`).
 */
export function guestPosition(
  map: MapState,
  g: Pick<Guest, 'tile' | 'nextTile' | 'progress' | 'lane' | 'dir'> & { z?: number },
  alpha: number,
  out: GuestPos,
  heights?: WalkerHeights,
): GuestPos {
  const w = map.width;
  const x = g.tile % w;
  const y = (g.tile - x) / w;
  let fx = x + 0.5;
  let fy = y + 0.5;
  let alongX: boolean;
  let t = 0;
  const n = map.width * map.height;
  const inMap = g.tile >= 0 && g.tile < n;
  if (g.nextTile >= 0 && g.nextTile !== g.tile) {
    const nx = g.nextTile % w;
    const ny = (g.nextTile - nx) / w;
    t = (g.progress + alpha) / GUEST_WALK_TICKS_PER_TILE;
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
  out.z = inMap ? stepHeight(map, heights, g.tile, g.z, g.nextTile, t, fx, fy) : ((map.heights[map.entranceTile] as number | undefined) ?? 0);
  out.tile = g.tile;
  return out;
}
