/**
 * After Dark simulation side (Phase 4 §4.7). Owner: W3-F. Signatures are a contract.
 *
 * The simulation never reads the render darkness float. Night is the integer clock window 20:00–06:00.
 * `lightRaw` is a derived `Uint16Array(width × height)` kept in a module-level WeakMap<World, …> (`./lightMap.ts`);
 * it does not change with the clock. Sources: path lamps (not broken), scenery with flag L, open rides, open stalls,
 * the park entrance. Callers that change a light source on a tile call `markLightDirty(world, tile)`; every query
 * here also diffs lamps, footpaths, rides, stalls, scenery, and elevated paths itself, so it is always current.
 */
import { NIGHT_END_HOUR, NIGHT_START_HOUR } from '../../data/tuning/night';
import { hourOf } from '../time';
import type { World } from '../types';
import { lightOf, litShareOf, litValue, markLightCacheDirty, syncLight } from './lightMap';
import { nightArrivalFactorFor } from './rules';
import { spookyRideWithin } from './spooky';
import { BOO_SPOOKY_RIDE_RADIUS } from '../../data/tuning/night';

/** 20:00–06:00 (start inclusive, end exclusive). Real body. */
export function isNight(tick: number): boolean {
  const h = hourOf(tick);
  return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
}

/** Night effects apply: After Dark is on and it is night. Real body. */
export function nightActive(world: World): boolean {
  return world.state.park.afterDark && isNight(world.state.tick);
}

/** Light read value of `tile`, `min(255, lightRaw)` (0 outside the map). */
export function lightAt(world: World, tile: number): number {
  return lightOf(syncLight(world), tile);
}

/** Lit: `lightAt ≥ 96`. */
export function isLit(world: World, tile: number): boolean {
  return litValue(lightAt(world, tile));
}

/**
 * Lit footpath tiles / all footpath tiles, 0–1 (1 with no footpaths). Footpath tiles are ground footpaths
 * (`Content.Footpath`) and elevated footpaths (one each); queues do not count.
 */
export function litShare(world: World): number {
  return litShareOf(syncLight(world));
}

/** A light source on or next to `tile` may have changed (lamp, lit scenery). */
export function markLightDirty(world: World, _tile: number): void {
  markLightCacheDirty(world);
}

/** Arrival multiplier (Phase 4 §4.7): at night with After Dark on, `0.5 + 0.5 × litShare`; else 1. */
export function nightArrivalFactor(world: World): number {
  return nightActive(world) ? nightArrivalFactorFor(litShare(world)) : 1;
}

/**
 * The Boo costume matches every guest (Phase 4 §4.7): at night with After Dark on, or when the performer at
 * `performerTile` is within 6 tiles (Chebyshev) of a spooky ride (always, After Dark on or off).
 */
export function booBonusActive(world: World, performerTile: number): boolean {
  return nightActive(world) || spookyRideWithin(world, performerTile, BOO_SPOOKY_RIDE_RADIUS);
}
