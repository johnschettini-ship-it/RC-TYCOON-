/** Monthly awards (Phase 5 §4.10, §8). Owner: W3-I. */
export const AWARD_MIN_GUESTS_POSITIVE = 100;
export const AWARD_MIN_GUESTS_NEGATIVE = 50;
export const AWARD_ARRIVALS_POSITIVE = 1.1;
export const AWARD_ARRIVALS_NEGATIVE = 0.9;
export const AWARD_RATING_POSITIVE = 20;
export const AWARD_RATING_NEGATIVE = -20;
export const AWARD_ARRIVALS_CLAMP = [0.7, 1.3] as const;
export const AWARD_RATING_CLAMP = [-60, 60] as const;

/*
 * Criteria (Phase 5 §4.10 table). Litter + mess per footpath tile is kept as a count per 100 tiles and the
 * breakdown share as a percentage, so those comparisons are exact integer math (0.02 → 2, 0.15 → 15). Sample
 * shares are percentages, as `sampleMeans` (W3-H) returns them; thought shares are fractions 0–1, as
 * `tooExpensiveShare` and `lostShare` return them.
 */
/** Spotless Park: litter + mess per 100 footpath tiles ≤ 2. */
export const AWARD_SPOTLESS_MAX_DIRT_PER_100 = 2;
/** Litterbug Park: litter + mess per 100 footpath tiles ≥ 15. */
export const AWARD_LITTERBUG_MIN_DIRT_PER_100 = 15;
/** Best Value: mean daily rating ≥ 600 and mean price paid per ride ≤ $2.50. */
export const AWARD_BEST_VALUE_MIN_RATING = 600;
export const AWARD_BEST_VALUE_MAX_PRICE = 250;
/** Thrill Seekers' Choice: ≥ 3 open thrill rides with excitement ≥ 6.00, Thrill-group happiness ≥ 180. */
export const AWARD_THRILL_MIN_RIDES = 3;
export const AWARD_THRILL_MIN_EXCITEMENT = 600;
export const AWARD_THRILL_HAPPINESS = 180;
/** Chill Haven: mean footpath Calm ≥ 3 (Calm read value, 0–255) and Chill-group happiness ≥ 180. */
export const AWARD_CHILL_MIN_CALM = 3;
export const AWARD_CHILL_HAPPINESS = 180;
/** Perfect Balance: Thrill and Chill shares ≥ 35%, both group happiness ≥ 170. */
export const AWARD_BALANCE_MIN_SHARE = 35;
export const AWARD_BALANCE_HAPPINESS = 170;
/** Night Owls' Favourite: After Dark on, ≥ 90% of footpath tiles lit, night-sample happiness ≥ 170. */
export const AWARD_NIGHT_MIN_LIT = 0.9;
export const AWARD_NIGHT_HAPPINESS = 170;
/** Dark and Dreary: After Dark on and < 40% of footpath tiles lit. */
export const AWARD_DARK_MAX_LIT = 0.4;
/** Rip-off Park: ≥ 15% of this month's guests had a "too expensive" thought (fraction, `tooExpensiveShare`). */
export const AWARD_RIPOFF_MIN_SHARE = 0.15;
/** Queue Nightmare: mean queue wait ≥ 90 s (1,800 ticks). */
export const AWARD_QUEUE_MIN_WAIT_TICKS = 1_800;
/** Breakdown Central: ≥ 25% of rides broke down at least once. */
export const AWARD_BREAKDOWN_MIN_SHARE = 25;
/** Lost and Confused: ≥ 10% of this month's guests had a "lost" thought (fraction, `lostShare`). */
export const AWARD_LOST_MIN_SHARE = 0.1;

