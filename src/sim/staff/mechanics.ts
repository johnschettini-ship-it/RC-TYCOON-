/**
 * Owner: W1-H. Mechanic dispatch, the pending-breakdown queue, fixes, and inspections (Phase 3 §4.2, §4.5).
 */
import { FIX_TICKS, INSPECTION_TICKS, RECENT_BREAK_TICKS } from '../../data/tuning/staff';
import { fixedReliability, fixFactor, inspectedReliability, rideAgeYears } from '../breakdowns/reliability';
import { isWalkable } from '../pathing';
import type { Ride } from '../rides/types';
import type { World } from '../types';
import { staffBfs } from './bfs';
import { findRide, serviceTile } from './lookup';
import { inPatrol } from './patrol';
import type { Staff } from './types';

export function isMechanic(s: Staff): boolean {
  return s.type === 'mechanic';
}

/** A Mechanic who is not assigned to a breakdown. */
export function isFreeMechanic(s: Staff): boolean {
  return s.type === 'mechanic' && s.fixRideId === -1;
}

export function hasFreeMechanic(world: World): boolean {
  return world.state.staff.members.some(isFreeMechanic);
}

/** Head for the ride's service tile to fix it. The route is planned at the next tile boundary. */
export function startFixTask(s: Staff, ride: Ride): void {
  s.task = 'fix';
  s.targetRideId = ride.id;
  s.targetTile = serviceTile(ride);
  s.route = [];
  s.state = 'walking';
  s.stateTicks = 0;
  s.savedRideStatus = null;
}

export function assignMechanic(world: World, s: Staff, ride: Ride): void {
  s.fixRideId = ride.id;
  ride.assignedMechanicId = s.id;
  if (s.state === 'inspecting' && s.savedRideStatus !== null) {
    const inspected = findRide(world, s.targetRideId);
    // §4.2 rule 4: a Mechanic inspecting on site finishes the inspection first.
    if (inspected && inspected.status === 'inspecting') return;
  }
  // An inspection walk (or a wait for the cycle to end) is dropped for a dispatch.
  startFixTask(s, ride);
}

/**
 * §4.2 Mechanic dispatch. Free, reachable Mechanics whose patrol contains the service tile (or is empty)
 * are candidates; with none, every free reachable Mechanic is. Smallest service-field distance wins; ties
 * go to the lower id. Returns false when nobody can take it (the caller queues it).
 */
export function dispatchMechanic(world: World, ride: Ride): boolean {
  const service = serviceTile(ride);
  if (service < 0 || !isWalkable(world, service, 'staff')) return false;
  const free = world.state.staff.members.filter(isFreeMechanic);
  if (free.length === 0) return false;
  const field = staffBfs(world, service);
  const pick = (needPatrol: boolean): Staff | undefined => {
    let best: Staff | undefined;
    let bestDist = Number.MAX_SAFE_INTEGER;
    for (const m of free) {
      const d = field.dist(m.tile);
      if (d < 0) continue;
      if (needPatrol && !inPatrol(m.patrol, service)) continue;
      if (d < bestDist) {
        best = m;
        bestDist = d;
      }
    }
    return best;
  };
  const chosen = pick(true) ?? pick(false);
  if (!chosen) return false;
  assignMechanic(world, chosen, ride);
  return true;
}

/** Give pending breakdowns (oldest first) to free Mechanics. Drops entries that are fixed or gone. */
export function dispatchPending(world: World): void {
  const staff = world.state.staff;
  if (staff.pendingBreakdowns.length === 0 || !hasFreeMechanic(world)) return;
  const keep: number[] = [];
  for (const id of staff.pendingBreakdowns) {
    const ride = findRide(world, id);
    if (!ride || ride.status !== 'broken' || ride.assignedMechanicId !== null) continue;
    if (hasFreeMechanic(world) && dispatchMechanic(world, ride)) continue;
    keep.push(id);
  }
  staff.pendingBreakdowns = keep;
}

/** Queue a breakdown for the next free Mechanic. `front` puts it first (a fired Mechanic's job). */
export function queueBreakdown(world: World, rideId: number, front: boolean): void {
  const pending = world.state.staff.pendingBreakdowns.filter((id) => id !== rideId);
  if (front) pending.unshift(rideId);
  else pending.push(rideId);
  world.state.staff.pendingBreakdowns = pending;
}

