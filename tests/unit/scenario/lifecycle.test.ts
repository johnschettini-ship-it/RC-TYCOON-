/** Phase 5 §4.4, §4.8: win, lose (time up, bankrupt, rating collapse), stars, keep playing, end-screen facts. */
import { describe, expect, it } from 'vitest';
import { getScenarioDef, type Difficulty } from '../../../src/data/scenarios';
import { TICKS_PER_MONTH } from '../../../src/data/tuning/core';
import { executeCommand } from '../../../src/sim/commands';
import { maxLoan } from '../../../src/sim/finance/loans';
import { scenarioResult, winStars } from '../../../src/sim/scenario/api';
import { checkLoseConditions } from '../../../src/sim/scenario/lose';
import { evaluateObjectives } from '../../../src/sim/scenario/objectives';
import { newScenarioRun } from '../../../src/sim/scenario/start';
import type { ScenarioRun } from '../../../src/sim/scenario/types';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld, placeFootpath } from '../../helpers/world';

/** A world running Meadow Start (250 guests with rating ≥ 500) on `difficulty`. */
function meadow(difficulty: Difficulty = 'standard'): { w: World; run: ScenarioRun } {
  const w = makeTestWorld();
  const run = newScenarioRun(getScenarioDef('meadow_start')!, difficulty);
  w.state.scenario = run;
  return { w, run };
}

function meetGoal(w: World): void {
  const tile = placeFootpath(w, 31, 40);
  while (w.state.guests.length < 250) addGuestDirect(w, tile);
  w.state.park.rating = 500;
}

/** The month-end pipeline steps 4–5 for the month `m` (the tick is the first tick of month m + 1). */
function monthEnd(w: World, m: number): void {
  w.state.tick = (m + 1) * TICKS_PER_MONTH;
  evaluateObjectives(w);
  checkLoseConditions(w);
}

describe('win (Phase 5 §4.4)', () => {
  it('all goals met at a month end: won, end month, scenarioEnded; objectives keep their records', () => {
    const { w, run } = meadow();
    monthEnd(w, 0);
    expect(run.status).toBe('active');
    expect(run.objectives).toEqual([{ met: false, value: 0, streak: 0 }]);
    meetGoal(w);
    monthEnd(w, 4);
    expect(run).toMatchObject({ status: 'won', endReason: null, endMonthIndex: 4 });
    expect(run.objectives).toEqual([{ met: true, value: 250, streak: 1 }]);
    expect(w.events).toEqual([{ type: 'scenarioEnded', status: 'won', reason: null, monthIndex: 4 }]);
  });

  it('a win at the deadline month counts on Standard; the time-up check does not run after it', () => {
    const { w, run } = meadow('standard');
    meetGoal(w);
    monthEnd(w, 11);
    expect(run).toMatchObject({ status: 'won', endMonthIndex: 11 });
    expect(winStars(11, run.deadlineMonthIndex)).toBe(1);
  });

  it('Relaxed allows a late win for 1 star; Standard and Tough have lost by then', () => {
    const relaxed = meadow('relaxed');
    monthEnd(relaxed.w, 11);
    expect(relaxed.run.status).toBe('active');
    meetGoal(relaxed.w);
    monthEnd(relaxed.w, 14);
    expect(relaxed.run).toMatchObject({ status: 'won', endMonthIndex: 14 });
    expect(scenarioResult(relaxed.w)?.stars).toBe(1);
    for (const d of ['standard', 'tough'] as const) {
      const { w, run } = meadow(d);
      monthEnd(w, 11);
      expect(run).toMatchObject({ status: 'lost', endReason: 'timeUp', endMonthIndex: 11 });
    }
  });

  it('stars: 3 with ≥ 50% of the time left, 2 with ≥ 25%, else 1; no limit gives 3', () => {
    // 12-month limit, deadline month 11: months left after a win at month m = 11 − m.
    expect([0, 5, 6, 8, 9, 11].map((m) => winStars(m, 11))).toEqual([3, 3, 2, 2, 1, 1]);
    expect(winStars(12, 11)).toBe(1);
    expect(winStars(40, null)).toBe(3);
    // 18-month limit (deadline 17): 9 left = 50% → 3; 5 left (27.8%) → 2; 4 left (22%) → 1.
    expect([8, 9, 12, 13].map((m) => winStars(m, 17))).toEqual([3, 2, 2, 1]);
  });
});

