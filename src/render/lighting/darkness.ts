/**
 * Render-only darkness from the clock (Phase 4 §4.7). Owner: W3-F. Pure; the simulation never reads it.
 * | Clock       | Darkness           |
 * | 07:00–19:00 | 0                  |
 * | 19:00–21:00 | linear 0 → 0.75    |
 * | 21:00–05:00 | 0.75               |
 * | 05:00–07:00 | linear 0.75 → 0    |
 */
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../data/tuning/core';
import { MAX_DARKNESS, NIGHT_AMBIENT } from '../../data/tuning/night';

const DUSK_START = 19;
const DUSK_END = 21;
const DAWN_START = 5;
const DAWN_END = 7;

/**
 * Darkness 0–0.75 at `tick` (fractional ticks allowed: the renderer passes `tick + alpha` so dusk is smooth).
 * Always 0 when `afterDark` is off.
 */
export function darknessAt(tick: number, afterDark: boolean): number {
  if (!afterDark) return 0;
  const t = ((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  const h = t / TICKS_PER_HOUR;
  if (h >= DAWN_END && h < DUSK_START) return 0;
  if (h >= DUSK_START && h < DUSK_END) return (MAX_DARKNESS * (h - DUSK_START)) / (DUSK_END - DUSK_START);
  if (h >= DAWN_START && h < DAWN_END) return (MAX_DARKNESS * (DAWN_END - h)) / (DAWN_END - DAWN_START);
  return MAX_DARKNESS;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Light canvas fill: white lerped to `NIGHT_AMBIENT` by `darkness / 0.75`, rounded to integers. */
export function ambientColour(darkness: number, out: Rgb = { r: 0, g: 0, b: 0 }): Rgb {
  const k = Math.max(0, Math.min(1, darkness / MAX_DARKNESS));
  out.r = Math.round(255 + (NIGHT_AMBIENT.r - 255) * k);
  out.g = Math.round(255 + (NIGHT_AMBIENT.g - 255) * k);
  out.b = Math.round(255 + (NIGHT_AMBIENT.b - 255) * k);
  return out;
}
