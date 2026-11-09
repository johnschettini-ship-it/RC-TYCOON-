/**
 * Calm and Buzz effects on guests (Phase 4 §4.6 effects table) at temperament 0, 50, and 100, the guest hooks
 * that apply them, and the Atmosphere rating input (round(mean × 100), weights still sum to 1,000).
 */
import { describe, expect, it } from 'vitest';
import {
  ATMOSPHERE_MAX_POINTS,
  ATMOSPHERE_NO_GUESTS_SCORE,
  BUZZ_CHILL_UNHAPPY,
  BUZZ_THRILL_HAPPY,
  BUZZ_WALK_FAST,
  CALM_CHILL_HAPPY,
  CALM_ENERGY_CUT,
  CALM_WALK_SLOW,
} from '../../../src/data/tuning/fields';
import { RATING_MAX, RATING_WEIGHTS } from '../../../src/data/tuning/economy';
import { NEED_INTERVAL } from '../../../src/data/tuning/guests';
import { atmosphereScore, buzzAt, calmAt } from '../../../src/sim/fields/api';
import { energyFactorOf, happinessDeltaOf, nauseaRecoveryFactorOf, roundDiv, walkFactorOf } from '../../../src/sim/fields/effects';
import { fieldHooks } from '../../../src/sim/fields/hooks';
import { guestHooks, hookFactor } from '../../../src/sim/hooks';
import { updateNeeds } from '../../../src/sim/guests/needs';
import { ratingParts } from '../../../src/sim/park/rating';
import { tileIndex } from '../../../src/sim/map';
import type { Guest } from '../../../src/sim/guests/types';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld, placeFootpath, placeQueue, placeRideDirect, runTicks } from '../../helpers/world';
import { addSceneryDirect } from './helpers';

const C = (calm: number): number => calm / 255;

describe('effect formulas at temperament 0, 50, and 100 (C = B = 1)', () => {
  it('energy loss × (1 − 0.6 × C × c)', () => {
    expect(energyFactorOf(255, 0)).toBeCloseTo(1 - CALM_ENERGY_CUT, 12);
    expect(energyFactorOf(255, 50)).toBeCloseTo(1 - CALM_ENERGY_CUT * 0.5, 12);
    expect(energyFactorOf(255, 100)).toBe(1);
    expect(energyFactorOf(0, 0)).toBe(1);
  });

  it('nausea recovery × (1 + C × (1 + 2c))', () => {
    expect(nauseaRecoveryFactorOf(255, 0)).toBeCloseTo(4, 12);
    expect(nauseaRecoveryFactorOf(255, 50)).toBeCloseTo(3, 12);
    expect(nauseaRecoveryFactorOf(255, 100)).toBeCloseTo(2, 12);
    expect(nauseaRecoveryFactorOf(0, 0)).toBe(1);
  });

  it('happiness + round(6 × C × c) − round(3 × B × c) + round(6 × B × h)', () => {
    expect(happinessDeltaOf(255, 255, 0)).toBe(6 - 3 + 0);
    // t 50: round(3) − round(1.5) + round(3): halves round up.
    expect(happinessDeltaOf(255, 255, 50)).toBe(3 - 2 + 3);
    expect(happinessDeltaOf(255, 255, 100)).toBe(0 - 0 + 6);
    expect(happinessDeltaOf(0, 0, 0)).toBe(0);
    // Calm only helps Chill guests, Buzz only helps Thrill guests.
    expect(happinessDeltaOf(255, 0, 100)).toBe(0);
    expect(happinessDeltaOf(0, 255, 0)).toBe(-3);
  });

  it('walking speed: Chill × (1 − 0.15 × C × c); Thrill to a thrill ride × (1 + 0.25 × B × h); Family 1', () => {
    expect(walkFactorOf(255, 255, 0, true)).toBeCloseTo(1 - CALM_WALK_SLOW, 12);
    expect(walkFactorOf(255, 255, 0, false)).toBeCloseTo(1 - CALM_WALK_SLOW, 12);
    expect(walkFactorOf(255, 255, 50, true)).toBe(1);
    expect(walkFactorOf(255, 255, 100, true)).toBeCloseTo(1 + BUZZ_WALK_FAST, 12);
    expect(walkFactorOf(255, 255, 100, false)).toBe(1);
    // Master R6 group bounds: Chill ≤ 35, Thrill ≥ 65.
    expect(walkFactorOf(255, 0, 35, false)).toBeCloseTo(1 - CALM_WALK_SLOW * 0.65, 12);
    expect(walkFactorOf(255, 0, 36, false)).toBe(1);
    expect(walkFactorOf(0, 255, 64, true)).toBe(1);
    expect(walkFactorOf(0, 255, 65, true)).toBeCloseTo(1 + BUZZ_WALK_FAST * 0.65, 12);
  });

  it('partial values use the same shares (C 0.4, B 0.2)', () => {
    for (const t of [0, 50, 100]) {
      const c = (100 - t) / 100;
      const h = t / 100;
      expect(energyFactorOf(102, t)).toBeCloseTo(1 - 0.6 * 0.4 * c, 12);
      expect(nauseaRecoveryFactorOf(102, t)).toBeCloseTo(1 + 0.4 * (1 + 2 * c), 12);
      expect(happinessDeltaOf(102, 51, t)).toBe(Math.round(CALM_CHILL_HAPPY * 0.4 * c) - Math.round(BUZZ_CHILL_UNHAPPY * 0.2 * c) + Math.round(BUZZ_THRILL_HAPPY * 0.2 * h));
    }
  });

  it('rounding is exact integer math at the half (6 × C × c = 0.5 with calm 85 and t 75)', () => {
    // 6 × (85 / 255) × 0.25 = 0.5 exactly in real numbers; floating point gives 0.49999…
    expect(roundDiv(6 * 85 * 25, 255 * 100)).toBe(1);
    expect(happinessDeltaOf(85, 0, 75)).toBe(1);
    expect(roundDiv(0, 7)).toBe(0);
    expect(roundDiv(7, 2)).toBe(4);
    expect(roundDiv(5, 2)).toBe(3);
  });
});

