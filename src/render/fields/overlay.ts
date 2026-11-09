/**
 * Calm (teal) and Buzz (orange) overlays (Phase 4 §4.6): path and ground tiles tinted by band, with a hatch density
 * per band so colour is not the only signal. Drawn in `drawGround` when `tool.overlay` is `calm` or `buzz`.
 * Owner: W3-E. Stub: draws nothing.
 */
import type { WorldLayer } from '../layers';

export function createFieldOverlayLayer(): WorldLayer {
  return { name: 'fieldOverlay', kinds: [] };
}