/** Drop the Mechanic's breakdown assignment and queue it again (fired, or the route is gone). */
export function releaseFix(world: World, s: Staff, front: boolean): void {
  if (s.fixRideId === -1) return;
  const ride = findRide(world, s.fixRideId);
  if (ride && ride.status === 'broken' && ride.assignedMechanicId === s.id) {
    ride.assignedMechanicId = null;
    queueBreakdown(world, ride.id, front);
  }
  s.fixRideId = -1;
  if (s.task === 'fix') {
    s.task = 'none';
    s.targetRideId = -1;
    s.targetTile = -1;
    s.route = [];
  }
}

/** End an inspection early and give the ride its status back (no reliability gain). */
export function abortInspection(world: World, s: Staff): void {
  if (s.savedRideStatus !== null) {
    const ride = findRide(world, s.targetRideId);
    if (ride && ride.status === 'inspecting') ride.status = s.savedRideStatus;
  }
  s.savedRideStatus = null;
}

export function fixDurationTicks(ride: Ride): number {
  return Math.round(FIX_TICKS * fixFactor(ride.breakdownType));
}

function recordRecentFix(world: World, rideId: number): void {
  const now = world.state.tick;
  const list = world.state.staff.recentFixes.filter((f) => f.rideId !== rideId && now - f.tick < RECENT_BREAK_TICKS);
  list.push({ rideId, tick: now });
  list.sort((a, b) => a.rideId - b.rideId);
  world.state.staff.recentFixes = list;
}

/** The fix is done: reliability rises, the ride returns to its status before the breakdown. */
export function completeFix(world: World, s: Staff): void {
  const ride = findRide(world, s.fixRideId);
  if (ride && ride.status === 'broken') {
    ride.reliability = fixedReliability(ride.reliability, rideAgeYears(ride.builtTick, world.state.tick));
    ride.status = ride.statusBeforeBreakdown ?? 'open';
    ride.breakdownType = null;
    ride.statusBeforeBreakdown = null;
    ride.assignedMechanicId = null;
    recordRecentFix(world, ride.id);
  }
  s.fixRideId = -1;
  s.targetRideId = -1;
  s.targetTile = -1;
  s.task = 'none';
  s.state = 'walking';
  s.stateTicks = 0;
  dispatchPending(world);
}

/** A ride may enter inspection only between cycles (flat) — track trains finish and are held at a station. */
export function canStartInspection(ride: Ride): boolean {
  if (ride.status !== 'open' && ride.status !== 'closed') return false;
  if (ride.kind === 'track') return true;
  return ride.cycle.phase === 'waiting' || ride.cycle.phase === 'loading';
}

/** Mechanic in state `inspecting` on the service tile: wait for the cycle, then inspect for INSPECTION_TICKS. */
export function updateInspecting(world: World, s: Staff): void {
  const ride = findRide(world, s.targetRideId);
  if (s.savedRideStatus !== null) {
    if (!ride || ride.status !== 'inspecting') {
      s.savedRideStatus = null;
      finishMechanicActivity(world, s);
      return;
    }
    s.stateTicks -= 1;
    if (s.stateTicks > 0) return;
    ride.reliability = inspectedReliability(ride.reliability, rideAgeYears(ride.builtTick, world.state.tick));
    ride.lastInspectionTick = world.state.tick;
    ride.status = s.savedRideStatus;
    s.savedRideStatus = null;
    finishMechanicActivity(world, s);
    return;
  }
  if (!ride || (ride.status !== 'open' && ride.status !== 'closed')) {
    finishMechanicActivity(world, s);
    return;
  }
  if (!canStartInspection(ride)) return;
  s.savedRideStatus = ride.status;
  ride.status = 'inspecting';
  s.stateTicks = INSPECTION_TICKS;
}

/** After an inspection: go to an assigned breakdown, or choose a new task. */
function finishMechanicActivity(world: World, s: Staff): void {
  const fixRide = s.fixRideId !== -1 ? findRide(world, s.fixRideId) : undefined;
  if (fixRide && fixRide.status === 'broken' && fixRide.assignedMechanicId === s.id) {
    startFixTask(s, fixRide);
    return;
  }
  if (s.fixRideId !== -1) releaseFix(world, s, true);
  s.task = 'none';
  s.state = 'walking';
  s.stateTicks = 0;
  s.targetRideId = -1;
  s.targetTile = -1;
}
