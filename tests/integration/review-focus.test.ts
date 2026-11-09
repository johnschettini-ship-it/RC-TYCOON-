/**
 * Review Focus 1–5 end-to-end checks (delivery plan, W2-D). Each case runs a real scripted park with every
 * system on, instead of the single-system setups of the owners' unit tests. Review Focus 4 (touch gesture
 * overlap) is covered by the Playwright phone project.
 */
import { describe, expect, it } from 'vitest';
import { getFlatRideDef, getStallDef } from '../../src/data/catalog';
import { MSG } from '../../src/data/strings/management';
import { GUEST_DECISION_INTERVAL } from '../../src/data/tuning/guests';
import { START_CASH, TICKS_PER_MONTH } from '../../src/data/tuning/core';
import { RESEARCH_BUDGET_MONTHLY } from '../../src/data/tuning/management';
import { Game } from '../../src/game';
import { GAME_VERSION, SaveStore, serialize, slotKey, validateState, type KeyValueStore } from '../../src/save';
import { encodeTypedArray } from '../../src/save/typedArrays';
import { executeCommand } from '../../src/sim/commands';
import { targetValid } from '../../src/sim/guests/state';
import { Content, tileIndex } from '../../src/sim/map';
import { distanceTo } from '../../src/sim/pathing';
import { isMonthStart, monthIndexOf } from '../../src/sim/time';
import type { World } from '../../src/sim/types';
import { SaveActions } from '../../src/ui/saves';
import { addGuestDirect, makeTestWorld, runTicks, stateHash } from '../helpers/world';
import { buildPhase1Park, ledgerSum, line, must, runMonitored } from './scenario';

const WALKABLE = new Set<number>([Content.Footpath, Content.Queue, Content.ParkEntrance]);

/** Every guest not on a ride stands on a walkable tile and has a target that still exists. */
function guestProblems(world: World): string[] {
  const out: string[] = [];
  const s = world.state;
  for (const g of s.guests) {
    if (g.state !== 'riding' && !WALKABLE.has(s.map.content[g.tile] as number)) out.push(`guest ${g.id} (${g.state}) stands on tile ${g.tile}`);
    if (g.target !== null && !targetValid(world, g.target) && g.state !== 'riding') out.push(`guest ${g.id} (${g.state}) targets ${g.target}`);
  }
  return out;
}

function runUntil(world: World, cond: (w: World) => boolean, max: number): void {
  for (let k = 0; k < max && !cond(world); k++) runTicks(world, 1);
  if (!cond(world)) throw new Error('condition not reached');
}

describe('Review Focus 1: demolish while in use', { timeout: 60_000 }, () => {
  it('a ride with riders, a queue, and guests on the way: everyone re-plans within one decision interval', () => {
    const w = makeTestWorld(31);
    const park = buildPhase1Park(w);
    const key = `ride:${park.swingTower}` as const;
    runUntil(
      w,
      (x) => {
        const r = x.state.rides.find((y) => y.id === park.swingTower);
        return !!r && r.riders.length > 0 && r.queue.length > 3 && x.state.guests.some((g) => g.target === key && g.state === 'walking');
      },
      6_000,
    );
    const ride = w.state.rides.find((r) => r.id === park.swingTower);
    const involved = new Set([...(ride?.riders ?? []), ...(ride?.queue ?? []), ...w.state.guests.filter((g) => g.target === key).map((g) => g.id)]);
    expect(involved.size).toBeGreaterThan(5);
    const refund = must(w, { type: 'demolish', x: 35, y: 53 });
    expect(refund.cost).toBe(-(getFlatRideDef('swing_tower')?.buildCost ?? 0) / 2);
    expect(guestProblems(w)).toEqual([]);
    for (let k = 0; k <= GUEST_DECISION_INTERVAL; k++) {
      runTicks(w, 1);
      expect(guestProblems(w)).toEqual([]);
    }
    for (const g of w.state.guests) {
      expect(g.target).not.toBe(key);
      expect(g.activityId).not.toBe(park.swingTower);
    }
    // The former riders and queuers are back on the paths.
    for (const id of involved) {
      const g = w.state.guests.find((x) => x.id === id);
      if (g) expect(['walking', 'leaving', 'buying', 'queueing', 'riding', 'sitting']).toContain(g.state);
    }
    expect(validateState(w.state)).toBeNull();
  });

  it('a stall while a guest is buying, and a path tile with guests standing on it', () => {
    const w = makeTestWorld(32);
    const park = buildPhase1Park(w);
    runUntil(w, (x) => x.state.guests.some((g) => g.state === 'buying' && g.activityId === park.fizz), 8_000);
    must(w, { type: 'demolish', x: 29, y: 60 });
    expect(w.state.stalls.some((s) => s.id === park.fizz)).toBe(false);
    for (let k = 0; k <= GUEST_DECISION_INTERVAL; k++) {
      runTicks(w, 1);
      expect(guestProblems(w)).toEqual([]);
    }
    // A busy path tile on the south row (the main walkway from the gate).
    const busy = tileIndex(w.state.map, 30, 59);
    runUntil(w, (x) => x.state.guests.some((g) => g.tile === busy), 3_000);
    must(w, { type: 'demolish', x: 30, y: 59 });
    runTicks(w, 1);
    expect(guestProblems(w)).toEqual([]);
    expect(w.state.guests.some((g) => g.tile === busy)).toBe(false);
    // The loop still connects the gate to everything (via the other side), so play goes on.
    const stats = runMonitored(w, 2_000);
    expect(stats.leaverHappiness.length).toBeGreaterThan(0);
    expect(guestProblems(w)).toEqual([]);
    expect(validateState(w.state)).toBeNull();
  });
});

