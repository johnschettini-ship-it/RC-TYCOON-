/**
 * Scenery sprites (Phase 4 §4.5, §7): 85 procedural items in 4 view rotations, wilted garden art, edge items, the
 * scenery ghost (green or red with a reason icon). Owner: W3-D. Stub: draws nothing.
 */
import { LAYER_KIND, type WorldLayer } from '../layers';

export function createSceneryLayer(): WorldLayer {
  return { name: 'scenery', kinds: [LAYER_KIND.scenery, LAYER_KIND.sceneryEdge] };
}
