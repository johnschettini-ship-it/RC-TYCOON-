import { describe, expect, it } from 'vitest';
import { sellItem } from '../../../src/sim/stalls/api';
import { updateStalls } from '../../../src/sim/stalls/update';
import { currentLedger } from '../../../src/sim/economy/ledger';
import { getStallDef } from '../../../src/data/catalog';
import { SNACK_DEAL_CAMPAIGN } from '../../../src/data/tuning/economy';
import { addGuestDirect, makeTestWorld, placeStallDirect } from '../../helpers/world';

describe('sellItem (Phase 1 §4.5)', () => {
  it('the guest pays the price, the park pays the stock cost, and the stall counts the sale', () => {
    const w = makeTestWorld();
    const stall = placeStallDirect(w, 'snack_shack', 20, 20);
    const def = getStallDef('snack_shack')!;
    const guest = addGuestDirect(w, stall.serviceTile, { cash: 5_000, spent: 700 });
    const cash0 = w.state.park.cash;
    sellItem(w, stall, guest);
    expect(guest.cash).toBe(5_000 - def.defaultPrice);
    expect(guest.spent).toBe(700 + def.defaultPrice);
    const lines = currentLedger(w).lines;
    expect(lines.stallSales).toBe(def.defaultPrice);
    expect(lines.stock).toBe(-def.stockCost);
    expect(w.state.park.cash - cash0).toBe(def.defaultPrice - def.stockCost);
    expect(stall.totals).toEqual({ sales: 1, income: def.defaultPrice, salesThisMonth: 1, incomeThisMonth: def.defaultPrice });
  });

  it('uses the stall price the player set', () => {
    const w = makeTestWorld();
    const stall = placeStallDirect(w, 'fizz_stand', 20, 20);
    stall.price = 350;
    const guest = addGuestDirect(w, stall.serviceTile, { cash: 1_000 });
    sellItem(w, stall, guest);
    sellItem(w, stall, guest);
    expect(guest.cash).toBe(300);
    expect(currentLedger(w).lines.stallSales).toBe(700);
    expect(currentLedger(w).lines.stock).toBe(-2 * getStallDef('fizz_stand')!.stockCost);
    expect(stall.totals.salesThisMonth).toBe(2);
    expect(stall.totals.incomeThisMonth).toBe(700);
  });

  it('a free facility moves no money but counts the visit', () => {
    const w = makeTestWorld();
    const stall = placeStallDirect(w, 'restrooms', 20, 20);
    const guest = addGuestDirect(w, stall.serviceTile, { cash: 1_000 });
    const cash0 = w.state.park.cash;
    sellItem(w, stall, guest);
    expect(guest.cash).toBe(1_000);
    expect(w.state.park.cash).toBe(cash0);
    expect(stall.totals).toEqual({ sales: 1, income: 0, salesThisMonth: 1, incomeThisMonth: 0 });
  });

  it('Snack Deal halves the price at its target stall; the stock cost does not change (Phase 3 §4.7)', () => {
    const w = makeTestWorld();
    const stall = placeStallDirect(w, 'snack_shack', 20, 20);
    const other = placeStallDirect(w, 'snack_shack', 22, 20);
    w.state.management.campaigns.push({ type: SNACK_DEAL_CAMPAIGN, targetId: stall.id, endTick: 99_999 });
    const guest = addGuestDirect(w, stall.serviceTile, { cash: 1_000 });
    sellItem(w, stall, guest);
    expect(guest.cash).toBe(1_000 - 150);
    expect(currentLedger(w).lines.stock).toBe(-100);
    expect(stall.totals.income).toBe(150);
    sellItem(w, other, guest);
    expect(guest.cash).toBe(1_000 - 150 - 300);
  });
});

describe('updateStalls', () => {
  it('releases a stall whose served guest left or stopped buying there', () => {
    const w = makeTestWorld();
    const a = placeStallDirect(w, 'snack_shack', 20, 20);
    const b = placeStallDirect(w, 'fizz_stand', 22, 20);
    const c = placeStallDirect(w, 'restrooms', 24, 20);
    const buying = addGuestDirect(w, a.serviceTile, { state: 'buying', activityId: a.id });
    const walking = addGuestDirect(w, b.serviceTile, { state: 'walking', activityId: -1 });
    a.servingGuest = buying.id;
    b.servingGuest = walking.id;
    c.servingGuest = 9_999;
    updateStalls(w);
    expect(a.servingGuest).toBe(buying.id);
    expect(b.servingGuest).toBe(-1);
    expect(c.servingGuest).toBe(-1);
  });
});
