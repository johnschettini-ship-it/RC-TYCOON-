/**
 * Owner: W1-E. Hourly running costs for rides and stalls (hourly charge rule, Phase 3 §4.1, master R9, R20).
 * Runs at every hour start. Each charge is booked at the start of the hour it pays for (hourOfMonth 0–71);
 * the remainder is booked at the start of hour 71, so a full month costs exactly the monthly amount.
 */
import { getFlatRideDef, getStallDef } from '../../data/catalog';
import { TICKS_PER_MONTH } from '../../data/tuning/core';
import { trackRunningCostMonthly } from '../rides/track/api';
import { hourOfMonth } from '../time';
import type { Ride } from '../rides/types';
import type { Stall } from '../stalls/types';
import type { World } from '../types';
import type { Cents } from '../units';
import { hourlyShare, recordLedger } from './ledger';

/**
 * Monthly running cost of a ride in cents. Flat rides: catalog. Track rides: the track module's Phase 2 §4.12
 * formula (run base + $1.50 × pieces + extra train cost / 20 × (trains − 1)).
 */
export function rideMonthlyRunningCost(world: World, ride: Ride): Cents {
  if (ride.kind === 'flat') return getFlatRideDef(ride.defId)?.runningCostMonthly ?? 0;
  return trackRunningCostMonthly(world, ride);
}

export function stallMonthlyRunningCost(stall: Stall): Cents {
  return getStallDef(stall.defId)?.runningCostMonthly ?? 0;
}

export function chargeRunningCosts(world: World): void {
  const tick = world.state.tick;
  const hour = hourOfMonth(tick);
  const monthStart = tick - (tick % TICKS_PER_MONTH);
  for (const ride of world.state.rides) {
    ride.hoursThisMonth += 1;
    // Active all month = it existed at hour 0 of this month.
    const share = hourlyShare(rideMonthlyRunningCost(world, ride), hour, ride.builtTick <= monthStart);
    if (share !== 0) recordLedger(world, 'rideRunning', -share);
  }
  for (const stall of world.state.stalls) {
    stall.hoursThisMonth += 1;
    const share = hourlyShare(stallMonthlyRunningCost(stall), hour, stall.builtTick <= monthStart);
    if (share !== 0) recordLedger(world, 'stallRunning', -share);
  }
}
