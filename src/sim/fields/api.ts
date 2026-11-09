/**
 * Calm and Buzz fields (Phase 4 §4.6). Owner: W3-E. Signatures are a contract.
 *
 * `calmRaw` / `buzzRaw` are derived `Uint16Array(width × height)` kept in a module-level WeakMap<World, …> (like the
 * pathing caches), rebuilt in full on first use after a load and updated by incremental stamps after that. Sources:
 * scenery (W3-D), wet tiles (W3-A), benches (path items), open rides (diffed against ride status by this module).
 * Callers that change a source on a tile call `markFieldsDirty(world, tile)`.
 */
import { FIELD_BANDS } from '../../data/tuning/fields';
import type { World } from '../types';

export type FieldBand = 'none' | 'low' | 'medium' | 'high';

/** Calm read value of `tile`, 0–255 (`min(255, raw − litter/mess penalty)`, floored at 0). Stub: 0. */
export function calmAt(_world: World, _tile: number): number {
  return 0;
}

/** Buzz read value of `tile`, 0–255. Stub: 0. */
export function buzzAt(_world: World, _tile: number): number {
  return 0;
}

/** None < 20, Low 20–59, Medium 60–119, High ≥ 120. Real body. */
export function fieldBand(value: number): FieldBand {
  if (value < FIELD_BANDS[0]) return 'none';
  if (value < FIELD_BANDS[1]) return 'low';
  if (value < FIELD_BANDS[2]) return 'medium';
  return 'high';
}

/** A field source on or next to `tile` may have changed (scenery, water, bench, wilting). Stub: no-op. */
export function markFieldsDirty(_world: World, _tile: number): void {}

/**
 * Atmosphere sub-score 0–1 for the park rating (Phase 4 §4.6): mean over guests on a path (ascending id) of
 * `c × C + h × B`. The rating multiplies it by `RATING_WEIGHTS.atmosphere`. Stub: 0.
 */
export function atmosphereScore(_world: World): number {
  return 0;
}
