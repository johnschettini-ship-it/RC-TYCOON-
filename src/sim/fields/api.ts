/**
 * Calm and Buzz fields (Phase 4 §4.6). Owner: W3-E. Signatures are a contract.
 *
 * `calmRaw` / `buzzRaw` are derived `Uint16Array(width × height)` kept in a module-level WeakMap<World, …> (like the
 * pathing caches), rebuilt in full on first use after a load and updated by incremental stamps after that. Sources:
 * scenery (W3-D), wet tiles (W3-A), benches (path items), open rides (diffed against ride status by this module).
 * Callers that change a source on a tile call `markFieldsDirty(world, tile)`. Store details: `./store.ts`.
 */
import { ATMOSPHERE_MAX_POINTS, ATMOSPHERE_NO_GUESTS_SCORE, FIELD_BANDS } from '../../data/tuning/fields';
import type { Guest } from '../guests/types';
import type { World } from '../types';
import { ATMOSPHERE_UNIT, atmosphereUnits, roundDiv } from './effects';
import { buzzRead, calmRead, markStale, simFields } from './store';

export type FieldBand = 'none' | 'low' | 'medium' | 'high';

/** Calm read value of `tile`, 0–255 (`min(255, raw − litter/mess penalty)`, floored at 0). 0 outside the map. */
export function calmAt(world: World, tile: number): number {
  const c = simFields(world);
  if (tile < 0 || tile >= c.n) return 0;
  return calmRead(c, world.state.map, tile);
}

/** Buzz read value of `tile`, 0–255 (`min(255, raw)`). 0 outside the map. */
export function buzzAt(world: World, tile: number): number {
  const c = simFields(world);
  if (tile < 0 || tile >= c.n) return 0;
  return buzzRead(c, tile);
}

/** None < 20, Low 20–59, Medium 60–119, High ≥ 120. Real body. */
export function fieldBand(value: number): FieldBand {
  if (value < FIELD_BANDS[0]) return 'none';
  if (value < FIELD_BANDS[1]) return 'low';
  if (value < FIELD_BANDS[2]) return 'medium';
  return 'high';
}

/**
 * A field source on or next to `tile` may have changed (scenery, water, bench, wilting): the next read syncs, even
 * inside the same tick. Changes made without a mark (ride status, Build 1 path item commands) are found at the
 * first read of the next tick.
 */
export function markFieldsDirty(world: World, _tile: number): void {
  markStale(world);
}

/**
 * Atmosphere sub-score 0–1 for the park rating (Phase 4 §4.6): mean over guests on a path (ascending id) of
 * `c × C + h × B`. The rating multiplies it by `RATING_WEIGHTS.atmosphere`.
 *
 * Returns `round(mean × 100) / 100`, so the rating term is exactly `round(mean × 100)` points; the mean is taken in
 * exact integer units. A guest is on a path unless it is on a ride (elevated paths count; the tile column is read).
 * With no guest on a path: `ATMOSPHERE_NO_GUESTS_SCORE` (0.5, the Phase 3 "no data" value of H, P, and L).
 */
export function atmosphereScore(world: World): number {
  const c = simFields(world);
  const map = world.state.map;
  const guests = world.state.guests;
  let units = 0;
  let count = 0;
  for (let k = 0; k < guests.length; k++) {
    const g = guests[k] as Guest;
    const tile = g.tile;
    if (g.state === 'riding' || tile < 0 || tile >= c.n) continue;
    units += atmosphereUnits(calmRead(c, map, tile), buzzRead(c, tile), g.temperament);
    count++;
  }
  if (count === 0) return ATMOSPHERE_NO_GUESTS_SCORE;
  return roundDiv(units * ATMOSPHERE_MAX_POINTS, count * ATMOSPHERE_UNIT) / ATMOSPHERE_MAX_POINTS;
}
