/**
 * Shared scripted-game helpers for the integration tests, the save round-trip test, and the benchmarks (W2-D).
 * Every park is built through `executeCommand`, so build costs land in the ledger like a real game.
 */
import { temperamentGroup, type RideTag } from '../../src/data/catalog';
import { START_CASH, TICKS_PER_MONTH } from '../../src/data/tuning/core';
import { validateState } from '../../src/save';
import { executeCommand, type Command, type CommandResult } from '../../src/sim/commands';
import { Content } from '../../src/sim/map';
import { stepTick } from '../../src/sim/tick';
import { isMonthStart, monthIndexOf } from '../../src/sim/time';
import { LEDGER_CATEGORIES } from '../../src/sim/economy/types';
import type { World } from '../../src/sim/types';
import type { GuestStateName } from '../../src/sim/guests/types';
import type { EntityId } from '../../src/sim/units';
import { makeTestWorld } from '../helpers/world';

/** Happiness of the last `k` guests who left (newest last), from the park's rolling leaver list. */
export function recentLeavers(world: World, k: number): number[] {
  const list = world.state.park.recentLeavers;
  return list.slice(Math.max(0, list.length - k));
}

/** Run a command and fail loudly when it is blocked (scripted games never expect a block). */
export function must(world: World, cmd: Command): CommandResult & { ok: true } {
  const r = executeCommand(world, cmd);
  if (!r.ok) throw new Error(`Command ${cmd.type} failed: ${r.reason} (${JSON.stringify(cmd)})`);
  return r;
}

export function line(world: World, x0: number, y0: number, x1: number, y1: number, kind: 'footpath' | 'queue' = 'footpath'): void {
  must(world, { type: 'buildPathLine', x0, y0, x1, y1, kind });
}

export interface Phase1Park {
  carousel: EntityId;
  swingTower: EntityId;
  snack: EntityId;
  fizz: EntityId;
  restrooms: EntityId;
}

/**
 * Phase 1 §9 integration park on the default 64 × 64 map (entrance at (31, 63), stub up to (31, 60)):
 * a footpath loop x 24–38, y 48–59; Carousel and Swing Tower inside the loop, each with a 4-tile queue
 * down to the south side and an exit spur up to the north side; three stalls facing the south side.
 */
export function buildPhase1Park(world: World): Phase1Park {
  // Path loop.
  line(world, 24, 59, 38, 59);
  line(world, 24, 48, 38, 48);
  line(world, 24, 49, 24, 58);
  line(world, 38, 49, 38, 58);
  // Carousel (rotation 0: front faces south). Entrance outside (27, 55), exit outside (27, 51).
  const carousel = must(world, { type: 'placeRide', defId: 'carousel', x: 26, y: 52, rotation: 0 }).id as EntityId;
  line(world, 27, 55, 27, 58, 'queue');
  line(world, 27, 49, 27, 51);
  // Swing Tower. Entrance outside (35, 55), exit outside (35, 51).
  const swingTower = must(world, { type: 'placeRide', defId: 'swing_tower', x: 34, y: 52, rotation: 0 }).id as EntityId;
  line(world, 35, 55, 35, 58, 'queue');
  line(world, 35, 49, 35, 51);
  // Stalls south of the loop, service side north (rotation 0).
  const snack = must(world, { type: 'placeStall', defId: 'snack_shack', x: 25, y: 60, rotation: 0 }).id as EntityId;
  const fizz = must(world, { type: 'placeStall', defId: 'fizz_stand', x: 29, y: 60, rotation: 0 }).id as EntityId;
  const restrooms = must(world, { type: 'placeStall', defId: 'restrooms', x: 34, y: 60, rotation: 0 }).id as EntityId;
  for (const id of [carousel, swingTower]) must(world, { type: 'setRideOpen', rideId: id, open: true });
  must(world, { type: 'setParkOpen', open: true });
  return { carousel, swingTower, snack, fizz, restrooms };
}

export interface Phase3Park extends Phase1Park {
  bigWheel: EntityId;
  teacups: EntityId;
  groundskeepers: [EntityId, EntityId];
  mechanic: EntityId;
  security: EntityId;
  performer: EntityId;
  /** Footpath tiles with a bin and with a bench. */
  bins: number[];
  benches: number[];
}

/**
 * Phase 3 §9.2 park (W2-D): the Phase 1 park plus an upper loop (y 38–48) with a Big Wheel and a Teacup Twirl,
 * 6 bins, 6 benches, 2 Groundskeepers (the second patrols the lower loop), 1 Mechanic, 1 Security Guard,
 * 1 Performer in the Spark costume. Research stays at the default (medium).
 * The Junior Coaster of §9.2 is left out: the track system is not merged yet (known gap in the W2-D report).
 */
