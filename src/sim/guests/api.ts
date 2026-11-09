/**
 * Guest API used by ride and stall systems. Owner: W1-D. Signatures are a contract.
 *
 * Array ownership (integration notes):
 * - `boardRide` removes the guest from `ride.queue` itself (by id; harmless if the caller already
 *   shifted it). It never touches `ride.totals`, `ride.riders`, or train seats: the caller updates
 *   totals, adds the guest to riders and, for track rides, sets `guest.seat` after a `true` result.
 * - `finishRide` never touches `ride.riders`: the caller clears its own list (iterate a copy or clear after).
 * - `leaveQueue` and `forgetDestination` remove guests from `ride.queue` (iterate over a copy).
 */
import { temperamentGroup } from '../../data/catalog';
import { TICKS_PER_SECOND } from '../../data/tuning/core';
import {
  AIRTIME_HAPPY,
  AIRTIME_THRILL_SECONDS,
  GOOD_RIDE_GAIN,
  INVERSION_CHILL_HAPPY,
  QUEUE_MAX_JOIN,
  QUEUE_MAX_WAIT,
  RIDE_ENERGY_COST,
  RIDE_HAPPY_BASE,
  RIDE_HAPPY_EXC_DIV,
  RIDE_HAPPY_TAG_BONUS,
  RIDE_NAUSEA_FACTOR,
  SLOW_RUNNING_EXCITEMENT,
  TAME_FACTOR,
} from '../../data/tuning/guests';
import { recordLedger } from '../economy/ledger';
import { guestHooks } from '../hooks';
import type { Ride } from '../rides/types';
import type { World } from '../types';
import { changeNeed } from './needs';
import { gateZ, relocate, stepOffQueue, stopWalking, tileOk } from './movement';
import { rideTag } from './scoring';
import { byId, findRide, findStall, parseDest, replan, rideAcceptsGuests, rideDest, setState } from './state';
import { minIntensity, nauseaGainMultiplier, tagFit } from './temperament';
import { THOUGHT, addThought } from './thoughts';
import type { DestKey, Guest } from './types';

export { addThought, THOUGHT } from './thoughts';

function removeFromQueue(ride: Ride, guestId: number): void {
  const i = ride.queue.indexOf(guestId);
  if (i >= 0) ride.queue.splice(i, 1);
}

/**
 * Guest at the queue front boards: pays the price and enters state `riding`. False if the guest cannot board.
 * Ride totals are the ride system's job (W1-E flat, W1-G track): it updates them when this returns true.
 * False only when the guest can never board (cannot pay): the guest thinks "I need cash" and leaves the
 * queue here already; the ride system's own `leaveQueue` call is then a harmless no-op.
 */
export function boardRide(world: World, guest: Guest, ride: Ride): boolean {
  if (guest.state === 'riding') return false;
  if (guest.cash < ride.price) {
    addThought(world, guest, THOUGHT.needCash);
    leaveQueue(world, guest, ride, null);
    return false;
  }
  removeFromQueue(ride, guest.id);
  const waitTicks = guest.state === 'queueing' ? guest.stateTicks : 0;
  const price = ride.price;
  guest.cash -= price;
  guest.spent += price;
  if (price !== 0) recordLedger(world, 'rideTickets', price);
  setState(guest, 'riding');
  guest.activityId = ride.id;
  guest.target = rideDest(ride.id);
  stopWalking(guest);
  for (const hook of guestHooks.onBoard) hook(world, guest, ride, waitTicks);
  return true;
}

/** Happiness gain of one ride before track extras (Phase 1 §4.3 Riding). */
export function rideHappinessGain(world: World, guest: Guest, ride: Ride): { gain: number; tame: boolean } {
  const stats = ride.stats;
  if (!stats) return { gain: 0, tame: false };
  let exc = stats.excitement;
  if (ride.status === 'broken' && ride.breakdownType === 'slow_running') exc = Math.max(0, exc - SLOW_RUNNING_EXCITEMENT);
  const tag = rideTag(world, ride);
  const fit = tag ? tagFit(guest.temperament, tag) : 0;
  const raw = ((RIDE_HAPPY_BASE * (exc / 100)) / RIDE_HAPPY_EXC_DIV) * (1 + Math.max(0, fit) * RIDE_HAPPY_TAG_BONUS);
  const tame = stats.intensity < minIntensity(guest.temperament);
  return { gain: Math.round(tame ? raw * TAME_FACTOR : raw), tame };
}

function exitTile(ride: Ride, fallback: number): number {
  if (ride.exit && ride.exit.outside >= 0) return ride.exit.outside;
  if (ride.entrance && ride.entrance.outside >= 0) return ride.entrance.outside;
  return fallback;
}