describe('Review Focus 2: disconnected network', { timeout: 60_000 }, () => {
  it('guests never target a ride or stall on a path island, and a guest on the island gets lost without looping', () => {
    const w = makeTestWorld(33);
    buildPhase1Park(w);
    // A ride and a stall on an island path north-west of the park, not connected to the gate.
    line(w, 6, 10, 16, 10);
    const island = must(w, { type: 'placeRide', defId: 'big_wheel', x: 8, y: 12, rotation: 2 }).id as number;
    // Rotation 2: the front faces north. Entrance outside (9, 11) needs a queue; exit outside (9, 15).
    must(w, { type: 'buildPath', x: 9, y: 11, kind: 'queue' });
    line(w, 9, 15, 9, 16);
    must(w, { type: 'setRideOpen', rideId: island, open: true });
    const stall = must(w, { type: 'placeStall', defId: 'snack_shack', x: 12, y: 9, rotation: 2 }).id as number;
    expect(distanceTo(w, w.state.map.entranceTile, `ride:${island}`)).toBeNull();
    expect(distanceTo(w, w.state.map.entranceTile, `stall:${stall}`)).toBeNull();
    const stranded = addGuestDirect(w, tileIndex(w.state.map, 14, 10), { temperament: 50 });

    const t0 = Date.now();
    runMonitored(w, 3_000, {
      afterTick: (x) => {
        for (const g of x.state.guests) {
          if (g.id === stranded.id) continue;
          if (g.target === `ride:${island}` || g.target === `stall:${stall}` || g.activityId === island || g.activityId === stall) {
            throw new Error(`guest ${g.id} targets the island`);
          }
        }
      },
    });
    expect(Date.now() - t0).toBeLessThan(20_000);
    // The stranded guest rides the island ride or wanders lost on the island; it never leaves the island tiles.
    const g = w.state.guests.find((x) => x.id === stranded.id);
    if (g) {
      expect(WALKABLE.has(w.state.map.content[g.tile] as number) || g.state === 'riding').toBe(true);
      expect(distanceTo(w, g.tile, 'exit')).toBeNull();
    }
    expect(guestProblems(w)).toEqual([]);
    expect(validateState(w.state)).toBeNull();
  });

  it('cutting the only path to a stall: guests heading there re-plan and nobody targets it while it is cut off', () => {
    const w = makeTestWorld(34);
    const park = buildPhase1Park(w);
    // A spur to a Restrooms block on its own: x 39–44 on row 54, stall at (45, 54) facing west.
    line(w, 39, 54, 44, 54);
    const far = must(w, { type: 'placeStall', defId: 'restrooms', x: 45, y: 54, rotation: 3 }).id as number;
    runTicks(w, 2_000);
    must(w, { type: 'demolish', x: 39, y: 54 });
    expect(distanceTo(w, w.state.map.entranceTile, `stall:${far}`)).toBeNull();
    for (let k = 0; k < 1_500; k++) {
      runTicks(w, 1);
      for (const g of w.state.guests) {
        // A guest who was on the spur when it was cut may still be there (it is lost, not targeting the stall from outside).
        const onSpur = distanceTo(w, g.tile, 'exit') === null;
        if (!onSpur && k > GUEST_DECISION_INTERVAL) expect(g.target).not.toBe(`stall:${far}`);
      }
    }
    expect(w.state.stalls.find((s) => s.id === park.restrooms)?.totals.sales).toBeGreaterThan(0);
    expect(guestProblems(w)).toEqual([]);
  });
});

