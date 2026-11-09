/**
 * Buying at stalls (Phase 1 §4.3 Buying; catalog §3 effects; Phase 3 §4.10 facilities). Owner: W1-D.
 * Money is W1-E's `sellItem`; this module runs the service time and applies the catalog effects.
 */
import { getStallDef } from '../../data/catalog';
import type { StallDef } from '../../data/catalog/types';
import { FIRST_AID_TICKS, ITEM_PRICE_FACTOR, ITEM_VALUE, RESTROOM_TICKS, SALE_TICKS } from '../../data/tuning/guests';
import { guestHooks } from '../hooks';
import { rngInt } from '../rng';
import { sellItem } from '../stalls/api';
import type { Stall } from '../stalls/types';
import type { World } from '../types';
import type { Cents } from '../units';
import { clampNeed } from './needs';
import { replan, setState } from './state';
import { THOUGHT, addThought, type ThoughtId } from './thoughts';
import type { Guest } from './types';

/** Value of one item for the "too expensive" check: food $3, drink $2, toilet $0, others the catalog price. */
export function itemValue(def: StallDef): Cents {
  return ITEM_VALUE[def.kind] ?? def.defaultPrice;
}

/** Thought for a stall price above item value × 2 (× modifiers.priceTolerance), or undefined when acceptable. */
export function stallPriceReject(world: World, stall: Stall, def: StallDef): ThoughtId | null | undefined {
  if (stall.price <= itemValue(def) * ITEM_PRICE_FACTOR * world.state.modifiers.priceTolerance) return undefined;
  if (def.kind === 'food') return THOUGHT.snackTooExpensive;
  if (def.kind === 'drink') return THOUGHT.drinkTooExpensive;
  return null;
}

/** Ticks a visit takes: restrooms 60, First Aid 60, everything else 20. */
export function serviceTicks(def: StallDef): number {
  if (def.kind === 'toilet') return RESTROOM_TICKS;
  if (def.id === 'first_aid') return FIRST_AID_TICKS;
  return SALE_TICKS;
}

/** Checks a guest makes at the counter. Returns false (after re-planning) when the guest will not buy. */
function willBuy(world: World, guest: Guest, stall: Stall, def: StallDef): boolean {
  if (!stall.open) return false;
  const reject = stallPriceReject(world, stall, def);
  if (reject !== undefined) {
    if (reject) addThought(world, guest, reject);
    return false;
  }
  if (guest.cash < stall.price) {
    addThought(world, guest, THOUGHT.needCash);
    return false;
  }
  return true;
}

/** The guest reached the service tile of its target stall. */
export function startBuying(world: World, guest: Guest, stall: Stall): void {
  const def = getStallDef(stall.defId);
  if (!def || !willBuy(world, guest, stall, def)) {
    replan(world, guest);
    return;
  }
  setState(guest, 'buying');
  guest.activityId = stall.id;
  guest.nextTile = -1;
  guest.progress = 0;
  if (stall.servingGuest < 0) stall.servingGuest = guest.id;
}

/** Apply the catalog effects of one purchase. */
export function applyStallEffects(world: World, guest: Guest, def: StallDef): void {
  const fx = def.effects;
  for (const [key, change] of Object.entries(fx.needs) as [keyof Guest['needs'], number | 'reset'][]) {
    guest.needs[key] = change === 'reset' ? 0 : clampNeed(guest.needs[key] + change);
  }
  if (fx.gives) guest.items[fx.gives] = true;
  if (fx.withdraw && guest.cash < fx.withdraw.belowCents) {
    // Money from outside the park: no ledger entry (Phase 3 §4.10).
    guest.cash += rngInt(world.state, fx.withdraw.minCents / 100, fx.withdraw.maxCents / 100) * 100;
  }
}

/** Per tick while buying. Completes the sale after the service time. */
export function updateBuying(world: World, guest: Guest, stall: Stall | undefined): void {
  if (!stall) {
    replan(world, guest);
    return;
  }
  const def = getStallDef(stall.defId);
  if (!def) {
    replan(world, guest);
    return;
  }
  if (guest.stateTicks < serviceTicks(def)) return;
  if (stall.servingGuest === guest.id) stall.servingGuest = -1;
  if (!willBuy(world, guest, stall, def)) {
    replan(world, guest);
    return;
  }
  const cashBefore = guest.cash;
  const spentBefore = guest.spent;
  sellItem(world, stall, guest);
  const paid = cashBefore - guest.cash;
  if (paid > 0 && guest.spent === spentBefore) guest.spent += paid;
  applyStallEffects(world, guest, def);
  // Re-plan first so an afterPurchase hook may still set a target or state.
  replan(world, guest);
  for (const hook of guestHooks.afterPurchase) hook(world, guest, stall);
}
