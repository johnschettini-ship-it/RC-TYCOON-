/**
 * Tuning for staff, litter, mess, path items, vandalism, reliability, and breakdowns.
 * Owner: W1-H. Starting values from phase-3-management.md §8. Tests read these same constants.
 * Reliability values are integer hundredths of a point (100.00 = 10,000).
 */

// --- Staff (§4.2) ---
export const STAFF_MAX = 200;
/** Groundskeeper and Mechanic local BFS, in steps. */
export const STAFF_SEARCH_RADIUS = 10;
/** Vandalism block radius (Chebyshev tiles). */
export const SECURITY_RADIUS = 6;
export const SECURITY_ROAM_RADIUS = 12;
export const PERFORMER_RADIUS = 4;
export const PERFORMER_SEARCH_RADIUS = 10;
export const PERFORMER_SPOT_SAMPLES = 8;
export const PERFORMER_SHOW_TICKS = 200;
export const PERFORMER_WALK_TICKS_MIN = 100;
export const PERFORMER_WALK_TICKS_MAX = 300;
export const PERFORMER_HAPPY = 2;
export const PERFORMER_HAPPY_MATCH = 3;
/** A walking staff member re-runs task selection this often. */
export const STAFF_RECHECK_TICKS = 40;

// --- Groundskeeper tasks (§4.2) ---
export const SWEEP_TICKS_PER_LITTER = 20;
export const MESS_CLEAN_TICKS = 60;
export const BIN_EMPTY_TICKS = 40;
export const BIN_EMPTY_AT = 18;

// --- Litter, mess, benches (§4.3) ---
export const TRASH_TIMER_MIN = 400;
export const TRASH_TIMER_MAX = 1200;
export const LITTER_TILE_MAX = 8;
export const MESS_TILE_MAX = 2;
export const SICK_NAUSEA = 180;
export const SICK_CHANCE = 0.08;
export const SICK_NAUSEA_DROP = 100;
export const SICK_HAPPY_DROP = 15;
export const DIRT_MILD = 4;
export const DIRT_BAD = 10;
export const DIRT_MILD_HAPPY = 1;
export const DIRT_BAD_HAPPY = 3;
/** Mess weighs this many litter items in the dirt sum and in cleanliness. */
export const MESS_DIRT_WEIGHT = 4;
/** Cleanliness reaches 0 at this much dirt per walkable tile. */
export const DIRT_PER_TILE_ZERO = 0.5;
/** "Nice clean park!" when the guest's area is spotless and park cleanliness is at least this. */
export const CLEAN_PARK_THOUGHT_MIN = 0.95;
export const BENCH_TIRED = 100;
export const BENCH_TIRED_CHILL = 130;
export const BENCH_SEATS = 2;
/** Catalog: a tired guest sits for 3 s. */
export const BENCH_SIT_TICKS = 60;
/** Temperament at or below this is Chill (master R6). */
export const CHILL_MAX = 35;
/** Temperament at or above this is Thrill (master R6). */
export const THRILL_MIN = 65;

// --- Vandalism and repair (§4.4) ---
export const ANGRY_HAPPY = 50;
export const VANDAL_CHANCE = 0.03;
/** Happiness lost per decision next to a broken path item. */
export const BROKEN_ITEM_HAPPY = 1;
/** Repair cost = this percent of the item's build cost. */
export const REPAIR_COST_PERCENT = 50;

// --- Reliability and breakdowns (§4.5) ---
/** 100.00 reliability points in hundredths. */
export const REL_MAX = 10_000;
export const REL_CAP_MIN = 5_000;
export const REL_CAP_LOSS_PER_YEAR = 500;
/** 1.5 points per cycle or dispatch. */
export const WEAR_PER_CYCLE = 150;
export const AGE_FACTOR_PER_YEAR = 0.25;
export const AGE_FACTOR_MAX = 2;
export const BREAK_BASE = 0.002;
export const BREAK_SCALE = 0.2;
export const INSPECTION_TICKS = 100;
/** 1 day. */
export const INSPECT_DEFAULT = 1200;
/** Interval value that means "never inspect". */
export const INSPECT_NEVER = 0;
/** UI choices: 4 h, 8 h, 12 h, 1 day, 2 days, 1 month, never. */
export const INSPECTION_INTERVALS: readonly number[] = Object.freeze([200, 400, 600, 1200, 2400, 3600, INSPECT_NEVER]);
export const FIX_TICKS = 200;
export const RECENT_BREAK_SCORE = 0.8;
/** Recent-fix score lasts 1 game day. */
export const RECENT_BREAK_TICKS = 1200;
/** Riders stuck on a stopped ride lose this much happiness per decision interval. */
export const STUCK_RIDER_HAPPY = 1;
export const STUCK_RIDER_INTERVAL = 40;

export type BreakdownKind = 'stopped' | 'train_stalled' | 'gate_stuck' | 'slow_running';

export interface BreakdownDef {
  id: BreakdownKind;
  appliesTo: 'flat' | 'track' | 'all';
  weight: number;
  fixFactor: number;
}

/** §4.5 breakdown table, in a fixed order (the weighted draw walks it in this order). */
export const BREAKDOWNS: readonly BreakdownDef[] = Object.freeze([
  { id: 'stopped', appliesTo: 'flat', weight: 40, fixFactor: 1.0 },
  { id: 'train_stalled', appliesTo: 'track', weight: 40, fixFactor: 1.5 },
  { id: 'gate_stuck', appliesTo: 'all', weight: 30, fixFactor: 0.5 },
  { id: 'slow_running', appliesTo: 'all', weight: 30, fixFactor: 0.75 },
]);

/** Slow running: flat cycle time ×1.5, powered track drive ×0.6, rider excitement −1.00. */
export const SLOW_CYCLE_FACTOR = 1.5;
export const SLOW_POWERED_FACTOR = 0.6;
export const SLOW_EXCITEMENT_PENALTY = 100;

/**
 * Riders of a broken flat ride with no Mechanic assigned get off after this many ticks (8 game hours),
 * so no guest stays in `riding` forever in a park without Mechanics (Phase 1 §9 rule; W2-D finding).
 * The ride stays broken.
 */
export const EVACUATE_TICKS = 400;
