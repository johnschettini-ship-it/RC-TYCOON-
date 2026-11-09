/**
 * After Dark rendering (Phase 4 §4.7): the light canvas at 1/4 resolution filled with the ambient colour, cached
 * warm radial light sprites with `lighter`, multiplied over the frame (`drawAfterObjects`), then emissive sprites;
 * the Light overlay (`tool.overlay === 'light'`) in `drawGround`. Darkness 0 skips the pass. Budget ≤ 2 ms per
 * frame, ≤ 400 visible light sprites. Owner: W3-F.
 */
import type { WorldLayer } from '../layers';

export { ambientColour, darknessAt } from './darkness';

export function createLightingLayer(): WorldLayer {
  return { name: 'lighting', kinds: [] };
}
