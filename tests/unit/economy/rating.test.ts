import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/litter/metrics', () => ({ cleanliness: vi.fn() }));
vi.mock('../../../src/sim/breakdowns/api', () => ({ onRideDispatch: vi.fn(() => false), reliabilityScore: vi.fn() }));

import { cleanliness } from '../../../src/sim/litter/metrics';
import { reliabilityScore } from '../../../src/sim/breakdowns/api';
import { TOO_EXPENSIVE_THOUGHT_IDS, computeRating, ratingParts, updateRating } from '../../../src/sim/park/rating';
import { THOUGHT, addThought } from '../../../src/sim/guests/thoughts';
import { en } from '../../../src/data/strings/en';
import { getFlatRideDef } from '../../../src/data/catalog';
import {
  FAIR_PRICE_WINDOW_TICKS,
  RATING_MAX,
  RATING_WEIGHTS,
  TOO_EXPENSIVE_THOUGHT_TEXTS,
  VARIETY_FULL_RIDES,
} from '../../../src/data/tuning/economy';
import { TICKS_PER_HOUR } from '../../../src/data/tuning/core';
import { ATMOSPHERE_MAX_POINTS, ATMOSPHERE_NO_GUESTS_SCORE } from '../../../src/data/tuning/fields';
import { addSceneryDirect } from '../fields/helpers';
import { createTrackSlice } from '../../../src/sim/rides/track/types';
import { addGuestDirect, makeTestWorld, makeTrackRideDataDirect, placeRideDirect, runTicks } from '../../helpers/world';
import type { World } from '../../../src/sim/types';
import type { Ride } from '../../../src/sim/rides/types';
import { LOST_STEPS } from '../../../src/data/tuning/facilities';

const clean = vi.mocked(cleanliness);
const reliable = vi.mocked(reliabilityScore);

beforeEach(() => {
  clean.mockReset().mockReturnValue(1);
  reliable.mockReset().mockReturnValue(1);
});

/** Open flat rides by catalog id, placed apart. */
function openRides(w: World, defIds: string[]): Ride[] {
  return defIds.map((id, i) => {
    const r = placeRideDirect(w, id, 4 + (i % 8) * 6, 4 + Math.floor(i / 8) * 6);
    r.status = 'open';
    return r;
  });
}

function guests(w: World, n: number, patch: Parameters<typeof addGuestDirect>[2] = {}): void {
  for (let i = 0; i < n; i++) addGuestDirect(w, 0, patch);
}

