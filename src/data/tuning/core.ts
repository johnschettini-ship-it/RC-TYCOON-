/** Core tuning constants shared by every system. Starting values from the master spec §6. */
export const TICKS_PER_SECOND = 20;
export const TICKS_PER_HOUR = 50;
export const HOURS_PER_DAY = 24;
export const TICKS_PER_DAY = TICKS_PER_HOUR * HOURS_PER_DAY; // 1,200
export const DAYS_PER_MONTH = 3;
export const TICKS_PER_MONTH = TICKS_PER_DAY * DAYS_PER_MONTH; // 3,600
export const HOURS_PER_MONTH = HOURS_PER_DAY * DAYS_PER_MONTH; // 72
export const MONTHS_PER_YEAR = 12;
/** Tick 0 is 00:00 on 1 March, Year 1. A new game starts at 09:00 (master rule R1). */
export const START_TICK = 9 * TICKS_PER_HOUR; // 450

export const MAX_TICKS_PER_FRAME = 10;
export const MAP_SIZE_BUILD1 = 64;
export const PARK_ENTRANCE_X = 31;
export const ENTRANCE_STUB_LENGTH = 3;

export const START_CASH = 1_500_000; // cents = $15,000
export const START_ENTRANCE_FEE = 1_000; // cents = $10

export const MAX_HEIGHT_STEPS = 63;
/** Ground level of every new map, in height steps (master rule R2). */
export const GROUND_LEVEL = 8;
