/**
 * Water ride effects on guests (Phase 4 §4.4) through the guest hooks. Owner: W3-C.
 * - afterRide: a ride with a piece that gets riders wet (`flume_splashdown`, `rapids_waterfall`) sets
 *   `guest.wetUntilTick = tick + 1 game hour`
 * - perHour: a wet guest gets happiness +8 in hot weather, −8 in cold or rain, 0 otherwise
 * Stub: no hooks.
 */
import type { GuestHooks } from '../../hookTypes';

export const waterRideHooks: Partial<GuestHooks> = {};
