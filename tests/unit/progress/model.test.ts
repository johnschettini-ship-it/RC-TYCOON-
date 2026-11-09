/**
 * Scenario front-end view models (Phase 5 §4.3, §4.4, §4.7, §4.13, §7) with fake scenario definitions: goal texts,
 * objective rows, deadlines, cards with locks and best stars, start conditions, end facts.
 */
import { describe, expect, it } from 'vitest';
import type { Objective, ScenarioDef } from '../../../src/data/scenarios/types';
import { text } from '../../../src/data/strings/en';
import { emptyProgress, type Progress } from '../../../src/progress';
import {
  actVerb,
  AWARD_MASCOT,
  cameraTiles,
  deadlineText,
  endFacts,
  goalText,
  goalView,
  monthLabel,
  monthsLeftText,
  newestSlot,
  scenarioCards,
  startConditions,
} from '../../../src/ui/scenario/model';
import { AWARD_IDS } from '../../../src/sim/awards/types';

function def(id: string, patch: Partial<ScenarioDef> = {}): ScenarioDef {
  return {
    id,
    defVersion: 1,
    nameKey: id.replace(/_/g, ' '),
    description: 'A test scenario',
    stars: 1,
    map: {
      width: 64,
      height: 64,
      seed: 1,
      baseHeight: 8,
      noise: { amplitude: 2, scale: 16, octaves: 2 },
      waterLevel: 0,
      terrainRules: [],
      features: [],
      park: { owned: [{ x0: 12, y0: 20, x1: 51, y1: 59 }], forSale: [], rightsForSale: [], entrance: { x: 31, y: 60, side: 'S' } },
    },
    start: { cash: 2_000_000, loan: 0, maxLoan: 2_000_000, entranceFee: 600, parkName: 'Meadow Park' },
    research: { unlocked: [], allowed: 'all' },
    climate: 'temperate',
    afterDark: 'off',
    objectives: [{ type: 'guestsInPark', count: 250, minRating: 500 }],
    timeLimitMonths: 12,
    ...patch,
  };
}

describe('goal texts (Phase 5 §4.3, §4.7 goals)', () => {
  const cases: Array<[Objective, string]> = [
    [{ type: 'guestsInPark', count: 250, minRating: 500 }, '250 guests in the park with a rating of 500 or more'],
    [{ type: 'guestsInPark', count: 400 }, '400 guests in the park'],
    [{ type: 'parkRatingHeld', rating: 650, months: 3 }, 'Park rating of 650 or more every day for 3 months'],
    [{ type: 'parkValue', value: 12_000_000 }, 'Park value of $120,000 or more'],
    [{ type: 'monthlyRideIncome', amount: 400_000, months: 1 }, 'Ride income of $4,000 or more a month for 1 month'],
    [{ type: 'monthlyProfit', amount: 500_000, months: 1 }, 'Profit of $5,000 or more a month for 1 month'],
    [{ type: 'coasterExcitement', count: 2, minExcitement: 650, maxIntensity: 850 }, '2 coasters with excitement 6.50 or more and intensity 8.50 or less'],
    [{ type: 'coasterExcitement', count: 1, minExcitement: 700 }, '1 coaster with excitement 7.00 or more'],
    [{ type: 'ridesOpen', count: 3, flag: 'spooky' }, '3 open spooky rides'],
    [{ type: 'ridesOpen', count: 5 }, '5 open rides'],
    [{ type: 'repayLoan' }, 'Repay the loan'],
    [{ type: 'temperamentBalance', minGuests: 400, minShare: 30, minHappiness: 170, months: 2 }, '400 guests with 30% Thrill and 30% Chill guests, each group 67% happy, for 2 months'],
    [{ type: 'afterDarkHappiness', minGuests: 300, minHappiness: 180, months: 1 }, 'After Dark on, and 300 guests at night who are 71% happy, for 1 month'],
  ];
  for (const [o, want] of cases) {
    it(`${o.type}: "${want}"`, () => {
      expect(goalText(o)).toBe(want);
      expect(want.endsWith('.')).toBe(false);
    });
  }
});

describe('objective rows', () => {
  it('counts show value of target and a bar', () => {
    expect(goalView({ type: 'guestsInPark', count: 250 }, { met: false, value: 125, streak: 0 })).toEqual({
      text: '250 guests in the park',
      met: false,
      fraction: 0.5,
      value: '125 of 250',
      streak: null,
    });
  });

  it('parkRatingHeld counts days of the streak', () => {
    const v = goalView({ type: 'parkRatingHeld', rating: 650, months: 3 }, { met: false, value: 660, streak: 4 });
    expect(v.streak).toBe('Streak: 4 of 9 days');
    expect(v.fraction).toBeCloseTo(4 / 9, 10);
  });

  it('money goals show money; month goals show a month streak', () => {
    const v = goalView({ type: 'monthlyProfit', amount: 500_000, months: 2 }, { met: false, value: 250_000, streak: 1 });
    expect(v.value).toBe('$2,500 of $5,000');
    expect(v.streak).toBe('Streak: 1 of 2 months');
    expect(v.fraction).toBe(0.5);
  });

  it('repayLoan shows the balance and how much is paid back', () => {
    const v = goalView({ type: 'repayLoan' }, { met: false, value: 750_000, streak: 0 }, 3_000_000);
    expect(v.value).toBe('Loan: $7,500');
    expect(v.fraction).toBe(0.75);
    expect(goalView({ type: 'repayLoan' }, { met: true, value: 0, streak: 0 }, 3_000_000).fraction).toBe(1);
  });

  it('a missing progress record reads as not met', () => {
    expect(goalView({ type: 'parkValue', value: 100 }, undefined)).toMatchObject({ met: false, fraction: 0 });
  });
});

