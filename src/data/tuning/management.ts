/**
 * Management tuning (Phase 3 §8). Owner: W1-I. Starting values for play-testing.
 * Money in integer cents, time in ticks. Tests read these constants, not copies.
 */
import { TICKS_PER_DAY, TICKS_PER_MONTH } from './core';

/** Keys mirror `ResearchLevel` in `src/sim/management/types.ts` (data/ may not import sim/). */
export type ResearchLevelKey = 'none' | 'low' | 'medium' | 'high';
/** Keys mirror `Season` in `src/sim/time.ts`. */
export type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter';
/** Same values as `WeatherKey` in the catalog types. */
export type WeatherState = 'sunny' | 'cloudy' | 'rain' | 'storm' | 'hot' | 'cold';

// ---------------------------------------------------------------- research (§4.6)

export const RESEARCH_LEVELS: readonly ResearchLevelKey[] = ['none', 'low', 'medium', 'high'];

/** Monthly research budget per level (hourly charge rule, master R9). $0 / $200 / $400 / $600. */
export const RESEARCH_BUDGET_MONTHLY: Readonly<Record<ResearchLevelKey, number>> = {
  none: 0,
  low: 20_000,
  medium: 40_000,
  high: 60_000,
};

/** Research points per game hour per level: 0 / 144 / 216 / 288 per month (master R10). */
export const RESEARCH_POINTS_PER_HOUR: Readonly<Record<ResearchLevelKey, number>> = {
  none: 0,
  low: 2,
  medium: 3,
  high: 4,
};

// ---------------------------------------------------------------- marketing (§4.7)

export const CAMPAIGN_ARRIVAL_CAP = 2.5;

export type CampaignTarget = 'park' | 'ride' | 'stall';

export interface CampaignDef {
  id: string;
  name: string;
  /** Cents, charged in full at the start. */
  cost: number;
  durationTicks: number;
  target: CampaignTarget;
  /** Arrival multiplier while running. */
  arrivals: number;
  /** Score multiplier for the targeted ride (Ride Spotlight). */
  targetRideScore?: number;
  /** Score multiplier for open rides with this tag (weekends). */
  tagRideScore?: { tag: 'thrill' | 'chill'; factor: number };
  /** Added to the temperament of new guests (clamped to 0–100). */
  temperamentShift?: number;
  /** Price share guests pay at the targeted stall, in percent (Snack Deal). */
  stallPricePercent?: number;
  /** Want-chance multiplier at the targeted stall (Snack Deal). */
  stallWant?: number;
  /** Entrance fee for arrivals becomes $0 (Open Gate Day). */
  freeEntry?: boolean;
}

const DAY = TICKS_PER_DAY;
const MONTH = TICKS_PER_MONTH;

/** The 7 campaigns of Phase 3 §4.7, in UI order. */
export const CAMPAIGNS: readonly CampaignDef[] = Object.freeze([
  { id: 'open_gate_day', name: 'Open Gate Day', cost: 40_000, durationTicks: DAY, target: 'park', arrivals: 1.8, freeEntry: true },
  { id: 'poster_run', name: 'Town Poster Run', cost: 60_000, durationTicks: MONTH, target: 'park', arrivals: 1.25 },
  { id: 'radio_jingle', name: 'Radio Jingle', cost: 120_000, durationTicks: MONTH, target: 'park', arrivals: 1.5 },
  { id: 'ride_spotlight', name: 'Ride Spotlight', cost: 35_000, durationTicks: MONTH, target: 'ride', arrivals: 1.1, targetRideScore: 1.6 },
  { id: 'snack_deal', name: 'Snack Deal', cost: 25_000, durationTicks: MONTH, target: 'stall', arrivals: 1.05, stallPricePercent: 50, stallWant: 1.5 },
  { id: 'thrill_weekend', name: 'Thrill Weekend', cost: 50_000, durationTicks: 2 * DAY, target: 'park', arrivals: 1.2, temperamentShift: 20, tagRideScore: { tag: 'thrill', factor: 1.2 } },
  { id: 'chill_weekend', name: 'Chill Weekend', cost: 50_000, durationTicks: 2 * DAY, target: 'park', arrivals: 1.2, temperamentShift: -20, tagRideScore: { tag: 'chill', factor: 1.2 } },
]);

/** Campaign pairs that cannot run together. */
export const EXCLUSIVE_CAMPAIGNS: readonly (readonly [string, string])[] = [['thrill_weekend', 'chill_weekend']];

export function getCampaignDef(id: string): CampaignDef | undefined {
  return CAMPAIGNS.find((c) => c.id === id);
}

