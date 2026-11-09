/** Phase 5 §4.8: difficulty multipliers reach the Phase 1 and Phase 3 systems through `state.modifiers` (master R7). */
import { describe, expect, it } from 'vitest';
import type { Difficulty } from '../../../src/data/scenarios';
import { DIFFICULTY } from '../../../src/data/tuning/scenario';
import { RESEARCH_POINTS_PER_HOUR } from '../../../src/data/tuning/management';
import { onRideDispatch } from '../../../src/sim/breakdowns/api';
import { monthlyFinance } from '../../../src/sim/finance/monthly';
import { updateNeeds } from '../../../src/sim/guests/needs';
import { rideValue } from '../../../src/sim/guests/scoring';
import { arrivalsPerHour } from '../../../src/sim/park/arrivals';
import { hourlyResearch } from '../../../src/sim/research/update';
import { createScenarioWorld, difficultyModifiers } from '../../../src/sim/scenario/start';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld, placeFootpath, placeRideDirect } from '../../helpers/world';

const PRESETS: Difficulty[] = ['relaxed', 'standard', 'tough'];

function world(d: Difficulty): World {
  const w = makeTestWorld();
  w.state.modifiers = difficultyModifiers(d);
  return w;
}

describe('difficulty presets (Phase 5 §4.8 table)', () => {
  it('map to the master R7 modifiers', () => {
    expect(difficultyModifiers('relaxed')).toEqual({ arrivals: 1.2, priceTolerance: 1.2, happinessDecay: 0.8, researchSpeed: 1.5, breakdownChance: 0.6, loanInterest: 0.5, ratingBonus: 0 });
    expect(difficultyModifiers('standard')).toEqual({ arrivals: 1, priceTolerance: 1, happinessDecay: 1, researchSpeed: 1, breakdownChance: 1, loanInterest: 1, ratingBonus: 0 });
    expect(difficultyModifiers('tough')).toEqual({ arrivals: 0.9, priceTolerance: 0.85, happinessDecay: 1.2, researchSpeed: 0.75, breakdownChance: 1.3, loanInterest: 1.5, ratingBonus: 0 });
    expect([DIFFICULTY.relaxed.bankruptMonths, DIFFICULTY.standard.bankruptMonths, DIFFICULTY.tough.bankruptMonths]).toEqual([null, 3, 2]);
    expect(PRESETS.map((d) => DIFFICULTY[d].ratingCollapse)).toEqual([false, false, true]);
    expect(PRESETS.map((d) => DIFFICULTY[d].lateWinAllowed)).toEqual([true, false, false]);
  });

  it('start cash scales ×1.5 / ×1 / ×0.75', () => {
    expect(PRESETS.map((d) => createScenarioWorld('meadow_start', d)!.state.park.cash)).toEqual([3_000_000, 2_000_000, 1_500_000]);
  });
});

describe('the multipliers reach the systems', () => {
  it('Phase 1 arrivals', () => {
    const rate = (d: Difficulty): number => {
      const w = world(d);
      w.state.park.open = true;
      w.state.park.rating = 600;
      w.state.tick = 12 * 50;
      placeRideDirect(w, 'carousel', 20, 20).status = 'open';
      return arrivalsPerHour(w);
    };
    expect(rate('relaxed') / rate('standard')).toBeCloseTo(1.2, 9);
    expect(rate('tough') / rate('standard')).toBeCloseTo(0.9, 9);
  });

  it('Phase 1 price tolerance (ride value for price checks)', () => {
    const value = (d: Difficulty): number => {
      const w = world(d);
      return rideValue(w, placeRideDirect(w, 'swing_tower', 20, 20));
    };
    expect(value('relaxed') / value('standard')).toBeCloseTo(1.2, 9);
    expect(value('tough') / value('standard')).toBeCloseTo(0.85, 9);
  });

  it('Phase 1 happiness decay', () => {
    const loss = (d: Difficulty): number => {
      const w = world(d);
      const g = addGuestDirect(w, placeFootpath(w, 30, 30), { needs: { hunger: 255, thirst: 255, bladder: 255, energy: 0, happiness: 255, nausea: 255 } });
      const before = g.needs.happiness;
      for (let k = 0; k < 600; k++) {
        updateNeeds(w, g);
        g.needs.hunger = 255;
        w.state.tick++;
      }
      return before - g.needs.happiness;
    };
    const standard = loss('standard');
    expect(standard).toBeGreaterThan(20);
    expect(loss('relaxed') / standard).toBeCloseTo(0.8, 1);
    expect(loss('tough') / standard).toBeCloseTo(1.2, 1);
  });

  it('Phase 3 research speed', () => {
    const points = (d: Difficulty): number => {
      const w = world(d);
      w.state.tick = 450;
      hourlyResearch(w);
      return w.state.management.research.progress;
    };
    expect(points('standard')).toBe(RESEARCH_POINTS_PER_HOUR.medium);
    expect(points('relaxed')).toBe(RESEARCH_POINTS_PER_HOUR.medium * 1.5);
    expect(points('tough')).toBe(RESEARCH_POINTS_PER_HOUR.medium * 0.75);
  });

  it('Phase 3 loan interest', () => {
    const interest = (d: Difficulty): number => {
      const w = world(d);
      w.state.management.loan.balance = 2_000_000;
      w.state.tick = 3600;
      monthlyFinance(w);
      return -w.state.economy.ledger.at(-1)!.lines.loanInterest;
    };
    expect(PRESETS.map(interest)).toEqual([10_000, 20_000, 30_000]);
  });

  it('Phase 3 breakdown chance (0 never breaks; more often on Tough than Relaxed)', () => {
    const breakdowns = (factor: number): number => {
      const w = makeTestWorld(4242);
      w.state.modifiers.breakdownChance = factor;
      const ride = placeRideDirect(w, 'carousel', 20, 20);
      let n = 0;
      for (let k = 0; k < 3000; k++) {
        ride.status = 'open';
        ride.reliability = 2000;
        onRideDispatch(w, ride);
        if ((ride.status as string) === 'broken') n++;
      }
      return n;
    };
    expect(breakdowns(0)).toBe(0);
    expect(breakdowns(DIFFICULTY.tough.breakdownChance)).toBeGreaterThan(breakdowns(DIFFICULTY.relaxed.breakdownChance));
  });
});
