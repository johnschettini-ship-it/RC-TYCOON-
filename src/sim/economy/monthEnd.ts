/**
 * Owner: W1-E. Month-end ledger close (master R13 step 1), at the first tick of a month.
 * The finished month's record stays as it is (one record per month). The new month's record is opened,
 * and the monthly counters on rides and stalls start again from 0.
 */
import type { World } from '../types';
import { currentLedger } from './ledger';

export function closeMonth(world: World): void {
  currentLedger(world);
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
