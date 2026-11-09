/**
 * Water ride effects on guests (Phase 4 §4.4 "Wet riders") through the guest hooks. Owner: W3-C.
 * - afterRide: a ride with a piece that gets riders wet (`flume_splashdown`, `rapids_waterfall`) sets
 *   `guest.wetUntilTick = tick + 1 game hour`. The hook runs as the rider steps off: a game hour is 50 ticks, shorter
 *   than any lap, so wetness set at the splash itself would be gone before the ride ends.
 * - perHour: a wet guest gets happiness +8 in hot weather, −8 in cold or rain (storm counts as rain, as in the Phase 3
 *   weather rules), 0 otherwise. A guest is wet while `tick ≤ wetUntilTick`, so each ride gives exactly one hour start.
 */
import { WET_HAPPINESS_COLD_OR_RAIN, WET_HAPPINESS_HOT, WET_TICKS } from '../../../data/tuning/track';
import type { GuestHooks } from '../../hookTypes';
import type { Guest } from '../../guests/types';
import type { World } from '../../types';
import type { Ride } from '../types';
import { trackData } from './common';
import { getLayout } from './layout';

/** True when the track ride `rideId` has a piece that gets riders wet. */
export function rideWetsRiders(world: World, rideId: number): boolean {
  const data = trackData(world, rideId);
  if (!data || data.pieces.length === 0) return false;
  for (const st of getLayout(data).statics) if (st.def.water?.wetsRiders) return true;
  return false;
}

/** The guest is still wet from a water ride. */
export function isGuestWet(world: World, guest: Guest): boolean {
  return guest.wetUntilTick >= 0 && world.state.tick <= guest.wetUntilTick;
}

/** Happiness change per game hour for a wet guest in the current weather. */
export function wetHappinessDelta(world: World): number {
  const w = world.state.management.weather.current;
  if (w === 'hot') return WET_HAPPINESS_HOT;
  if (w === 'cold' || w === 'rain' || w === 'storm') return WET_HAPPINESS_COLD_OR_RAIN;
  return 0;
}

function wetAfterRide(world: World, guest: Guest, ride: Ride): void {
  if (ride.kind !== 'track' || !rideWetsRiders(world, ride.id)) return;
  guest.wetUntilTick = world.state.tick + WET_TICKS;
}

function wetPerHour(world: World, guest: Guest): void {
  if (!isGuestWet(world, guest)) return;
  const d = wetHappinessDelta(world);
  if (d === 0) return;
  const h = guest.needs.happiness + d;
  guest.needs.happiness = h < 0 ? 0 : h > 255 ? 255 : h;
}

export const waterRideHooks: Partial<GuestHooks> = {
  afterRide: [wetAfterRide],
  perHour: [wetPerHour],
};
