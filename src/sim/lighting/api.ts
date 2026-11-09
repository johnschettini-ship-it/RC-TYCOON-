/**
 * After Dark simulation side (Phase 4 §4.7). Owner: W3-F. Signatures are a contract.
 *
 * The simulation never reads the render darkness float. Night is the integer clock window 20:00–06:00.
 * `lightRaw` is a derived `Uint16Array(width × height)` kept in a module-level WeakMap<World, …>; it does not change
 * with the clock. Sources: path lamps, scenery with flag L, open rides, stalls, the park entrance. Callers that change
 * a light source on a tile call `markLightDirty(world, tile)`; ride status changes are diffed by this module.
 */
import { NIGHT_END_HOUR, NIGHT_START_HOUR } from '../../data/tuning/night';
import { hourOf } from '../time';
import type { World } from '../types';

/** 20:00–06:00 (start inclusive, end exclusive). Real body. */
export function isNight(tick: number): boolean {
  const h = hourOf(tick);
  return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
}

/** Night effects apply: After Dark is on and it is night. Real body. */
export function nightActive(world: World): boolean {
  return world.state.park.afterDark && isNight(world.state.tick);
}

/** Light read value of `tile`, `min(255, lightRaw)`. Stub: 255 (everything lit, so no night penalty). */
export function lightAt(_world: World, _tile: number): number {
  return 255;
}

/** Lit: `lightAt ≥ 96`. Stub: true. */
export function isLit(_world: World, _tile: number): boolean {
  return true;
}

/** Lit footpath tiles / all footpath tiles, 0–1 (1 with no footpaths). Stub: 1. */
export function litShare(_world: World): number {
  return 1;
}

/** A light source on or next to `tile` may have changed (lamp, lit scenery). Stub: no-op. */
export function markLightDirty(_world: World, _tile: number): void {}

/** Arrival multiplier (Phase 4 §4.7): at night with After Dark on, `0.5 + 0.5 × litShare`; else 1. Stub: 1. */
export function nightArrivalFactor(_world: World): number {
  return 1;
}

/**
 * The Boo costume matches every guest (Phase 4 §4.7): at night with After Dark on, or when the performer at
 * `performerTile` is within 6 tiles of a spooky ride (always, After Dark on or off). Stub: false.
 */
export function booBonusActive(_world: World, _performerTile: number): boolean {
  return false;
}
