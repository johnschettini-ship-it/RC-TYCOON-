import { describe, expect, it } from 'vitest';
import { executeCommand } from '../../../src/sim/commands';
import { Owned, tileIndex, type MapState } from '../../../src/sim/map';
import { LAND_PRICE, RIGHTS_PRICE } from '../../../src/data/tuning/land';
import { currentLedger } from '../../../src/sim/economy/ledger';
import { buyLandQuote } from '../../../src/sim/land/commands';
import { makeTestWorld, stateHash } from '../../helpers/world';
import type { World } from '../../../src/sim/types';

/** A 64 × 64 Build 1 park with a 6 × 4 block (x 10–15, y 20–23) made for sale: x 10–12 land (2), x 13–15 rights (4). */
function saleWorld(): World {
  const world = makeTestWorld();
  const map = world.state.map;
  for (let y = 20; y <= 23; y++) {
    for (let x = 10; x <= 15; x++) map.owned[tileIndex(map, x, y)] = x <= 12 ? Owned.LandForSale : Owned.RightsForSale;
  }
  return world;
}

function ownedAt(map: MapState, x: number, y: number): number {
  return map.owned[tileIndex(map, x, y)] as number;
}

describe('buyLand (Phase 4 §4.9)', () => {
  it('buys every state-2 tile (→ 1) and state-4 tile (→ 3) in the rectangle and skips the rest', () => {
    const world = saleWorld();
    const map = world.state.map;
    const cash = world.state.park.cash;
    // Rectangle x 9–13, y 21–22 (any corner order): land 3 × 2 = 6 tiles, rights 1 × 2 = 2 tiles, x 9 is owned.
    const r = executeCommand(world, { type: 'buyLand', x0: 13, y0: 22, x1: 9, y1: 21 });
    const cost = 6 * LAND_PRICE + 2 * RIGHTS_PRICE;
    expect(r).toEqual({ ok: true, cost, warnings: [] });
    for (let y = 21; y <= 22; y++) {
      for (let x = 10; x <= 12; x++) expect(ownedAt(map, x, y)).toBe(Owned.Owned);
      expect(ownedAt(map, 13, y)).toBe(Owned.RightsOwned);
      expect(ownedAt(map, 14, y)).toBe(Owned.RightsForSale);
      expect(ownedAt(map, 9, y)).toBe(Owned.Owned);
    }
    // Rows outside the rectangle are still for sale.
    expect(ownedAt(map, 10, 20)).toBe(Owned.LandForSale);
    expect(ownedAt(map, 13, 23)).toBe(Owned.RightsForSale);
    expect(world.state.park.cash).toBe(cash - cost);
    expect(currentLedger(world).lines.landPurchase).toBe(-cost);
  });

  it('uses the park prices, not the tuning constants', () => {
    const world = saleWorld();
    world.state.park.landPrice = 100;
    world.state.park.rightsPrice = 7;
    const r = executeCommand(world, { type: 'buyLand', x0: 12, y0: 20, x1: 13, y1: 20 });
    expect(r.ok && r.cost).toBe(107);
  });

  it('is allowed at exactly the cash it costs and fails atomically below it', () => {
    const world = saleWorld();
    const cost = 3 * LAND_PRICE + 3 * RIGHTS_PRICE;
    world.state.park.cash = cost - 1;
    const before = stateHash(world);
    expect(executeCommand(world, { type: 'buyLand', x0: 10, y0: 20, x1: 15, y1: 20 })).toEqual({ ok: false, reason: 'Not enough cash' });
    expect(stateHash(world)).toBe(before);
    world.state.park.cash = cost;
    expect(executeCommand(world, { type: 'buyLand', x0: 10, y0: 20, x1: 15, y1: 20 }).ok).toBe(true);
    expect(world.state.park.cash).toBe(0);
  });

  it('says "Nothing to buy here" when the rectangle holds no tile for sale', () => {
    const world = saleWorld();
    const before = stateHash(world);
    // Owned tiles only.
    expect(executeCommand(world, { type: 'buyLand', x0: 30, y0: 30, x1: 34, y1: 31 })).toEqual({ ok: false, reason: 'Nothing to buy here' });
    // A single owned tile, and a rectangle of not-owned border tiles.
    expect(executeCommand(world, { type: 'buyLand', x0: 30, y0: 30, x1: 30, y1: 30 })).toEqual({ ok: false, reason: 'Nothing to buy here' });
    expect(executeCommand(world, { type: 'buyLand', x0: 0, y0: 0, x1: 5, y1: 0 })).toEqual({ ok: false, reason: 'Nothing to buy here' });
    expect(stateHash(world)).toBe(before);
    // Construction rights already owned are skipped too.
    world.state.map.owned[tileIndex(world.state.map, 40, 40)] = Owned.RightsOwned;
    const mid = stateHash(world);
    expect(executeCommand(world, { type: 'buyLand', x0: 40, y0: 40, x1: 40, y1: 40 })).toEqual({ ok: false, reason: 'Nothing to buy here' });
    expect(stateHash(world)).toBe(mid);
  });

  it('says "This land is not for sale" for a single-tile tap on a state-0 tile', () => {
    const world = saleWorld();
    const before = stateHash(world);
    expect(executeCommand(world, { type: 'buyLand', x0: 0, y0: 5, x1: 0, y1: 5 })).toEqual({ ok: false, reason: 'This land is not for sale' });
    expect(stateHash(world)).toBe(before);
  });

  it('clamps the rectangle to the map and rejects one fully outside it', () => {
    const world = saleWorld();
    const map = world.state.map;
    map.owned[tileIndex(map, 0, 0)] = Owned.LandForSale;
    const r = executeCommand(world, { type: 'buyLand', x0: -5, y0: -5, x1: 0, y1: 0 });
    expect(r.ok && r.cost).toBe(LAND_PRICE);
    expect(ownedAt(map, 0, 0)).toBe(Owned.Owned);
    expect(executeCommand(world, { type: 'buyLand', x0: 70, y0: 70, x1: 80, y1: 90 })).toEqual({ ok: false, reason: 'Nothing to buy here' });
    expect(executeCommand(world, { type: 'buyLand', x0: Number.NaN, y0: 0, x1: 1, y1: 1 })).toEqual({ ok: false, reason: 'Nothing to buy here' });
  });

  it('setup mode buys without cash or ledger lines', () => {
    const world = saleWorld();
    world.state.park.cash = 0;
    const r = executeCommand(world, { type: 'buyLand', x0: 10, y0: 20, x1: 15, y1: 23 }, { setup: true });
    expect(r.ok).toBe(true);
    expect(world.state.park.cash).toBe(0);
    expect(currentLedger(world).lines.landPurchase).toBe(0);
    expect(ownedAt(world.state.map, 15, 23)).toBe(Owned.RightsOwned);
  });

  it('quotes the total the command charges (the drag total before release) and changes nothing', () => {
    const world = saleWorld();
    const map = world.state.map;
    const before = stateHash(world);
    expect(buyLandQuote(world.state, 9, 21, 13, 22)).toEqual({ land: 6, rights: 2, cost: 6 * LAND_PRICE + 2 * RIGHTS_PRICE });
    expect(buyLandQuote(world.state, 30, 30, 31, 31)).toEqual({ land: 0, rights: 0, cost: 0 });
    expect(ownedAt(map, 10, 21)).toBe(Owned.LandForSale);
    expect(stateHash(world)).toBe(before);
  });
});
