/** Owner: W1-I. Phase 3 §4.9. Changes weather on its interval and holds tall rides in storms. */
import {
  AFTER_STORM_WEIGHTS,
  SEASON_WEATHER_WEIGHTS,
  STORM_FROM,
  WEATHER_ARRIVAL_FACTOR,
  WEATHER_INTERVAL,
  WEATHER_STATES,
  WEATHER_STAY,
} from '../../data/tuning/management';
import { MSG } from '../../data/strings/management';
import { TALL_HEIGHT_M } from '../../data/tuning/track';
import { getFlatRideDef, getTrackRideDef, type WeatherKey } from '../../data/catalog';
import { notify } from '../notifications';
import { trackHighestPointM } from '../rides/track/api';
import type { Ride } from '../rides/types';
import { rngChance, rngInt, type RngHolder } from '../rng';
import { seasonOf, type Season } from '../time';
import type { World } from '../types';

function weightedPick(rng: RngHolder, weights: Readonly<Record<WeatherKey, number>>): WeatherKey {
  let total = 0;
  for (const k of WEATHER_STATES) total += weights[k];
  let r = rngInt(rng, 0, total - 1);
  for (const k of WEATHER_STATES) {
    r -= weights[k];
    if (r < 0) return k;
  }
  return WEATHER_STATES[WEATHER_STATES.length - 1] as WeatherKey;
}

/**
 * The state after `current` (§4.9 draw rule). After a storm: rain or cloudy, 1:1.
 * Else stay with chance `WEATHER_STAY`, else draw from the season weights; a storm draw becomes
 * rain unless `current` is rain or cloudy.
 */
export function drawNextWeather(rng: RngHolder, current: WeatherKey, season: Season): WeatherKey {
  if (current === 'storm') return weightedPick(rng, AFTER_STORM_WEIGHTS);
  if (rngChance(rng, WEATHER_STAY)) return current;
  const drawn = weightedPick(rng, SEASON_WEATHER_WEIGHTS[season]);
  if (drawn === 'storm' && !STORM_FROM.includes(current)) return 'rain';
  return drawn;
}

/**
 * Every tick (tick order R13). At `nextChangeTick` the forecast becomes current and a new forecast
 * is drawn for the season in which it starts. Changes fall on multiples of `WEATHER_INTERVAL`.
 */
export function updateWeather(world: World): void {
  const s = world.state;
  const w = s.management.weather;
  if (s.tick >= w.nextChangeTick) {
    const prev = w.current;
    w.current = w.next;
    w.nextChangeTick = (Math.floor(s.tick / WEATHER_INTERVAL) + 1) * WEATHER_INTERVAL;
    w.next = drawNextWeather(s, w.current, seasonOf(w.nextChangeTick));
    if (w.current === 'storm' && prev !== 'storm') notify(world, 'weather', MSG.storm);
  }
  applyStormHold(world);
}

/** Arrival multiplier for the current weather (Phase 3 §4.9). */
export function weatherArrivalFactor(world: World): number {
  return WEATHER_ARRIVAL_FACTOR[world.state.management.weather.current];
}

/**
 * Catalog `tall` flag, or a track ride whose highest rail is ≥ 20 m above the ground below it
 * (`trackHighestPointM`: every rail tile of the current pieces against its own ground height).
 */
export function isTallRide(world: World, ride: Ride): boolean {
  if (ride.kind === 'track') {
    if (getTrackRideDef(ride.defId)?.flags.tall) return true;
    return trackHighestPointM(world, ride.id) >= TALL_HEIGHT_M;
  }
  return getFlatRideDef(ride.defId)?.flags.tall === true;
}

/**
 * During a storm, open tall rides get status `stormHold`: the ride systems finish the current cycle
 * or circuit and start no new one; queues stay. After the storm, held rides open again.
 */
export function applyStormHold(world: World): void {
  const storm = world.state.management.weather.current === 'storm';
  for (const ride of world.state.rides) {
    if (storm) {
      if (ride.status === 'open' && isTallRide(world, ride)) ride.status = 'stormHold';
    } else if (ride.status === 'stormHold') {
      ride.status = 'open';
    }
  }
}
