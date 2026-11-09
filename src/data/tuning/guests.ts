/**
 * Guest tuning constants (Phase 1 §4.3, §4.6 spawn side, §8). Owner: W1-D.
 * Needs use the 0–255 scale. Money is integer cents. Ratings are hundredths. Times are ticks.
 */

// Movement and decisions (Phase 1 §8).
export const GUEST_WALK_TICKS_PER_TILE = 10;
export const GUEST_DECISION_INTERVAL = 40;
/** Sub-tile lanes per tile; lane = id % GUEST_LANES (Phase 1 §11). */
export const GUEST_LANES = 4;

// Queues (Phase 1 §4.3, §8).
export const QUEUE_MAX_JOIN = 25;
export const QUEUE_MAX_WAIT = 1_200;
/** Happiness −1 per this many ticks in a queue. */
export const QUEUE_HAPPINESS_TICKS = 100;

// Buying (Phase 1 §4.3, §8; Phase 3 §4.10 First Aid).
export const SALE_TICKS = 20;
export const RESTROOM_TICKS = 60;
export const FIRST_AID_TICKS = 60;
/** Item value per stall kind for the "too expensive" check (price > value × 2). Other kinds use the catalog price. */
export const ITEM_VALUE: Readonly<Record<string, number>> = Object.freeze({ food: 300, drink: 200, toilet: 0 });
export const ITEM_PRICE_FACTOR = 2;

// Sitting (Phase 3 §4.3 benches: 60 ticks, energy from the catalog).
export const SIT_TICKS = 60;

// Spawn (Phase 1 §4.3, §4.6).
export const ARRIVAL_CARRY_UNIT = 1_000;
export const START_HUNGER = { min: 30, max: 60 } as const;
export const START_THIRST = { min: 30, max: 60 } as const;
export const START_BLADDER = { min: 10, max: 40 } as const;
export const START_ENERGY = { min: 200, max: 255 } as const;
export const START_NAUSEA = 0;
export const START_HAPPINESS = 180;
export const START_CASH = { min: 4_000, max: 12_000 } as const;
/** Entrance fee tolerance = (base + perOpenRide × open rides) × factor × modifiers.priceTolerance. */
export const FEE_TOLERANCE_BASE = 500;
export const FEE_TOLERANCE_PER_RIDE = 250;
export const FEE_FACTOR_MIN = 0.8;
export const FEE_FACTOR_MAX = 1.2;

// Needs (Phase 1 §4.3). Changes apply per NEED_INTERVAL ticks.
export const NEED_MAX = 255;
export const NEED_INTERVAL = 100;
export const HUNGER_RATE = 7;
export const THIRST_RATE = 8;
export const BLADDER_RATE = 5;
/** Energy falls by this × the energy drain multiplier. */
export const ENERGY_RATE = 3;
export const NAUSEA_RECOVERY = 10;
export const NEED_UNCOMFORTABLE = 160;
export const NEED_URGENT = 210;
export const NAUSEA_UNCOMFORTABLE = 120;
export const NAUSEA_URGENT = 180;
export const HAPPY_LOSS_UNCOMFORTABLE = 1;
export const HAPPY_LOSS_URGENT = 3;
export const ENERGY_GO_HOME = 50;
export const HAPPINESS_GO_HOME = 60;
export const NO_RIDE_STREAK_LEAVE = 3;
/** "What a great park!" when leaving at or above this happiness. */
export const GREAT_PARK_HAPPINESS = 220;

// Temperament (Phase 1 §4.3 table; groups follow master R6).
export const MAX_INTENSITY_BASE = 2.0;
export const MAX_INTENSITY_PER_T = 0.08;
export const MIN_INTENSITY_PER_T = 0.05;
export const NAUSEA_MULT_BASE = 1.5;
export const ENERGY_MULT_BASE = 0.8;
export const ENERGY_MULT_DIV = 250;
export const TAG_FIT_FAMILY = 0.3;

// Ride score (Phase 1 §4.3). Ratings in these formulas are on the 0.00–10.00 scale, money in dollars.
export const SCORE_EXCITEMENT = 0.6;
export const SCORE_TAG_FIT = 1.5;
export const SCORE_BORING = 0.8;
export const SCORE_PRICE_PER_DOLLAR = 0.5;
export const SCORE_DISTANCE_PER_TILE = 0.02;
export const SCORE_REPEAT = 1.5;
export const SCORE_NOISE = 0.5;
/** Ride value = excitement × this many cents (excitement 0.00–10.00). */
export const RIDE_VALUE_CENTS_PER_EXCITEMENT = 100;
export const RIDE_PRICE_REJECT_FACTOR = 1.5;
/** Hard reject: guest nausea ≥ this and ride nausea ≥ RIDE_NAUSEA_REJECT (hundredths). */
export const NAUSEA_REJECT = 120;
export const RIDE_NAUSEA_REJECT = 200;

// Riding (Phase 1 §4.3; Phase 2 §4.11; Phase 3 §4.5).
export const RIDE_HAPPY_BASE = 12;
export const RIDE_HAPPY_EXC_DIV = 5;
export const RIDE_HAPPY_TAG_BONUS = 0.5;
export const RIDE_NAUSEA_FACTOR = 15;
export const RIDE_ENERGY_COST = 5;
export const TAME_FACTOR = 0.5;
export const GOOD_RIDE_GAIN = 15;
export const AIRTIME_THRILL_SECONDS = 1.0;
export const AIRTIME_HAPPY = 10;
export const INVERSION_CHILL_HAPPY = -10;
/** Phase 3 §4.5 `slow_running`: rider excitement −1.00 (hundredths). */
export const SLOW_RUNNING_EXCITEMENT = 100;

// Thoughts (master R5).
export const THOUGHT_MAX = 5;
export const THOUGHT_REPEAT_TICKS = 1_200;

// Lost and safety (Phase 1 §4.2; Review Focus 1–2).
/** 2 game hours. */
export const LOST_EXIT_TICKS = 100;
export const RELOCATE_RADIUS = 10;

// Leaving (Phase 1 §4.3).
export const RECENT_LEAVERS_MAX = 200;
