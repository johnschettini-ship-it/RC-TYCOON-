/**
 * Phase 6 §9 integration (W4-C): one night with 2 shows → the `shows` ledger total, watcher counts, and an equal state
 * hash on a second run. The Phase 1 park (paths, 2 rides, 3 stalls, open, After Dark on) gets a Lightshow Tower north
 * of its loop at 20:30 and a Fireworks Launcher west of it at 22:00, both every day. Real guests arrive during the
 * day and gather at night. The sites are placed in setup mode (Phase 6 content stays locked until W4-D raises the
 * build phase), so their build cost is not booked; everything after that runs through the normal tick.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { START_CASH, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/data/tuning/core';
import { getShowSiteDef } from '../../src/data/catalog';
import { validateState } from '../../src/save';
import { executeCommand } from '../../src/sim/commands';
import { hourlyShare } from '../../src/sim/economy/ledger';
import { THOUGHT } from '../../src/sim/guests/thoughts';
import type { ShowSite } from '../../src/sim/shows/types';
import { hourOfMonth } from '../../src/sim/time';
import type { SimEvent, World } from '../../src/sim/types';
import { makeTestWorld, stateHash } from '../helpers/world';
import { buildPhase1Park, must, runMonitored, type RunStats } from './scenario';

const SEED = 2027;
const LONG = 60_000;
/** From 09:00 on day 0 to 08:00 on day 1: the Fireworks (400 ticks = 8 game hours from 22:00) end at 06:00. */
const END_TICK = TICKS_PER_DAY + 8 * TICKS_PER_HOUR;

interface NightRun {
  world: World;
  lightshow: ShowSite;
  fireworks: ShowSite;
  stats: RunStats;
  showEvents: Array<Extract<SimEvent, { type: 'show' }>>;
  greatShowThoughts: number;
}

function placeSite(world: World, defId: 'lightshow_tower' | 'fireworks_launcher', x: number, y: number, hour: number, minute: 0 | 30): ShowSite {
  const r = executeCommand(world, { type: 'placeShowSite', defId, x, y, rotation: 0 }, { setup: true });
  if (!r.ok || r.id === undefined) throw new Error(r.ok ? 'no id' : r.reason);
  must(world, { type: 'setShowSchedule', id: r.id, hour, minute, everyNDays: 1 });
  must(world, { type: 'setShowEnabled', id: r.id, enabled: true });
  return world.state.shows.find((s) => s.id === r.id) as ShowSite;
}

function runNight(): NightRun {
  const world = makeTestWorld(SEED, 'Show Night Park');
  buildPhase1Park(world);
  const lightshow = placeSite(world, 'lightshow_tower', 30, 44, 20, 30);
  const fireworks = placeSite(world, 'fireworks_launcher', 19, 53, 22, 0);
  const showEvents: NightRun['showEvents'] = [];
  const seen = new Set<number>();
  let greatShowThoughts = 0;
  const stats = runMonitored(world, END_TICK - world.state.tick, {
    cashAtMonthStart: START_CASH,
    afterTick: (w) => {
      // Drain like a client: show events kept, the rest dropped.
      for (const e of w.events) if (e.type === 'show') showEvents.push(e);
      w.events = [];
      for (const g of w.state.guests) {
        if (seen.has(g.id)) continue;
        if (g.thoughts.some((t) => t.id === THOUGHT.greatShow)) {
          seen.add(g.id);
          greatShowThoughts++;
        }
      }
    },
  });
  return { world, lightshow, fireworks, stats, showEvents, greatShowThoughts };
}

/** Running costs `hourlyShows` books for a site built at `built`, for the hour starts in [from, to). */
function runningCharged(monthly: number, built: number, from: number, to: number): number {
  let sum = 0;
  for (let t = Math.ceil(from / TICKS_PER_HOUR) * TICKS_PER_HOUR; t < to; t += TICKS_PER_HOUR) sum += hourlyShare(monthly, hourOfMonth(t), built <= t - (t % 3600));
  return sum;
}

describe('one night with 2 shows (Phase 6 §9 integration)', () => {
  let run: NightRun;
  beforeAll(() => {
    run = runNight();
  }, LONG);

  it('both shows run once on schedule', () => {
    expect(run.lightshow.totals.shows).toBe(1);
    expect(run.fireworks.totals.shows).toBe(1);
    expect(run.lightshow.startTick).toBe(20 * TICKS_PER_HOUR + 25);
    expect(run.fireworks.startTick).toBe(22 * TICKS_PER_HOUR);
    expect(run.lightshow.status).toBe('idle');
    expect(run.fireworks.status).toBe('idle');
    expect(run.lightshow.nextShowTick).toBe(TICKS_PER_DAY + 20 * TICKS_PER_HOUR + 25);
  });

  it('the shows ledger line is the 2 show costs plus the hourly running costs, exactly', () => {
    const ls = getShowSiteDef('lightshow_tower')!;
    const fw = getShowSiteDef('fireworks_launcher')!;
    const built = run.lightshow.builtTick;
    const running = runningCharged(ls.runningCostMonthly, built, built, END_TICK) + runningCharged(fw.runningCostMonthly, built, built, END_TICK);
    const total = run.world.state.economy.ledger.reduce((sum, m) => sum + m.lines.shows, 0);
    expect(total).toBe(-(ls.costPerShow + fw.costPerShow + running));
    expect(run.lightshow.totals.cost + run.fireworks.totals.cost).toBe(ls.costPerShow + fw.costPerShow);
  });

  it('guests gather and watch; the watcher counts agree across the events, the sites, and the thoughts', () => {
    const ended = run.showEvents.filter((e) => e.phase === 'ended');
    expect(ended.map((e) => e.siteId)).toEqual([run.lightshow.id, run.fireworks.id]);
    expect(ended[0]!.watchers).toBe(run.lightshow.lastWatchers);
    expect(ended[1]!.watchers).toBe(run.fireworks.lastWatchers);
    expect(run.lightshow.totals.watchers).toBe(run.lightshow.lastWatchers);
    expect(run.fireworks.totals.watchers).toBe(run.fireworks.lastWatchers);
    expect(run.lightshow.lastWatchers).toBeGreaterThan(0);
    expect(run.fireworks.lastWatchers).toBeGreaterThan(0);
    const announced = run.showEvents.filter((e) => e.phase === 'announced');
    expect(announced).toHaveLength(2);
    for (const e of announced) expect(e.watchers).toBeGreaterThan(0);
    expect(run.showEvents.some((e) => e.phase === 'cancelled')).toBe(false);
    // A guest thinks it at most once a day: watchers of both shows count once.
    expect(run.greatShowThoughts).toBeGreaterThan(0);
    expect(run.greatShowThoughts).toBeLessThanOrEqual(run.lightshow.lastWatchers + run.fireworks.lastWatchers);
  });

  it('the ledger invariant holds and the state validates; nobody is left in a show state', () => {
    for (const m of run.stats.months) expect(m.cashEnd - m.cashStart, `month ${m.monthIndex}`).toBe(m.ledgerSum);
    expect(validateState(run.world.state)).toBeNull();
    for (const g of run.world.state.guests) {
      expect(g.state).not.toBe('watchingShow');
      expect(g.showTarget).toBe(-1);
    }
  });

  it('is deterministic: a second run gives the same state hash', () => {
    const again = runNight();
    expect(stateHash(again.world)).toBe(stateHash(run.world));
    expect(again.showEvents).toEqual(run.showEvents);
  }, LONG);
});
