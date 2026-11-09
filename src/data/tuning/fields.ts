/** Calm and Buzz fields (Phase 4 §4.6, §8). Owner: W3-E. */
/** Bands: None < 20, Low 20–59, Medium 60–119, High ≥ 120. */
export const FIELD_BANDS = [20, 60, 120] as const;
/** Read values are capped at 255 (`min(255, raw − penalty)`). */
export const FIELD_MAX = 255;
/** Calm read penalty per litter item and per mess on the tile itself (Calm only). */
export const LITTER_CALM_PENALTY = 8;
export const MESS_CALM_PENALTY = 16;
/** Atmosphere is worth 0–100 rating points (master R8). */
export const ATMOSPHERE_MAX_POINTS = 100;
/** Stamp radii (Chebyshev). */
export const FIELD_RADIUS = { scenery1x1: 3, sceneryLarge: 4, sceneryEdge: 1, wetTile: 2, bench: 2, flatRide: 5, trackThrill: 3, trackFamily: 2 } as const;

/** Source strengths `s` that do not come from the scenery tables (Phase 4 §4.6 sources table). */
export const FIELD_STRENGTH = {
  /** Wet tile: Calm 1. */
  wetTile: 1,
  /** Bench: Calm 1. */
  bench: 1,
  /** Open flat ride, tag `thrill`: Buzz `2 + floor(intensity / 2)` (each footprint tile). */
  flatThrillBase: 2,
  /** Open flat ride, tag `family`: Buzz 1 (each footprint tile). */
  flatFamily: 1,
  /** Open track ride, tag `thrill`: Buzz 2 (each track tile). */
  trackThrill: 2,
  /** Open track ride, tag `family`: Buzz 1 (each track tile). */
  trackFamily: 1,
} as const;
/**
 * `floor(intensity / 2)` with the intensity rating in points: ratings are stored in hundredths (catalog), so the
 * term is `floor(intensityHundredths / 200)`. Flip Arm (8.00) gives 2 + 4 = 6.
 */
export const FLAT_THRILL_INTENSITY_DIVISOR = 200;
/** A wilted garden gives `floor(C / 2)` Calm. */
export const WILTED_CALM_DIVISOR = 2;

/** Guest effects (Phase 4 §4.6 effects table). `C = calm / 255`, `B = buzz / 255`, `c = (100 − t) / 100`, `h = t / 100`. */
/** Energy loss × (1 − 0.6 × C × c). */
export const CALM_ENERGY_CUT = 0.6;
/** Nausea recovery × (1 + C × (1 + 2c)): the `2` in front of `c`. */
export const CALM_NAUSEA_CHILL_WEIGHT = 2;
/** Happiness per game hour: + round(6 × C × c) − round(3 × B × c) + round(6 × B × h). */
export const CALM_CHILL_HAPPY = 6;
export const BUZZ_CHILL_UNHAPPY = 3;
export const BUZZ_THRILL_HAPPY = 6;
/** Walking speed: Chill × (1 − 0.15 × C × c); Thrill walking to a `thrill` ride × (1 + 0.25 × B × h). */
export const CALM_WALK_SLOW = 0.15;
export const BUZZ_WALK_FAST = 0.25;
/**
 * Atmosphere with no guest on a path: 0.5, the Phase 3 §4.13 "no data" value of H, P, and L. A park with no
 * guests keeps its Build 1 rating (300 × 0.5 + 100 × 0.5 = 400 × 0.5).
 */
export const ATMOSPHERE_NO_GUESTS_SCORE = 0.5;
