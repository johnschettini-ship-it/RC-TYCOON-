/**
 * Path tool height control (Phase 4 §4.2, §7). Owner: W3-B.
 * `Page Up` / `Page Down` (and the + / − buttons of the path mini-bar) change `tool.pathHeight.z`; the ramp toggle
 * sets `tool.pathHeight.ramp`. The controller adds `pathCommandHeight(…)` to every `buildPathLine` it sends.
 *
 * `z` is the absolute height of the walking surface (null = ground paths, the Build 1 command). Raising from the
 * ground starts 1 m above the highest corner of the tile under the pointer (the lowest legal elevated path);
 * lowering below that returns to ground paths. The top is ground + 20 m (`ELEVATED_PATH_MAX`).
 */
import { ELEVATED_PATH_MAX_ABOVE_GROUND } from '../data/tuning/paths';
import type { RampMode } from '../sim/commands/types';
import type { World } from '../sim/types';
import type { ToolState } from '../render/types';

/**
 * Extra fields for a path command from the height control: `{}` for ground paths (the Build 1 command, unchanged),
 * else `{ z, ramp }`.
 */
export function pathCommandHeight(tool: ToolState): { z?: number; ramp?: RampMode } {
  const z = tool.pathHeight.z;
  if (z === null) return {};
  return { z, ramp: tool.pathHeight.ramp };
}

/** The tile the height refers to: the drag start, else the tile under the pointer, else the park entrance. */
function referenceTile(tool: ToolState, world: World): number {
  const map = world.state.map;
  const n = map.width * map.height;
  const t = tool.drag ? tool.drag.startTile : tool.hoverTile;
  if (t !== null && t >= 0 && t < n) return t;
  return map.entranceTile >= 0 ? map.entranceTile : 0;
}

/** Lowest and highest elevated height over tile `i`: maxCorner + 1 and ground + 20 m. */
export function pathHeightRange(world: World, i: number): { min: number; max: number } {
  const map = world.state.map;
  const ground = (map.heights[i] as number) ?? 0;
  const maxCorner = ground + ((map.slope[i] as number) !== 0 ? 1 : 0);
  return { min: maxCorner + 1, max: ground + ELEVATED_PATH_MAX_ABOVE_GROUND };
}

/** `Page Up` (+1) / `Page Down` (−1): raise or lower the path height (null = ground). */
export function changePathHeight(tool: ToolState, world: World, delta: 1 | -1): void {
  const { min, max } = pathHeightRange(world, referenceTile(tool, world));
  const h = tool.pathHeight;
  if (h.z === null) {
    if (delta > 0) h.z = min;
    return;
  }
  const next = h.z + delta;
  if (next < min) h.z = null;
  else h.z = Math.min(Math.max(next, min), Math.max(max, min), 255);
}

/** Cycle the ramp toggle: flat → up → down → flat. */
export function nextRampMode(mode: RampMode): RampMode {
  return mode === 'flat' ? 'up' : mode === 'up' ? 'down' : 'flat';
}
