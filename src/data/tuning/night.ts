/** After Dark (Phase 4 §4.7, §8). Owner: W3-F. */
/** Simulation night: the integer clock window 20:00–06:00 (start inclusive, end exclusive). */
export const NIGHT_START_HOUR = 20;
export const NIGHT_END_HOUR = 6;
/** Render-only darkness curve. */
export const MAX_DARKNESS = 0.75;
export const NIGHT_AMBIENT = { r: 70, g: 80, b: 130 } as const;
export const LIT_THRESHOLD = 96;
export const LIGHT_MAX = 255;
/** Light stamp radii (Euclidean). */
export const LIGHT_RADIUS = { pathLamp: 3, scenery1x1: 2, sceneryLarge: 3, ride: 2, stall: 1, entrance: 4 } as const;
export const DARK_PATH_PENALTY = -4; // happiness per game hour on an unlit path at night
export const DARK_PATH_THOUGHT_COOLDOWN_HOURS = 4;
export const SPOOKY_NIGHT_MULT = 1.3;
export const SPOOKY_ITEM_BONUS = 0.02;
export const SPOOKY_ITEM_BONUS_CAP = 0.2;
export const SPOOKY_ITEM_RADIUS = 6;
export const SPOOKY_RIDE_NIGHT_HAPPY = 5;
export const NIGHT_ENERGY_MULT = 1.25;
export const BOO_SPOOKY_RIDE_RADIUS = 6;
/** Toast threshold when After Dark is turned on. */
export const AFTER_DARK_WARN_LIT_SHARE = 0.5;
/** Light-pass budget (render): visible light sprites per frame. */
export const MAX_LIGHT_SPRITES = 400;
