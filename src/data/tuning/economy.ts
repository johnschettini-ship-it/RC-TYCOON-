/**
 * Tuning constants for rides in operation, stalls, economy, park rating, and arrivals. Owner: W1-E.
 * Starting values from phase-1-first-playable.md §4.4–4.6 and §8, and phase-3-management.md §4.1, §4.5, §4.7, §4.13.
 * Tests read these constants, not copies.
 */

// ---------------------------------------------------------------- Flat ride cycle (Phase 1 §4.4)
/** Loading ends after this many ticks if at least 1 guest is on board. */
export const LOAD_MAX_WAIT = 200;
/** Unloading takes this many ticks. */
export const UNLOAD_TICKS = 40;
/** Breakdown type `slow_running`: the flat cycle time is multiplied by this (Phase 3 §4.5). */
export const SLOW_RUNNING_BREAKDOWN = 'slow_running';
export const SLOW_RUNNING_CYCLE_FACTOR = 1.5;

// ---------------------------------------------------------------- Prices (Phase 1 §4.5)
/** Ride and stall prices: $0–$20 in $0.10 steps (cents). */
export const PRICE_MIN = 0;
export const PRICE_MAX = 2_000;
export const PRICE_STEP = 10;
/** Entrance fee: $0–$50 in $1 steps (cents). */
export const ENTRANCE_FEE_MIN = 0;
export const ENTRANCE_FEE_MAX = 5_000;
export const ENTRANCE_FEE_STEP = 100;
/** Park name length after trimming, in characters. */
export const PARK_NAME_MIN = 1;
export const PARK_NAME_MAX = 32;

// ---------------------------------------------------------------- Stalls and campaigns (Phase 3 §4.7)
/** Snack Deal: guests pay this share of the price at the target stall. Stock cost does not change. */
export const SNACK_DEAL_CAMPAIGN = 'snack_deal';
export const SNACK_DEAL_PRICE_FACTOR = 0.5;

// ---------------------------------------------------------------- Park rating (Phase 3 §4.13, master R8)
export const RATING_MIN = 0;
export const RATING_MAX = 1_000;
/** Weights of the 7 sub-scores. They sum to 1,000. Phase 4 adds Atmosphere 100 and lowers Happiness to 300. */
/**
 * Rating weights (sum 1,000). Phase 4 (master R8) moves 100 points from happiness to atmosphere: happiness 300,
 * atmosphere 100 (the Calm and Buzz fields, W3-E).
 */
export const RATING_WEIGHTS: Readonly<Record<'happiness' | 'cleanliness' | 'reliability' | 'fairPrices' | 'variety' | 'lostGuests' | 'queues' | 'atmosphere', number>> = Object.freeze({
  happiness: 300,
  cleanliness: 150,
  reliability: 100,
  fairPrices: 100,
  variety: 100,
  lostGuests: 75,
  queues: 75,
  atmosphere: 100,
});
/** "With 0 guests, H, P, L use 0.5" (Phase 3 §4.13). */
export const RATING_NO_GUESTS_SCORE = 0.5;
/** Fair prices: P = 1 − min(1, 3 × tooExpensiveThoughtsToday / max(1, guests)). */
export const FAIR_PRICE_THOUGHT_FACTOR = 3;
/** "Today" for fair prices: thoughts shown within the last game day (ticks). */
export const FAIR_PRICE_WINDOW_TICKS = 1_200;
/**
 * Spec texts of the "too expensive" guest thoughts (Phase 1 §4.3). The rating finds their ids in the
 * English string table, so it does not depend on the id names the guest system picks.
 */
export const TOO_EXPENSIVE_THOUGHT_TEXTS: readonly string[] = Object.freeze([
  'That ride costs too much',
  'Too expensive for a snack',
  'Too expensive for a drink',
]);
/** Variety: V = (1 − 0.5 × Σ |guestShare − rideShare|) × min(1, openRides / 8). */
export const VARIETY_FULL_RIDES = 8;
/** Lost guests: L = 1 − min(1, 4 × lostGuests / max(1, guests)). */
export const LOST_GUEST_FACTOR = 4;
/** Queues: Q = 1 − min(1, average over open rides of queueLength / (3 × capacity)). */
export const QUEUE_CAPACITY_FACTOR = 3;

// ---------------------------------------------------------------- Arrivals (Phase 1 §4.6)
export const BASE_ARRIVALS_PER_HOUR = 4;
/** Rating factor = clamp(rating / 500, 0.2, 2.0). */
export const ARRIVAL_RATING_DIVISOR = 500;
export const ARRIVAL_RATING_FACTOR_MIN = 0.2;
export const ARRIVAL_RATING_FACTOR_MAX = 2.0;
/** Ride factor = 0 with no open rides; else min(1.5, 0.25 + open rides × 0.25). */
export const ARRIVAL_RIDE_FACTOR_BASE = 0.25;
export const ARRIVAL_RIDE_FACTOR_PER_RIDE = 0.25;
export const ARRIVAL_RIDE_FACTOR_MAX = 1.5;
/** Clock factor bands: [fromHour, toHour) → factor. 06–10 = 0.6, 10–18 = 1.0, 18–22 = 0.6, 22–06 = 0.1. */
export const ARRIVAL_CLOCK_BANDS: readonly { from: number; to: number; factor: number }[] = Object.freeze([
  { from: 0, to: 6, factor: 0.1 },
  { from: 6, to: 10, factor: 0.6 },
  { from: 10, to: 18, factor: 1.0 },
  { from: 18, to: 22, factor: 0.6 },
  { from: 22, to: 24, factor: 0.1 },
]);