export function buildPhase3Park(world: World): Phase3Park {
  const p1 = buildPhase1Park(world);
  const map = world.state.map;
  // Upper loop: row y = 38 and two columns joining the lower loop's north row (y = 48).
  line(world, 24, 38, 38, 38);
  line(world, 24, 39, 24, 47);
  line(world, 38, 39, 38, 47);
  const bigWheel = must(world, { type: 'placeRide', defId: 'big_wheel', x: 26, y: 40, rotation: 0 }).id as EntityId;
  line(world, 27, 43, 27, 47, 'queue');
  line(world, 27, 39, 27, 39);
  const teacups = must(world, { type: 'placeRide', defId: 'teacup_twirl', x: 34, y: 40, rotation: 0 }).id as EntityId;
  line(world, 35, 43, 35, 47, 'queue');
  line(world, 35, 39, 35, 39);
  for (const id of [bigWheel, teacups]) must(world, { type: 'setRideOpen', rideId: id, open: true });

  const bins: number[] = [];
  const benches: number[] = [];
  for (const [x, y] of [[26, 59], [30, 59], [33, 59], [24, 52], [38, 52], [31, 48]] as const) {
    must(world, { type: 'buildPathItem', x, y, itemType: 'bin' });
    bins.push(y * map.width + x);
  }
  for (const [x, y] of [[24, 56], [38, 56], [29, 48], [33, 48], [31, 38], [24, 43]] as const) {
    must(world, { type: 'buildPathItem', x, y, itemType: 'bench' });
    benches.push(y * map.width + x);
  }

  const gk1 = must(world, { type: 'hireStaff', staffType: 'groundskeeper' }).id as EntityId;
  const gk2 = must(world, { type: 'hireStaff', staffType: 'groundskeeper' }).id as EntityId;
  // The second Groundskeeper patrols the lower loop and the stall row.
  const patrol: number[] = [];
  for (let y = 48; y <= 62; y++) for (let x = 23; x <= 39; x++) patrol.push(y * map.width + x);
  must(world, { type: 'editPatrol', staffId: gk2, add: patrol, remove: [] });
  const mechanic = must(world, { type: 'hireStaff', staffType: 'mechanic' }).id as EntityId;
  const security = must(world, { type: 'hireStaff', staffType: 'security' }).id as EntityId;
  const performer = must(world, { type: 'hireStaff', staffType: 'performer' }).id as EntityId;
  must(world, { type: 'setCostume', staffId: performer, costume: 'spark' });
  return { ...p1, bigWheel, teacups, groundskeepers: [gk1, gk2], mechanic, security, performer, bins, benches };
}

/** Footpath, queue, and park entrance tiles. */
export function walkableTileCount(world: World): number {
  const c = world.state.map.content;
  let n = 0;
  for (let i = 0; i < c.length; i++) if (c[i] === Content.Footpath || c[i] === Content.Queue || c[i] === Content.ParkEntrance) n++;
  return n;
}

export function totalLitter(world: World): number {
  let n = 0;
  for (const v of world.state.map.litter) n += v;
  return n;
}

export interface MonthCheck {
  monthIndex: number;
  /** True for the month the run ended in (checked up to the last tick). */
  partial: boolean;
  cashStart: number;
  cashEnd: number;
  ledgerSum: number;
}

export interface RunStats {
  ticks: number;
  /** Guests who came through the gate (`park.guestsArrivedTotal` delta). */
  arrived: number;
  turnedAway: number;
  /** Final happiness of every guest who left during the run. */
  leaverHappiness: number[];
  /** Longest time any guest spent in one state, per state. */
  maxStateTicks: Partial<Record<GuestStateName, number>>;
  /** Guest id and state of the longest stay overall. */
  longest: { guestId: number; state: GuestStateName; ticks: number } | null;
  months: MonthCheck[];
  peakGuests: number;
}

export function ledgerSum(world: World, monthIndex: number): number {
  const rec = world.state.economy.ledger.find((m) => m.monthIndex === monthIndex);
  if (!rec) return 0;
  let sum = 0;
  for (const c of LEDGER_CATEGORIES) sum += rec.lines[c];
  return sum;
}

