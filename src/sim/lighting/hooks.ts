/**
 * After Dark effects on guests (Phase 4 §4.7) through the guest hooks; every effect only when `nightActive`
 * (After Dark on and the clock in 20:00–06:00). Owner: W3-F.
 * - perTick, once per game hour per guest: guest on an unlit path tile → happiness −4, thought "This path is too
 *   dark". Each guest checks at its own phase of the hour (`(tick + id) mod 50 = 0`), so 2,000 guests do not all
 *   think the thought on one tick (the first night hour would cost one tick ~5 ms). The phase text gives the
 *   thought a 4-hour cooldown; master R5 (one game day per thought, `addThought`) is longer and wins.
 * - energyFactor: × 1.25
 * - rideScoreFactor: spooky ride × 1.3, plus 2% per spooky scenery item within 6 tiles (max +20%)
 * - afterRide: spooky ride → happiness +5 extra
 */
import { TICKS_PER_HOUR } from '../../data/tuning/core';
import { DARK_PATH_PENALTY, NIGHT_ENERGY_MULT, SPOOKY_ITEM_RADIUS, SPOOKY_RIDE_NIGHT_HAPPY } from '../../data/tuning/night';
import type { GuestHooks } from '../hookTypes';
import { changeNeed } from '../guests/needs';
import { addThought, THOUGHT } from '../guests/thoughts';
import type { Guest } from '../guests/types';
import { Content } from '../map';
import { pathNodesAt } from '../paths/api';
import type { Ride } from '../rides/types';
import { spookyItemsNear } from '../scenery/api';
import type { World } from '../types';
import { nightActive } from './api';
import { lightOf, litValue, syncLightForTick } from './lightMap';
import { spookyRideCentre, isSpookyRide } from './spooky';
import { spookyScoreFactorFor } from './rules';

/** The guest stands on a walkable path node (ground footpath, queue, entrance, or an elevated path). */
function onPath(world: World, guest: Guest): boolean {
  const map = world.state.map;
  const c = map.content[guest.tile];
  if (c === Content.Footpath || c === Content.Queue || c === Content.ParkEntrance) return true;
  return pathNodesAt(world, guest.tile).length > 0;
}

/** The hourly dark-path check of this guest falls on this tick (its own phase of the game hour). */
export function darkPathPhase(tick: number, guestId: number): boolean {
  return (tick + guestId) % TICKS_PER_HOUR === 0;
}

/** perTick: the hourly dark-path effect at the guest's own phase of the hour. */
export function darkPathTick(world: World, guest: Guest): void {
  if (darkPathPhase(world.state.tick, guest.id)) darkPathHour(world, guest);
}

/** The hourly effect: an unlit path at night costs 4 happiness and raises the dark-path thought. */
export function darkPathHour(world: World, guest: Guest): void {
  if (!nightActive(world)) return;
  if (guest.state === 'riding' || guest.tile < 0 || guest.tile >= world.state.map.content.length) return;
  if (!onPath(world, guest)) return;
  // One diff per tick for the whole guest loop (this hook runs inside stepTick only).
  if (litValue(lightOf(syncLightForTick(world), guest.tile))) return;
  changeNeed(guest, 'happiness', DARK_PATH_PENALTY);
  addThought(world, guest, THOUGHT.pathTooDark);
}

/** energyFactor: guests tire 1.25× faster at night. */
export function nightEnergyFactor(world: World, _guest: Guest): number {
  return nightActive(world) ? NIGHT_ENERGY_MULT : 1;
}

/** rideScoreFactor: spooky rides are more popular at night, more so with spooky scenery around them. */
export function spookyRideScoreFactor(world: World, _guest: Guest, ride: Ride): number {
  if (!nightActive(world) || !isSpookyRide(world, ride)) return 1;
  return spookyScoreFactorFor(spookyItemsNear(world, spookyRideCentre(world, ride), SPOOKY_ITEM_RADIUS));
}

/** afterRide: a spooky ride at night is +5 happiness on top of the ride's own gain. */
export function spookyAfterRide(world: World, guest: Guest, ride: Ride): void {
  if (!nightActive(world) || !isSpookyRide(world, ride)) return;
  changeNeed(guest, 'happiness', SPOOKY_RIDE_NIGHT_HAPPY);
}

export const nightHooks: Partial<GuestHooks> = {
  perTick: [darkPathTick],
  energyFactor: [nightEnergyFactor],
  rideScoreFactor: [spookyRideScoreFactor],
  afterRide: [spookyAfterRide],
};
