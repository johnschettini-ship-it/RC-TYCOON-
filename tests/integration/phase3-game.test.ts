/**
 * Phase 3 §9.2–9.3 integration game (W2-D): the 6-month scripted management game on a fixed seed.
 * Setup: footpath loops, 4 Phase 1 rides with queues, 3 stalls, 6 bins, 6 benches, 2 Groundskeepers
 * (one with a patrol), 1 Mechanic, 1 Security Guard, 1 Performer (Spark), research at medium,
 * a $5,000 loan, Town Poster Run at month 2, the loan repaid at month 5, and the §9.2 Junior Coaster (built, tested,
 * and opened in the setup).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { RESEARCH_ORDER } from '../../src/data/research';
import { STAFF } from '../../src/data/catalog/people';
import { RESEARCH_POINTS_PER_HOUR } from '../../src/data/tuning/management';
import { FIX_TICKS, INSPECTION_TICKS } from '../../src/data/tuning/staff';
import { START_CASH, START_TICK, TICKS_PER_HOUR, TICKS_PER_MONTH } from '../../src/data/tuning/core';
import { RATING_MAX, RATING_MIN } from '../../src/data/tuning/economy';
import { deserialize, GAME_VERSION, serialize, validateState } from '../../src/save';
import { fixFactor } from '../../src/sim/breakdowns/reliability';
import { breakDown } from '../../src/sim/breakdowns/api';
import { executeCommand } from '../../src/sim/commands';
import { staffDistanceTo } from '../../src/sim/pathing';
import { isHourStart } from '../../src/sim/time';
import type { World } from '../../src/sim/types';
import { makeTestWorld, stateHash } from '../helpers/world';
import {
  buildPhase3Park,
  ledgerSum,
  must,
  runMonitored,
  totalLitter,
  walkableTileCount,
  type MonthCheck,
  type Phase3Park,
} from './scenario';

export const PHASE3_SEED = 4242;
const MONTHS = 6;
const TICKS = MONTHS * TICKS_PER_MONTH;
const LOAN = 500_000;
/** A 6-month game takes about 5 s on a laptop; CI runners and parallel files can be several times slower. */
const LONG = 120_000;

interface BreakdownRecord {
  rideId: number;
  type: string;
  start: number;
  end: number;
  /** The Mechanic was free (not fixing another ride) when the ride broke down. */
  mechanicFree: boolean;
  /** Mechanic walking time to the service tile at the breakdown, in ticks. */
  walkTicks: number;
}

interface Phase3Log {
  months: MonthCheck[];
  monthProblems: string[];
  litterAtMonthEnd: { month: number; litter: number; limit: number }[];
  breakdowns: BreakdownRecord[];
  weatherSeen: Set<string>;
  ratingOutOfRange: number[];
  litterSwept: number;
  campaignTicks: number;
  commandFailures: string[];
  /** `type:state` and `type:task` pairs seen on staff members during the game. */
  staffWork: Set<string>;
}

function newLog(): Phase3Log {
  return {
    months: [],
    monthProblems: [],
    litterAtMonthEnd: [],
    breakdowns: [],
    weatherSeen: new Set(),
    ratingOutOfRange: [],
    litterSwept: 0,
    campaignTicks: 0,
    commandFailures: [],
    staffWork: new Set(),
  };
}

/** Scripted commands at month starts: Town Poster Run at month 2 (index 1), repay the loan at month 5 (index 4). */
function monthScript(world: World, monthIndex: number, log: Phase3Log): void {
  const cmds =
    monthIndex === 1 ? [{ type: 'startCampaign', campaignType: 'poster_run' } as const] : monthIndex === 4 ? [{ type: 'repay', amount: LOAN } as const] : [];
  for (const cmd of cmds) {
    const r = executeCommand(world, cmd);
    if (!r.ok) log.commandFailures.push(`${cmd.type}: ${r.reason}`);
  }
  // Natural breakdowns depend on the seeded random stream, which every new system shifts. Force one
  // scripted breakdown so the mechanic repair path is always exercised (odds are covered by unit tests).
  if (monthIndex === 2) {
    const ride = world.state.rides.find((r) => r.kind === 'flat' && r.status === 'open');
    if (ride) breakDown(world, ride, 'stopped');
  }
}