/** Ride over: apply ride effects (Phase 1 §4.3 Riding) and place the guest on the exit's outside tile. */
export function finishRide(world: World, guest: Guest, ride: Ride): void {
  if (guest.state !== 'riding' || guest.activityId !== ride.id) return;
  const stats = ride.stats;
  if (stats) {
    const { gain, tame } = rideHappinessGain(world, guest, ride);
    changeNeed(guest, 'happiness', gain);
    changeNeed(guest, 'nausea', Math.round((stats.nausea / 100) * RIDE_NAUSEA_FACTOR * nauseaGainMultiplier(guest.temperament)));
    if (tame) addThought(world, guest, THOUGHT.tame);
    else addThought(world, guest, gain >= GOOD_RIDE_GAIN ? THOUGHT.amazing : THOUGHT.nice);
    if (ride.kind === 'track') applyTrackExtras(world, guest, ride);
  }
  changeNeed(guest, 'energy', -RIDE_ENERGY_COST);
  const key = String(ride.id);
  guest.ridden[key] = (guest.ridden[key] ?? 0) + 1;
  for (const hook of guestHooks.afterRide) hook(world, guest, ride);

  guest.tile = exitTile(ride, guest.tile);
  guest.z = gateZ(world, ride, guest.tile, guest.z);
  stopWalking(guest);
  guest.seat = null;
  guest.activityId = -1;
  guest.target = null;
  setState(guest, 'walking');
  guest.nextDecisionTick = world.state.tick;
  if (!tileOk(world, guest.tile)) relocate(world, guest);
}

/**
 * Phase 2 §4.11: airtime pleases Thrill guests, inversions upset Chill guests. Reads the W1-G test result.
 * The only place these reactions happen: the track system unloads riders through `finishRide`.
 */
function applyTrackExtras(world: World, guest: Guest, ride: Ride): void {
  const data = world.state.track.rides[String(ride.id)];
  const test = data?.test ?? null;
  if (!test || !test.passed) return;
  const group = temperamentGroup(guest.temperament);
  // `TestResult.airtimeTicks` counts ticks; the threshold is in seconds (20 ticks = 1 s).
  const airtimeSeconds = test.airtimeTicks / TICKS_PER_SECOND;
  if (group === 'thrill' && airtimeSeconds >= AIRTIME_THRILL_SECONDS) {
    changeNeed(guest, 'happiness', AIRTIME_HAPPY);
    addThought(world, guest, THOUGHT.airtimeAwesome);
  }
  // `TestResult.inversions` is a plain count of loop pieces.
  if (group === 'chill' && test.inversions >= 1) {
    changeNeed(guest, 'happiness', INVERSION_CHILL_HAPPY);
    addThought(world, guest, THOUGHT.neverUpsideDown);
  }
}

/**
 * A guest walking to `ride` reached its queue. Joins when the queue holds fewer than 25 guests;
 * otherwise thinks "That queue is far too long", steps out of the line, and re-plans.
 */
export function joinQueue(world: World, guest: Guest, ride: Ride): boolean {
  if (!rideAcceptsGuests(ride)) {
    stepOffQueue(world, guest);
    replan(world, guest);
    return false;
  }
  if (ride.queue.length >= QUEUE_MAX_JOIN) {
    addThought(world, guest, THOUGHT.queueTooLong);
    stepOffQueue(world, guest);
    replan(world, guest);
    return false;
  }
  if (!ride.queue.includes(guest.id)) ride.queue.push(guest.id);
  setState(guest, 'queueing');
  guest.activityId = ride.id;
  guest.target = rideDest(ride.id);
  stopWalking(guest);
  // While queueing, `nextDecisionTick` is the patience deadline (Phase 3 §4.5 drains it faster on a broken ride).
  guest.nextDecisionTick = world.state.tick + QUEUE_MAX_WAIT;
  return true;
}

/** Remove a guest from a ride queue (closed ride, demolish, timeout). The guest re-plans. */
export function leaveQueue(world: World, guest: Guest, ride: Ride, thoughtId: string | null): void {
  removeFromQueue(ride, guest.id);
  if (thoughtId) addThought(world, guest, thoughtId);
  if (guest.state === 'queueing') {
    stepOffQueue(world, guest);
    replan(world, guest);
  }
}

export function findGuest(world: World, id: number): Guest | undefined {
  return byId(world.state.guests, id);
}

/** Stop a purchase in progress without a sale. */
export function cancelBuying(world: World, guest: Guest): void {
  const stall = findStall(world, guest.activityId);
  if (stall && stall.servingGuest === guest.id) stall.servingGuest = -1;
  replan(world, guest);
}

/** A ride, stall, or exit route was removed or closed: every guest targeting it re-plans at once. */
export function forgetDestination(world: World, dest: DestKey): void {
  const p = parseDest(dest);
  if (p.kind === 'exit') {
    // The exit cannot be removed; leaving guests re-route from their current tile.
    for (const g of world.state.guests) if (g.target === 'exit' && g.nextTile >= 0 && !tileOk(world, g.nextTile)) stopWalking(g);
    return;
  }
  const ride = p.kind === 'ride' ? findRide(world, p.id) : undefined;
  if (ride) {
    for (const id of [...ride.queue]) {
      const g = findGuest(world, id);
      if (g) leaveQueue(world, g, ride, null);
    }
    ride.queue.length = 0;
  }
  for (const g of world.state.guests) {
    if (g.target !== dest || g.state === 'riding') continue;
    if (g.state === 'queueing') {
      stepOffQueue(world, g);
      replan(world, g);
    } else if (g.state === 'buying') {
      cancelBuying(world, g);
    } else {
      replan(world, g);
    }
  }
}
