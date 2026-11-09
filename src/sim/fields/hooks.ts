/**
 * Calm and Buzz effects on guests (Phase 4 §4.6) through the guest hooks. Owner: W3-E.
 * - energyFactor: Phase 1 energy loss × (1 − 0.6 × C × c)
 * - nauseaRecoveryFactor: Phase 1 nausea recovery × (1 + C × (1 + 2c))
 * - perHour: happiness + round(6 × C × c) − round(3 × B × c) + round(6 × B × h)
 * - walkSpeed: Chill × (1 − 0.15 × C × c); Thrill walking to a `thrill` ride × (1 + 0.25 × B × h)
 *
 * Values come from the guest's current tile (`guest.tile`; on an elevated path, its tile column). A guest on a ride
 * has no tile value: every factor is 1 and the hour adds nothing. Formulas: `./effects.ts`.
 *
 * This module imports no guest module (the hook registry imports it, and guest modules import the registry).
 */
import { getFlatRideDef, getTrackRideDef, temperamentGroup } from '../../data/catalog';
import { NEED_MAX } from '../../data/tuning/guests';
import type { GuestHooks } from '../hookTypes';
import type { Guest } from '../guests/types';
import type { Ride } from '../rides/types';
import type { World } from '../types';
import { energyFactorOf, happinessDeltaOf, nauseaRecoveryFactorOf, walkFactorOf } from './effects';
import { buzzRead, calmRead, simFields } from './store';

/** The tile whose fields apply to the guest, or −1 (on a ride, not on the map). */
function fieldTile(guest: Guest): number {
  return guest.state === 'riding' ? -1 : guest.tile;
}

/** The ride id of a `ride:<id>` target without allocating, or −1. */
function targetRideId(target: Guest['target']): number {
  // 'ride:' = r i d e :
  if (target === null || target.length < 6 || target.charCodeAt(0) !== 114 || target.charCodeAt(4) !== 58) return -1;
  let id = 0;
  for (let k = 5; k < target.length; k++) {
    const d = target.charCodeAt(k) - 48;
    if (d < 0 || d > 9) return -1;
    id = id * 10 + d;
  }
  return id;
}

function findRide(rides: readonly Ride[], id: number): Ride | undefined {
  let lo = 0;
  let hi = rides.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = rides[mid] as Ride;
    if (r.id === id) return r;
    if (r.id < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

/** True when the guest walks to a ride with tag `thrill` (Phase 4 §4.6 walking speed row). */
export function walkingToThrillRide(world: World, guest: Guest): boolean {
  const id = targetRideId(guest.target);
  if (id < 0) return false;
  const ride = findRide(world.state.rides, id);
  if (ride === undefined) return false;
  if (ride.kind === 'flat') return getFlatRideDef(ride.defId)?.tag === 'thrill';
  const typeId = world.state.track.rides[String(ride.id)]?.typeId ?? ride.defId;
  return getTrackRideDef(typeId)?.tag === 'thrill';
}

function energyFactor(world: World, guest: Guest): number {
  const tile = fieldTile(guest);
  if (tile < 0) return 1;
  const c = simFields(world);
  if (tile >= c.n) return 1;
  return energyFactorOf(calmRead(c, world.state.map, tile), guest.temperament);
}

function nauseaRecoveryFactor(world: World, guest: Guest): number {
  const tile = fieldTile(guest);
  if (tile < 0) return 1;
  const c = simFields(world);
  if (tile >= c.n) return 1;
  return nauseaRecoveryFactorOf(calmRead(c, world.state.map, tile), guest.temperament);
}

function perHour(world: World, guest: Guest): void {
  const tile = fieldTile(guest);
  if (tile < 0) return;
  const c = simFields(world);
  if (tile >= c.n) return;
  const delta = happinessDeltaOf(calmRead(c, world.state.map, tile), buzzRead(c, tile), guest.temperament);
  if (delta === 0) return;
  const v = guest.needs.happiness + delta;
  guest.needs.happiness = v < 0 ? 0 : v > NEED_MAX ? NEED_MAX : v;
}

function walkSpeed(world: World, guest: Guest): number {
  const t = guest.temperament;
  const group = temperamentGroup(t);
  if (group === 'family') return 1;
  const tile = fieldTile(guest);
  if (tile < 0) return 1;
  const c = simFields(world);
  if (tile >= c.n) return 1;
  if (group === 'chill') return walkFactorOf(calmRead(c, world.state.map, tile), 0, t, false);
  const buzz = buzzRead(c, tile);
  if (buzz === 0) return 1;
  return walkFactorOf(0, buzz, t, walkingToThrillRide(world, guest));
}

export const fieldHooks: Partial<GuestHooks> = {
  energyFactor: [energyFactor],
  nauseaRecoveryFactor: [nauseaRecoveryFactor],
  perHour: [perHour],
  walkSpeed: [walkSpeed],
};
