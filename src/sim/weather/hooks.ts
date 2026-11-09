/**
 * Owner: W1-I. Weather and marketing effects on guests (Phase 3 §4.7, §4.9) through the guest hooks.
 * - beforeDecision: rain/storm happiness per decision, weather thoughts, "closed for the storm"
 * - perTick: hot → thirst rise ×1.5, cold → energy fall ×1.2 (extra over the Phase 1 base rate)
 * - rideScoreFactor: multiplies the guest's positive ride score
 * - stallWant: catalog weather factors × Snack Deal
 */
import { getFlatRideDef, getStallDef, getTrackRideDef, type ContentFlags, type WeatherKey } from '../../data/catalog';
import {
  BASE_ENERGY_PER_100,
  BASE_THIRST_PER_100,
  COLD_ENERGY_FACTOR,
  COLD_EXTRA_ENERGY_TICKS,
  HOT_EXTRA_THIRST_TICKS,
  HOT_THIRST_FACTOR,
  WEATHER_HAPPY_UMBRELLA,
  WEATHER_HAPPY_UNCOVERED,
  WET_BOLD_TEMPERAMENT,
  WET_SCORE_COVERED,
  WET_SCORE_UNCOVERED,
  WET_SCORE_UNCOVERED_BOLD,
} from '../../data/tuning/management';
import type { GuestHooks } from '../hooks';
import { THOUGHT, addThought } from '../guests/thoughts';
import type { Guest } from '../guests/types';
import { campaignRideScoreFactor, campaignStallWant, rideTag } from '../marketing/campaigns';
import type { Ride } from '../rides/types';
import type { Stall } from '../stalls/types';
import type { World } from '../types';

function rideFlags(ride: Ride): ContentFlags | undefined {
  return ride.kind === 'track' ? getTrackRideDef(ride.defId)?.flags : getFlatRideDef(ride.defId)?.flags;
}

function findRide(world: World, id: number): Ride | undefined {
  return world.state.rides.find((r) => r.id === id);
}

function isWet(weather: WeatherKey): boolean {
  return weather === 'rain' || weather === 'storm';
}

/** A guest is covered while riding a `covered` ride. */
export function isGuestCovered(world: World, guest: Guest): boolean {
  if (guest.state !== 'riding') return false;
  const rideId = guest.seat ? guest.seat.rideId : guest.activityId;
  const ride = rideId >= 0 ? findRide(world, rideId) : undefined;
  return ride ? rideFlags(ride)?.covered === true : false;
}

/** Happiness change per decision from the weather (§4.9 effect table). */
export function weatherHappinessDelta(world: World, guest: Guest): number {
  const weather = world.state.management.weather.current;
  if (isGuestCovered(world, guest)) return 0;
  return guest.items.umbrella ? WEATHER_HAPPY_UMBRELLA[weather] : WEATHER_HAPPY_UNCOVERED[weather];
}

/** Ride score multiplier from the weather: rain or storm, no umbrella → covered ×1.5, others ×0.6 (×0.8 bold). */
export function weatherRideScoreFactor(world: World, guest: Guest, ride: Ride): number {
  if (!isWet(world.state.management.weather.current) || guest.items.umbrella) return 1;
  if (rideFlags(ride)?.covered) return WET_SCORE_COVERED;
  return guest.temperament >= WET_BOLD_TEMPERAMENT ? WET_SCORE_UNCOVERED_BOLD : WET_SCORE_UNCOVERED;
}

/** Every Phase 3 ride score multiplier: weather × campaigns (Ride Spotlight, weekends). */
export function rideScoreFactor(world: World, guest: Guest, ride: Ride): number {
  return weatherRideScoreFactor(world, guest, ride) * campaignRideScoreFactor(world, guest, ride);
}

/** Catalog weather sales factor of the stall for the current weather (§4.9, catalog §3). */
export function weatherStallFactor(world: World, stall: Stall): number {
  return getStallDef(stall.defId)?.weatherFactors[world.state.management.weather.current] ?? 1;
}

function heldTarget(world: World, guest: Guest): boolean {
  let rideId = -1;
  if (guest.target !== null && guest.target.startsWith('ride:')) rideId = Number(guest.target.slice(5));
  else if (guest.state === 'queueing') rideId = guest.activityId;
  return rideId >= 0 && findRide(world, rideId)?.status === 'stormHold';
}

function weatherDecision(world: World, guest: Guest): boolean {
  const weather = world.state.management.weather.current;
  const delta = weatherHappinessDelta(world, guest);
  if (delta !== 0) guest.needs.happiness = Math.max(0, Math.min(255, guest.needs.happiness + delta));
  if (isWet(weather) && !isGuestCovered(world, guest)) {
    addThought(world, guest, guest.items.umbrella ? THOUGHT.goodUmbrella : THOUGHT.rainNoUmbrella);
  } else if (weather === 'hot') addThought(world, guest, THOUGHT.tooHot);
  else if (weather === 'cold') addThought(world, guest, THOUGHT.tooCold);
  if (weather === 'storm' && heldTarget(world, guest)) addThought(world, guest, THOUGHT.stormClosed);
  return false;
}

const HOT_EXTRA_THIRST = Math.round(BASE_THIRST_PER_100 * (HOT_THIRST_FACTOR - 1) * (HOT_EXTRA_THIRST_TICKS / 100));

function weatherNeeds(world: World, guest: Guest): void {
  const weather = world.state.management.weather.current;
  const tick = world.state.tick;
  if (weather === 'hot' && tick % HOT_EXTRA_THIRST_TICKS === 0) {
    guest.needs.thirst = Math.min(255, guest.needs.thirst + HOT_EXTRA_THIRST);
  } else if (weather === 'cold' && tick % COLD_EXTRA_ENERGY_TICKS === 0) {
    const drain = 0.8 + guest.temperament / 250; // Phase 1 energy drain multiplier
    const extra = Math.round(BASE_ENERGY_PER_100 * (COLD_ENERGY_FACTOR - 1) * (COLD_EXTRA_ENERGY_TICKS / 100) * drain);
    guest.needs.energy = Math.max(0, guest.needs.energy - extra);
  }
}

function stallWant(world: World, _guest: Guest, stall: Stall): number {
  return weatherStallFactor(world, stall) * campaignStallWant(world, stall);
}

export const weatherHooks: Partial<GuestHooks> = {
  beforeDecision: [weatherDecision],
  perTick: [weatherNeeds],
  rideScoreFactor: [rideScoreFactor],
  stallWant: [stallWant],
};
