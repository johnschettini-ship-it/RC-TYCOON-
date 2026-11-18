/**
 * Realistic look only: the strength of the baked and live shadows by the clock (review P2 of batch 5 Tasks 4-5). A
 * module of its own, imported last by the renderer, so the website build's module order does not move.
 */
import { MAX_DARKNESS } from '../../data/tuning/night';
import { darknessAt } from '../lighting/darkness';

/**
 * How strong the realistic shadows draw at clock `tick` (fractional, as the lighting pass reads it): 1 by day, fading
 * with the lighting pass's own darkness through dusk to 0 at full night, back through dawn (review P2: the bake's sun is
 * daylight only, so its shadows must not show under the night sky). Always 1 with after-dark off.
 */
export function shadowDaylight(tick: number, afterDark: boolean): number {
  return Math.max(0, 1 - darknessAt(tick, afterDark) / MAX_DARKNESS);
}