/** A world with a garden area around (20, 20) (high Calm), an open thrill ride at (40, 20), and plain paths. */
function scene(): { w: World; garden: number; plain: number; nearRide: number; thrillRide: number; familyRide: number } {
  const w = makeTestWorld();
  for (const [x, y] of [[18, 18], [20, 18], [22, 18], [18, 22], [20, 22], [22, 22]] as const) addSceneryDirect(w, 'fountain_carved', x, y);
  const garden = placeFootpath(w, 20, 20);
  const plain = placeFootpath(w, 10, 50);
  const thrill = placeRideDirect(w, 'flip_arm', 40, 20, 0);
  thrill.status = 'open';
  const family = placeRideDirect(w, 'carousel', 50, 50, 0);
  family.status = 'open';
  const nearRide = placeFootpath(w, 41, 24);
  return { w, garden, plain, nearRide, thrillRide: thrill.id, familyRide: family.id };
}

describe('guest hooks (fieldHooks)', () => {
  it('are registered in the guest hook registry', () => {
    expect(guestHooks.energyFactor).toContain(fieldHooks.energyFactor![0]);
    expect(guestHooks.nauseaRecoveryFactor).toContain(fieldHooks.nauseaRecoveryFactor![0]);
    expect(guestHooks.perHour).toContain(fieldHooks.perHour![0]);
    expect(guestHooks.walkSpeed).toContain(fieldHooks.walkSpeed![0]);
  });

  it('read the guest tile: energy and nausea factors for temperament 0, 50, 100', () => {
    const { w, garden, plain } = scene();
    const calm = calmAt(w, garden);
    expect(calm).toBe(255);
    for (const t of [0, 50, 100]) {
      const g = addGuestDirect(w, garden, { temperament: t });
      expect(fieldHooks.energyFactor![0]!(w, g)).toBeCloseTo(energyFactorOf(calm, t), 12);
      expect(fieldHooks.nauseaRecoveryFactor![0]!(w, g)).toBeCloseTo(nauseaRecoveryFactorOf(calm, t), 12);
      const far = addGuestDirect(w, plain, { temperament: t });
      expect(fieldHooks.energyFactor![0]!(w, far)).toBe(1);
      expect(fieldHooks.nauseaRecoveryFactor![0]!(w, far)).toBe(1);
      // A guest on a ride has no tile value.
      const riding = addGuestDirect(w, garden, { temperament: t, state: 'riding' });
      expect(fieldHooks.energyFactor![0]!(w, riding)).toBe(1);
    }
  });

  it('per hour: happiness changes by the formula and stays within 0–255', () => {
    const { w, garden, nearRide } = scene();
    const chill = addGuestDirect(w, garden, { temperament: 0 });
    const before = chill.needs.happiness;
    fieldHooks.perHour![0]!(w, chill);
    expect(chill.needs.happiness).toBe(before + happinessDeltaOf(calmAt(w, garden), buzzAt(w, garden), 0));
    expect(chill.needs.happiness).toBeGreaterThan(before);
    const thrill = addGuestDirect(w, nearRide, { temperament: 100 });
    thrill.needs.happiness = 253;
    fieldHooks.perHour![0]!(w, thrill);
    expect(buzzAt(w, nearRide)).toBeGreaterThan(0);
    expect(thrill.needs.happiness).toBe(255);
    const chillNearRide = addGuestDirect(w, nearRide, { temperament: 0 });
    chillNearRide.needs.happiness = 0;
    fieldHooks.perHour![0]!(w, chillNearRide);
    expect(chillNearRide.needs.happiness).toBe(0);
  });

  it('Chill guests recover in gardens: less energy loss and faster nausea recovery than on a plain path', () => {
    const { w, garden, plain } = scene();
    const needs = { hunger: 0, thirst: 0, bladder: 0, energy: 200, happiness: 128, nausea: 200 };
    const inGarden = addGuestDirect(w, garden, { temperament: 0, needs: { ...needs } });
    const onPath = addGuestDirect(w, plain, { temperament: 0, needs: { ...needs } });
    const s = w.state;
    for (let k = 0; k < 10 * NEED_INTERVAL; k++) {
      updateNeeds(w, inGarden);
      updateNeeds(w, onPath);
      s.tick += 1;
    }
    expect(200 - inGarden.needs.energy).toBeLessThan(200 - onPath.needs.energy);
    expect(inGarden.needs.nausea).toBeLessThan(onPath.needs.nausea);
  });

  it('Thrill guests speed up near thrill rides only when they walk to a thrill ride; Chill guests slow in Calm', () => {
    const { w, garden, nearRide, thrillRide, familyRide } = scene();
    const buzz = buzzAt(w, nearRide);
    expect(buzz).toBeGreaterThan(0);
    const toThrill = addGuestDirect(w, nearRide, { temperament: 100, target: `ride:${thrillRide}` });
    expect(hookFactor(guestHooks.walkSpeed, w, toThrill)).toBeCloseTo(1 + BUZZ_WALK_FAST * C(buzz), 12);
    const toFamily = addGuestDirect(w, nearRide, { temperament: 100, target: `ride:${familyRide}` });
    expect(hookFactor(guestHooks.walkSpeed, w, toFamily)).toBe(1);
    const leaving = addGuestDirect(w, nearRide, { temperament: 100, target: 'exit', state: 'leaving' });
    expect(hookFactor(guestHooks.walkSpeed, w, leaving)).toBe(1);
    const gone = addGuestDirect(w, nearRide, { temperament: 100, target: 'ride:99999' });
    expect(hookFactor(guestHooks.walkSpeed, w, gone)).toBe(1);
    const chill = addGuestDirect(w, garden, { temperament: 0, target: `ride:${thrillRide}` });
    expect(hookFactor(guestHooks.walkSpeed, w, chill)).toBeCloseTo(1 - CALM_WALK_SLOW, 12);
    const family = addGuestDirect(w, garden, { temperament: 50 });
    expect(hookFactor(guestHooks.walkSpeed, w, family)).toBe(1);
  });

  it('through stepTick, a Thrill guest walking to a thrill ride gets there before a Family guest', () => {
    const w = makeTestWorld();
    // Flip Arm at (40, 20), rotation 0: entrance gate (41, 22), queue at (41, 23), path south to (41, 27).
    const ride = placeRideDirect(w, 'flip_arm', 40, 20, 0);
    ride.status = 'open';
    placeQueue(w, 41, 23);
    for (let y = 24; y <= 27; y++) placeFootpath(w, 41, y);
    const start = tileIndex(w.state.map, 41, 27);
    const patch = { target: `ride:${ride.id}` as const, nextDecisionTick: 1e9, cash: 100_000 };
    const thrill: Guest = addGuestDirect(w, start, { ...patch, temperament: 100 });
    const family: Guest = addGuestDirect(w, start, { ...patch, temperament: 50 });
    let thrillAt = -1;
    let familyAt = -1;
    for (let k = 1; k <= 80 && familyAt < 0; k++) {
      runTicks(w, 1);
      // Arrival: the guest joins the queue (and may board in the same tick).
      if (thrillAt < 0 && thrill.state !== 'walking') thrillAt = k;
      if (familyAt < 0 && family.state !== 'walking') familyAt = k;
    }
    expect(thrillAt).toBeGreaterThan(0);
    expect(familyAt).toBeGreaterThan(0);
    expect(thrillAt).toBeLessThan(familyAt);
  });
});

