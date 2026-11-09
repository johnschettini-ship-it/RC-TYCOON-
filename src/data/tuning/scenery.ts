/** Scenery placement and gardens (Phase 4 §4.5, §8). Owner: W3-D. */
import { TICKS_PER_SECOND } from './core';

export const SCENERY_REFUND = 0.5;
/** Garden water level 0–255; new items start full. */
export const GARDEN_WATER_MAX = 255;
export const GARDEN_DRAIN = 3; // per game hour
export const GARDEN_DRAIN_HOT = 5; // per game hour in hot weather
export const GARDEN_WILT_BELOW = 64;
/** Groundskeepers water gardens below this level (task order: mess, bins, litter, gardens). */
export const GARDEN_WATER_BELOW = 128;
export const WATERING_TICKS = 2 * TICKS_PER_SECOND; // 2 s
