import { describe, expect, it } from 'vitest';
import { FLAT_RIDES } from '../../../src/data/catalog';
import { keyAt, periodOk, pictureOf, type Keys } from './frameHelpers';

// Plain JS build tool without types: import by a computed path so it loads as `any`.
const dir = new URL('../../../tools/art3d/', import.meta.url);
const load = (rel: string): Promise<any> => import(/* @vite-ignore */ new URL(rel, dir).href); // eslint-disable-line @typescript-eslint/no-explicit-any

describe('NON_ROUND', () => {
  it('is exactly the rides with a front, and all of them are flat rides', async () => {
    const { NON_ROUND } = await load('items/flatRides.js');
    expect([...NON_ROUND].sort()).toEqual(['bumper_cars', 'big_wheel', 'drop_tower', 'haunted_manor', 'magic_carpet', 'mirror_maze', 'observation_tower', 'pendulum_ship', 'spiral_slide', 'thunder_disc'].sort());
    const ids = new Set(FLAT_RIDES.map((d) => d.id));
    for (const id of NON_ROUND) expect(ids.has(id), id).toBe(true);
  });
});

describe('cycleKeys', () => {
  const pick = (a: number, full: boolean) => `p${a}${full ? 'f' : 'e'}`;
  it('period 32 bakes 16 slots x 2 occupancies and lists all 64 frame keys once', async () => {
    const { cycleKeys } = await load('items/flatRides.js');
    const m: Keys = cycleKeys('x', { period: 32 }, pick);
    expect(m.size).toBe(32);
    expect([...m.values()].reduce((n, e) => n + e.keys.length, 0)).toBe(32 * 2);
    periodOk(m, 'x', 32);
    periodOk(m, 'x', 32, true);
  });
  it('a shorter period folds slots: period 8 bakes 4 slots x 2', async () => {
    const { cycleKeys } = await load('items/flatRides.js');
    const m: Keys = cycleKeys('x', { period: 8 }, pick);
    expect(m.size).toBe(8);
    periodOk(m, 'x', 8);
    expect(pictureOf(m, keyAt('x', 10, false))).toBe(pictureOf(m, keyAt('x', 2, false)));
  });
  it('walkThrough bakes one occupancy state', async () => {
    const { cycleKeys } = await load('items/flatRides.js');
    const m: Keys = cycleKeys('x', { period: 4, walkThrough: true }, pick);
    expect(m.size).toBe(2);
    expect(pictureOf(m, keyAt('x', 0, true))).toBe(pictureOf(m, keyAt('x', 0, false)));
  });
  it('rejects a period that does not divide 32', async () => {
    const { cycleKeys } = await load('items/flatRides.js');
    for (const p of [0, 1, 3, 6, 34]) expect(() => cycleKeys('x', { period: p }, pick), String(p)).toThrow(/period/);
  });
});

describe('timeKeys', () => {
  const pick = (t: number, full: boolean) => `t${t}${full ? 'f' : 'e'}`;
  it('bakes 16 time steps x 2 occupancies and wraps slot 32 to step 0', async () => {
    const { timeKeys } = await load('items/flatRides.js');
    const m: Keys = timeKeys('x', {}, pick);
    expect(m.size).toBe(32);
    periodOk(m, 'x', 32);
    expect(pictureOf(m, keyAt('x', 30, false))).toBe('t15e');
  });
  it('walkThrough bakes one occupancy state', async () => {
    const { timeKeys } = await load('items/flatRides.js');
    const m: Keys = timeKeys('x', { walkThrough: true }, pick);
    expect(m.size).toBe(16);
    expect(pictureOf(m, keyAt('x', 6, true))).toBe(pictureOf(m, keyAt('x', 6, false)));
  });
});

// Task 5 (buildings and arenas): bumper_cars, thunder_disc (time steps), mirror_maze, haunted_manor (walk-throughs).
describe('Task 5 ride frames', () => {
  const RIDES: [string, string, number][] = [['bumper_cars', 'bumperKeys', 32], ['thunder_disc', 'thunderKeys', 32], ['mirror_maze', 'mirrorKeys', 8], ['haunted_manor', 'manorKeys', 8]];
  for (const [id, fn, period] of RIDES) {
    it(`${id}: slot 32 wraps to slot 0, frames run in order (period ${period})`, async () => {
      const keys = await load('items/arenaKeys.js');
      const m: Keys = keys[fn]();
      periodOk(m, id, period, true);
      periodOk(m, id, period, false);
    });
  }

  it('bumper_cars and thunder_disc: a whole run (REVOLUTIONS) plays the time cycle a whole number of times, never backwards', async () => {
    const keys = await load('items/arenaKeys.js');
    const { rideFrameFor } = await import('../../../src/render/anim');
    const { getFlatRideDef } = await import('../../../src/data/catalog');
    for (const [id, fn, pics] of [['bumper_cars', 'bumperKeys', keys.BUMPER_PICS], ['thunder_disc', 'thunderKeys', keys.THUNDER_PICS]] as const) {
      const def = getFlatRideDef(id);
      if (!def) throw new Error(id);
      const m: Keys = keys[fn]();
      const at = (ticks: number): number => {
        const f = rideFrameFor({ defId: id, cycle: { phase: 'running', ticks }, riders: [1] as never }, def);
        const id2 = pictureOf(m, keyAt(id, f & 31, true));
        return Number((id2 as string).slice(1));
      };
      // rest (start and end of a run) shows step 0
      expect(at(0), id).toBe(0);
      expect(at(def.cycleTicks), id).toBe(0);
      let wraps = 0;
      let last = 0;
      for (let t = 1; t <= def.cycleTicks; t++) {
        const s = at(t);
        if (s < last) { wraps++; expect(last, `${id} tick ${t}: only the last step wraps`).toBe(pics - 1); expect(s).toBe(0); }
        else expect(s - last, `${id} tick ${t}: no skipped picture`).toBeLessThanOrEqual(1);
        last = s;
      }
      // REVOLUTIONS[id] ?? 2 (anim.ts): the ride ends where it started after exactly that many cycles
      expect(wraps, id).toBe(2);
      // the empty ride is one rest picture
      const empty = new Set<string>();
      for (let a = 0; a < 32; a++) empty.add(pictureOf(m, keyAt(id, a, false)) as string);
      expect([...empty], id).toEqual(['rest']);
    }
  });

  it('walk-throughs bake 4 light steps and one occupancy state', async () => {
    const keys = await load('items/arenaKeys.js');
    for (const fn of ['mirrorKeys', 'manorKeys']) {
      const m: Keys = keys[fn]();
      expect(m.size, fn).toBe(keys.LIGHT_STEPS);
    }
  });

  it('every Task 5 ride is baked: registry, card, BAKED, not a stand-in, rots [0,1,2,3] (NON_ROUND)', async () => {
    const { ITEM_LIST, CARD_ITEMS } = await load('items/registry.js');
    const { NON_ROUND } = await load('items/flatRides.js');
    const { REAL_FALLBACK } = await import('../../../src/render/real/fallbacks');
    for (const [id] of RIDES) {
      expect(ITEM_LIST.some((x: { id: string }) => x.id === id), id).toBe(true);
      expect(CARD_ITEMS.some((x: { id: string; kind: string }) => x.id === id && x.kind === 'ride'), id).toBe(true);
      expect(REAL_FALLBACK[id], id).toBe(id);
      expect(NON_ROUND, id).toContain(id);
    }
  });
});
