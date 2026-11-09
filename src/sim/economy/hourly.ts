/**
 * Owner: W1-E. Hourly running costs for rides and stalls (hourly charge rule, Phase 3 §4.1, master R9, R20).
 * Runs at every hour start. Each charge is booked at the start of the hour it pays for (hourOfMonth 0–71);
 * the remainder is booked at the start of hour 71, so a full month costs exactly the monthly amount.
 */
import { getFlatRideDef, getStallDef } from '../../data/catalog';
import { TICKS_PER_MONTH } from '../../data/tuning/core';
import {
  TRACK_EXTRA_TRAIN_COST,
  TRACK_EXTRA_TRAIN_DIVISOR,
  TRACK_RUN_BASE,
  TRACK_RUN_PER_PIECE,
} from '../../data/tuning/economy';
import { hourOfMonth } from '../time';
import type { Ride } from '../rides/types';
import type { Stall } from '../stalls/types';
import type { World } from '../types';
import type { Cents } from '../units';
import { hourlyShare, recordLedger } from './ledger';

/**
 * Monthly running cost of a ride in cents. Flat rides: catalog. Track rides: Phase 2 §4.12
 * (run base + $1.50 × pieces + extra train cost / 20 × (trains − 1)), from a local copy of the Phase 2 table
 * until W1-G exports its own function (contract change request in the W1-E report).
 */
export function rideMonthlyRunningCost(world: World, ride: Ride): Cents {
  if (ride.kind === 'flat') return getFlatRideDef(ride.defId)?.runningCostMonthly ?? 0;
  const data = world.state.track.rides[String(ride.id)];
  const typeId = data?.typeId ?? ride.defId;
  const base = TRACK_RUN_BASE[typeId];
  if (base === undefined) return 0;
  const pieces = data?.pieces.length ?? 0;
  const trains = data?.trainConfig.trains ?? 1;
  const extraTrain = Math.floor((TRACK_EXTRA_TRAIN_COST[typeId] ?? 0) / TRACK_EXTRA_TRAIN_DIVISOR);
  return base + TRACK_RUN_PER_PIECE * pieces + extraTrain * Math.max(0, trains - 1);
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