/** Run `ticks` ticks of the scripted game with all Phase 3 checks recorded into `log`. */
function runSegment(world: World, park: Phase3Park, ticks: number, log: Phase3Log, cashAtMonthStart?: number): void {
  const open = new Map<number, BreakdownRecord>();
  const mechanicDef = STAFF.find((d) => d.id === 'mechanic');
  let litterBefore = 0;
  const stats = runMonitored(world, ticks, {
    ...(cashAtMonthStart === undefined ? {} : { cashAtMonthStart }),
    onMonth: (w, m) => {
      const problem = validateState(w.state);
      if (problem) log.monthProblems.push(`month ${m}: ${problem}`);
      log.litterAtMonthEnd.push({ month: m - 1, litter: totalLitter(w), limit: 0.5 * walkableTileCount(w) });
      monthScript(w, m, log);
    },
    beforeTick: (w) => {
      litterBefore = totalLitter(w);
    },
    afterTick: (w) => {
      const s = w.state;
      const after = totalLitter(w);
      if (after < litterBefore) log.litterSwept += litterBefore - after;
      log.weatherSeen.add(s.management.weather.current);
      if (s.management.campaigns.some((c) => c.type === 'poster_run')) log.campaignTicks++;
      for (const m of s.staff.members) {
        log.staffWork.add(`${m.type}:${m.state}`);
        log.staffWork.add(`${m.type}:${m.task}`);
      }
      if (isHourStart(s.tick - 1) && (s.park.rating < RATING_MIN || s.park.rating > RATING_MAX)) log.ratingOutOfRange.push(s.tick);
      for (const ride of s.rides) {
        const rec = open.get(ride.id);
        if (ride.status === 'broken' && !rec) {
          const mech = s.staff.members.find((m) => m.id === park.mechanic);
          const service = ride.exit?.outside ?? -1;
          const dist = mech && service >= 0 ? (staffDistanceTo(w, mech.tile, service) ?? 0) : 0;
          open.set(ride.id, {
            rideId: ride.id,
            type: ride.breakdownType ?? '?',
            start: s.tick,
            end: -1,
            mechanicFree: mech !== undefined && (mech.fixRideId === -1 || mech.fixRideId === ride.id),
            walkTicks: dist * (mechanicDef?.ticksPerTile ?? 10),
          });
        } else if (ride.status !== 'broken' && rec) {
          rec.end = s.tick;
          log.breakdowns.push(rec);
          open.delete(ride.id);
        }
      }
    },
  });
  for (const rec of open.values()) log.breakdowns.push(rec);
  log.months.push(...stats.months);
}

function setUp(seed: number): { world: World; park: Phase3Park } {
  const world = makeTestWorld(seed, 'Management Park');
  const park = buildPhase3Park(world);
  must(world, { type: 'borrow', amount: LOAN });
  return { world, park };
}

export function runPhase3Game(seed: number): { world: World; park: Phase3Park; log: Phase3Log } {
  const { world, park } = setUp(seed);
  const log = newLog();
  runSegment(world, park, TICKS, log, START_CASH);
  return { world, park, log };
}

/** The same game with a save and load at the start of month 3 (Phase 3 §9.3). */
function runPhase3WithReload(seed: number): World {
  const { world, park } = setUp(seed);
  const log = newLog();
  const first = 3 * TICKS_PER_MONTH - world.state.tick;
  runSegment(world, park, first, log, START_CASH);
  const json = serialize(world, GAME_VERSION, '2026-11-09T00:00:00.000Z');
  const loaded = deserialize(json);
  if (!loaded.ok) throw new Error(loaded.error);
  expect(stateHash(loaded.world)).toBe(stateHash(world));
  runSegment(loaded.world, park, TICKS - first, log);
  return loaded.world;
}

