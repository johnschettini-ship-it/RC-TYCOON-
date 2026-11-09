/**
 * One simulation tick in the fixed order of master rule R13. Owner: integrator.
 *
 * Month start (the month-end pipeline of the month that just closed, Phase 5 §4.6):
 *   ledger close → Phase 3 monthly tasks (loan interest) → awards (W3-I) → objectives (W3-H) → lose checks (W3-H)
 *   → metric resets (W3-H) → `monthEnded` event.
 * Every tick: weather → arrivals → guests (hourly guest hooks run inside, at hour start) → staff → flat rides
 *   → track rides → stalls → breakdowns → shows (Phase 6, W4-C).
 * Hour start: hourly charges → staff wages → show site running costs (W4-C) → research points → campaign expiry
 *   → park value → rating → garden upkeep (W3-D) → Calm and Buzz refresh (W3-E) → day/night samples (W3-H, after
 *   the rating: the 12:00 sample stores the daily rating) → tutorial checks (W3-I).
 * Then message pruning and `tick + 1`. Lighting has no tick system: the light map is derived and the darkness
 * curve is render-only (Phase 4 §4.7).
 */
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
import { evaluateAwards } from './awards/update';
import { evaluateObjectives } from './scenario/objectives';
import { checkLoseConditions } from './scenario/lose';
import { recordSamples, resetMonthMetrics } from './scenario/metrics';
import { hourlyScenery } from './scenery/update';
import { hourlyFields } from './fields/update';
import { hourlyTutorial } from './tutorial/update';
import { hourlyShows, updateShows } from './shows/update';

export function stepTick(world: World): void {
  const t = world.state.tick;

  if (isMonthStart(t)) {
    closeMonth(world);
    monthlyFinance(world);
    evaluateAwards(world);
    evaluateObjectives(world);
    checkLoseConditions(world);
    resetMonthMetrics(world);
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
  updateShows(world);

  if (isHourStart(t)) {
    chargeRunningCosts(world);
    hourlyStaff(world);
    hourlyShows(world);
    hourlyResearch(world);
    hourlyMarketing(world);
    updateParkValue(world);
    updateRating(world);
    hourlyScenery(world);
    hourlyFields(world);
    recordSamples(world);
    hourlyTutorial(world);
  }

  pruneMessages(world);
  world.state.tick = t + 1;
}

export function runTicks(world: World, n: number): void {
  for (let i = 0; i < n; i++) stepTick(world);
}
