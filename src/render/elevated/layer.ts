/**
 * Elevated paths, ramps on elevated paths, and supports at the tile corners down to the ground (Phase 4 §4.2).
 * Owner: W3-B. Ground ramps are drawn by the terrain chunks (they follow the slope). Stub: draws nothing.
 */
import { LAYER_KIND, type WorldLayer } from '../layers';

export function createElevatedPathLayer(): WorldLayer {
  return { name: 'elevatedPaths', kinds: [LAYER_KIND.elevatedPath, LAYER_KIND.elevatedSupport] };
}
