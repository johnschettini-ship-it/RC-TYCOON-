/** Phase 3 §4.10 impulse buys: chance, price factor, weather factor, held items, urgent needs. */
import { describe, expect, it } from 'vitest';
import { getStallDef } from '../../../src/data/catalog';
import { IMPULSE } from '../../../src/data/tuning/facilities';
import { NAUSEA_URGENT, NEED_URGENT, SALE_TICKS } from '../../../src/data/tuning/guests';
import { hasUrgentNeed, impulseChance, impulsePriceFactor } from '../../../src/sim/facilities/impulse';
import { THOUGHT } from '../../../src/sim/guests/thoughts';
import { updateGuests } from '../../../src/sim/guests/update';
import type { Guest } from '../../../src/sim/guests/types';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld } from '../../helpers/world';
import { facilityPark, pinWeather } from './park';
import { nextAtLeast, nextBelow } from './rng';

function setup(): { w: World; p: ReturnType<typeof facilityPark> } {
  const w = makeTestWorld(777);
  return { w, p: facilityPark(w) };
}

/** A guest that has walked for a while, standing on main-path tile x, heading east to `target`. */
function walker(w: World, p: ReturnType<typeof facilityPark>, x: number, patch: Partial<Guest> = {}): Guest {
  const far = p.stall('restrooms', 56);
  return addGuestDirect(w, p.main(x), { stateTicks: 30, target: `stall:${far.id}`, ...patch });
}

describe('impulse price factor (§4.10)', () => {
  it('is 1 up to the catalog price, then falls linearly to 0 at twice the catalog price', () => {
    expect(impulsePriceFactor(150, 200)).toBe(1);
    expect(impulsePriceFactor(200, 200)).toBe(1);
    expect(impulsePriceFactor(201, 200)).toBeCloseTo(0.995, 10);
    expect(impulsePriceFactor(300, 200)).toBeCloseTo(0.5, 10);
    expect(impulsePriceFactor(400, 200)).toBe(0);
    expect(impulsePriceFactor(900, 200)).toBe(0);
  });

  it('a free catalog item is wanted only while free', () => {
    expect(impulsePriceFactor(0, 0)).toBe(1);
    expect(impulsePriceFactor(1, 0)).toBe(0);
  });
});

describe('impulse chance = IMPULSE[kind] × weather factor × price factor', () => {
  it('uses the kind base chance at the catalog price in neutral weather', () => {
    const { w, p } = setup();
    const g = addGuestDirect(w, p.main(10));
    pinWeather(w, 'cloudy');
    expect(impulseChance(w, g, p.stall('snack_shack', 10))).toBeCloseTo(IMPULSE.food as number, 10);
    expect(impulseChance(w, g, p.stall('fizz_stand', 11))).toBeCloseTo(IMPULSE.drink as number, 10);
    expect(impulseChance(w, g, p.stall('pizza_slice', 12))).toBeCloseTo(0.05, 10);
    expect(impulseChance(w, g, p.stall('balloon_stand', 13))).toBeCloseTo(0.06, 10);
    expect(impulseChance(w, g, p.stall('info_kiosk', 14))).toBeCloseTo(0.1, 10);
    expect(impulseChance(w, g, p.stall('restrooms', 15))).toBe(0);
    expect(impulseChance(w, g, p.stall('first_aid', 16))).toBe(0);
    expect(impulseChance(w, g, p.stall('cash_machine', 17))).toBe(0);
  });

  it('applies the catalog weather factors (ice cream hot ×1.6, cocoa cold ×1.6 / hot ×0.4, umbrella rain ×3 / sunny ×0.2)', () => {
    const { w, p } = setup();
    const g = addGuestDirect(w, p.main(10));
    const ice = p.stall('ice_cream_cart', 10);
    const cocoa = p.stall('cocoa_hut', 11);
    const umbrella = p.stall('umbrella_stand', 12);
    pinWeather(w, 'hot');
    expect(impulseChance(w, g, ice)).toBeCloseTo(0.08, 10);
    expect(impulseChance(w, g, cocoa)).toBeCloseTo(0.02, 10);
    pinWeather(w, 'cold');
    expect(impulseChance(w, g, ice)).toBeCloseTo(0.02, 10);
    expect(impulseChance(w, g, cocoa)).toBeCloseTo(0.08, 10);
    pinWeather(w, 'rain');
    expect(impulseChance(w, g, cocoa)).toBeCloseTo(0.08, 10);
    expect(impulseChance(w, g, umbrella)).toBeCloseTo(0.18, 10);
    pinWeather(w, 'sunny');
    expect(impulseChance(w, g, umbrella)).toBeCloseTo(0.012, 10);
  });

  it('applies the price factor to the price the guest pays', () => {
    const { w, p } = setup();
    const g = addGuestDirect(w, p.main(10));
    const balloon = p.stall('balloon_stand', 10);
    balloon.price = 300; // catalog $2: factor 0.5
    expect(impulseChance(w, g, balloon)).toBeCloseTo(0.03, 10);
    balloon.price = 400;
    expect(impulseChance(w, g, balloon)).toBe(0);
  });

  it('never for a souvenir or map the guest already holds', () => {
    const { w, p } = setup();
    const g = addGuestDirect(w, p.main(10), { items: { map: true, umbrella: true, balloon: true } });
    pinWeather(w, 'rain');
    expect(impulseChance(w, g, p.stall('balloon_stand', 10))).toBe(0);
    expect(impulseChance(w, g, p.stall('umbrella_stand', 11))).toBe(0);
    expect(impulseChance(w, g, p.stall('info_kiosk', 12))).toBe(0);
    expect(impulseChance(w, g, p.stall('snack_shack', 13))).toBeGreaterThan(0);
  });

  it('needs cash ≥ price and an open stall', () => {
    const { w, p } = setup();
    const pizza = p.stall('pizza_slice', 10);
    const g = addGuestDirect(w, p.main(10), { cash: pizza.price - 1 });
    expect(impulseChance(w, g, pizza)).toBe(0);
    g.cash = pizza.price;
    expect(impulseChance(w, g, pizza)).toBeGreaterThan(0);
    pizza.open = false;
    expect(impulseChance(w, g, pizza)).toBe(0);
  });

  it('no impulse buys with an urgent need (hunger, thirst, bladder ≥ 210, nausea ≥ 180)', () => {
    const { w, p } = setup();
    const snack = p.stall('snack_shack', 10);
    const g = addGuestDirect(w, p.main(10));
    for (const need of ['hunger', 'thirst', 'bladder'] as const) {
      g.needs[need] = NEED_URGENT - 1;
      expect(hasUrgentNeed(g)).toBe(false);
      expect(impulseChance(w, g, snack)).toBeGreaterThan(0);
      g.needs[need] = NEED_URGENT;
      expect(hasUrgentNeed(g)).toBe(true);
      expect(impulseChance(w, g, snack)).toBe(0);
      g.needs[need] = 40;
    }
    g.needs.nausea = NAUSEA_URGENT - 1;
    expect(impulseChance(w, g, snack)).toBeGreaterThan(0);
    g.needs.nausea = NAUSEA_URGENT;
    expect(impulseChance(w, g, snack)).toBe(0);
  });

  it('a lost guest without a map always buys a map it can pay for', () => {
    const { w, p } = setup();
    const kiosk = p.stall('info_kiosk', 10);
    const g = addGuestDirect(w, p.main(10), { lostSteps: 60, lostTarget: 'exit', bestDistance: 5 });
    expect(impulseChance(w, g, kiosk)).toBe(1);
    g.needs.hunger = 250;
    expect(impulseChance(w, g, kiosk)).toBe(1);
    g.cash = kiosk.price - 1;
    expect(impulseChance(w, g, kiosk)).toBe(0);
  });
});

