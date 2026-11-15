import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLAT_RIDES, getFlatRideDef } from '../../../src/data/catalog';
import { coarseRideFrame, decodeRideFrame, rideFrameFor } from '../../../src/render/anim';
import type { Ride } from '../../../src/sim/rides/types';
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

// Task 2 (Spinners): each module folds its frames by PERIOD angle slots with cycleKeys and the pick `${slot}:${occ}`.
describe('spinner periods', () => {
  const SPINNERS: Record<string, number> = { teacup_twirl: 16, rocket_rounds: 16, kiddie_cars: 16, merry_mill: 16 };
  const pick = (a: number, full: boolean) => `${a}:${full ? 1 : 0}`;
  for (const [id, period] of Object.entries(SPINNERS)) {
    it(`${id} folds by ${period} slots: slot 32 shows slot 0, pictures advance in order`, async () => {
      const src = readFileSync(new URL(`items/${id}.js`, dir), 'utf8');
      expect(src).toMatch(new RegExp(`export const PERIOD = ${period};`));
      expect(src).toMatch(new RegExp(`cycleKeys\\('${id}', \\{ period: PERIOD \\}, \\(a, full\\) => \`\\$\\{a\\}:\\$\\{full \\? 1 : 0\\}\`\\)`));
      expect(src, 'round: one set for every view turn').toMatch(/rots: 'all'/);
      const { cycleKeys } = await load('items/flatRides.js');
      const m: Keys = cycleKeys(id, { period }, pick);
      expect(m.size).toBe(period);
      periodOk(m, id, period);
      periodOk(m, id, period, true);
    });
    it(`${id}: a whole run in the game steps its pictures forward one at a time and ends where it started`, async () => {
      const { cycleKeys } = await load('items/flatRides.js');
      const m: Keys = cycleKeys(id, { period }, pick);
      const def = getFlatRideDef(id)!;
      const n = period / 2;
      let last = -1;
      for (let t = 0; t <= def.cycleTicks; t++) {
        const f = coarseRideFrame(rideFrameFor({ defId: id, cycle: { phase: 'running', ticks: t } as Ride['cycle'], riders: [] }, def));
        const id0 = pictureOf(m, keyAt(id, decodeRideFrame(f).angle, false)) as string;
        const k = Number(id0.split(':')[0]) / 2;
        if (last >= 0) expect([0, 1], `tick ${t}`).toContain((k - last + n) % n);
        last = k;
      }
      expect(last).toBe(0);
    });
  }
});
