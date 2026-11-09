/** Scenarios, sandbox, difficulty, climate (Phase 5 §4.3–4.9, §8). Owner: W3-H. */
import type { Climate, Difficulty } from '../scenarios/types';

/** Samples per day: 12:00 day sample, 22:00 night sample. */
export const DAY_SAMPLE_HOUR = 12;
export const NIGHT_SAMPLE_HOUR = 22;
export const THRILL_MIN = 65;
export const CHILL_MAX = 35;
export const RATING_COLLAPSE_BELOW = 200;
export const RATING_COLLAPSE_DAYS = 6;
/** Stars: ≥ 25% of the time limit left → 2, ≥ 50% → 3. */
export const STAR_TIME_LEFT = [0.25, 0.5] as const;
/** Unlocks: 2 wins → scenarios 4–6; 4 wins → 7; 6 wins → 8. */
export const UNLOCK_WINS = [2, 4, 6] as const;
export const MAX_SLOPE_PASSES = 64;
export const SANDBOX_BORDER = 2;
/** Scenario, sandbox, and tutorial start tick (master R1). */
export const SCENARIO_START_TICK = 450;

export interface DifficultyPreset {
  startCash: number;
  maxLoan: number;
  loanInterest: number;
  priceTolerance: number;
  happinessDecay: number;
  arrivals: number;
  researchSpeed: number;
  breakdownChance: number;
  /** Relaxed: a win after the deadline is allowed (1 star). */
  lateWinAllowed: boolean;
  /** Month ends in a row with cash < 0 and loan = max before a loss; null = off. */
  bankruptMonths: number | null;
  ratingCollapse: boolean;
}

export const DIFFICULTY: Readonly<Record<Difficulty, DifficultyPreset>> = {
  relaxed: { startCash: 1.5, maxLoan: 1.5, loanInterest: 0.5, priceTolerance: 1.2, happinessDecay: 0.8, arrivals: 1.2, researchSpeed: 1.5, breakdownChance: 0.6, lateWinAllowed: true, bankruptMonths: null, ratingCollapse: false },
  standard: { startCash: 1, maxLoan: 1, loanInterest: 1, priceTolerance: 1, happinessDecay: 1, arrivals: 1, researchSpeed: 1, breakdownChance: 1, lateWinAllowed: false, bankruptMonths: 3, ratingCollapse: false },
  tough: { startCash: 0.75, maxLoan: 0.75, loanInterest: 1.5, priceTolerance: 0.85, happinessDecay: 1.2, arrivals: 0.9, researchSpeed: 0.75, breakdownChance: 1.3, lateWinAllowed: false, bankruptMonths: 2, ratingCollapse: true },
};

export interface ClimateDef {
  /** °C offsets for winter, spring, summer, autumn. */
  tempOffset: readonly [number, number, number, number];
  rainWeight: number;
  sunWeight: number;
}

export const CLIMATES: Readonly<Record<Climate, ClimateDef>> = {
  temperate: { tempOffset: [0, 0, 0, 0], rainWeight: 1, sunWeight: 1 },
  cold: { tempOffset: [-10, -6, -3, -6], rainWeight: 1.2, sunWeight: 0.8 },
  hot: { tempOffset: [6, 8, 10, 8], rainWeight: 0.5, sunWeight: 1.5 },
  coastal: { tempOffset: [2, 0, -1, 2], rainWeight: 1.4, sunWeight: 0.9 },
};

// ---------------------------------------------------------------- map generator (Phase 5 §4.2)

/** Noise values and interpolation weights are fixed point with 16 fraction bits (0–65,535). */
export const NOISE_ONE = 65_536;
/** A cone's crater floor lies this many steps below its rim (Phase 5 §4.1). */
export const CRATER_DEPTH = 4;
/** Validation: owned, dry, flat, empty tiles reachable on land from the entrance (Phase 5 §4.2 step 9). */
export const MIN_BUILDABLE_TILES = 200;
/** Lake beds: 1 step below the surface at the shore, `LAKE_EXTRA_DEPTH` more at the centre. */
export const LAKE_EXTRA_DEPTH = 2;
/** Sandbox generation retries the next seed when a random layout fails validation (the seed used is stored). */
export const SANDBOX_SEED_TRIES = 8;

// ---------------------------------------------------------------- climates (Phase 5 §4.9)

/**
 * Phase 3 weather has no temperature, only the `hot` and `cold` states. A climate's °C offset for the season moves
 * this many draw-weight points per °C from `cold` to `hot` (offset > 0) or from `hot` to `cold` (offset < 0).
 * The rain weight then multiplies `rain` and `storm`, the sun weight `sunny` and `hot` (rounded to integers).
 */
export const CLIMATE_WEIGHT_PER_DEGREE = 2;

// ---------------------------------------------------------------- month metrics (Phase 5 §4.10, §5)

/** Thought ids whose guests month metrics count (Rip-off Park and Lost and Confused awards). */
export const TOO_EXPENSIVE_THOUGHTS: readonly string[] = ['rideTooExpensive', 'snackTooExpensive', 'drinkTooExpensive'];
export const LOST_THOUGHTS: readonly string[] = ['lost', 'lostNeedMap'];
export const TRACKED_THOUGHTS: readonly string[] = [...TOO_EXPENSIVE_THOUGHTS, ...LOST_THOUGHTS];

// ---------------------------------------------------------------- sandbox (Phase 5 §4.5)

export const SANDBOX_MAP_SIZES: readonly number[] = [64, 96, 128, 192, 256];
export const SANDBOX_DEFAULT_MAP_SIZE = 96;
/** Map sizes from this one up show "Large maps can run slowly on phones". */
export const SANDBOX_LARGE_MAP = 192;
