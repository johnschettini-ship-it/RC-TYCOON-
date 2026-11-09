/**
 * Guest hook contract. Lets Phase 3 systems change guest behaviour without editing W1-D files.
 * Owner of this file: integrator. Each hook list comes from its owner's module in a fixed order.
 */
import type { Guest } from './guests/types';
import type { Ride } from './rides/types';
import type { Stall } from './stalls/types';
import type { World } from './types';
import { litterHooks } from './litter/hooks';
import { weatherHooks } from './weather/hooks';
import { facilityHooks } from './facilities/hooks';

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
}

function merge(...parts: Partial<GuestHooks>[]): GuestHooks {
  const out: GuestHooks = { beforeDecision: [], perTick: [], rideScore: [], rideScoreFactor: [], stallWant: [], afterPurchase: [] };
  for (const p of parts) {
    out.beforeDecision.push(...(p.beforeDecision ?? []));
    out.perTick.push(...(p.perTick ?? []));
    out.rideScore.push(...(p.rideScore ?? []));
    out.rideScoreFactor.push(...(p.rideScoreFactor ?? []));
    out.stallWant.push(...(p.stallWant ?? []));
    out.afterPurchase.push(...(p.afterPurchase ?? []));
  }
  return out;
}

/** Fixed order: litter/mess/bench/vandalism (W1-H), weather (W1-I), facilities (W2-C). */
export const guestHooks: GuestHooks = merge(litterHooks, weatherHooks, facilityHooks);
