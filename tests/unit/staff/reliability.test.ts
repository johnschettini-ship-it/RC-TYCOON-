import { describe, expect, it } from 'vitest';
import {
  ageFactor,
  breakdownChance,
  inspectedReliability,
  fixedReliability,
  reliabilityCap,
  rideAgeYears,
  wearAmount,
  wornReliability,
} from '../../../src/sim/breakdowns/reliability';
import {
  BREAK_BASE,
  BREAK_SCALE,
  REL_CAP_MIN,
  REL_MAX,
  WEAR_PER_CYCLE,
} from '../../../src/data/tuning/staff';
import { TICKS_PER_MONTH, MONTHS_PER_YEAR } from '../../../src/data/tuning/core';

const YEAR = TICKS_PER_MONTH * MONTHS_PER_YEAR;

describe('reliability formulas (Phase 3 §4.5)', () => {
  it('age counts whole years from placement', () => {
    expect(rideAgeYears(1000, 1000)).toBe(0);
    expect(rideAgeYears(1000, 1000 + YEAR - 1)).toBe(0);
    expect(rideAgeYears(1000, 1000 + YEAR)).toBe(1);
    expect(rideAgeYears(0, 7 * YEAR + 5)).toBe(7);
  });

  it('cap = max(REL_CAP_MIN, 100 − 5 × ageYears)', () => {
    expect(reliabilityCap(0)).toBe(REL_MAX);
    expect(reliabilityCap(1)).toBe(9500);
    expect(reliabilityCap(4)).toBe(8000);
    expect(reliabilityCap(10)).toBe(REL_CAP_MIN);
    expect(reliabilityCap(30)).toBe(REL_CAP_MIN);
  });

  it('ageFactor = min(2, 1 + 0.25 × ageYears) and wear = WEAR_PER_CYCLE × ageFactor', () => {
    expect(ageFactor(0)).toBe(1);
    expect(ageFactor(2)).toBe(1.5);
    expect(ageFactor(4)).toBe(2);
    expect(ageFactor(9)).toBe(2);
    expect(wearAmount(0)).toBe(WEAR_PER_CYCLE);
    expect(wearAmount(1)).toBe(188);
    expect(wearAmount(4)).toBe(2 * WEAR_PER_CYCLE);
  });

  it('wear never goes below 0', () => {
    expect(wornReliability(10_000, 0)).toBe(9850);
    expect(wornReliability(100, 0)).toBe(0);
    expect(wornReliability(0, 3)).toBe(0);
  });

  it('breakdown chance at R = 100, 80, 50, 0', () => {
    expect(breakdownChance(10_000)).toBeCloseTo(BREAK_BASE, 12);
    expect(breakdownChance(8_000)).toBeCloseTo(BREAK_BASE + BREAK_SCALE * 0.04, 12);
    expect(breakdownChance(5_000)).toBeCloseTo(0.052, 12);
    expect(breakdownChance(0)).toBeCloseTo(0.202, 12);
  });

  it('inspection: R += max(1, 0.5 × (cap − R)), clamped to cap', () => {
    expect(inspectedReliability(6_000, 0)).toBe(8_000);
    expect(inspectedReliability(9_950, 0)).toBe(10_000); // +1 point minimum, clamped
    expect(inspectedReliability(9_990, 0)).toBe(10_000);
    expect(inspectedReliability(9_000, 0)).toBe(9_500);
    expect(inspectedReliability(9_800, 1)).toBe(9_500); // above the aged cap: clamped down to cap
    expect(inspectedReliability(9_000, 1)).toBe(9_250);
  });

  it('fix: R += 0.25 × (cap − R), clamped to cap', () => {
    expect(fixedReliability(6_000, 0)).toBe(7_000);
    expect(fixedReliability(10_000, 0)).toBe(10_000);
    expect(fixedReliability(2_000, 10)).toBe(2_750);
    expect(fixedReliability(9_900, 1)).toBe(9_500);
  });
});
