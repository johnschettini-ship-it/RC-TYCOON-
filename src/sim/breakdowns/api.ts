/**
 * Owner: W1-H. Called by ride systems at dispatch (flat cycle start, train dispatch at a station).
 * Phase 3 §4.5. Reliability is integer hundredths (0–10,000).
 */
import { STAFF_MESSAGES } from '../../data/strings/staff';
import {
  INSPECT_DEFAULT,
  RECENT_BREAK_SCORE,
  RECENT_BREAK_TICKS,
  REL_MAX,
  SLOW_CYCLE_FACTOR,
  SLOW_EXCITEMENT_PENALTY,
  SLOW_POWERED_FACTOR,
  type BreakdownKind,
} from '../../data/tuning/staff';
import { forgetDestination } from '../guests/api';
import { THOUGHT, addThought } from '../guests/thoughts';
import { notify } from '../notifications';
import { rngChance } from '../rng';
import type { Ride } from '../rides/types';
import { findGuestById, serviceTile } from '../staff/lookup';
import { dispatchPending, queueBreakdown } from '../staff/mechanics';
import type { World } from '../types';
import { breakdownChance, pickBreakdownType, rideAgeYears, wornReliability } from './reliability';

/**
 * Sets the Phase 3 reliability fields of a newly placed ride (flat or track).
 * Integration: call from placeRide (W1-C) and track-ride creation (W1-G).
 */
export function initRideReliability(world: World, ride: Ride): void {
  ride.reliability = REL_MAX;
  ride.lastInspectionTick = world.state.tick;
  ride.inspectionIntervalTicks = INSPECT_DEFAULT;
  ride.breakdownType = null;
  ride.statusBeforeBreakdown = null;
  ride.breakdownsThisMonth = 0;
  ride.lastBreakdownTick = -1;
  ride.assignedMechanicId = null;
}

/** A track ride with `slow_running` keeps dispatching (powered drive ×0.6); every other breakdown holds the ride. */
function keepsRunning(ride: Ride): boolean {
  return ride.kind === 'track' && ride.breakdownType === 'slow_running';
}

/**
 * Rolls wear and breakdown for one dispatch. True if the ride must not start the cycle (track: the train
 * stays at the station, R16). The roll uses the reliability before this cycle's wear.
 */
export function onRideDispatch(world: World, ride: Ride): boolean {
  if (ride.status === 'broken') return !keepsRunning(ride);
  if (ride.status === 'inspecting') return true;
  if (ride.status !== 'open') return false;
  const p = breakdownChance(ride.reliability) * world.state.modifiers.breakdownChance;
  if (rngChance(world.state, p)) {
    breakDown(world, ride, pickBreakdownType(world.state, ride.kind));
    return !keepsRunning(ride);
  }
  ride.reliability = wornReliability(ride.reliability, rideAgeYears(ride.builtTick, world.state.tick));
  return false;
}

/** §4.5 Breakdown: status, counters, guest reactions, flat-ride stop, message, mechanic dispatch. */
export function breakDown(world: World, ride: Ride, type: BreakdownKind): void {
  const s = world.state;
  const before = ride.status === 'broken' ? ride.statusBeforeBreakdown : ride.status;
  const stops = !(ride.kind === 'track' && type === 'slow_running');
  const key = `ride:${ride.id}` as const;
  for (const id of ride.queue) {
    const g = findGuestById(world, id);
    if (g) addThought(world, g, THOUGHT.rideBrokeDown);
  }
  for (const g of s.guests) {
    if (g.target === key && g.state === 'walking') addThought(world, g, THOUGHT.rideBrokeDown);
  }
  // Riders wait on board (Phase 3 §4.5): the flat ride cycle freezes while `broken`.
  ride.status = 'broken';
  ride.breakdownType = type;
  ride.statusBeforeBreakdown = before ?? 'open';
  ride.breakdownsThisMonth += 1;
  ride.lastBreakdownTick = s.tick;
  ride.assignedMechanicId = null;
  if (stops) forgetDestination(world, key);
  notify(world, 'breakdown', STAFF_MESSAGES.breakdown, {
    params: { ride: ride.name, type },
    tile: serviceTile(ride),
    entityId: ride.id,
  });
  if (!s.staff.members.some((m) => m.type === 'mechanic')) {
    // §4.2 rule 6: once per breakdown (this is the only place it is sent).
    notify(world, 'staff', STAFF_MESSAGES.noMechanic, { tile: serviceTile(ride), entityId: ride.id });
  }
  // FIFO (§4.2 rule 5): older pending breakdowns go first when a Mechanic is free.
  queueBreakdown(world, ride.id, false);
  dispatchPending(world);
}

/**
 * Reliability sub-score B for the rating (Phase 3 §4.13):
 * 1 − min(1, (ridesBrokenNow + 0.5 × ridesBrokeThisMonth) / max(1, rides)).
 */
export function reliabilityScore(world: World): number {
  const rides = world.state.rides;
  let brokenNow = 0;
  let brokeThisMonth = 0;
  for (const r of rides) {
    if (r.status === 'broken') brokenNow++;
    if (r.breakdownsThisMonth > 0) brokeThisMonth++;
  }
  return 1 - Math.min(1, (brokenNow + 0.5 * brokeThisMonth) / Math.max(1, rides.length));
}

/** Average reliability of all rides, 0–1 (1 with no rides). For panels and overlays. */
export function averageReliability(world: World): number {
  const rides = world.state.rides;
  if (rides.length === 0) return 1;
  let sum = 0;
  for (const r of rides) sum += r.reliability;
  return sum / (rides.length * REL_MAX);
}

/** Guests score a ride ×RECENT_BREAK_SCORE for one game day after a fix (§4.5). */
export function recentBreakFactor(world: World, ride: Ride): number {
  const f = world.state.staff.recentFixes.find((x) => x.rideId === ride.id);
  return f && world.state.tick - f.tick < RECENT_BREAK_TICKS ? RECENT_BREAK_SCORE : 1;
}

/** Flat cycle time factor while `slow_running` (W1-E may apply it if slow flat rides keep running). */
export function breakdownCycleFactor(ride: Ride): number {
  return ride.status === 'broken' && ride.breakdownType === 'slow_running' ? SLOW_CYCLE_FACTOR : 1;
}

/** Powered drive speed factor for track rides while `slow_running` (chain and lift speeds never change). */
export function poweredSpeedFactor(ride: Ride): number {
  return ride.status === 'broken' && ride.breakdownType === 'slow_running' ? SLOW_POWERED_FACTOR : 1;
}

/** Rider excitement penalty (hundredths) while `slow_running`. */
export function slowExcitementPenalty(ride: Ride): number {
  return ride.status === 'broken' && ride.breakdownType === 'slow_running' ? SLOW_EXCITEMENT_PENALTY : 0;
}
