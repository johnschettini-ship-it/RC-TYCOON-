/**
 * Show state machine (Phase 6 §4.4: idle → announced → running → done → idle), schedule ticks, cost, cancellation,
 * After Dark, unlimited money, running costs (master R9, R20, R27), and the arrivals factor. Owner: W4-C.
 */
import { describe, expect, it } from 'vitest';
import { SHOW_ANNOUNCE_TICKS, SHOW_NIGHT_ARRIVALS } from '../../../src/data/tuning/shows';
import { TICKS_PER_MONTH } from '../../../src/data/tuning/core';
import { executeCommand } from '../../../src/sim/commands';
import { drainEvents } from '../../../src/sim/events';
import { showArrivalFactor } from '../../../src/sim/shows/api';
import type { SimEvent, World } from '../../../src/sim/types';
import { validateState } from '../../../src/save';
import { makeTestWorld, stateHash } from '../../helpers/world';
import { at, defOf, placeSite, runningCharged, runTo, scheduleSite, showsTotal, unlimitedMoney } from './helpers';

type ShowEvent = Extract<SimEvent, { type: 'show' }>;

function showEvents(w: World): ShowEvent[] {
  return drainEvents(w).filter((e): e is ShowEvent => e.type === 'show');
}

describe('state machine and schedule ticks', () => {
  it('announces 50 ticks ahead, starts on time, ends after the show length, then waits for the next day', () => {
    const w = makeTestWorld();
    const site = placeSite(w, 'lightshow_tower', 20, 20);
    const def = defOf('lightshow_tower');
    scheduleSite(w, site, 21, 0, 1);
    const start = at(0, 21);
    expect(site.nextShowTick).toBe(start);

    runTo(w, start - SHOW_ANNOUNCE_TICKS);
    expect(site.status).toBe('idle');
    drainEvents(w);
    runTo(w, start - SHOW_ANNOUNCE_TICKS + 1);
    expect(site.status).toBe('announced');
    expect(showEvents(w)).toEqual([{ type: 'show', siteId: site.id, phase: 'announced', watchers: 0 }]);

    runTo(w, start);
    expect(site.status).toBe('announced');
    runTo(w, start + 1);
    expect(site.status).toBe('running');
    expect(site.startTick).toBe(start);
    expect(site.totals).toEqual({ shows: 1, cost: def.costPerShow, watchers: 0 });
    expect(showEvents(w)).toEqual([{ type: 'show', siteId: site.id, phase: 'started', watchers: 0 }]);

    runTo(w, start + def.showTicks);
    expect(site.status).toBe('running');
    runTo(w, start + def.showTicks + 1);
    expect(site.status).toBe('done');
    expect(showEvents(w)).toEqual([{ type: 'show', siteId: site.id, phase: 'ended', watchers: 0 }]);
    runTo(w, start + def.showTicks + 2);
    expect(site.status).toBe('idle');
    expect(site.nextShowTick).toBe(at(1, 21));
    expect(validateState(w.state)).toBeNull();
  });

  it('every N days: the next show is N days after the last one, at the schedule time', () => {
    const w = makeTestWorld();
    const fw = placeSite(w, 'fireworks_launcher', 20, 20);
    scheduleSite(w, fw, 22, 30, 3);
    expect(fw.nextShowTick).toBe(at(0, 22, 30));
    // Show length 400 ticks = 8 game hours: the show ends at 06:30 on day 1.
    runTo(w, at(1, 12));
    expect(fw.status).toBe('idle');
    expect(fw.totals.shows).toBe(1);
    expect(fw.nextShowTick).toBe(at(3, 22, 30));
    // A schedule change while idle moves the next show from now (today is day 1).
    executeCommand(w, { type: 'setShowSchedule', id: fw.id, hour: 23, minute: 30, everyNDays: 2 });
    expect(fw.nextShowTick).toBe(at(1, 23, 30));
    runTo(w, at(3, 12));
    expect(fw.totals.shows).toBe(2);
    expect(fw.startTick).toBe(at(1, 23, 30));
    expect(fw.nextShowTick).toBe(at(3, 23, 30));
  });

  it('a show may run past midnight; the next one still counts from the day it started', () => {
    const w = makeTestWorld();
    const fw = placeSite(w, 'fireworks_launcher', 20, 20);
    scheduleSite(w, fw, 23, 30, 1);
    runTo(w, at(1, 2));
    expect(fw.status).toBe('running');
    runTo(w, at(0, 23, 30) + defOf('fireworks_launcher').showTicks + 2);
    expect(fw.status).toBe('idle');
    expect(fw.nextShowTick).toBe(at(1, 23, 30));
  });

  it('a schedule change during a show applies from the next show', () => {
    const w = makeTestWorld();
    const site = placeSite(w, 'lightshow_tower', 20, 20);
    scheduleSite(w, site, 21, 0, 1);
    runTo(w, at(0, 21) + 10);
    expect(site.status).toBe('running');
    executeCommand(w, { type: 'setShowSchedule', id: site.id, hour: 20, minute: 30, everyNDays: 2 });
    expect(site.startTick).toBe(at(0, 21));
    expect(site.status).toBe('running');
    runTo(w, at(1, 12));
    expect(site.nextShowTick).toBe(at(2, 20, 30));
  });

  it('turning shows off: no next show; a show being announced is dropped; a running show finishes', () => {
    const w = makeTestWorld();
    const site = placeSite(w, 'lightshow_tower', 20, 20);
    scheduleSite(w, site);
    runTo(w, at(0, 20, 30));
    expect(site.status).toBe('announced');
    executeCommand(w, { type: 'setShowEnabled', id: site.id, enabled: false });
    expect(site.status).toBe('idle');
    expect(site.nextShowTick).toBe(-1);
    runTo(w, at(0, 23));
    expect(site.totals.shows).toBe(0);

    executeCommand(w, { type: 'setShowEnabled', id: site.id, enabled: true });
    runTo(w, at(1, 21) + 5);
    expect(site.status).toBe('running');
    executeCommand(w, { type: 'setShowEnabled', id: site.id, enabled: false });
    runTo(w, at(1, 23));
    expect(site.status).toBe('running');
    runTo(w, at(2, 6));
    expect(site.totals.shows).toBe(1);
    expect(site.status).toBe('idle');
    expect(site.nextShowTick).toBe(-1);
  });
});

