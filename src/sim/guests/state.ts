/** Small shared helpers for the guest system. Owner: W1-D. */
import type { Ride } from '../rides/types';
import type { Stall } from '../stalls/types';
import type { World } from '../types';
import type { EntityId } from '../units';
import type { DestKey, Guest, GuestStateName } from './types';

/** Binary search in an array sorted by ascending id. */
export function byId<T extends { id: EntityId }>(items: readonly T[], id: EntityId): T | undefined {
  let lo = 0;
  let hi = items.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const item = items[mid] as T;
    if (item.id === id) return item;
    if (item.id < id) lo = mid + 1;
    else hi = mid - 1;
  }
  // Fall back to a scan in case a caller broke the sort order.
  return items.find((x) => x.id === id);
}

export function findRide(world: World, id: EntityId): Ride | undefined {
  return byId(world.state.rides, id);
}

export function findStall(world: World, id: EntityId): Stall | undefined {
  return byId(world.state.stalls, id);
}

export type ParsedDest = { kind: 'ride'; id: EntityId } | { kind: 'stall'; id: EntityId } | { kind: 'exit' };

export function parseDest(dest: DestKey): ParsedDest {
  if (dest === 'exit') return { kind: 'exit' };
  if (dest.startsWith('ride:')) return { kind: 'ride', id: Number(dest.slice(5)) };
  return { kind: 'stall', id: Number(dest.slice(6)) };
}

export function rideDest(id: EntityId): DestKey {
  return `ride:${id}`;
}

export function stallDest(id: EntityId): DestKey {
  return `stall:${id}`;
}

/** Guests may start walking to a ride only while it is open and has stats. */
export function rideChoosable(ride: Ride): boolean {
  return ride.status === 'open' && ride.stats !== null;
}

/**
 * Guests already on their way keep going, and may join the queue, while the ride is open or briefly held
 * (inspection, storm hold). Closed, broken, building, and testing rides make them decide again (Phase 3 §4.5).
 */
export function rideAcceptsGuests(ride: Ride): boolean {
  return ride.stats !== null && (ride.status === 'open' || ride.status === 'inspecting' || ride.status === 'stormHold');
}

/** True while `dest` is still a valid walking target. */
export function targetValid(world: World, dest: DestKey): boolean {
  const p = parseDest(dest);
  if (p.kind === 'exit') return true;
  if (p.kind === 'ride') {
    const ride = findRide(world, p.id);
    return ride !== undefined && rideAcceptsGuests(ride);
  }
  const stall = findStall(world, p.id);
  return stall !== undefined && stall.open && stall.serviceTile >= 0;
}

export function setState(guest: Guest, state: GuestStateName): void {
  guest.state = state;
  guest.stateTicks = 0;
}

/** Drop the target and decide again on this guest's next update. Leaving guests keep heading out. */
export function replan(world: World, guest: Guest): void {
  guest.activityId = -1;
  guest.seat = null;
  if (guest.state === 'leaving') {
    guest.target = 'exit';
    return;
  }
  if (guest.state !== 'walking') setState(guest, 'walking');
  guest.target = null;
  guest.nextDecisionTick = world.state.tick;
}
