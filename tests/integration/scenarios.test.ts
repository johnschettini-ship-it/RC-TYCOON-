/**
 * Phase 5 §9 integration (W3-H): scripted scenario runs through the real tick pipeline — a Meadow Start win at the
 * expected month with the right stars, a time-up loss on Standard, a late Relaxed win for 1 star, a Tough bankruptcy
 * after 2 month ends, keep playing, and save/load mid-scenario keeping streaks and counters.
 */
import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR, TICKS_PER_MONTH } from '../../src/data/tuning/core';
import { deserialize, serialize, validateState } from '../../src/save';
import { executeCommand } from '../../src/sim/commands';
import { maxLoan } from '../../src/sim/finance/loans';
import { Content } from '../../src/sim/map';
import { scenarioResult } from '../../src/sim/scenario/api';
import { createScenarioWorld } from '../../src/sim/scenario/start';
import type { ScenarioRun } from '../../src/sim/scenario/types';
import { stepTick } from '../../src/sim/tick';
import type { SimEvent, World } from '../../src/sim/types';
import { addGuestDirect, stateHash } from '../helpers/world';

function start(id: string, difficulty: 'relaxed' | 'standard' | 'tough'): World {
  const w = createScenarioWorld(id, difficulty);
  if (!w) throw new Error(`no scenario ${id}`);
  return w;
}

function run(w: World): ScenarioRun {
  if (w.state.scenario.kind !== 'scenario') throw new Error('not a scenario');
  return w.state.scenario;
}

/** Step until `tick` (exclusive); collect the scenarioEnded events on the way. */
function stepTo(w: World, tick: number, ended: SimEvent[] = []): SimEvent[] {
  while (w.state.tick < tick) {
    stepTick(w);
    for (const e of w.events) if (e.type === 'scenarioEnded') ended.push({ ...e });
    w.events.length = 0;
  }
  return ended;
}

const monthStart = (m: number): number => m * TICKS_PER_MONTH;

/**
 * Opens Meadow Start for business: a carousel joined to the plaza path, open, and the park open.
 * Everything stands on the flat entrance plaza (x 26–36, y 56–62, flattened by the scenario): flat rides need flat
 * land (Phase 4 §4.2, W3-B), and the gentle meadow north of the plaza is one step higher with a sloped row between.
 * Carousel (rotation 0, front to the south) at x 33–35, y 59–61: exit onto the plaza path at (34, 58), entrance
 * from a queue along the south row (32–34, 62) that starts beside the prebuilt path at (31, 62). A Mechanic keeps
 * the only ride running: without one its first breakdown closes the park to arrivals for good (Phase 3 §4.5), so
 * the run would depend on when the RNG breaks it.
 */
function openMeadow(w: World): void {
  const ok = (cmd: Parameters<typeof executeCommand>[1]): void => {
    const r = executeCommand(w, cmd);
    if (!r.ok) throw new Error(`${cmd.type}: ${r.reason}`);
  };
  ok({ type: 'buildPathLine', x0: 27, y0: 58, x1: 35, y1: 58, kind: 'footpath' });
  ok({ type: 'placeRide', defId: 'carousel', x: 33, y: 59, rotation: 0 });
  ok({ type: 'buildPathLine', x0: 32, y0: 62, x1: 34, y1: 62, kind: 'queue' });
  ok({ type: 'setRideOpen', rideId: w.state.rides[0]!.id, open: true });
  ok({ type: 'setParkOpen', open: true });
  ok({ type: 'hireStaff', staffType: 'mechanic' });
  expect(executeCommand(w, { type: 'placeRide', defId: 'carousel', x: 32, y: 54, rotation: 0 })).toEqual({ ok: false, reason: 'The land must be flat here' });
}

/**
 * The goal state for Meadow Start at the end of month `m`: the rating pushed up for the last hour start of the
 * month, and guests topped up to 250 on the plaza just before the month closes.
 */
function reachMeadowGoalAt(w: World, m: number, ended: SimEvent[]): void {
  stepTo(w, monthStart(m + 1) - 2 * TICKS_PER_HOUR, ended);
  w.state.modifiers.ratingBonus = 1000;
  stepTo(w, monthStart(m + 1) - 5, ended);
  const plaza = w.state.map.entranceTile - w.state.map.width;
  while (w.state.guests.length < 250) addGuestDirect(w, plaza);
  w.state.modifiers.ratingBonus = 0;
}

describe('Meadow Start (Standard): scripted win', () => {
  it('wins at the end of month 5 with 3 stars, then keeps playing', () => {
    const w = start('meadow_start', 'standard');
    openMeadow(w);
    const ended: SimEvent[] = [];
    stepTo(w, monthStart(5), ended);
    expect(ended).toEqual([]);
    expect(run(w).status).toBe('active');
    expect(w.state.guests.length).toBeGreaterThan(0);
    reachMeadowGoalAt(w, 5, ended);
    stepTo(w, monthStart(6) + 1, ended);
    expect(ended).toEqual([{ type: 'scenarioEnded', status: 'won', reason: null, monthIndex: 5 }]);
    expect(run(w)).toMatchObject({ status: 'won', endReason: null, endMonthIndex: 5, continued: false });
    const result = scenarioResult(w)!;
    expect(result).toMatchObject({ status: 'won', endMonthIndex: 5, stars: 3 });
    expect(result.guests).toBeGreaterThanOrEqual(240);
    expect(validateState(w.state)).toBeNull();

    // Keep playing: objectives freeze, no lose check ends the run, the park goes on.
    expect(executeCommand(w, { type: 'scenarioContinue' }).ok).toBe(true);
    const frozen = structuredClone(run(w).objectives);
    w.state.park.cash = -1;
    w.state.management.loan.balance = maxLoan(w);
    stepTo(w, monthStart(13), ended);
    expect(ended).toHaveLength(1);
    expect(run(w)).toMatchObject({ status: 'won', continued: true, endMonthIndex: 5 });
    expect(run(w).objectives).toEqual(frozen);
    expect(w.state.monthMetrics.monthIndex).toBe(12);
  }, 60_000);
});

