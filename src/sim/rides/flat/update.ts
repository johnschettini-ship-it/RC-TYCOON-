/**
 * Owner: W1-E. Phase 1 §4.4 flat ride cycle: waiting → loading → running → unloading → waiting.
 *
 * Timing (one call = one tick):
 * - waiting → loading on the first tick with a guest in the queue; boarding starts on that tick.
 * - Loading ends when the ride is full, or after LOAD_MAX_WAIT ticks with at least 1 rider.
 *   Loading with nobody on board and nobody queued goes back to waiting.
 * - At the loading → running transition `onRideDispatch` rolls wear and breakdowns (Phase 3 §4.5).
 *   True means the ride broke down: it stays in loading with its riders on board and does not run.
 *   The breakdown system owns the status; once the ride is `open` again the cycle continues.
 * - Running lasts `cycleTicks` ticks (× SLOW_RUNNING_CYCLE_FACTOR during a `slow_running` breakdown).
 * - Unloading lasts UNLOAD_TICKS ticks, then every rider gets `finishRide` in boarding order.
 *
 * Status rules:
 * - `open`: the full cycle; guests board.
 * - `closed`, `stormHold`, `inspecting`: riders finish the current cycle; nobody boards; no new cycle starts.
 *   Loading with riders on board ends at once (the riders still get their ride).
 * - `broken` with breakdown type `slow_running`: keeps running like `open`, slower, with no new breakdown roll.
 * - `broken` (other types): frozen until the breakdown system restores the status.
 */
import { getFlatRideDef, type FlatRideDef } from '../../../data/catalog';
import {
  LOAD_MAX_WAIT,
  SLOW_RUNNING_BREAKDOWN,
  SLOW_RUNNING_CYCLE_FACTOR,
  UNLOAD_TICKS,
} from '../../../data/tuning/economy';
import { onRideDispatch } from '../../breakdowns/api';
import { boardRide, findGuest, leaveQueue } from '../../guests/api';
import type { Ride } from '../types';
import type { World } from '../../types';
import { removeId, unloadRiders } from './api';

function isSlowRunning(ride: Ride): boolean {
  return ride.status === 'broken' && ride.breakdownType === SLOW_RUNNING_BREAKDOWN;
}

/** Guests may board and new cycles may start. */
function canLoad(ride: Ride): boolean {
  return ride.status === 'open' || isSlowRunning(ride);
}

/** The cycle advances (possibly only to finish the current one). */
function cycleAdvances(ride: Ride): boolean {
  switch (ride.status) {
    case 'open':
    case 'closed':
    case 'stormHold':
    case 'inspecting':
      return true;
    case 'broken':
      return isSlowRunning(ride);
    default:
      return false;
  }
}

/** Running ticks for this cycle. */
export function runTicks(ride: Ride, def: FlatRideDef): number {
  return isSlowRunning(ride) ? Math.ceil(def.cycleTicks * SLOW_RUNNING_CYCLE_FACTOR) : def.cycleTicks;
}

/**
 * Board guests from the queue front until the ride is full or the queue is empty.
 * At most one attempt per guest queued at the start of the tick, so a guest who re-joins at once cannot loop.
 */
function board(world: World, ride: Ride, capacity: number): void {
  let attempts = ride.queue.length;
  while (ride.riders.length < capacity && ride.queue.length > 0 && attempts-- > 0) {
    const id = ride.queue[0] as number;
    const guest = findGuest(world, id);
    if (!guest) {
      ride.queue.shift();
      continue;
    }
    if (boardRide(world, guest, ride)) {
      removeId(ride.queue, id);
      ride.riders.push(id);
      ride.totals.riders += 1;
      ride.totals.ridersThisMonth += 1;
      ride.totals.income += ride.price;
      ride.totals.incomeThisMonth += ride.price;
    } else {
      // The guest cannot board: it leaves the queue and re-plans.
      leaveQueue(world, guest, ride, null);
      removeId(ride.queue, id);
    }
  }
}

function dispatch(world: World, ride: Ride): void {
  // A ride that is already broken (slow running) does not roll again.
  if (ride.status !== 'broken' && onRideDispatch(world, ride)) return;
  ride.cycle = { phase: 'running', ticks: 0 };
}

function loadStep(world: World, ride: Ride, def: FlatRideDef): void {
  const loading = canLoad(ride);
  if (loading) board(world, ride, def.capacity);
  const riders = ride.riders.length;
  if (riders >= def.capacity || (riders >= 1 && (ride.cycle.ticks >= LOAD_MAX_WAIT || !loading))) {
    dispatch(world, ride);
  } else if (riders === 0 && (!loading || ride.queue.length === 0)) {
    ride.cycle = { phase: 'waiting', ticks: 0 };
  }
}

function updateRide(world: World, ride: Ride, def: FlatRideDef): void {
  const cycle = ride.cycle;
  switch (cycle.phase) {
    case 'waiting':
      if (!canLoad(ride) || ride.queue.length === 0) return;
      ride.cycle = { phase: 'loading', ticks: 0 };
      loadStep(world, ride, def);
      return;
    case 'loading':
      cycle.ticks += 1;
      loadStep(world, ride, def);
      return;
    case 'running':
      cycle.ticks += 1;
      if (cycle.ticks >= runTicks(ride, def)) ride.cycle = { phase: 'unloading', ticks: 0 };
      return;
    case 'unloading':
      cycle.ticks += 1;
      if (cycle.ticks >= UNLOAD_TICKS) {
        unloadRiders(world, ride);
        ride.cycle = { phase: 'waiting', ticks: 0 };
      }
      return;
  }
}

export function updateFlatRides(world: World): void {
  for (const ride of world.state.rides) {
    if (ride.kind !== 'flat' || !cycleAdvances(ride)) continue;
    const def = getFlatRideDef(ride.defId);
    if (!def) continue;
    updateRide(world, ride, def);
  }
}
