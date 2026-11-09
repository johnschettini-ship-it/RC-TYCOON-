/** World building and network tuning (Phase 1 §4.1, §4.2, §8). Owner: W1-C. Money in cents. */

/** `PATH_COST`: footpath, per tile ($10). */
export const PATH_COST = 1_000;
/** `QUEUE_COST`: queue path, per tile ($12). */
export const QUEUE_COST = 1_200;

/** `DEMOLISH_REFUND`: share of build cost refunded when a ride or stall is removed (master R15). */
export const DEMOLISH_REFUND_PERCENT = 50;
/** Paths refund nothing (master R15). */
export const PATH_REFUND_PERCENT = 0;

/** Staff distance fields are cached per target tile; the oldest is dropped beyond this count. */
export const STAFF_FIELD_CACHE_MAX = 64;
