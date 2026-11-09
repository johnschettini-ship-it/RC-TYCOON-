import { describe, expect, it } from 'vitest';
import { rngInt, rngNext } from '../../../src/sim/rng';
import { formatDate, isMonthStart, monthIndexOf, seasonOf, hourOfMonth } from '../../../src/sim/time';
import { Content, Owned, tileIndex } from '../../../src/sim/map';
import { executeCommand, type Command } from '../../../src/sim/commands';
import { stepTick } from '../../../src/sim/tick';
import { hourlyShare, recordLedger, currentLedger } from '../../../src/sim/economy/ledger';
import { advance } from '../../../src/loop';
import { FLAT_RIDES, STALLS, TRACK_RIDES, PATH_ITEMS, STAFF, getFlatRideDef, gateIndex, temperamentGroup } from '../../../src/data/catalog';
import { GROUND_LEVEL, START_TICK } from '../../../src/data/tuning/core';
import { makeTestWorld, stateHash } from '../../helpers/world';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = { rng: 42 };
    const b = { rng: 42 };
    const sa = Array.from({ length: 20 }, () => rngNext(a));
    const sb = Array.from({ length: 20 }, () => rngNext(b));
    expect(sa).toEqual(sb);
  });

  it('rngInt stays in range and is roughly uniform', () => {
    const s = { rng: 7 };
    const counts = new Array(10).fill(0) as number[];
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const v = rngInt(s, 0, 9);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(9);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const c of counts) expect(Math.abs(c / n - 0.1)).toBeLessThan(0.002 * 10);
  });
});

describe('time (master 6.2, rule R1)', () => {
  it('formats the start and month boundaries', () => {
    expect(formatDate(0)).toBe('Mar · Year 1 · 00:00');
    expect(formatDate(START_TICK)).toBe('Mar · Year 1 · 09:00');
    expect(formatDate(3600)).toBe('Apr · Year 1 · 00:00');
    expect(formatDate(43_200)).toBe('Mar · Year 2 · 00:00');
    expect(formatDate(75)).toBe('Mar · Year 1 · 01:30');
  });

  it('computes month index, month starts, seasons, and hour of month', () => {
    expect(monthIndexOf(3599)).toBe(0);
    expect(monthIndexOf(3600)).toBe(1);
    expect(isMonthStart(7200)).toBe(true);
    expect(isMonthStart(7250)).toBe(false);
    expect(seasonOf(0)).toBe('spring');
    expect(seasonOf(3 * 3600)).toBe('summer');
    expect(seasonOf(9 * 3600)).toBe('winter');
    expect(hourOfMonth(3550)).toBe(71);
  });
});

describe('map generator (Phase 0 §4.5)', () => {
  it('builds the Build 1 map', () => {
    const w = makeTestWorld();
    const m = w.state.map;
    expect(m.width).toBe(64);
    expect(m.heights.every((h) => h === GROUND_LEVEL)).toBe(true);
    expect(m.owned[tileIndex(m, 0, 10)]).toBe(Owned.NotOwned);
    expect(m.owned[tileIndex(m, 10, 10)]).toBe(Owned.Owned);
    expect(m.entranceTile).toBe(tileIndex(m, 31, 63));
    expect(m.content[m.entranceTile]).toBe(Content.ParkEntrance);
    expect(m.owned[m.entranceTile]).toBe(Owned.Owned);
    for (const y of [62, 61, 60]) expect(m.content[tileIndex(m, 31, y)]).toBe(Content.Footpath);
    expect(m.content[tileIndex(m, 31, 59)]).toBe(Content.Empty);
  });
});

describe('world, commands, tick', () => {
  it('starts at tick 450 with $15,000', () => {
    const w = makeTestWorld();
    expect(w.state.tick).toBe(450);
    expect(w.state.park.cash).toBe(1_500_000);
  });

  it('an unknown command fails and changes nothing', () => {
    const w = makeTestWorld();
    const before = stateHash(w);
    const r = executeCommand(w, { type: 'noSuchCommand' } as unknown as Command);
    expect(r).toEqual({ ok: false, reason: 'Unknown command noSuchCommand' });
    expect(stateHash(w)).toBe(before);
  });

  it('stepTick advances one tick and emits monthEnded at a month start', () => {
    const w = makeTestWorld();
    w.state.tick = 3599;
    stepTick(w);
    expect(w.state.tick).toBe(3600);
    stepTick(w);
    expect(w.events).toContainEqual({ type: 'monthEnded', monthIndex: 0 });
  });

  it('the same seed gives the same state hash after 2,000 ticks', () => {
    const a = makeTestWorld(99);
    const b = makeTestWorld(99);
    for (let i = 0; i < 2000; i++) {
      stepTick(a);
      stepTick(b);
    }
    expect(stateHash(a)).toBe(stateHash(b));
  });
});

describe('ledger (Phase 1 §4.5, Phase 3 §4.1)', () => {
  it('records cash and lines together', () => {
    const w = makeTestWorld();
    recordLedger(w, 'construction', -12_345);
    expect(w.state.park.cash).toBe(1_500_000 - 12_345);
    expect(currentLedger(w).lines.construction).toBe(-12_345);
  });

  it('hourly shares sum to the exact monthly amount', () => {
    for (const monthly of [4000, 6001, 13_337, 0]) {
      let sum = 0;
      for (let h = 0; h < 72; h++) sum += hourlyShare(monthly, h, true);
      expect(sum).toBe(monthly);
    }
    expect(hourlyShare(4000, 71, false)).toBe(Math.floor(4000 / 72));
  });

  it('rejects non-integer amounts', () => {
    const w = makeTestWorld();
    expect(() => recordLedger(w, 'stock', 1.5)).toThrow();
  });
});

describe('loop (Phase 0 §4.6)', () => {
  it('advances by speed and caps at 10 ticks', () => {
    expect(advance(0, 100, 1).ticks).toBe(2);
    expect(advance(0, 100, 2).ticks).toBe(4);
    expect(advance(0, 100, 4).ticks).toBe(8);
    expect(advance(0, 1000, 4)).toEqual({ ticks: 10, accMs: 0 });
    expect(advance(30, 100, 0)).toEqual({ ticks: 0, accMs: 0 });
  });
});

describe('catalog data (content-catalog.md)', () => {
  it('has the Build 1 and Build 2 counts', () => {
    expect(FLAT_RIDES).toHaveLength(14);
    expect(TRACK_RIDES).toHaveLength(9);
    expect(STALLS).toHaveLength(11);
    expect(PATH_ITEMS).toHaveLength(3);
    expect(STAFF).toHaveLength(4);
  });

  it('matches spot-checked rows', () => {
    expect(getFlatRideDef('carousel')).toMatchObject({ w: 3, d: 3, excitement: 250, intensity: 100, nausea: 50, capacity: 16, cycleTicks: 400, buildCost: 120_000, runningCostMonthly: 4000, defaultPrice: 200 });
    expect(getFlatRideDef('flip_arm')).toMatchObject({ excitement: 650, intensity: 800, nausea: 600, buildCost: 500_000, flags: { covered: false, spooky: false, tall: true } });
  });

  it('gate index and temperament groups', () => {
    expect([gateIndex(2), gateIndex(3), gateIndex(4), gateIndex(5)]).toEqual([0, 1, 1, 2]);
    expect([temperamentGroup(35), temperamentGroup(36), temperamentGroup(64), temperamentGroup(65)]).toEqual(['chill', 'family', 'family', 'thrill']);
  });
});