describe(`Phase 3 integration game (seed ${PHASE3_SEED}, ${MONTHS} game months)`, () => {
  let world: World;
  let park: Phase3Park;
  let log: Phase3Log;
  beforeAll(() => {
    ({ world, park, log } = runPhase3Game(PHASE3_SEED));
  }, LONG);

  it('runs the script without a blocked command', () => {
    expect(log.commandFailures).toEqual([]);
  });

  it('every staff type does its work: sweep and empty bins, inspect and fix, patrol, perform', () => {
    for (const work of ['groundskeeper:sweeping', 'groundskeeper:emptying', 'mechanic:inspecting', 'mechanic:fixing', 'security:roam', 'performer:performing']) {
      expect(log.staffWork, work).toContain(work);
    }
  });

  it('the Junior Coaster carries guests all game', () => {
    const coaster = world.state.rides.find((r) => r.id === park.juniorCoaster);
    expect(coaster?.kind).toBe('track');
    expect(coaster?.totals.riders).toBeGreaterThan(100);
  });

  it('the finance check holds every month: cash change = income − expenses + loan in − loan out', () => {
    expect(log.months.length).toBe(MONTHS + 1);
    for (const m of log.months) expect(m.cashEnd - m.cashStart, `month ${m.monthIndex}`).toBe(m.ledgerSum);
  });

  it('staff are hired and paid; the loan is taken, charged interest, and repaid', () => {
    const ledger = world.state.economy.ledger;
    const sum = (cat: 'staffHiring' | 'wages' | 'loanInterest' | 'marketing'): number => ledger.reduce((a, m) => a + m.lines[cat], 0);
    expect(world.state.staff.members.map((m) => m.type).sort()).toEqual(['groundskeeper', 'groundskeeper', 'mechanic', 'performer', 'security']);
    expect(sum('staffHiring')).toBe(-STAFF.reduce((a, d) => a + d.hireCost * (d.id === 'groundskeeper' ? 2 : 1), 0));
    expect(sum('wages')).toBeLessThan(0);
    expect(ledger[0]?.lines.loan).toBe(LOAN);
    expect(ledger[4]?.lines.loan).toBe(-LOAN);
    expect(world.state.management.loan.balance).toBe(0);
    // 1% interest at the first tick of months 1–3. The script repays before the first tick of month 4 runs.
    expect(sum('loanInterest')).toBe(-3 * (LOAN / 100));
    expect(sum('marketing')).toBe(-60_000);
    // Profit excludes financing: the loan lines cancel out over the game.
    expect(ledger.reduce((a, m) => a + m.lines.loan, 0)).toBe(0);
  });

  it('the Town Poster Run runs for its full month', () => {
    expect(log.campaignTicks).toBe(TICKS_PER_MONTH);
    expect(world.state.management.campaigns).toEqual([]);
  });

  it('research unlocks exactly items 1–6 (6 × 216 = 1,296 points; item 7 needs 1,380)', () => {
    const r = world.state.management.research;
    expect(MONTHS * 72 * RESEARCH_POINTS_PER_HOUR.medium).toBe(1_296);
    // Research also runs during the setup (the Junior Coaster's test run): count every hour start since START_TICK.
    const hours = Math.floor((world.state.tick - 1) / TICKS_PER_HOUR) - Math.floor((START_TICK - 1) / TICKS_PER_HOUR);
    const points = hours * RESEARCH_POINTS_PER_HOUR.medium;
    expect(hours).toBeGreaterThanOrEqual(MONTHS * 72);
    expect(points).toBeLessThan(1_380);
    expect(r.unlocked).toEqual(RESEARCH_ORDER.slice(0, 6).map((i) => i.id));
    expect(r.current).toBe(RESEARCH_ORDER[6]?.id);
    const spent = RESEARCH_ORDER.slice(0, 6).reduce((a, i) => a + i.cost, 0);
    expect(r.progress).toBe(points - spent);
  });

  it('rides break down and the Mechanic fixes them within FIX_TICKS × 1.5 plus walking time', () => {
    const done = log.breakdowns.filter((b) => b.end >= 0);
    expect(done.length).toBeGreaterThanOrEqual(1);
    for (const b of done) {
      if (!b.mechanicFree) continue;
      const limit = FIX_TICKS * Math.max(1.5, fixFactor(b.type)) + b.walkTicks + INSPECTION_TICKS + 20;
      expect(b.end - b.start, `ride ${b.rideId} ${b.type}`).toBeLessThanOrEqual(limit);
    }
    // Nothing stays broken at the end of the game for longer than one fix.
    for (const b of log.breakdowns.filter((x) => x.end < 0)) expect(world.state.tick - b.start).toBeLessThan(FIX_TICKS * 3);
  });

  it('Groundskeepers sweep litter and keep it below 0.5 per walkable tile at each month end', () => {
    expect(log.litterSwept).toBeGreaterThan(0);
    expect(log.litterAtMonthEnd.length).toBe(MONTHS);
    for (const m of log.litterAtMonthEnd) expect(m.litter, `month ${m.month}`).toBeLessThan(m.limit);
  });

  it('the weather changes and the rating stays in 0–1,000', () => {
    expect(log.weatherSeen.size).toBeGreaterThanOrEqual(3);
    expect(log.ratingOutOfRange).toEqual([]);
  });

  it('every reference is sound at every month start and at the end', () => {
    expect(log.monthProblems).toEqual([]);
    expect(validateState(world.state)).toBeNull();
    expect(park.bins.every((t) => world.state.map.pathItem[t] === 2)).toBe(true);
  });

  it('is deterministic: the same script twice gives the same state hash', () => {
    expect(stateHash(runPhase3Game(PHASE3_SEED).world)).toBe(stateHash(world));
  }, LONG);

  it('a save and load at month 3 gives the same final hash as the run without it', () => {
    expect(stateHash(runPhase3WithReload(PHASE3_SEED))).toBe(stateHash(world));
  }, LONG);

  it('reports the ledger of every month in order', () => {
    expect(world.state.economy.ledger.map((m) => m.monthIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(ledgerSum(world, 6)).toBe(log.months[MONTHS]?.ledgerSum);
  });
});