describe('time limits', () => {
  it('Standard: the deadline month (Feb, Year 2) ends without a win → lost, time up', () => {
    const w = start('meadow_start', 'standard');
    const ended = stepTo(w, monthStart(12) + 1);
    expect(ended).toEqual([{ type: 'scenarioEnded', status: 'lost', reason: 'timeUp', monthIndex: 11 }]);
    expect(run(w)).toMatchObject({ status: 'lost', endReason: 'timeUp', endMonthIndex: 11 });
    expect(scenarioResult(w)).toMatchObject({ status: 'lost', endReason: 'timeUp', stars: 0 });
  }, 60_000);

  it('Relaxed: no loss at the deadline; a win 2 months late gives 1 star', () => {
    const w = start('meadow_start', 'relaxed');
    openMeadow(w);
    const ended = stepTo(w, monthStart(13));
    expect(ended).toEqual([]);
    expect(run(w).status).toBe('active');
    reachMeadowGoalAt(w, 13, ended);
    stepTo(w, monthStart(14) + 1, ended);
    expect(ended).toEqual([{ type: 'scenarioEnded', status: 'won', reason: null, monthIndex: 13 }]);
    expect(scenarioResult(w)?.stars).toBe(1);
  }, 60_000);
});

describe('bankruptcy (Phase 5 §4.4, §4.8)', () => {
  /** Borrow up to the limit by command, then a debt the park cannot pay (closed park, no income). */
  function inDebt(difficulty: 'standard' | 'tough'): World {
    const w = start('meadow_start', difficulty);
    const room = maxLoan(w) - w.state.management.loan.balance;
    if (room > 0) expect(executeCommand(w, { type: 'borrow', amount: room }).ok).toBe(true);
    expect(w.state.management.loan.balance).toBe(maxLoan(w));
    w.state.park.cash = -50_000;
    return w;
  }

  it('Tough: lost after 2 month ends in a row with negative cash and the loan at its limit', () => {
    const w = inDebt('tough');
    const ended = stepTo(w, monthStart(1) + 1);
    expect(run(w)).toMatchObject({ status: 'active' });
    expect(run(w).loseCounters.bankruptMonths).toBe(1);
    stepTo(w, monthStart(2) + 1, ended);
    expect(ended).toEqual([{ type: 'scenarioEnded', status: 'lost', reason: 'bankrupt', monthIndex: 1 }]);
    expect(run(w)).toMatchObject({ status: 'lost', endReason: 'bankrupt', endMonthIndex: 1 });
  }, 60_000);

  it('Standard: still running after 2 such month ends, lost at the 3rd', () => {
    const w = inDebt('standard');
    const ended = stepTo(w, monthStart(2) + 1);
    expect(ended).toEqual([]);
    expect(run(w).loseCounters.bankruptMonths).toBe(2);
    stepTo(w, monthStart(3) + 1, ended);
    expect(ended).toEqual([{ type: 'scenarioEnded', status: 'lost', reason: 'bankrupt', monthIndex: 2 }]);
  }, 60_000);
});

describe('save and load mid-scenario (Fading Fairground, Standard)', () => {
  it('keeps the run, streaks, counters, and month metrics, and plays on identically', () => {
    const a = start('fading_fairground', 'standard');
    stepTo(a, monthStart(1) + 30 * TICKS_PER_HOUR);
    const sc = run(a);
    expect(sc.objectives).toHaveLength(2);
    expect(a.state.monthMetrics.daySamples.length).toBeGreaterThan(0);
    expect(a.state.monthMetrics.guestsSeen.length).toBeGreaterThan(100);
    expect(sc.objectives[1]!.value).toBeGreaterThan(0);

    const loaded = deserialize(serialize(a, '0.2.0', '2026-11-09T12:00:00.000Z'));
    if (!loaded.ok) throw new Error(loaded.error);
    const b = loaded.world;
    expect(b.state.scenario).toEqual(a.state.scenario);
    expect(b.state.monthMetrics).toEqual(a.state.monthMetrics);
    expect(stateHash(b)).toBe(stateHash(a));

    stepTo(a, monthStart(3) + 1);
    stepTo(b, monthStart(3) + 1);
    expect(stateHash(b)).toBe(stateHash(a));
    expect(run(b).objectives).toEqual(run(a).objectives);
    expect(run(b).loseCounters).toEqual(run(a).loseCounters);
    expect(validateState(b.state)).toBeNull();
  }, 60_000);

  it('the run is deterministic: the same scenario twice gives the same state', () => {
    const a = start('fading_fairground', 'tough');
    const b = start('fading_fairground', 'tough');
    stepTo(a, monthStart(1));
    stepTo(b, monthStart(1));
    expect(stateHash(a)).toBe(stateHash(b));
    expect(a.state.map.content.filter((c) => c === Content.Footpath).length).toBeGreaterThan(50);
  }, 60_000);
});
