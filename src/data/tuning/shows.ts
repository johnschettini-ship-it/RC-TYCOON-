/**
 * After Dark show tuning (Phase 6 §4.4, §8). Owner: W4-C. Starting values for play-testing; site stats (cost per
 * show, radius, show length) are catalog data (`catalog/showSites.ts`). Tests read these constants, not copies.
 */
import type { ShowSiteDef, TemperamentGroup } from '../catalog';

/** Show start hours (Phase 6 §4.4: 20:00–23:30 in 30-minute steps). */
export const SHOW_HOUR_MIN = 20;
export const SHOW_HOUR_MAX = 23;
export const SHOW_MINUTES: readonly (0 | 30)[] = [0, 30];
/** Every 1, 2, or 3 days. */
export const SHOW_EVERY_N_DAYS_MIN = 1;
export const SHOW_EVERY_N_DAYS_MAX = 3;

/** Announced 1 game hour before the start. */
export const SHOW_ANNOUNCE_TICKS = 50;

/** Gathering: walking guests with energy ≥ 40 within 20 tiles of walking distance. */
export const SHOW_GATHER_ENERGY_MIN = 40;
export const SHOW_GATHER_DISTANCE = 20;
/** Chance 0.5, +0.2 for a matching temperament group (Lightshow: Chill; Fireworks: Thrill; master R6). */
export const SHOW_WATCH_CHANCE = 0.5;
export const SHOW_WATCH_MATCH_BONUS = 0.2;
/** The temperament group (master R6) each show type suits: the +0.2 watch chance and the ×1.3 happiness. */
export const SHOW_MATCH_GROUP: Readonly<Record<ShowSiteDef['id'], TemperamentGroup>> = Object.freeze({
  lightshow_tower: 'chill',
  fireworks_launcher: 'thrill',
});

/**
 * +1 happiness per second (20 ticks) of the show, at most +40 per show; ×1.3 for a matching group. The factor scales
 * the running total (floor), and the cap holds for every watcher: a matching watcher reaches +40 sooner, never more.
 */
export const SHOW_HAPPY_TICKS = 20;
export const SHOW_HAPPY_CAP = 40;
export const SHOW_MATCH_FACTOR = 1.3;

/** Arrivals ×1.05 from 20:00 to 24:00 in a park with ≥ 1 show per night. */
export const SHOW_NIGHT_ARRIVALS = 1.05;
export const SHOW_ARRIVALS_FROM_HOUR = 20;

/** Render only: at most 600 firework particles. */
export const MAX_FIREWORK_PARTICLES = 600;
/** Render only: Lightshow beams. */
export const LIGHTSHOW_BEAMS = 6;
export const LIGHTSHOW_SWEEP_DEG_PER_S = 30;
/** Render only: 40–80 particles per firework burst. */
export const FIREWORK_BURST_MIN = 40;
export const FIREWORK_BURST_MAX = 80;
