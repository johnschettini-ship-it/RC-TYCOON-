/**
 * Owner: W1-H. Phase 3 §4.5 per-tick breakdown work: reference integrity, the pending queue,
 * stuck riders, and bookkeeping for bench sitters and recent fixes.
 */
import { EVACUATE_TICKS, RECENT_BREAK_TICKS, STUCK_RIDER_HAPPY, STUCK_RIDER_INTERVAL } from '../../data/tuning/staff';
import { unloadRiders } from '../rides/flat/api';
import { THOUGHT, addThought } from '../guests/thoughts';
import { pruneSitters } from '../litter/benches';
import { changeHappiness } from '../staff/guestEffects';
import { findRide, findStaff, indexById } from '../staff/lookup';
import { dispatchPending, queueBreakdown } from '../staff/mechanics';
import type { World } from '../types';

export function updateBreakdowns(world: World): void {
  checkReferences(world);
  dispatchPending(world);
  stuckRiders(world);
  evacuateUnattended(world);
  pruneSitters(world);
  pruneRecentFixes(world);
}

/** Every assignment points to a live entity, or is cleared (Phase 3 §5 integrity). */
function checkReferences(world: World): void {
  const s = world.state;
  for (const m of s.staff.members) {
    if (m.type !== 'mechanic') continue;
    if (m.fixRideId !== -1) {
      const ride = findRide(world, m.fixRideId);
      if (!ride || ride.status !== 'broken' || ride.assignedMechanicId !== m.id) {
        m.fixRideId = -1;
        if (m.task === 'fix') {
          m.task = 'none';
          m.targetTile = -1;
          m.targetRideId = -1;
          m.route = [];
          if (m.state === 'fixing') {
            m.state = 'walking';
            m.stateTicks = 0;
          }
        }
      }
    }
    if (m.targetRideId !== -1 && !findRide(world, m.targetRideId)) {
      m.targetRideId = -1;
      m.targetTile = -1;
      m.savedRideStatus = null;
      m.route = [];
      m.task = 'none';
      if (m.state === 'inspecting' || m.state === 'fixing') {
        m.state = 'walking';
        m.stateTicks = 0;
      }
    }
  }
  const pending = s.staff.pendingBreakdowns;
  if (pending.some((id) => indexById(s.rides, id) < 0)) {
    s.staff.pendingBreakdowns = pending.filter((id) => indexById(s.rides, id) >= 0);
  }
  for (const ride of s.rides) {
    if (ride.status !== 'broken') continue;
    if (ride.assignedMechanicId !== null) {
      const m = findStaff(world, ride.assignedMechanicId);
      if (m && m.fixRideId === ride.id) continue;
      ride.assignedMechanicId = null;
    }
    if (!s.staff.pendingBreakdowns.includes(ride.id)) queueBreakdown(world, ride.id, false);
  }
}

/** Riders on a stopped ride lose 1 happiness per decision interval and think "We are stuck!". */
function stuckRiders(world: World): void {
  const s = world.state;
  const stuck = new Set<number>();
  for (const ride of s.rides) {
    if (ride.status !== 'broken' || ride.breakdownType === 'slow_running') continue;
    const since = s.tick - ride.lastBreakdownTick;
    if (since > 0 && since % STUCK_RIDER_INTERVAL === 0) stuck.add(ride.id);
  }
  if (stuck.size === 0) return;
  for (const g of s.guests) {
    if (g.state !== 'riding') continue;
    const rideId = g.seat ? g.seat.rideId : g.activityId;
    if (!stuck.has(rideId)) continue;
    changeHappiness(g, -STUCK_RIDER_HAPPY);
    addThought(world, g, THOUGHT.stuck);
  }
}

/** Let riders off a broken flat ride that no Mechanic has been assigned to for EVACUATE_TICKS. */
function evacuateUnattended(world: World): void {
  const s = world.state;
  for (const ride of s.rides) {
    if (ride.kind !== 'flat' || ride.status !== 'broken' || ride.breakdownType === 'slow_running') continue;
    if (ride.assignedMechanicId !== null || ride.riders.length === 0) continue;
    if (s.tick - ride.lastBreakdownTick >= EVACUATE_TICKS) unloadRiders(world, ride);
  }
}

function pruneRecentFixes(world: World): void {
  const s = world.state;
  const list = s.staff.recentFixes;
  if (list.length === 0) return;
  if (list.every((f) => s.tick - f.tick < RECENT_BREAK_TICKS && indexById(s.rides, f.rideId) >= 0)) return;
  s.staff.recentFixes = list.filter((f) => s.tick - f.tick < RECENT_BREAK_TICKS && indexById(s.rides, f.rideId) >= 0);
}
