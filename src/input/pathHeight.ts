/**
 * Path tool height control (Phase 4 §4.2, §7). Owner: W3-B.
 * `Page Up` / `Page Down` (and the + / − buttons of the path mini-bar) change `tool.pathHeight.z`; the ramp toggle
 * sets `tool.pathHeight.ramp`. The controller adds `pathCommandHeight(…)` to every `buildPathLine` it sends.
 */
import type { RampMode } from '../sim/commands/types';
import type { World } from '../sim/types';
import type { ToolState } from '../render/types';

/**
 * Extra fields for a path command from the height control: `{}` for ground paths (the Build 1 command, unchanged),
 * else `{ z, ramp }`. Stub: always `{}`.
 */
export function pathCommandHeight(_tool: ToolState): { z?: number; ramp?: RampMode } {
  return {};
}

/** `Page Up` (+1) / `Page Down` (−1): raise or lower the path height (null = ground). Stub: no change. */
export function changePathHeight(_tool: ToolState, _world: World, _delta: 1 | -1): void {}
