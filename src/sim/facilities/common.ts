/**
 * Owner: W2-C. Small helpers shared by the facility hooks (Phase 3 §4.10).
 * Facility modules must not import `guests/buying`, `guests/decide`, or `guests/update`: those import the
 * hook list (`sim/hooks.ts`), which imports this folder, and the cycle would break module start-up.
 */
import { getStallDef } from '../../data/catalog';
import type { StallDef } from '../../data/catalog/types';
import { ITEM_PRICE_FACTOR, ITEM_VALUE } from '../../data/tuning/guests';
import { findStall, stallDest } from '../guests/state';
import type { Guest } from '../guests/types';
import { Content, neighbour, type Dir } from '../map';
import { distanceTo } from '../pathing';
import { salePrice } from '../stalls/api';
import type { Stall } from '../stalls/types';
import type { World } from '../types';

const DIRS: readonly Dir[] = [0, 1, 2, 3];

/** Walking or leaving: the states in which a guest steps toward a target. */
export function isOnTheMove(guest: Guest): boolean {
  return guest.state === 'walking' || guest.state === 'leaving';
}

const NO_STALLS: readonly Stall[] = Object.freeze([]);

/**
 * Open stalls whose service tile is `tile`, in ascending id order (at most one per side).
 * Guests ask at every step, and most tiles have no building beside them: that case returns a shared
 * empty list without allocating (master §10 tick budget).
 */
export function stallsServing(world: World, tile: number): readonly Stall[] {
  const map = world.state.map;
  let out: Stall[] | null = null;
  for (let k = 0; k < DIRS.length; k++) {
    const n = neighbour(map, tile, DIRS[k] as Dir);
    if (n < 0 || map.content[n] !== Content.Building) continue;
    const stall = findStall(world, map.contentRef[n] as number);
    if (stall && stall.open && stall.serviceTile === tile) (out ??= []).push(stall);
  }
  if (out === null) return NO_STALLS;
  return out.length > 1 ? out.sort((a, b) => a.id - b.id) : out;
}

/**
 * Phase 1 §4.3 "too expensive" rule, the same as the guest system's `stallPriceReject` (a test keeps
 * them equal): the price the guest pays must not exceed item value × 2 × `modifiers.priceTolerance`.
 */
export function priceAcceptable(world: World, stall: Stall, def: StallDef): boolean {
  const value = ITEM_VALUE[def.kind] ?? def.defaultPrice;
  return salePrice(world, stall) <= value * ITEM_PRICE_FACTOR * world.state.modifiers.priceTolerance;
}

/** The guest would buy here: the stall is open with a service tile, the price is acceptable, and cash ≥ price. */
export function willPay(world: World, guest: Guest, stall: Stall, def: StallDef): boolean {
  if (!stall.open || stall.serviceTile < 0) return false;
  if (!priceAcceptable(world, stall, def)) return false;
  return guest.cash >= salePrice(world, stall);
}

export interface FacilityChoice {
  stall: Stall;
  distance: number;
}

/**
 * Nearest open stall of catalog id `defId` that the guest can reach and would pay for.
 * Ties go to the lower id. Null when there is none.
 */
export function nearestFacility(world: World, guest: Guest, defId: string): FacilityChoice | null {
  let best: FacilityChoice | null = null;
  for (const stall of world.state.stalls) {
    if (stall.defId !== defId) continue;
    const def = getStallDef(stall.defId);
    if (!def || !willPay(world, guest, stall, def)) continue;
    const d = distanceTo(world, guest.tile, stallDest(stall.id));
    if (d === null) continue;
    if (best === null || d < best.distance) best = { stall, distance: d };
  }
  return best;
}

/**
 * Send a walking guest to `stall`. The guest system does the rest: on the service tile it buys (or
 * re-plans if it no longer wants to). A target with a route ends the Phase 1 "no route" lost state.
 */
export function targetStall(guest: Guest, stall: Stall): void {
  guest.target = stallDest(stall.id);
  guest.lostSinceTick = -1;
}