describe('dates and deadlines', () => {
  it('month labels follow the HUD date (the game year starts in March) and the detail deadline', () => {
    expect(monthLabel(0)).toBe('Mar · Year 1');
    expect(monthLabel(11)).toBe('Feb · Year 1');
    expect(monthLabel(12)).toBe('Mar · Year 2');
    expect(deadlineText({ timeLimitMonths: 12 })).toBe('End of Feb · Year 1 (12 months)');
    expect(deadlineText({ timeLimitMonths: null })).toBe('No time limit');
  });

  it('"8 months left" counts the deadline month itself', () => {
    expect(monthsLeftText(11, 450)).toBe('12 months left');
    expect(monthsLeftText(11, 4 * 3600)).toBe('8 months left');
    expect(monthsLeftText(11, 11 * 3600)).toBe('1 month left');
    expect(monthsLeftText(11, 12 * 3600)).toBe('Past the deadline');
    expect(monthsLeftText(null, 0)).toBeNull();
  });
});

describe('scenario cards (Phase 5 §4.7, §4.13)', () => {
  const defs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => def(id, { stars: (Math.min(5, 1 + Math.floor(i / 2)) as 1 | 2 | 3 | 4 | 5) }));

  it('locks, wins needed, and best stars per preset', () => {
    const p: Progress = emptyProgress();
    p.scenarios.a = { defVersion: 1, best: { standard: { stars: 2, endMonthIndex: 7, parkValue: 0, rating: 600, guests: 300, completedAt: 'x' } } };
    const cards = scenarioCards(defs, p, false);
    expect(cards.map((c) => c.open)).toEqual([true, true, true, false, false, false, false, false]);
    expect(cards.map((c) => c.winsNeeded)).toEqual([0, 0, 0, 2, 2, 2, 4, 6]);
    expect(cards[0]?.best).toEqual({ relaxed: null, standard: 2, tough: null });
    expect(cards[0]?.name).toBe('a');
  });

  it('an older record is tagged as an earlier version', () => {
    const p = emptyProgress();
    p.scenarios.b = { defVersion: 1, best: { tough: { stars: 3, endMonthIndex: 3, parkValue: 0, rating: 0, guests: 0, completedAt: 'x' } } };
    const cards = scenarioCards([def('a'), def('b', { defVersion: 2 })], p, false);
    expect(cards.map((c) => c.earlier)).toEqual([false, true]);
  });

  it('unreadable progress opens the first 3; Unlock all opens all', () => {
    expect(scenarioCards(defs, null, false).filter((c) => c.open)).toHaveLength(3);
    expect(scenarioCards(defs, null, true).every((c) => c.open)).toBe(true);
  });
});

describe('start conditions per preset (Phase 5 §4.8)', () => {
  it('cash and max loan scale; the loan stays', () => {
    const d = def('m', { start: { cash: 2_200_000, loan: 500_000, maxLoan: 3_000_000, entranceFee: 0, parkName: 'P' } });
    expect(startConditions(d, 'relaxed')).toEqual({ cash: 3_300_000, loan: 500_000, maxLoan: 4_500_000 });
    expect(startConditions(d, 'standard')).toEqual({ cash: 2_200_000, loan: 500_000, maxLoan: 3_000_000 });
    expect(startConditions(d, 'tough')).toEqual({ cash: 1_650_000, loan: 500_000, maxLoan: 2_250_000 });
  });
});

describe('end screen, mascots, pointer words, newest save', () => {
  it('end facts in spec order', () => {
    const facts = endFacts({ status: 'won', endReason: null, endMonthIndex: 9, guests: 260, rating: 610, parkValue: 5_000_000, totalProfit: -120_000, bestCoasterExcitement: 655, stars: 2 }, 'Jan · Year 2');
    expect(facts.map((f) => `${f.label}: ${f.value}`)).toEqual([
      'Date: Jan · Year 2',
      'Guests: 260',
      'Park rating: 610',
      'Park value: $50,000',
      'Total profit: −$1,200',
      'Best coaster excitement: 6.55',
      'Stars: 2 of 3',
    ]);
  });

  it('every award has a mascot: Frost for Chill, Spark for Thrill', () => {
    for (const id of AWARD_IDS) expect(['frost', 'spark', 'both']).toContain(AWARD_MASCOT[id]);
    expect(AWARD_MASCOT.chillHaven).toBe('frost');
    expect(AWARD_MASCOT.thrillSeekersChoice).toBe('spark');
  });

  it('click for a mouse, tap for touch', () => {
    expect(actVerb('mouse')).toBe('Click');
    expect(actVerb('touch')).toBe('Tap');
    expect(text('prog.tutorial.hint.footpath', { act: actVerb('touch') })).toMatch(/^Tap Footpath/);
  });

  it('Continue picks the newest save or autosave', () => {
    expect(newestSlot([{ slot: '1', savedAt: '2026-01-02T00:00:00Z' }, { slot: 'auto', savedAt: '2026-01-03T00:00:00Z' }])?.slot).toBe('auto');
    expect(newestSlot([])).toBeNull();
  });

  it('camera moves in tiles', () => {
    expect(cameraTiles(0, 0, 32 * 4, 16 * 4)).toBeCloseTo(4, 10);
    expect(cameraTiles(0, 0, 0, 16 * 4)).toBeCloseTo(Math.SQRT2 * 2, 10);
  });
});
