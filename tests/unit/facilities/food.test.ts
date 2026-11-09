/**
 * Phase 3 §4.9–4.10: Pizza Slice, Ice Cream Cart, and Cocoa Hut go through the generic need-based
 * food and drink choice (Phase 1 §4.3), with the catalog weather factors dividing the distance.
 */
import { describe, expect, it } from 'vitest';
import { SALE_TICKS } from '../../../src/data/tuning/guests';
import { decide } from '../../../src/sim/guests/decide';
import { updateGuests } from '../../../src/sim/guests/update';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld } from '../../helpers/world';
import { facilityPark, pinWeather } from './park';

function setup(): { w: World; p: ReturnType<typeof facilityPark> } {
  const w = makeTestWorld(31);
  return { w, p: facilityPark(w) };
}

describe('new food and drink stalls in the need-based choice', () => {
  it('Pizza Slice serves hungry guests like the Snack Shack: hunger −160', () => {
    const { w, p } = setup();
    const pizza = p.stall('pizza_slice', 33);
    const g = addGuestDirect(w, p.main(30));
    g.needs.hunger = 200;
    decide(w, g);
    expect(g.target).toBe(`stall:${pizza.id}`);
    for (let k = 0; k < 200 && g.needs.hunger > 100; k++) updateGuests(w);
    expect(g.needs.hunger).toBe(40);
    expect(g.cash).toBe(8000 - pizza.price);
  });

  it('a hot day pulls a hungry guest past a nearer Snack Shack to the Ice Cream Cart (distance ÷ 1.6)', () => {
    const { w, p } = setup();
    const snack = p.stall('snack_shack', 34); // 4 away
    const ice = p.stall('ice_cream_cart', 36); // 6 away: 6 / 1.6 = 3.75 < 4
    const g = addGuestDirect(w, p.main(30));
    g.needs.hunger = 170;
    pinWeather(w, 'sunny');
    decide(w, g);
    expect(g.target).toBe(`stall:${snack.id}`);
    g.target = null;
    pinWeather(w, 'hot');
    decide(w, g);
    expect(g.target).toBe(`stall:${ice.id}`);
  });

  it('a cold day sends thirsty guests to the Cocoa Hut, a hot day away from it', () => {
    const { w, p } = setup();
    const fizz = p.stall('fizz_stand', 34); // 4 away
    const cocoa = p.stall('cocoa_hut', 36); // 6 away
    const g = addGuestDirect(w, p.main(30));
    g.needs.thirst = 170;
    pinWeather(w, 'cold'); // fizz 4 / 0.7 ≈ 5.7, cocoa 6 / 1.6 = 3.75
    decide(w, g);
    expect(g.target).toBe(`stall:${cocoa.id}`);
    g.target = null;
    pinWeather(w, 'rain'); // fizz 4, cocoa 3.75
    decide(w, g);
    expect(g.target).toBe(`stall:${cocoa.id}`);
    g.target = null;
    pinWeather(w, 'hot'); // fizz 4 / 1.5, cocoa 6 / 0.4
    decide(w, g);
    expect(g.target).toBe(`stall:${fizz.id}`);
  });

  it('Ice Cream (hunger −60, happiness +10) and Cocoa (thirst −100, happiness +5) apply their catalog effects', () => {
    const { w, p } = setup();
    const ice = p.stall('ice_cream_cart', 33);
    const cocoa = p.stall('cocoa_hut', 35);
    const a = addGuestDirect(w, p.main(33), { target: `stall:${ice.id}` });
    const b = addGuestDirect(w, p.main(35), { target: `stall:${cocoa.id}` });
    a.needs.hunger = 170;
    b.needs.thirst = 170;
    for (let k = 0; k <= SALE_TICKS; k++) updateGuests(w);
    expect(a.needs.hunger).toBe(110);
    expect(a.needs.happiness).toBe(190);
    expect(b.needs.thirst).toBe(70);
    expect(b.needs.happiness).toBe(185);
  });
});