/** In-memory storage for SaveStore. */
class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}

describe('Review Focus 3: corrupted or foreign save files', { timeout: 60_000 }, () => {
  it('each corruption class gives its exact message and the running game is unchanged', () => {
    const live = makeTestWorld(35);
    buildPhase1Park(live);
    runTicks(live, 1_500);
    const good = serialize(live, GAME_VERSION, '2026-11-09T00:00:00.000Z');
    interface RawSave {
      format: string;
      schemaVersion: number;
      state: { schemaVersion: number; park: Record<string, unknown>; map: Record<string, unknown>; rides: { queue: number[] }[] };
    }
    const raw = (): RawSave => JSON.parse(good) as RawSave;

    const corrupt: [string, string, string][] = [];
    corrupt.push(['truncated JSON', good.slice(0, Math.floor(good.length / 2)), 'This save could not be read']);
    {
      const r = raw();
      r.format = 'some-other-game';
      corrupt.push(['wrong format', JSON.stringify(r), 'This file is not a Thrills & Chills save']);
    }
    {
      const r = raw();
      r.schemaVersion = 99;
      r.state.schemaVersion = 99;
      corrupt.push(['future schema version', JSON.stringify(r), 'This save comes from a newer version of the game']);
    }
    {
      const r = raw();
      r.state.map.litter = encodeTypedArray(new Uint8Array(10));
      corrupt.push(['wrong typed-array length', JSON.stringify(r), 'This save is damaged: wrong size at map.litter']);
    }
    {
      const r = raw();
      const ride = r.state.rides.find((x) => x.queue.length > 0) ?? r.state.rides[0];
      if (!ride) throw new Error('no ride');
      ride.queue = [...ride.queue, 999_999];
      corrupt.push(['dangling reference', JSON.stringify(r), 'This save is damaged:']);
    }
    {
      const r = raw();
      delete r.state.park.cash;
      corrupt.push(['missing field', JSON.stringify(r), 'This save is damaged: missing field park.cash']);
    }

    const store = new MemoryStore();
    const game = new Game(live);
    const toasts: string[] = [];
    const actions = new SaveActions(game, new SaveStore(store, () => 'now'), (m) => toasts.push(m));
    const before = stateHash(live);
    for (const [label, json, message] of corrupt) {
      store.setItem(slotKey('1'), json);
      expect(actions.load('1'), label).toBe(false);
      const shown = toasts[toasts.length - 1] ?? '';
      if (message.endsWith(':')) expect(shown.startsWith(`${message} `), `${label}: ${shown}`).toBe(true);
      else expect(shown, label).toBe(message);
      expect(game.world, label).toBe(live);
      expect(stateHash(game.world), label).toBe(before);
    }
    // The uncorrupted save still loads.
    store.setItem(slotKey('1'), good);
    expect(actions.load('1')).toBe(true);
    expect(stateHash(game.world)).toBe(before);
  });
});

