/** Calm and Buzz fields (Phase 4 §4.6, §8). Owner: W3-E. */
/** Bands: None < 20, Low 20–59, Medium 60–119, High ≥ 120. */
export const FIELD_BANDS = [20, 60, 120] as const;
export const FIELD_MAX = 255;
export const LITTER_CALM_PENALTY = 8;
export const MESS_CALM_PENALTY = 16;
export const ATMOSPHERE_MAX_POINTS = 100;
/** Stamp radii (Chebyshev). */
export const FIELD_RADIUS = { scenery1x1: 3, sceneryLarge: 4, sceneryEdge: 1, wetTile: 2, bench: 2, flatRide: 5, trackThrill: 3, trackFamily: 2 } as const;