describe('lose conditions (Phase 5 §4.4, §4.8 presets)', () => {
  function broke(w: World): void {
    w.state.park.cash = -100;
    w.state.management.loan.balance = maxLoan(w);
  }

  it('bankrupt: Tough loses at the 2nd month end in a row, Standard at the 3rd, Relaxed never', () => {
    for (const [d, limit] of [['tough', 2], ['standard', 3], ['relaxed', null]] as const) {
      const { w, run } = meadow(d);
      broke(w);
      for (let m = 0; m < 4; m++) {
        monthEnd(w, m);
        if (limit !== null && m + 1 >= limit) break;
      }
      if (limit === null) {
        expect(run.status).toBe('active');
        expect(run.loseCounters.bankruptMonths).toBe(0);
      } else {
        expect(run).toMatchObject({ status: 'lost', endReason: 'bankrupt', endMonthIndex: limit - 1 });
        expect(run.loseCounters.bankruptMonths).toBe(limit);
        expect(w.events.at(-1)).toEqual({ type: 'scenarioEnded', status: 'lost', reason: 'bankrupt', monthIndex: limit - 1 });
      }
    }
  });

  it('bankrupt needs both negative cash and the loan at its limit; any other month end resets the counter', () => {
    const { w, run } = meadow('tough');
    broke(w);
    monthEnd(w, 0);
    expect(run.loseCounters.bankruptMonths).toBe(1);
    w.state.park.cash = 0;
    monthEnd(w, 1);
    expect(run.loseCounters.bankruptMonths).toBe(0);
    broke(w);
    w.state.management.loan.balance -= 100_000;
    monthEnd(w, 2);
    expect(run.loseCounters.bankruptMonths).toBe(0);
    broke(w);
    monthEnd(w, 3);
    monthEnd(w, 4);
    expect(run).toMatchObject({ status: 'lost', endReason: 'bankrupt', endMonthIndex: 4 });
  });

  it('rating collapse: 6 daily ratings in a row below 200 lose on Tough only', () => {
    for (const d of ['tough', 'standard'] as const) {
      const { w, run } = meadow(d);
      run.loseCounters.lowRatingDays = 5;
      monthEnd(w, 1);
      expect(run.status).toBe('active');
      run.loseCounters.lowRatingDays = 6;
      monthEnd(w, 2);
      expect(run.status).toBe(d === 'tough' ? 'lost' : 'active');
      if (d === 'tough') expect(run.endReason).toBe('ratingCollapse');
    }
  });
});

describe('keep playing (scenarioContinue)', () => {
  it('after a win or a loss: continued, objectives frozen, lose checks stopped; refused while active', () => {
    const { w, run } = meadow('tough');
    expect(executeCommand(w, { type: 'scenarioContinue' })).toEqual({ ok: false, reason: 'The scenario is still running' });
    meetGoal(w);
    monthEnd(w, 2);
    expect(run.status).toBe('won');
    expect(executeCommand(w, { type: 'scenarioContinue' })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(run.continued).toBe(true);
    const frozen = structuredClone(run);
    w.state.guests.length = 0;
    w.state.park.cash = -1;
    w.state.management.loan.balance = maxLoan(w);
    for (let m = 3; m < 15; m++) monthEnd(w, m);
    expect(run).toEqual(frozen);
  });

  it('has nothing to continue outside a scenario', () => {
    const w = makeTestWorld();
    expect(executeCommand(w, { type: 'scenarioContinue' })).toEqual({ ok: false, reason: 'There is no scenario to continue' });
  });
});

describe('end-screen facts (scenarioResult)', () => {
  it('null while active and for other kinds; the facts after the end', () => {
    const { w } = meadow();
    expect(scenarioResult(w)).toBeNull();
    expect(scenarioResult(makeTestWorld())).toBeNull();
    meetGoal(w);
    w.state.management.parkValue = 9_120_000;
    w.state.economy.ledger[0]!.lines.rideTickets = 70_000;
    w.state.economy.ledger[0]!.lines.construction = -20_000;
    w.state.economy.ledger[0]!.lines.loan = 1_000_000;
    monthEnd(w, 3);
    expect(scenarioResult(w)).toEqual({
      status: 'won',
      endReason: null,
      endMonthIndex: 3,
      guests: 250,
      rating: 500,
      parkValue: 9_120_000,
      totalProfit: 50_000,
      bestCoasterExcitement: null,
      stars: 3,
    });
  });
});
