/**
 * Owner: W1-E. Month-end ledger close (master R13 step 1), at the first tick of a month.
 * The finished month's record stays as it is (one record per month). The new month's record is opened,
 * and the monthly counters on rides and stalls start again from 0.
 *
 * The two steps are exported on their own so the month-end pipeline can run later steps
 * (awards, objectives, Phase 5) between the ledger close and the metric resets (master R13).
 */
import type { World } from '../types';
import { currentLedger } from './ledger';

/** Make sure the ledger record of the current month exists. */
export function openLedgerMonth(world: World): void {
  currentLedger(world);
}

/** Reset the per-month counters of rides and stalls. All-time totals stay. */
export function resetMonthlyCounters(world: World): void {
  for (const ride of world.state.rides) {
    ride.totals.ridersThisMonth = 0;
    ride.totals.incomeThisMonth = 0;
    ride.hoursThisMonth = 0;
    ride.breakdownsThisMonth = 0;
  }
  for (const stall of world.state.stalls) {
    stall.totals.salesThisMonth = 0;
    stall.totals.incomeThisMonth = 0;
    stall.hoursThisMonth = 0;
  }
}

export function closeMonth(world: World): void {
  openLedgerMonth(world);
  resetMonthlyCounters(world);
}
