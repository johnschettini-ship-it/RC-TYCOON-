/**
 * The facility hook module loads on its own (it must not import the guest modules that import the hook
 * list), its hooks are in the merged guest hook list, and its price rule matches the guest system's.
 * Keep the facilities import first: it checks that this module can be the first one loaded.
 */
import { facilityHooks, facilityStepTick } from '../../../src/sim/facilities/hooks';
import { describe, expect, it } from 'vitest';
import { STALLS } from '../../../src/data/catalog';
import { priceAcceptable } from '../../../src/sim/facilities/common';
import { cashMachineDecision, firstAidDecision } from '../../../src/sim/facilities/services';
import { balloonPerTick, cocoaThought, facilityAfterPurchase } from '../../../src/sim/facilities/souvenirs';
import { lostDecision } from '../../../src/sim/facilities/wayfinding';
import { stallPriceReject } from '../../../src/sim/guests/buying';
import { guestHooks } from '../../../src/sim/hooks';
import { makeTestWorld, placeStallDirect } from '../../helpers/world';

describe('facility hooks', () => {
  it('lists its hooks in a fixed order', () => {
    expect(facilityHooks.beforeDecision).toEqual([firstAidDecision, cashMachineDecision, lostDecision, cocoaThought]);
    expect(facilityHooks.perTick).toEqual([facilityStepTick, balloonPerTick]);
    expect(facilityHooks.afterPurchase).toEqual([facilityAfterPurchase]);
    expect(facilityHooks.rideScore ?? []).toEqual([]);
    expect(facilityHooks.rideScoreFactor ?? []).toEqual([]);
    expect(facilityHooks.stallWant ?? []).toEqual([]);
  });

  it('runs after the litter and weather hooks in the merged guest hook list', () => {
    const before = guestHooks.beforeDecision;
    expect(before.slice(-4)).toEqual(facilityHooks.beforeDecision);
    expect(guestHooks.perTick.slice(-2)).toEqual(facilityHooks.perTick);
    expect(guestHooks.afterPurchase.slice(-1)).toEqual(facilityHooks.afterPurchase);
  });

  it('uses the same "too expensive" rule as the guest system for every stall, price, and tolerance', () => {
    const w = makeTestWorld(1);
    for (const tolerance of [0.5, 1, 1.5]) {
      w.state.modifiers.priceTolerance = tolerance;
      for (const def of STALLS) {
        const stall = placeStallDirect(w, def.id, 10 + (def.id.length % 20), 10 + Math.round(tolerance * 10));
        for (let price = 0; price <= 2000; price += 25) {
          stall.price = price;
          expect(priceAcceptable(w, stall, def), `${def.id} at ${price} ×${tolerance}`).toBe(stallPriceReject(w, stall, def) === undefined);
        }
      }
    }
  });
});
