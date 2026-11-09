/** Phase 3 §4.10 balloons and umbrellas; §4.16 souvenir and cocoa thoughts. */
import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../../src/data/tuning/core';
import { BALLOON_LOSS, BALLOON_LOSS_HAPPY, COCOA_THOUGHT_THIRST } from '../../../src/data/tuning/facilities';
import { SALE_TICKS } from '../../../src/data/tuning/guests';
import { balloonPerTick, cocoaThought } from '../../../src/sim/facilities/souvenirs';
import { THOUGHT } from '../../../src/sim/guests/thoughts';
import { updateGuests } from '../../../src/sim/guests/update';
import type { Guest } from '../../../src/sim/guests/types';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld } from '../../helpers/world';
import { facilityPark, pinWeather } from './park';
import { nextAtLeast, nextBelow } from './rng';

const ids = (g: Guest): string[] => g.thoughts.map((t) => t.id);
const HELD = { map: false, umbrella: false, balloon: true };

function hourStart(w: World): void {
  w.state.tick = Math.ceil((w.state.tick + 1) / TICKS_PER_HOUR) * TICKS_PER_HOUR;
}

describe('balloons (§4.10)', () => {
  it('at an hour start a roll below BALLOON_LOSS lets the balloon fly away: thought and −5 happiness', () => {
    const w = makeTestWorld(1);
    const p = facilityPark(w);
    const g = addGuestDirect(w, p.main(30), { items: { ...HELD } });
    hourStart(w);
    nextBelow(w, BALLOON_LOSS);
    balloonPerTick(w, g);
    expect(g.items.balloon).toBe(false);
    expect(g.needs.happiness).toBe(180 - BALLOON_LOSS_HAPPY);
    expect(ids(g)).toContain(THOUGHT.balloonFlewAway);
  });

  it('a roll at or above BALLOON_LOSS keeps it', () => {
    const w = makeTestWorld(1);
    const p = facilityPark(w);
    const g = addGuestDirect(w, p.main(30), { items: { ...HELD } });
    hourStart(w);
    nextAtLeast(w, BALLOON_LOSS);
    balloonPerTick(w, g);
    expect(g.items.balloon).toBe(true);
    expect(g.needs.happiness).toBe(180);
  });

  it('rolls only at hour starts and only for balloon holders (no other RNG draw)', () => {
    const w = makeTestWorld(1);
    const p = facilityPark(w);
    const holder = addGuestDirect(w, p.main(30), { items: { ...HELD } });
    const other = addGuestDirect(w, p.main(31));
    hourStart(w);
    w.state.tick += 1;
    let rng = w.state.rng;
    balloonPerTick(w, holder);
    expect(w.state.rng).toBe(rng);
    hourStart(w);
    rng = w.state.rng;
    balloonPerTick(w, other);
    expect(w.state.rng).toBe(rng);
    balloonPerTick(w, holder);
    expect(w.state.rng).not.toBe(rng);
  });

  it('fly-away is deterministic for a seed and close to 1% per hour', () => {
    const run = (seed: number): number[] => {
      const w = makeTestWorld(seed);
      const p = facilityPark(w);
      const guests = Array.from({ length: 500 }, (_, k) => addGuestDirect(w, p.main(10 + (k % 40)), { items: { ...HELD } }));
      const lost: number[] = [];
      for (let h = 0; h < 20; h++) {
        hourStart(w);
        for (const g of guests) {
          const had = g.items.balloon;
          balloonPerTick(w, g);
          if (had && !g.items.balloon) lost.push(g.id);
        }
      }
      return lost;
    };
    const a = run(2024);
    expect(run(2024)).toEqual(a);
    expect(run(2025)).not.toEqual(a);
    // 500 balloons × 20 hours at 1%: expect about 91 lost (500 × (1 − 0.99^20)).
    expect(a.length).toBeGreaterThan(55);
    expect(a.length).toBeLessThan(130);
  });

  it('buying a balloon: +15 happiness and "I love my balloon"', () => {
    const w = makeTestWorld(3);
    const p = facilityPark(w);
    const stall = p.stall('balloon_stand', 33);
    const g = addGuestDirect(w, p.main(33), { target: `stall:${stall.id}` });
    for (let k = 0; k <= SALE_TICKS; k++) updateGuests(w);
    expect(g.items.balloon).toBe(true);
    expect(g.needs.happiness).toBe(195);
    expect(ids(g)).toContain(THOUGHT.loveBalloon);
  });
});

describe('umbrellas (§4.9, §4.10)', () => {
  it('end to end in rain: a guest without an umbrella loses happiness, buys one by impulse, then loses none', () => {
    const w = makeTestWorld(5);
    const p = facilityPark(w);
    pinWeather(w, 'rain');
    const stand = p.stall('umbrella_stand', 31);
    const far = p.stall('restrooms', 50);
    const g = addGuestDirect(w, p.main(30), { target: `stall:${far.id}`, stateTicks: 30 });
    updateGuests(w); // decision: −1 in rain; then the guest steps toward (31, 60)
    expect(g.needs.happiness).toBe(179);
    expect(ids(g)).toContain(THOUGHT.rainNoUmbrella);
    for (let k = 0; k < 9; k++) updateGuests(w); // arrive on the stand's service tile
    expect(g.tile).toBe(stand.serviceTile);
    nextBelow(w, 0.01); // umbrella impulse 0.06 × rain 3.0
    w.state.tick += 1;
    updateGuests(w);
    expect(g.target).toBe(`stall:${stand.id}`);
    w.state.tick += 1;
    updateGuests(w);
    expect(g.state).toBe('buying');
    for (let k = 0; k < SALE_TICKS; k++) {
      w.state.tick += 1;
      updateGuests(w);
    }
    expect(g.items.umbrella).toBe(true);
    const after = g.needs.happiness;
    for (let k = 0; k < 400; k++) {
      w.state.tick += 1;
      updateGuests(w);
    }
    expect(g.needs.happiness).toBeGreaterThanOrEqual(after);
    expect(ids(g)).toContain(THOUGHT.goodUmbrella);
  });
});

describe('"A cocoa would be nice" (§4.16)', () => {
  it(`in cold or rain, with an open Cocoa Hut, a guest with thirst ≥ ${COCOA_THOUGHT_THIRST} thinks it`, () => {
    const w = makeTestWorld(7);
    const p = facilityPark(w);
    const hut = p.stall('cocoa_hut', 40);
    const g = addGuestDirect(w, p.main(30));
    pinWeather(w, 'cold');
    g.needs.thirst = COCOA_THOUGHT_THIRST - 1;
    expect(cocoaThought(w, g)).toBe(false);
    expect(ids(g)).not.toContain(THOUGHT.wantCocoa);
    g.needs.thirst = COCOA_THOUGHT_THIRST;
    pinWeather(w, 'sunny');
    cocoaThought(w, g);
    expect(ids(g)).not.toContain(THOUGHT.wantCocoa);
    hut.open = false;
    pinWeather(w, 'rain');
    cocoaThought(w, g);
    expect(ids(g)).not.toContain(THOUGHT.wantCocoa);
    hut.open = true;
    cocoaThought(w, g);
    expect(ids(g)).toContain(THOUGHT.wantCocoa);
  });
});