describe('Atmosphere (Phase 4 §4.6, master R8)', () => {
  it('the weights sum to 1,000: Happiness 300, Atmosphere 100', () => {
    expect(RATING_WEIGHTS.happiness).toBe(300);
    expect(RATING_WEIGHTS.atmosphere).toBe(ATMOSPHERE_MAX_POINTS);
    expect(Object.values(RATING_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(RATING_MAX);
  });

  it('with no guest on a path it uses the no-data value', () => {
    const w = makeTestWorld();
    expect(atmosphereScore(w)).toBe(ATMOSPHERE_NO_GUESTS_SCORE);
    addGuestDirect(w, 100, { state: 'riding' });
    expect(atmosphereScore(w)).toBe(ATMOSPHERE_NO_GUESTS_SCORE);
  });

  it('is round(mean(c × C + h × B) × 100) over guests on a path', () => {
    const { w, garden, plain, nearRide } = scene();
    // Pure Chill in the garden: a = 1. Pure Thrill on a plain path: a = 0. Mean 0.5.
    addGuestDirect(w, garden, { temperament: 0 });
    addGuestDirect(w, plain, { temperament: 100 });
    expect(atmosphereScore(w)).toBe(0.5);
    // A guest on a ride is not on a path.
    addGuestDirect(w, plain, { temperament: 0, state: 'riding' });
    expect(atmosphereScore(w)).toBe(0.5);
    // A third guest with a = 0: mean 1 / 3 → 33 points.
    addGuestDirect(w, plain, { temperament: 50 });
    expect(atmosphereScore(w)).toBe(0.33);
    // Thrill guest near the thrill ride: a = B.
    const w2 = scene();
    addGuestDirect(w2.w, nearRide, { temperament: 100 });
    expect(atmosphereScore(w2.w)).toBe(Math.round((buzzAt(w2.w, nearRide) / 255) * 100) / 100);
  });

  it('feeds the rating part, and a park with no guests keeps its Build 1 rating total', () => {
    const { w, garden } = scene();
    addGuestDirect(w, garden, { temperament: 0 });
    expect(ratingParts(w).atmosphere).toBe(atmosphereScore(w));
    expect(RATING_WEIGHTS.happiness * 0.5 + RATING_WEIGHTS.atmosphere * ATMOSPHERE_NO_GUESTS_SCORE).toBe((RATING_WEIGHTS.happiness + RATING_WEIGHTS.atmosphere) * 0.5);
  });

  it('reads Calm after the litter penalty', () => {
    const { w, garden } = scene();
    addGuestDirect(w, garden, { temperament: 0 });
    expect(atmosphereScore(w)).toBe(1);
    // Raw Calm 396 at the garden tile (6 Carved Fountains around it); 9 messes take 144.
    w.state.map.mess[garden] = 9;
    expect(calmAt(w, garden)).toBe(396 - 144);
    expect(atmosphereScore(w)).toBe(Math.round((252 / 255) * 100) / 100);
  });
});