describe('cost per show (Phase 6 §4.4 Cost)', () => {
  it('is charged at the show start to the shows ledger line, with the hourly running cost', () => {
    const w = makeTestWorld();
    const site = placeSite(w, 'fireworks_launcher', 20, 20);
    const def = defOf('fireworks_launcher');
    scheduleSite(w, site, 21, 0, 1);
    const built = site.builtTick;
    const t0 = w.state.tick;
    runTo(w, at(0, 21));
    const before = showsTotal(w);
    expect(before).toBe(-runningCharged(def.runningCostMonthly, built, t0, at(0, 21)));
    const cash = w.state.park.cash;
    runTo(w, at(0, 21) + 1);
    const hourly = runningCharged(def.runningCostMonthly, built, at(0, 21), at(0, 21) + 1);
    expect(showsTotal(w) - before).toBe(-(def.costPerShow + hourly));
    // The cash change of that tick includes the other hourly charges (research budget); the show part is exact.
    expect(cash - w.state.park.cash).toBeGreaterThanOrEqual(def.costPerShow + hourly);
  });

  it('cash exactly equal to the cost runs the show (Review Focus 5)', () => {
    const w = makeTestWorld();
    const site = placeSite(w, 'fireworks_launcher', 20, 20);
    scheduleSite(w, site);
    runTo(w, at(0, 21));
    w.state.park.cash = defOf('fireworks_launcher').costPerShow;
    runTo(w, at(0, 21) + 1);
    expect(site.status).toBe('running');
    expect(site.totals.cost).toBe(defOf('fireworks_launcher').costPerShow);
  });

  it('is cancelled without cash: nothing charged, a cancelled event (toast), the next show tomorrow', () => {
    const w = makeTestWorld();
    const site = placeSite(w, 'lightshow_tower', 20, 20);
    scheduleSite(w, site);
    runTo(w, at(0, 21));
    w.state.park.cash = defOf('lightshow_tower').costPerShow - 1;
    const line = showsTotal(w);
    drainEvents(w);
    runTo(w, at(0, 21) + 1);
    expect(site.status).toBe('idle');
    expect(site.totals).toEqual({ shows: 0, cost: 0, watchers: 0 });
    expect(site.startTick).toBe(-1);
    // 21:00 is an hour start: only the hourly running cost is booked.
    expect(showsTotal(w) - line).toBe(-runningCharged(defOf('lightshow_tower').runningCostMonthly, site.builtTick, at(0, 21), at(0, 21) + 1));
    expect(showEvents(w)).toEqual([{ type: 'show', siteId: site.id, phase: 'cancelled', watchers: 0 }]);
    expect(site.nextShowTick).toBe(at(1, 21));
  });

  it('unlimited money runs the show with no cash (the line is still booked)', () => {
    const w = makeTestWorld();
    unlimitedMoney(w);
    const site = placeSite(w, 'fireworks_launcher', 20, 20);
    scheduleSite(w, site);
    w.state.park.cash = 0;
    runTo(w, at(0, 21) + 1);
    expect(site.status).toBe('running');
    expect(w.state.park.cash).toBe(0);
    expect(site.totals.cost).toBe(defOf('fireworks_launcher').costPerShow);
    expect(showsTotal(w)).toBeLessThanOrEqual(-defOf('fireworks_launcher').costPerShow);
  });
});