export interface RunOptions {
  /** Called before each tick (scripted commands). */
  beforeTick?: (world: World) => void;
  /** Called after each tick. */
  afterTick?: (world: World) => void;
  /** Called at each month start, after the month check and before the tick runs. */
  onMonth?: (world: World, monthIndex: number) => void;
  /** Cash at the start of the month the run starts in (defaults to the cash now). */
  cashAtMonthStart?: number;
}

/**
 * Step `n` ticks and collect the Phase 1 §9 integration measures: arrivals, leaver happiness,
 * the longest stay in one guest state, and the monthly ledger check (cash change = sum of lines).
 */
export function runMonitored(world: World, n: number, opts: RunOptions = {}): RunStats {
  const s = world.state;
  const stats: RunStats = {
    ticks: n,
    arrived: 0,
    turnedAway: 0,
    leaverHappiness: [],
    maxStateTicks: {},
    longest: null,
    months: [],
    peakGuests: s.guests.length,
  };
  const arrivedStart = s.park.guestsArrivedTotal;
  const turnedStart = s.park.turnedAway;
  let monthStartCash = opts.cashAtMonthStart ?? s.park.cash;
  let month = monthIndexOf(s.tick);
  for (let k = 0; k < n; k++) {
    if (isMonthStart(s.tick) && monthIndexOf(s.tick) !== month) {
      stats.months.push({ monthIndex: month, partial: false, cashStart: monthStartCash, cashEnd: s.park.cash, ledgerSum: ledgerSum(world, month) });
      month = monthIndexOf(s.tick);
      monthStartCash = s.park.cash;
      opts.onMonth?.(world, month);
    }
    opts.beforeTick?.(world);
    const before = s.guests.length;
    const arrivedBefore = s.park.guestsArrivedTotal;
    stepTick(world);
    const spawned = s.park.guestsArrivedTotal - arrivedBefore;
    const departed = before + spawned - s.guests.length;
    if (departed > 0) stats.leaverHappiness.push(...recentLeavers(world, departed));
    if (s.guests.length > stats.peakGuests) stats.peakGuests = s.guests.length;
    for (const g of s.guests) {
      const prev = stats.maxStateTicks[g.state] ?? 0;
      if (g.stateTicks > prev) stats.maxStateTicks[g.state] = g.stateTicks;
      if (!stats.longest || g.stateTicks > stats.longest.ticks) stats.longest = { guestId: g.id, state: g.state, ticks: g.stateTicks };
    }
    opts.afterTick?.(world);
  }
  stats.months.push({ monthIndex: month, partial: true, cashStart: monthStartCash, cashEnd: s.park.cash, ledgerSum: ledgerSum(world, month) });
  stats.arrived = s.park.guestsArrivedTotal - arrivedStart;
  stats.turnedAway = s.park.turnedAway - turnedStart;
  return stats;
}

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

/** The fixed seed of the scripted game (Phase 1 §9). */
export const PHASE1_SEED = 12345;
/** Other seeds the balance targets must also hold for (tuning-log.md). */
export const PHASE1_BALANCE_SEEDS = [1, 42, 9001] as const;
/** Length of the Phase 1 scripted game. */
export const PHASE1_MONTHS = 3;

export interface Phase1Run {
  world: World;
  park: Phase1Park;
  stats: RunStats;
  /** Boardings per temperament group and ride def id. */
  boardings: Record<RideTag, Record<string, number>>;
  problems: string[];
}

/**
 * The Phase 1 §9 scripted game: build the Phase 1 park, run 3 game months, and record measures,
 * per-month `validateState` problems, and ride boardings per temperament group.
 */
export function runPhase1Game(seed: number): Phase1Run {
  const world = makeTestWorld(seed, 'Integration Park');
  const park = buildPhase1Park(world);
  const boardings: Phase1Run['boardings'] = { chill: {}, family: {}, thrill: {} };
  const problems: string[] = [];
  const stats = runMonitored(world, PHASE1_MONTHS * TICKS_PER_MONTH, {
    cashAtMonthStart: START_CASH,
    onMonth: (w, m) => {
      const p = validateState(w.state);
      if (p) problems.push(`month ${m}: ${p}`);
    },
    afterTick: (w) => {
      for (const g of w.state.guests) {
        // A guest who boarded this tick is riding with a fresh state clock.
        if (g.state !== 'riding' || g.stateTicks !== 0) continue;
        const ride = w.state.rides.find((r) => r.id === g.activityId);
        if (!ride) continue;
        const group = boardings[temperamentGroup(g.temperament)];
        group[ride.defId] = (group[ride.defId] ?? 0) + 1;
      }
    },
  });
  return { world, park, stats, boardings, problems };
}
