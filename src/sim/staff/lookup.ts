/** Owner: W1-H. Id lookups over id-sorted entity arrays, and catalog lookups. */
import { STAFF } from '../../data/catalog/people';
import type { StaffDef, StaffType } from '../../data/catalog/types';
import type { Ride } from '../rides/types';
import type { Guest } from '../guests/types';
import type { World } from '../types';
import type { EntityId } from '../units';
import type { Staff } from './types';

/** Binary search in an array sorted by ascending `id`. Returns the index or −1. */
export function indexById<T extends { id: EntityId }>(items: readonly T[], id: EntityId): number {
  let lo = 0;
  let hi = items.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = (items[mid] as T).id;
    if (v === id) return mid;
    if (v < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

export function findById<T extends { id: EntityId }>(items: readonly T[], id: EntityId): T | undefined {
  const i = indexById(items, id);
  return i < 0 ? undefined : items[i];
}

export function findRide(world: World, id: EntityId): Ride | undefined {
  return findById(world.state.rides, id);
}

export function findStaff(world: World, id: EntityId): Staff | undefined {
  return findById(world.state.staff.members, id);
}

export function findGuestById(world: World, id: EntityId): Guest | undefined {
  return findById(world.state.guests, id);
}

export function staffDef(type: StaffType): StaffDef {
  const def = STAFF.find((d) => d.id === type);
  if (!def) throw new Error(`Unknown staff type ${type}`);
  return def;
}

/** The footpath outside the exit gate, where mechanics stand (Phase 3 §4.2), or −1. */
export function serviceTile(ride: Ride): number {
  return ride.exit ? ride.exit.outside : -1;
}
