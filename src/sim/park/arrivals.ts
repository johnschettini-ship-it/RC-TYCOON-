/**
 * Owner: W1-E. Phase 1 §4.6 arrival rate (with Phase 3 weather and marketing factors).
 *
 * Arrivals per game hour = 4 × rating factor × ride factor × clock factor
 *   × weatherArrivalFactor × campaignArrivalFactor × modifiers.arrivals; 0 while the park is closed.
 * Build 2: × nightArrivalFactor (After Dark, W3-F) × scenarioArrivalFactor (sandbox, W3-H) × awardArrivalFactor
 * (awards, W3-I); each is 1 when it does not apply.
 * The guest system spawns from this rate and carries fractions between ticks (`park.arrivalCarry`).
 */
import {
  ARRIVAL_CLOCK_BANDS,
  ARRIVAL_RATING_DIVISOR,
  ARRIVAL_RATING_FACTOR_MAX,
  ARRIVAL_RATING_FACTOR_MIN,
  ARRIVAL_RIDE_FACTOR_BASE,
  ARRIVAL_RIDE_FACTOR_MAX,
  ARRIVAL_RIDE_FACTOR_PER_RIDE,
  BASE_ARRIVALS_PER_HOUR,
} from '../../data/tuning/economy';
import { campaignArrivalFactor } from '../marketing/update';
import { clockOf } from '../time';
import type { World } from '../types';
import { weatherArrivalFactor } from '../weather/update';
import { openRides } from './rides';
import { nightArrivalFactor } from '../lighting/api';
import { scenarioArrivalFactor } from '../scenario/api';
import { awardArrivalFactor } from '../awards/api';

/** Rating factor = clamp(rating / 500, 0.2, 2.0). */
export function ratingFactor(rating: number): number {
  return Math.min(ARRIVAL_RATING_FACTOR_MAX, Math.max(ARRIVAL_RATING_FACTOR_MIN, rating / ARRIVAL_RATING_DIVISOR));
}

/** Ride factor = 0 with no open rides; else min(1.5, 0.25 + open rides × 0.25). */
export function rideFactor(open: number): number {
  if (open <= 0) return 0;
  return Math.min(ARRIVAL_RIDE_FACTOR_MAX, ARRIVAL_RIDE_FACTOR_BASE + open * ARRIVAL_RIDE_FACTOR_PER_RIDE);
}

/** Clock factor: 06–10 = 0.6, 10–18 = 1.0, 18–22 = 0.6, 22–06 = 0.1. */
export function clockFactor(tick: number): number {
  const { hour } = clockOf(tick);
  for (const band of ARRIVAL_CLOCK_BANDS) if (hour >= band.from && hour < band.to) return band.factor;
  return 0;
}

/** Expected guests per game hour right now. */
export function arrivalsPerHour(world: World): number {
  const s = world.state;
  if (!s.park.open) return 0;
  return (
    BASE_ARRIVALS_PER_HOUR *
    ratingFactor(s.park.rating) *
    rideFactor(openRides(world).length) *
    clockFactor(s.tick) *
    weatherArrivalFactor(world) *
    campaignArrivalFactor(world) *
    s.modifiers.arrivals *
    nightArrivalFactor(world) *
    scenarioArrivalFactor(world) *
    awardArrivalFactor(world)
  );
}
