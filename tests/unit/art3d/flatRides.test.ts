import { describe, expect, it } from 'vitest';
import { FLAT_RIDES } from '../../../src/data/catalog';
import { encodeRideFrame } from '../../../src/render/anim';
import { frameKey } from '../../../src/render/real/indexFormat';

// Plain JS build tool without types: import by a computed path so it loads as `any`.
const dir = new URL('../../../tools/art3d/', import.meta.url);
const load = (rel: string): Promise<any> => import(/* @vite-ignore */ new URL(rel, dir).href); // eslint-disable-line @typescript-eslint/no-explicit-any

type Keys = Map<string, { keys: string[] }>;

/** Picture id that serves a frame key. */
function pictureOf(map: Keys, key: string): string | undefined {
  for (const [id, e] of map) if (e.keys.includes(key)) return id;
  return undefined;
}
const keyAt = (item: string, angle: number, full: boolean) => frameKey([item, `f${encodeRideFrame(angle, 0, 0)}`, full ? 'occ1' : 'occ0']);

/**
 * Reused by every ride task: a ride's pictures repeat with its period. Slot 0 and slot 32 (wrapped) show the same
 * picture, slot `period` shows slot 0's picture again, and within the first period consecutive slots map to
 * pictures in baking order (never backwards).
 */
export function periodOk(map: Keys, item: string, period: number, full = false): void {
  expect(pictureOf(map, keyAt(item, 32, full))).toBe(pictureOf(map, keyAt(item, 0, full)));
  expect(pictureOf(map, keyAt(item, period % 32, full))).toBe(pictureOf(map, keyAt(item, 0, full)));
  const order = [...map.keys()];
  let last = -1;
  for (let a = 0; a < period; a += 2) {
    const id = pictureOf(map, keyAt(item, a, full));
    expect(id, `slot ${a}`).toBeDefined();
    const i = order.indexOf(id as string);
    expect(i, `slot ${a} out of order`).toBeGreaterThanOrEqual(last);
    last = i;
  }
}

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