describe('shows need After Dark', () => {
  it('with After Dark off nothing is announced, run, or charged; the schedule moves on day by day', () => {
    const w = makeTestWorld();
    w.state.park.afterDark = false;
    const site = placeSite(w, 'lightshow_tower', 20, 20);
    scheduleSite(w, site);
    drainEvents(w);
    runTo(w, at(2, 23));
    expect(site.totals).toEqual({ shows: 0, cost: 0, watchers: 0 });
    expect(site.status).toBe('idle');
    expect(showEvents(w)).toEqual([]);
    expect(site.nextShowTick).toBe(at(3, 21));
    expect(showsTotal(w)).toBe(-runningCharged(defOf('lightshow_tower').runningCostMonthly, site.builtTick, site.builtTick, at(2, 23)));
  });

  it('After Dark turned off after the announcement drops the show quietly', () => {
    const w = makeTestWorld();
    const site = placeSite(w, 'lightshow_tower', 20, 20);
    scheduleSite(w, site);
    runTo(w, at(0, 20, 30));
    expect(site.status).toBe('announced');
    w.state.park.afterDark = false;
    drainEvents(w);
    runTo(w, at(0, 21) + 1);
    expect(site.status).toBe('idle');
    expect(site.totals.shows).toBe(0);
    expect(showEvents(w)).toEqual([]);
    expect(site.nextShowTick).toBe(at(1, 21));
  });
});

describe('running costs (master R9, R20, R27: the shows ledger line)', () => {
  it('a site built before the month start costs exactly its monthly amount per month, remainder in hour 71', () => {
    const w = makeTestWorld();
    const tower = placeSite(w, 'lightshow_tower', 20, 20);
    const fw = placeSite(w, 'fireworks_launcher', 30, 20);
    void tower;
    void fw;
    runTo(w, TICKS_PER_MONTH);
    const before = w.state.economy.ledger.find((m) => m.monthIndex === 1)?.lines.shows ?? 0;
    expect(before).toBe(0);
    runTo(w, 2 * TICKS_PER_MONTH);
    const month1 = w.state.economy.ledger.find((m) => m.monthIndex === 1)!;
    expect(month1.lines.shows).toBe(-(defOf('lightshow_tower').runningCostMonthly + defOf('fireworks_launcher').runningCostMonthly));
  });

  it('a site built mid-month pays whole hourly shares and no remainder that month', () => {
    const w = makeTestWorld();
    const site = placeSite(w, 'lightshow_tower', 20, 20);
    runTo(w, TICKS_PER_MONTH);
    const month0 = w.state.economy.ledger.find((m) => m.monthIndex === 0)!;
    expect(month0.lines.shows).toBe(-runningCharged(4_000, site.builtTick, site.builtTick, TICKS_PER_MONTH));
    expect(month0.lines.shows).toBe(-55 * 63);
  });
});

describe('arrivals factor (Phase 6 §4.4 Arrivals)', () => {
  it('×1.05 from 20:00 to 24:00 on a night with a show; 1 by day, without shows, or with After Dark off', () => {
    const w = makeTestWorld();
    expect(showArrivalFactor(w)).toBe(1);
    const site = placeSite(w, 'lightshow_tower', 20, 20);
    runTo(w, at(0, 20));
    expect(showArrivalFactor(w)).toBe(1);
    // Day 0 has a show at 23:30 (scheduled now), then every 2 days.
    scheduleSite(w, site, 23, 30, 2);
    expect(showArrivalFactor(w)).toBe(SHOW_NIGHT_ARRIVALS);
    runTo(w, at(0, 23, 30) + 20);
    expect(site.status).toBe('running');
    expect(showArrivalFactor(w)).toBe(SHOW_NIGHT_ARRIVALS);
    runTo(w, at(1, 0));
    expect(showArrivalFactor(w)).toBe(1);
    runTo(w, at(1, 21));
    expect(showArrivalFactor(w)).toBe(1);
    runTo(w, at(2, 19, 30));
    expect(showArrivalFactor(w)).toBe(1);
    runTo(w, at(2, 20));
    expect(showArrivalFactor(w)).toBe(SHOW_NIGHT_ARRIVALS);
    w.state.park.afterDark = false;
    expect(showArrivalFactor(w)).toBe(1);
  });

  it('a cancelled show no longer counts that night', () => {
    const w = makeTestWorld();
    const site = placeSite(w, 'lightshow_tower', 20, 20);
    scheduleSite(w, site, 20, 30, 1);
    runTo(w, at(0, 20));
    expect(showArrivalFactor(w)).toBe(SHOW_NIGHT_ARRIVALS);
    w.state.park.cash = 0;
    runTo(w, at(0, 20, 30) + 1);
    expect(site.totals.shows).toBe(0);
    expect(showArrivalFactor(w)).toBe(1);
  });
});

describe('determinism', () => {
  it('two runs of the same schedule give the same state hash', () => {
    const run = (): string => {
      const w = makeTestWorld(99);
      const a = placeSite(w, 'lightshow_tower', 20, 20);
      const b = placeSite(w, 'fireworks_launcher', 30, 20);
      scheduleSite(w, a, 20, 30, 1);
      scheduleSite(w, b, 22, 0, 2);
      runTo(w, at(3, 1));
      return stateHash(w);
    };
    expect(run()).toBe(run());
  });
});
