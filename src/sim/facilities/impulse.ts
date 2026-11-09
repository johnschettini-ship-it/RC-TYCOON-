/**
 * Owner: W2-C. Impulse buys (Phase 3 §4.10).
 * A walking guest on a stall's service tile, with no urgent need and cash ≥ price, buys with chance
 * IMPULSE[kind] × want factor × price factor. The want factor is the product of the other modules'
 * `stallWant` hooks: the catalog weather factor (§4.9) and the Snack Deal campaign (§4.7).
 * Never a souvenir or map the guest already holds. A lost guest without a map always buys a map it
 * can pay for. The roll happens once per pass, when the guest starts its next step off the tile.
 * A guest who decides to buy targets the stall it stands at; the guest system runs the sale.
 */
import { getStallDef } from '../../data/catalog';
import { IMPULSE } from '../../data/tuning/facilities';
import { NAUSEA_URGENT, NEED_URGENT } from '../../data/tuning/guests';
import { stopWalking } from '../guests/movement';
import type { Guest } from '../guests/types';
import { litterHooks } from '../litter/hooks';
import { rngChance } from '../rng';
import { salePrice } from '../stalls/api';
import type { Stall } from '../stalls/types';
import type { World } from '../types';
import type { Cents } from '../units';
import { weatherHooks } from '../weather/hooks';
import { stallsServing, targetStall, willPay } from './common';
import { isWayLost } from './wayfinding';

/** 1 up to the catalog price, then max(0, 1 − (price − catalog) / catalog). A free item is wanted only while free. */
export function impulsePriceFactor(price: Cents, catalogPrice: Cents): number {
  if (price <= catalogPrice) return 1;
  if (catalogPrice <= 0) return 0;
  return Math.max(0, 1 - (price - catalogPrice) / catalogPrice);
}

/** Hunger, thirst, or bladder at or above urgent (210), or nausea at or above urgent (180) (Phase 1 §4.3). */
export function hasUrgentNeed(guest: Guest): boolean {
  const n = guest.needs;
  return n.hunger >= NEED_URGENT || n.thirst >= NEED_URGENT || n.bladder >= NEED_URGENT || n.nausea >= NAUSEA_URGENT;
}

/** Product of the weather and campaign `stallWant` hooks (facilities add none of their own). */
export function stallWantFactor(world: World, guest: Guest, stall: Stall): number {
  let f = 1;
  for (const hook of litterHooks.stallWant ?? []) f *= hook(world, guest, stall);
  for (const hook of weatherHooks.stallWant ?? []) f *= hook(world, guest, stall);
  return f;
}

/** Chance (0–1) that this guest impulse-buys at `stall` now. 0 when the guest cannot or will not. */
export function impulseChance(world: World, guest: Guest, stall: Stall): number {
  const def = getStallDef(stall.defId);
  if (!def) return 0;
  const base = IMPULSE[def.kind];
  if (base === undefined) return 0;
  const gives = def.effects.gives;
  if (gives && guest.items[gives]) return 0;
  if (!willPay(world, guest, stall, def)) return 0;
  if (gives === 'map' && isWayLost(guest)) return 1;
  if (hasUrgentNeed(guest)) return 0;
  const p = base * stallWantFactor(world, guest, stall) * impulsePriceFactor(salePrice(world, stall), def.defaultPrice);
  return Math.max(0, Math.min(1, p));
}

/**
 * At a step start: roll for each stall served from the guest's tile (ascending id), first buy wins.
 * Only walking guests that walked onto the tile (not ones that just started walking here, after
 * buying or riding). Draws from the RNG only for a chance strictly between 0 and 1.
 */
export function impulseAtStep(world: World, guest: Guest): boolean {
  if (guest.state !== 'walking' || guest.stateTicks <= 1) return false;
  for (const stall of stallsServing(world, guest.tile)) {
    const p = impulseChance(world, guest, stall);
    if (p <= 0) continue;
    if (p < 1 && !rngChance(world.state, p)) continue;
    stopWalking(guest);
    targetStall(guest, stall);
    return true;
  }
  return false;
}