describe('rating weights (Phase 3 §4.13, master R8)', () => {
  it('sum to 1,000', () => {
    expect(Object.values(RATING_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(RATING_MAX);
    expect(RATING_WEIGHTS).toEqual({
      // Phase 4 (master R8, W3-E) moves 100 points from happiness to atmosphere.
      happiness: 300,
      cleanliness: 150,
      reliability: 100,
      fairPrices: 100,
      variety: 100,
      lostGuests: 75,
      queues: 75,
      atmosphere: ATMOSPHERE_MAX_POINTS,
    });
  });
});

describe('rating parts at their edges', () => {
  it('empty park: no guests and no rides use the documented no-data values', () => {
    const w = makeTestWorld();
    expect(ratingParts(w)).toEqual({
      happiness: 0.5,
      cleanliness: 1,
      reliability: 1,
      fairPrices: 0.5,
      variety: 0,
      lostGuests: 0.5,
      queues: 0,
      atmosphere: ATMOSPHERE_NO_GUESTS_SCORE,
    });
    // 150 + 150 + 100 + 50 + 0 + 37.5 + 0 + 50 = 537.5 (the Build 1 total: Atmosphere's no-data 0.5 keeps it).
    const W = RATING_WEIGHTS;
    expect(computeRating(w)).toBe(
      Math.round(0.5 * W.happiness + W.cleanliness + W.reliability + 0.5 * W.fairPrices + 0.5 * W.lostGuests + ATMOSPHERE_NO_GUESTS_SCORE * W.atmosphere),
    );
    expect(computeRating(w)).toBe(538);
  });

  it('a perfect park scores 1,000', () => {
    const w = makeTestWorld();
    // Atmosphere 1 needs Calm and Buzz at 255 where the guests stand (tile 0): stacked fountains and glow pits.
    for (let k = 0; k < 3; k++) addSceneryDirect(w, 'rock_waterfall', 0, 0);
    for (let k = 0; k < 4; k++) addSceneryDirect(w, 'magma_pool', 0, 0);
    // 8 open rides: 3 chill, 2 family, 3 thrill → shares 3/8, 2/8, 3/8.
    openRides(w, ['big_wheel', 'big_wheel', 'big_wheel', 'carousel', 'carousel', 'swing_tower', 'swing_tower', 'swing_tower']);
    guests(w, 3, { temperament: 10, needs: { hunger: 0, thirst: 0, bladder: 0, energy: 255, happiness: 255, nausea: 0 } });
    guests(w, 2, { temperament: 50, needs: { hunger: 0, thirst: 0, bladder: 0, energy: 255, happiness: 255, nausea: 0 } });
    guests(w, 3, { temperament: 90, needs: { hunger: 0, thirst: 0, bladder: 0, energy: 255, happiness: 255, nausea: 0 } });
    expect(ratingParts(w)).toEqual({
      happiness: 1,
      cleanliness: 1,
      reliability: 1,
      fairPrices: 1,
      variety: 1,
      lostGuests: 1,
      queues: 1,
      atmosphere: 1,
    });
    expect(computeRating(w)).toBe(1_000);
  });

  it('atmosphere: guests with no Calm or Buzz under them score 0, which costs the whole atmosphere weight', () => {
    const w = makeTestWorld();
    guests(w, 4, { temperament: 30, needs: { hunger: 0, thirst: 0, bladder: 0, energy: 255, happiness: 255, nausea: 0 } });
    expect(ratingParts(w).atmosphere).toBe(0);
    addSceneryDirect(w, 'rock_waterfall', 0, 0); // raw Calm 119 at tile 0
    expect(ratingParts(w).atmosphere).toBe(Math.round(((70 * 119) / (100 * 255)) * ATMOSPHERE_MAX_POINTS) / ATMOSPHERE_MAX_POINTS);
  });

  it('happiness: mean of guests in the park and the last leavers, / 255', () => {
    const w = makeTestWorld();
    w.state.park.recentLeavers = [0, 0, 0];
    expect(ratingParts(w).happiness).toBe(0);
    guests(w, 1, { needs: { hunger: 0, thirst: 0, bladder: 0, energy: 255, happiness: 255, nausea: 0 } });
    expect(ratingParts(w).happiness).toBeCloseTo(0.25, 10);
    w.state.park.recentLeavers = [];
    expect(ratingParts(w).happiness).toBe(1);
  });

  it('cleanliness and reliability come from their systems', () => {
    const w = makeTestWorld();
    clean.mockReturnValue(0);
    reliable.mockReturnValue(0);
    const p = ratingParts(w);
    expect(p.cleanliness).toBe(0);
    expect(p.reliability).toBe(0);
    clean.mockReturnValue(0.4);
    reliable.mockReturnValue(0.7);
    expect(ratingParts(w).cleanliness).toBe(0.4);
    expect(ratingParts(w).reliability).toBe(0.7);
  });

  describe('fair prices: 1 − min(1, 3 × too-expensive thoughts today / guests)', () => {
    const ids = [THOUGHT.rideTooExpensive, THOUGHT.snackTooExpensive];

    it('finds the too-expensive thought ids by their spec text, once', () => {
      expect([...TOO_EXPENSIVE_THOUGHT_IDS]).toEqual([THOUGHT.drinkTooExpensive, THOUGHT.rideTooExpensive, THOUGHT.snackTooExpensive]);
      for (const id of TOO_EXPENSIVE_THOUGHT_IDS) expect(TOO_EXPENSIVE_THOUGHT_TEXTS).toContain(en[id]);
      expect(Object.isFrozen(TOO_EXPENSIVE_THOUGHT_IDS)).toBe(true);
    });

    it('is 1 with no such thoughts, and falls with each one', () => {
      const w = makeTestWorld();
      guests(w, 6);
      expect(ratingParts(w).fairPrices).toBe(1);
      const g = w.state.guests[0]!;
      g.thoughtCooldowns[ids[0] as string] = w.state.tick - 10;
      g.thoughtCooldowns[THOUGHT.hungry] = w.state.tick - 10;
      expect(ratingParts(w).fairPrices).toBeCloseTo(1 - 3 / 6, 10);
      g.thoughtCooldowns[ids[1] as string] = w.state.tick;
      expect(ratingParts(w).fairPrices).toBe(0);
    });

    it('counts thoughts shown through addThought, and only within the last game day', () => {
      const w = makeTestWorld();
      w.state.tick = 10_000;
      guests(w, 9);
      const [a, b] = w.state.guests;
      w.state.tick = 10_000 - FAIR_PRICE_WINDOW_TICKS - 1;
      addThought(w, b!, ids[1] as string);
      w.state.tick = 10_000 - FAIR_PRICE_WINDOW_TICKS;
      addThought(w, b!, ids[0] as string);
      w.state.tick = 10_000 - 5;
      addThought(w, a!, ids[0] as string);
      w.state.tick = 10_000;
      // Only a's thought is within the last game day (the thought list holds b's too, but they are a day old).
      expect(b!.thoughts.map((t) => t.id)).toEqual([ids[1], ids[0]]);
      expect(ratingParts(w).fairPrices).toBeCloseTo(1 - 3 / 9, 10);
    });

    it('addThought records every shown thought in the cooldowns, so the list never has a newer entry', () => {
      const w = makeTestWorld();
      guests(w, 1);
      const g = w.state.guests[0]!;
      for (let k = 0; k < 40; k++) {
        w.state.tick += 97;
        addThought(w, g, k % 3 === 0 ? (ids[k % 2] as string) : THOUGHT.hungry);
        for (const t of g.thoughts) {
          const last = g.thoughtCooldowns[t.id];
          // A list entry without a cooldown (or with an older one) is at least a game day old.
          if (last === undefined || last < t.tick) expect(w.state.tick - t.tick).toBeGreaterThanOrEqual(FAIR_PRICE_WINDOW_TICKS);
        }
      }
    });
  });

  describe('variety: (1 − 0.5 × Σ |guestShare − rideShare|) × min(1, openRides / 8)', () => {
    it('opposite mixes score 0', () => {
      const w = makeTestWorld();
      openRides(w, Array(VARIETY_FULL_RIDES).fill('swing_tower'));
      guests(w, 4, { temperament: 20 });
      expect(ratingParts(w).variety).toBe(0);
    });

    it('scales with the number of open rides up to 8', () => {
      const w = makeTestWorld();
      openRides(w, ['big_wheel', 'carousel']);
      guests(w, 1, { temperament: 0 });
      guests(w, 1, { temperament: 50 });
      expect(ratingParts(w).variety).toBeCloseTo(2 / 8, 10);
    });

    it('uses the master R6 group bounds (35 / 36 and 64 / 65)', () => {
      const w = makeTestWorld();
      openRides(w, ['big_wheel', 'big_wheel', 'big_wheel', 'big_wheel', 'swing_tower', 'swing_tower', 'swing_tower', 'swing_tower']);
      guests(w, 1, { temperament: 35 });
      guests(w, 1, { temperament: 65 });
      expect(ratingParts(w).variety).toBe(1);
      w.state.guests[0]!.temperament = 36;
      w.state.guests[1]!.temperament = 64;
      expect(ratingParts(w).variety).toBe(0);
    });

    it('with no guests the guest shares are 0, so variety is half the ride term', () => {
      const w = makeTestWorld();
      openRides(w, Array(VARIETY_FULL_RIDES).fill('carousel'));
      expect(ratingParts(w).variety).toBe(0.5);
    });

    it('counts open track rides by their type tag, and ignores closed rides', () => {
      const w = makeTestWorld();
      const [coaster] = openRides(w, ['carousel']);
      coaster!.kind = 'track';
      coaster!.defId = 'steel_coaster';
      const closed = placeRideDirect(w, 'big_wheel', 40, 40);
      closed.status = 'closed';
      guests(w, 1, { temperament: 100 });
      expect(ratingParts(w).variety).toBeCloseTo(1 / 8, 10);
    });
  });

  it('lost guests: 1 − min(1, 4 × lost / guests)', () => {
    const w = makeTestWorld();
    guests(w, 8);
    expect(ratingParts(w).lostGuests).toBe(1);
    w.state.guests[0]!.lostSinceTick = 0;
    expect(ratingParts(w).lostGuests).toBe(0.5);
    w.state.guests[1]!.lostSinceTick = 5;
    expect(ratingParts(w).lostGuests).toBe(0);
  });

  it('lost guests include guests lost after wrong turns (Phase 3 §4.10 LOST_STEPS)', () => {
    const w = makeTestWorld();
    guests(w, 8);
    w.state.guests[0]!.lostSteps = LOST_STEPS - 1;
    expect(ratingParts(w).lostGuests).toBe(1);
    w.state.guests[0]!.lostSteps = LOST_STEPS;
    expect(ratingParts(w).lostGuests).toBe(0.5);
  });

  describe('queues: 1 − min(1, mean over open rides of queue length / (3 × capacity))', () => {
    it('empty queues score 1 and a queue of 3 × capacity scores 0', () => {
      const w = makeTestWorld();
      const [ride] = openRides(w, ['carousel']);
      expect(ratingParts(w).queues).toBe(1);
      const cap = getFlatRideDef('carousel')!.capacity;
      ride!.queue = Array.from({ length: 3 * cap }, (_, i) => 1_000 + i);
      expect(ratingParts(w).queues).toBe(0);
      ride!.queue = Array.from({ length: 6 * cap }, (_, i) => 1_000 + i);
      expect(ratingParts(w).queues).toBe(0);
    });

    it('averages over open rides', () => {
      const w = makeTestWorld();
      const [a] = openRides(w, ['carousel', 'big_wheel']);
      const cap = getFlatRideDef('carousel')!.capacity;
      a!.queue = Array.from({ length: Math.round(1.5 * cap) }, (_, i) => 1_000 + i);
      // (0.5 + 0) / 2 = 0.25
      expect(ratingParts(w).queues).toBeCloseTo(0.75, 10);
    });

    it('uses the seats of all trains as a track ride capacity', () => {
      const w = makeTestWorld();
      const [ride] = openRides(w, ['carousel']);
      ride!.kind = 'track';
      ride!.defId = 'junior_coaster';
      w.state.track = createTrackSlice();
      makeTrackRideDataDirect(w, ride!, { trainConfig: { trains: 2, carsPerTrain: 3 }, openedOnce: true });
      // capacity = 2 trains × 3 cars × 2 seats = 12 → 3 × 12 = 36
      ride!.queue = Array.from({ length: 18 }, (_, i) => 1_000 + i);
      expect(ratingParts(w).queues).toBeCloseTo(0.5, 10);
    });
  });
});

describe('updateRating', () => {
  it('adds modifiers.ratingBonus and clamps to 0–1,000', () => {
    const w = makeTestWorld();
    w.state.modifiers.ratingBonus = 100;
    expect(computeRating(w)).toBe(638);
    w.state.modifiers.ratingBonus = 900;
    expect(computeRating(w)).toBe(1_000);
    w.state.modifiers.ratingBonus = -900;
    expect(computeRating(w)).toBe(0);
  });

  it('writes the rating at each hour start through stepTick', () => {
    const w = makeTestWorld();
    expect(w.state.park.rating).toBe(0);
    w.state.tick = 10 * TICKS_PER_HOUR - 1;
    runTicks(w, 1);
    expect(w.state.park.rating).toBe(0);
    runTicks(w, 1);
    expect(w.state.park.rating).toBe(538);
    clean.mockReturnValue(0);
    updateRating(w);
    expect(w.state.park.rating).toBe(388);
  });
});