// ---------------------------------------------------------------- loans (§4.8)

export const LOAN_MIN_LIMIT = 1_000_000; // $10,000
export const LOAN_STEP = 100_000; // $1,000
/** Monthly interest in basis points: 100 = 1% per month. */
export const LOAN_RATE_BP = 100;

// ---------------------------------------------------------------- weather (§4.9)

export const WEATHER_STATES: readonly WeatherState[] = ['sunny', 'cloudy', 'rain', 'storm', 'hot', 'cold'];
export const WEATHER_START: WeatherState = 'sunny';
/** 12 game hours. */
export const WEATHER_INTERVAL = 600;
export const WEATHER_STAY = 0.5;

/** Season draw weights (§4.9 table). Order of keys = draw order. */
export const SEASON_WEATHER_WEIGHTS: Readonly<Record<SeasonKey, Readonly<Record<WeatherState, number>>>> = {
  winter: { sunny: 15, cloudy: 30, rain: 20, storm: 5, hot: 0, cold: 30 },
  spring: { sunny: 35, cloudy: 30, rain: 25, storm: 5, hot: 5, cold: 0 },
  summer: { sunny: 35, cloudy: 15, rain: 10, storm: 10, hot: 30, cold: 0 },
  autumn: { sunny: 25, cloudy: 35, rain: 25, storm: 5, hot: 0, cold: 10 },
};

/** After a storm the draw uses only rain and cloudy, 1:1. */
export const AFTER_STORM_WEIGHTS: Readonly<Record<WeatherState, number>> = { sunny: 0, cloudy: 1, rain: 1, storm: 0, hot: 0, cold: 0 };

/** A storm draw becomes rain unless the current state is one of these. */
export const STORM_FROM: readonly WeatherState[] = ['rain', 'cloudy'];

export const WEATHER_ARRIVAL_FACTOR: Readonly<Record<WeatherState, number>> = {
  sunny: 1.0,
  cloudy: 0.9,
  rain: 0.6,
  storm: 0.3,
  hot: 1.1,
  cold: 0.7,
};

/** Happiness per decision for an uncovered guest without an umbrella. */
export const WEATHER_HAPPY_UNCOVERED: Readonly<Record<WeatherState, number>> = { sunny: 0, cloudy: 0, rain: -1, storm: -2, hot: 0, cold: 0 };
/** Happiness per decision for an uncovered guest with an umbrella. */
export const WEATHER_HAPPY_UMBRELLA: Readonly<Record<WeatherState, number>> = { sunny: 0, cloudy: 0, rain: 0, storm: -1, hot: 0, cold: 0 };

/** Ride choice in rain or storm without an umbrella (§4.9). */
export const WET_SCORE_COVERED = 1.5;
export const WET_SCORE_UNCOVERED = 0.6;
export const WET_SCORE_UNCOVERED_BOLD = 0.8;
export const WET_BOLD_TEMPERAMENT = 80;

/** Need rate changes: hot → thirst rise ×1.5, cold → energy fall ×1.2. */
export const HOT_THIRST_FACTOR = 1.5;
export const COLD_ENERGY_FACTOR = 1.2;
/**
 * Phase 1 §4.3 base rates the weather hooks scale (W1-D owns the guest copies; keep equal at integration).
 * Thirst +8 per 100 ticks; energy −3 × drain multiplier per 100 ticks.
 */
export const BASE_THIRST_PER_100 = 8;
export const BASE_ENERGY_PER_100 = 3;
/** Hot: extra thirst every 100 ticks = 8 × 0.5 = 4. */
export const HOT_EXTRA_THIRST_TICKS = 100;
/** Cold: extra energy fall applied every 500 ticks = round(5 × 3 × 0.2 × drain multiplier). */
export const COLD_EXTRA_ENERGY_TICKS = 500;

/** Track rides count as tall from this highest rail point above ground (catalog §2). */
export const TALL_TRACK_HEIGHT_M = 20;

// ---------------------------------------------------------------- park value (§4.12, master R14)

export const DEP_FLOOR = 0.3;
export const DEP_MONTHS = 120;
/** Paths and path items count at this share of their build cost. */
export const PATH_VALUE_SHARE = 0.5;
/**
 * Path build costs per tile (Phase 1 §8 `PATH_COST` / `QUEUE_COST`, owner W1-C).
 * Point these at `src/data/tuning/world.ts` when W1-C lands.
 */
export const PATH_VALUE_COST = 1_000;
export const QUEUE_VALUE_COST = 1_200;

// ---------------------------------------------------------------- messages (§4.14)

export const MESSAGE_MAX = 200;
