/**
 * Track tuning constants (phase-2-coasters.md §4 and §8). Owner: W1-G.
 * SI units unless the name says otherwise (Mm = millimetres, Mms = mm/s, Cents, Ticks).
 */

/** Gravity (m/s²). */
export const G = 9.81;
/** Physics step: one tick (s). */
export const DT = 0.05;
export const TICKS_PER_S = 20;

/** Bank angle in degrees (master R17). */
export const BANK_ANGLE_DEG = 35;
/** Rise per tile (m) of the gentle and steep slopes (master R17). */
export const GENTLE_RISE_M = 2;
export const STEEP_RISE_M = 6;
/** atan(2 / 4) and atan(6 / 4) in radians (fixed literals, no runtime trig). */
export const GENTLE_PITCH_RAD = 0.4636476090008061;
export const STEEP_PITCH_RAD = 0.982793723247329;

export const CHAIN_ACCEL = 3.0;
export const BRAKE_DECEL = 6.0;
/** Station speed and block brake exit speed (m/s). */
export const STATION_SPEED = 2.0;
export const STATION_STOP_DECEL = 4.0;
/** Acceleration after a hold or a station dispatch (m/s²). */
export const RELEASE_ACCEL = 2.0;
export const POWERED_ACCEL = 1.5;
export const POWERED_DECEL = 4.0;
export const CORNER_SPEED_POWERED = { small: 3.0, medium: 6.0 } as const;
export const CORNER_SPEED_GUEST = { small: 5.0, medium: 8.0 } as const;
/** Guest-driven target speed = base + span × temperament / 100 (m/s). */
export const GUEST_DRIVE_BASE = 6.0;
export const GUEST_DRIVE_SPAN = 3.0;
/** Temperament used for the empty test kart. */
export const TEST_KART_TEMPERAMENT = 50;
/** Gap rule (powered and guest-driven), metres to the tail of the vehicle ahead. */
export const GAP_RULE_MM = 3000;
/** Extra clearance behind every train for block occupancy (keeps ≥ 1 m between trains). */
export const BLOCK_MARGIN_MM = 1000;
/** The station stop puts the front this far before the station exit joint. */
export const STATION_STOP_MARGIN_MM = 500;

/** Placement (§4.5). */
export const PATH_HEIGHT_M = 3;
export const PATH_CLEARANCE_M = 4;
export const ENVELOPE_BELOW_M = 1;
export const ENVELOPE_ABOVE_M = 3;
export const MAX_UNSUPPORTED_TILES = 2;
export const MAX_PIECES = 300;
export const STATION_MAX_TILES = 12;
export const TILE_M = 4;
export const TILE_MM = 4000;

/** Sample tables (§4.3). */
export const SAMPLE_STEP_MM = 250;

/** Test run measurements (§4.9). */
export const G_AVERAGE_TICKS = 5;
export const AIRTIME_G = 0.2;
export const DROP_THRESHOLD_M = 3;
/** A test that has not finished after this many ticks fails (safety guard). */
export const TEST_MAX_TICKS = 36_000;
/** The Test tab chart keeps one point every this many ticks. */
export const TEST_CHART_EVERY_TICKS = 10;

/** Station cycle (§4.8). */
export const UNLOAD_TICKS = 40;
export const DEFAULT_MIN_DWELL_TICKS = 60;
export const DEFAULT_MAX_DWELL_TICKS = 300;
export const MIN_DWELL_RANGE_S = { min: 0, max: 30 } as const;
export const MAX_DWELL_RANGE_S = { min: 5, max: 60 } as const;
export const LAPS_RANGE = { min: 1, max: 5, default: 2 } as const;
/** Go-karts depart this many ticks apart. */
export const KART_DISPATCH_SPACING_TICKS = 20;
export const KART_MAX = 12;
export const KARTS_PER_STATION_TILE = 2;

/** Brake piece option (§4.2), m/s. */
export const BRAKE_SPEED = { min: 2, max: 20, default: 6 } as const;

