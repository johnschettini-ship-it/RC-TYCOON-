/**
 * After Dark rendering (Phase 4 §4.7): the light canvas at 1/4 resolution filled with the ambient colour, cached
 * warm radial light sprites with `lighter`, multiplied over the frame (`drawAfterObjects`), then emissive sprites;
 * the Light overlay (`tool.overlay === 'light'`) in `drawGround`. Darkness 0 skips the pass. Budget ≤ 2 ms per
 * frame, ≤ 400 visible light sprites. Owner: W3-F. Stub: draws nothing.
 */
import type { WorldLayer } from '../layers';

export function createLightingLayer(): WorldLayer {
  return { name: 'lighting', kinds: [] };
}

/**
 * Render-only darkness from the clock (Phase 4 §4.7 curve): 0 from 07:00 to 19:00, linear to 0.75 by 21:00, 0.75
 * until 05:00, linear to 0 by 07:00. Always 0 when `afterDark` is off. Stub: 0.
 */
export function darknessAt(_tick: number, _afterDark: boolean): number {
  return 0;
}