describe('Review Focus 5: money edge cases', { timeout: 60_000 }, () => {
  it('a build is allowed at exactly enough cash and blocked one cent below, with no change on a block', () => {
    const w = makeTestWorld(36);
    const cost = getFlatRideDef('carousel')?.buildCost ?? 0;
    w.state.park.cash = cost - 1;
    const h = stateHash(w);
    expect(executeCommand(w, { type: 'placeRide', defId: 'carousel', x: 20, y: 20, rotation: 0 })).toEqual({ ok: false, reason: 'Not enough cash' });
    expect(stateHash(w)).toBe(h);
    w.state.park.cash = cost;
    const r = executeCommand(w, { type: 'placeRide', defId: 'carousel', x: 20, y: 20, rotation: 0 });
    expect(r.ok).toBe(true);
    expect(w.state.park.cash).toBe(0);
    expect(w.state.economy.ledger[0]?.lines.construction).toBe(-cost);
  });

  it('negative cash: the game runs on, builds are blocked, the month message appears, and every month adds up', () => {
    const w = makeTestWorld(37);
    buildPhase1Park(w);
    // Close the gate and keep only the running costs: cash drains below $0.
    must(w, { type: 'setParkOpen', open: false });
    w.state.park.cash = 50_000;
    const stats = runMonitored(w, 2 * TICKS_PER_MONTH);
    expect(w.state.park.cash).toBeLessThan(0);
    // Month 0 is skipped: the test set the cash by hand during it.
    expect(executeCommand(w, { type: 'buildPath', x: 10, y: 10, kind: 'footpath' })).toEqual({ ok: false, reason: 'Not enough cash' });
    expect(w.state.management.messages.some((m) => m.textId === MSG.cashNegative)).toBe(true);
    expect(stats.months.length).toBe(3);
    for (const m of stats.months.slice(1)) expect(m.cashEnd - m.cashStart, `month ${m.monthIndex}`).toBe(m.ledgerSum);
  });

  it('a price of $0: guests ride and buy, nothing is booked as income, and the ledger still adds up', () => {
    const w = makeTestWorld(38);
    const park = buildPhase1Park(w);
    must(w, { type: 'setRidePrice', rideId: park.carousel, price: 0 });
    must(w, { type: 'setRidePrice', rideId: park.swingTower, price: 0 });
    must(w, { type: 'setStallPrice', stallId: park.snack, price: 0 });
    must(w, { type: 'setEntranceFee', fee: 0 });
    const stats = runMonitored(w, 3_000, { cashAtMonthStart: START_CASH });
    const ledger = w.state.economy.ledger;
    expect(ledger.reduce((a, m) => a + m.lines.rideTickets + m.lines.entranceTickets, 0)).toBe(0);
    for (const r of w.state.rides) {
      expect(r.totals.riders).toBeGreaterThan(0);
      expect(r.totals.income).toBe(0);
    }
    expect(w.state.stalls.find((s) => s.id === park.snack)?.totals.sales).toBeGreaterThan(0);
    // Stock is still paid for free snacks.
    expect(ledger.reduce((a, m) => a + m.lines.stock, 0)).toBeLessThan(0);
    for (const m of stats.months) expect(m.cashEnd - m.cashStart).toBe(m.ledgerSum);
  });

  it('month rollover with uneven monthly costs: a full month charges each cost exactly, to the cent', () => {
    const w = makeTestWorld(39);
    const park = buildPhase1Park(w);
    must(w, { type: 'setParkOpen', open: false });
    must(w, { type: 'hireStaff', staffType: 'mechanic' });
    // Run to the start of month 1, then through all of it.
    runUntil(w, (x) => isMonthStart(x.state.tick) && monthIndexOf(x.state.tick) === 1, TICKS_PER_MONTH);
    runTicks(w, TICKS_PER_MONTH);
    expect(monthIndexOf(w.state.tick)).toBe(2);
    const month = w.state.economy.ledger.find((m) => m.monthIndex === 1);
    if (!month) throw new Error('no month 1');
    const rides = [park.carousel, park.swingTower].map((id) => w.state.rides.find((r) => r.id === id)?.defId ?? '');
    const rideMonthly = rides.reduce((a, id) => a + (getFlatRideDef(id)?.runningCostMonthly ?? 0), 0);
    const stallMonthly = ['snack_shack', 'fizz_stand', 'restrooms'].reduce((a, id) => a + (getStallDef(id)?.runningCostMonthly ?? 0), 0);
    // Carousel $40 + Swing Tower $80 = 12,000 cents; 12,000 / 72 is not whole (166.67).
    expect(rideMonthly % 72).not.toBe(0);
    expect(month.lines.rideRunning).toBe(-rideMonthly);
    expect(month.lines.stallRunning).toBe(-stallMonthly);
    expect(month.lines.wages).toBe(-8_000);
    expect(month.lines.research).toBe(-RESEARCH_BUDGET_MONTHLY.medium);
    expect(ledgerSum(w, 1)).toBe(month.lines.rideRunning + month.lines.stallRunning + month.lines.wages + month.lines.research);
  });
});