describe('impulse buys while walking past a service tile', () => {
  it('a roll below the chance stops the guest, sells the item, and applies its effect', () => {
    const { w, p } = setup();
    const balloon = p.stall('balloon_stand', 30);
    const g = walker(w, p, 30);
    const happy = g.needs.happiness;
    nextBelow(w, 0.06);
    updateGuests(w);
    // The guest stops on the service tile and targets the stall; the guest system runs the sale.
    expect(g.nextTile).toBe(-1);
    expect(g.target).toBe(`stall:${balloon.id}`);
    updateGuests(w);
    expect(g.state).toBe('buying');
    expect(g.activityId).toBe(balloon.id);
    expect(g.tile).toBe(p.main(30));
    for (let k = 0; k < SALE_TICKS; k++) updateGuests(w);
    expect(g.state).toBe('walking');
    expect(g.items.balloon).toBe(true);
    expect(g.needs.happiness).toBe(happy + 15);
    expect(g.cash).toBe(8000 - balloon.price);
    expect(balloon.totals.sales).toBe(1);
    expect(g.thoughts.map((t) => t.id)).toContain(THOUGHT.loveBalloon);
  });

  it('a roll at or above the chance walks on', () => {
    const { w, p } = setup();
    p.stall('balloon_stand', 30);
    const g = walker(w, p, 30);
    nextAtLeast(w, 0.06);
    updateGuests(w);
    expect(g.state).toBe('walking');
    expect(g.nextTile).toBe(p.main(31));
    expect(g.items.balloon).toBe(false);
  });

  it('a guest who just finished buying does not roll again on the same tile', () => {
    const { w, p } = setup();
    p.stall('balloon_stand', 30);
    const g = walker(w, p, 30, { stateTicks: 0 });
    const rng = w.state.rng;
    updateGuests(w);
    expect(g.state).toBe('walking');
    expect(w.state.rng).toBe(rng);
  });

  it('leaving guests do not impulse-buy', () => {
    const { w, p } = setup();
    p.stall('snack_shack', 30);
    const g = addGuestDirect(w, p.main(30), { state: 'leaving', target: 'exit', stateTicks: 30 });
    nextBelow(w, 0.01);
    updateGuests(w);
    expect(g.state).toBe('leaving');
  });

  it('every Phase 3 shop sells by impulse (food, drink, souvenirs, map)', () => {
    for (const id of ['pizza_slice', 'ice_cream_cart', 'cocoa_hut', 'balloon_stand', 'umbrella_stand', 'info_kiosk']) {
      const { w, p } = setup();
      const stall = p.stall(id, 30);
      const g = walker(w, p, 30);
      nextBelow(w, 0.01);
      for (let k = 0; k < SALE_TICKS + 2; k++) updateGuests(w);
      expect(stall.totals.sales, id).toBe(1);
      const gives = getStallDef(id)?.effects.gives;
      if (gives) expect(g.items[gives], id).toBe(true);
    }
  });
});
