/** Test fake of W1-E's `sellItem` (src/sim/stalls/api.ts), matching its documented money side. */
import { getStallDef } from '../../../src/data/catalog';
import { recordLedger } from '../../../src/sim/economy/ledger';
import type { Guest } from '../../../src/sim/guests/types';
import type { Stall } from '../../../src/sim/stalls/types';
import type { World } from '../../../src/sim/types';

export const sales: { stallId: number; guestId: number; tick: number }[] = [];

export function sellItem(world: World, stall: Stall, guest: Guest): void {
  const price = stall.price;
  guest.cash -= price;
  guest.spent += price;
  if (price !== 0) recordLedger(world, 'stallSales', price);
  const stock = getStallDef(stall.defId)?.stockCost ?? 0;
  if (stock !== 0) recordLedger(world, 'stock', -stock);
  stall.totals.sales += 1;
  stall.totals.salesThisMonth += 1;
  stall.totals.income += price;
  stall.totals.incomeThisMonth += price;
  sales.push({ stallId: stall.id, guestId: guest.id, tick: world.state.tick });
}