/** Costs (§4.12), cents. */
export const CHAIN_EXTRA_CENTS = 2_000;
export const HEIGHT_COST_CENTS_PER_M = 300;
export const RUN_COST_PER_PIECE_CENTS = 150;
export const EXTRA_TRAIN_RUN_DIVISOR = 20;
/** Refund share after the ride first opened (master R15). */
export const REFUND_SHARE_AFTER_OPEN = 0.5;
/** Asset value depreciation (master R14). */
export const DEP_FLOOR = 0.3;
export const DEP_MONTHS = 120;
/** `tall` flag threshold (catalog §2). */
export const TALL_HEIGHT_M = 20;
/** Player colour palette size (§4.13). */
export const COLOUR_COUNT = 12;

/** Ratings (§4.10). */
export const RATING = {
  excitement: { vMax: 0.08, drop: 0.04, dropCap: 50, drops: 0.3, dropsCap: 5, air: 0.6, airCap: 3, inv: 0.6, invCap: 3, lat: 0.25, latCap: 2, timeDiv: 30, timeCap: 1.5 },
  intensity: { posG: 0.8, posGBase: 1, negG: 1.2, negGBase: 0.5, lat: 1.0, vMax: 0.05, inv: 0.4, invCap: 3, drop: 0.02, dropCap: 50 },
  nausea: { posG: 0.5, posGBase: 1.5, lat: 1.0, inv: 0.6, invCap: 3, air: 0.3, airCap: 3, turn: 0.1, turnCap: 2 },
  softCapAt: 6,
  softCapFactor: 0.5,
  penalty: { factor: 1.5, posGMax: 5.0, vertGMin: -1.5, latMax: 2.5, shortRideS: 20 },
  max: 10,
} as const;

/** Warning thresholds (§4.10). */
export const WARN = { intensity: 8.0, nausea: 7.0, dullExcitement: 2.0 } as const;

/**
 * Water rides (Phase 4 §4.4, §8). Owner: W3-C. Speeds in m/s, k in 1/s.
 * Current pieces: a = −g·sinθ − k·(v − vCurrent). Conveyors (stations, lifts): v = conveyor speed.
 */
export const FLUME_V_CURRENT = 1.5;
export const FLUME_K = 0.6;
export const RAPIDS_V_CURRENT = 3.0;
export const RAPIDS_K = 0.9;
/** Lift conveyor speed. */
export const V_LIFT = 2.0;
/** Station conveyor speed (Phase 4 §4.4 table: stations convey at 1.5 m/s). */
export const V_STATION_CONVEYOR = 1.5;
/** Splash brake: above SPLASH_MAX_V the boat slows at SPLASH_DECEL (more when needed to leave the piece at the cap). */
export const SPLASH_MAX_V = 4;
export const SPLASH_DECEL = 12;
export const WHIRLPOOL_MAX_V = 2;
/**
 * Rough water: the current speed varies along the piece as a fixed function of the position (phase-2 §4.14: never
 * the RNG), vCurrent × (1 + amplitude × sin(2π u / wavelength)).
 */
export const ROUGH_AMPLITUDE = 0.4;
export const ROUGH_WAVELENGTH_MM = 4000;

/**
 * Water rating extras (Phase 4 §4.4), added to the Phase 2 result after its formula. Integer hundredths per piece,
 * counted up to `max` pieces.
 */
export const WATER_RATING_EXTRAS = {
  splashdown: { e: 40, i: 10, n: 0, max: 3 },
  waterfall: { e: 30, i: 20, n: 0, max: 3 },
  rough: { e: 0, i: 10, n: 0, max: 10 },
  whirlpool: { e: 20, i: 0, n: 50, max: 3 },
} as const;

/** Wet riders (Phase 4 §4.4): wet for 1 game hour (50 ticks) after a ride with a wetting piece. */
export const WET_TICKS = 50;
/** Happiness per game hour while wet: hot weather +8, cold or rain (storm included) −8. */
export const WET_HAPPINESS_HOT = 8;
export const WET_HAPPINESS_COLD_OR_RAIN = -8;
