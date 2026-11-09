/** Owner: W1-E. Money side of a sale: guest pays the price, park pays stock cost (ledger). */
import { getStallDef } from '../../data/catalog';
import { SNACK_DEAL_CAMPAIGN, SNACK_DEAL_PRICE_FACTOR } from '../../data/tuning/economy';
import { recordLedger } from '../economy/ledger';
import type { Guest } from '../guests/types';
import type { World } from '../types';
import type { Cents } from '../units';
import type { Stall } from './types';

/** What a guest pays at this stall right now. Snack Deal: 50% of the price at its target (Phase 3 §4.7). */
export function salePrice(world: World, stall: Stall): Cents {
  const deal = world.state.management.campaigns.some((c) => c.type === SNACK_DEAL_CAMPAIGN && c.targetId === stall.id);
  return deal ? Math.floor(stall.price * SNACK_DEAL_PRICE_FACTOR) : stall.price;
}

/**
 * One completed sale. The caller (guest system) has already checked that the guest wants the item and can pay.
 * Guest: cash − price, spent + price. Ledger: `stallSales` + price, `stock` − stock cost. Stall totals count it.
 * Need effects and items are the guest system's work.
 */
export function sellItem(world: World, stall: Stall, guest: Guest): void {
  const price = salePrice(world, stall);
  const stockCost = getStallDef(stall.defId)?.stockCost ?? 0;
  guest.cash -= price;
  guest.spent += price;
  if (price !== 0) recordLedger(world, 'stallSales', price);
  if (stockCost !== 0) recordLedger(world, 'stock', -stockCost);
  stall.totals.sales += 1;
  stall.totals.salesThisMonth += 1;
  stall.totals.income += price;
  stall.totals.incomeThisMonth += price;
}
