/** One simulation tick in the fixed order of master rule R13. Owner: integrator. */
import { isHourStart, isMonthStart, monthIndexOf } from './time';
import { emit } from './events';
import type { World } from './types';
import { closeMonth } from './economy/monthEnd';
import { monthlyFinance } from './finance/monthly';
import { updateWeather } from './weather/update';
import { spawnArrivals } from './guests/arrivals';
import { updateGuests } from './guests/update';
import { updateStaff, hourlyStaff } from './staff/update';
import { updateFlatRides } from './rides/flat/update';
import { updateTrackRides } from './rides/track/update';
import { updateStalls } from './stalls/update';
import { updateBreakdowns } from './breakdowns/update';
import { chargeRunningCosts } from './economy/hourly';
import { hourlyResearch } from './research/update';
import { hourlyMarketing } from './marketing/update';
import { updateParkValue } from './finance/value';
import { updateRating } from './park/rating';
import { pruneMessages } from './notifications';

export function stepTick(world: World): void {
  const t = world.state.tick;

  if (isMonthStart(t)) {
    closeMonth(world);
    monthlyFinance(world);
    emit(world, { type: 'monthEnded', monthIndex: monthIndexOf(t) - 1 });
  }

  updateWeather(world);
  spawnArrivals(world);
  updateGuests(world);
  updateStaff(world);
  updateFlatRides(world);
  updateTrackRides(world);
  updateStalls(world);
  updateBreakdowns(world);

  if (isHourStart(t)) {
    chargeRunningCosts(world);
    hourlyStaff(world);
    hourlyResearch(world);
    hourlyMarketing(world);
    updateParkValue(world);
    updateRating(world);
  }

  pruneMessages(world);
  world.state.tick = t + 1;
}

export function runTicks(world: World, n: number): void {
  for (let i = 0; i < n; i++) stepTick(world);
}
