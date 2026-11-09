/**
 * Guest hook contract without the hook modules (no system imports), so a test can mock the registry (`./hooks`)
 * with a complete empty set from `emptyGuestHooks()` and `hookFactor`. Owner: integrator.
 */
import type { Guest } from './guests/types';
import type { Ride } from './rides/types';
import type { Stall } from './stalls/types';
import type { World } from './types';

export interface GuestHooks {
  /** At each guest decision, before needs and rides. Return true if the hook took the decision. */
  beforeDecision: Array<(world: World, guest: Guest) => boolean>;
  /** Every tick for each guest, after movement. */
  perTick: Array<(world: World, guest: Guest) => void>;
  /** Added to the ride score (Phase 1 §4.3). */
  rideScore: Array<(world: World, guest: Guest, ride: Ride) => number>;
  /** Multiplies a positive ride score (weather, campaigns, recently fixed rides). 1 = no change. */
  rideScoreFactor: Array<(world: World, guest: Guest, ride: Ride) => number>;
  /** Multiplies the wish to buy at a stall (weather factors). */
  stallWant: Array<(world: World, guest: Guest, stall: Stall) => number>;
  /** After a completed purchase. */
  afterPurchase: Array<(world: World, guest: Guest, stall: Stall) => void>;
  // ---- Build 2 (Wave 3.0) ----
  /** At every hour start, for each guest still in the park, after its tick (Calm/Buzz, dark paths, wet riders). */
  perHour: Array<(world: World, guest: Guest) => void>;
  /** A ride ended for this guest: after the ride effects, before the guest steps out at the exit (spooky, wet). */
  afterRide: Array<(world: World, guest: Guest, ride: Ride) => void>;
  /** A thought was added (not one held back by the repeat window). Month metrics count tracked thoughts. */
  onThought: Array<(world: World, guest: Guest, thoughtId: string) => void>;
  /** The guest boarded `ride` after `waitTicks` ticks in its queue (month metrics: queue waits). */
  onBoard: Array<(world: World, guest: Guest, ride: Ride, waitTicks: number) => void>;
  /** Multiplies the guest's walking progress per tick (Calm slows Chill guests, Buzz speeds Thrill guests). */
  walkSpeed: Array<(world: World, guest: Guest) => number>;
  /** Multiplies the Phase 1 energy drain per need step (Calm, night). */
  energyFactor: Array<(world: World, guest: Guest) => number>;
  /** Multiplies the Phase 1 nausea recovery per need step (Calm). */
  nauseaRecoveryFactor: Array<(world: World, guest: Guest) => number>;
}

export const GUEST_HOOK_KEYS: readonly (keyof GuestHooks)[] = [
  'beforeDecision',
  'perTick',
  'rideScore',
  'rideScoreFactor',
  'stallWant',
  'afterPurchase',
  'perHour',
  'afterRide',
  'onThought',
  'onBoard',
  'walkSpeed',
  'energyFactor',
  'nauseaRecoveryFactor',
];

export function emptyGuestHooks(): GuestHooks {
  const out = {} as Record<keyof GuestHooks, unknown[]>;
  for (const k of GUEST_HOOK_KEYS) out[k] = [];
  return out as unknown as GuestHooks;
}

/** One hook set from several partial ones, in argument order. */
export function mergeGuestHooks(...parts: Partial<GuestHooks>[]): GuestHooks {
  const out = emptyGuestHooks() as unknown as Record<keyof GuestHooks, unknown[]>;
  for (const p of parts) for (const k of GUEST_HOOK_KEYS) out[k].push(...((p[k] as unknown[] | undefined) ?? []));
  return out as unknown as GuestHooks;
}

/** Product of the guest's factor hooks (1 with none). */
export function hookFactor(list: ReadonlyArray<(world: World, guest: Guest) => number>, world: World, guest: Guest): number {
  let f = 1;
  for (const h of list) f *= h(world, guest);
  return f;
}
