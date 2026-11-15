import { expect } from 'vitest';
import { encodeRideFrame } from '../../../src/render/anim';
import { frameKey } from '../../../src/render/real/indexFormat';

// Shared by the flat-ride tests: a ride's baked pictures, as returned by cycleKeys / timeKeys / rideKeys, with the
// density-2 keys of flatRides.js withD2 (`keys2`; a picture without them is listed under `keys` at both densities).
export type Keys = Map<string, { keys: string[]; keys2?: string[] }>;

/** Picture id that serves a frame key at `density` (default 4). */
export function pictureOf(map: Keys, key: string, density: 2 | 4 = 4): string | undefined {
  for (const [id, e] of map) if ((density === 2 ? e.keys2 ?? e.keys : e.keys).includes(key)) return id;
  return undefined;
}

export const keyAt = (item: string, angle: number, full: boolean, swing = 0): string =>
  frameKey([item, `f${encodeRideFrame(angle, swing, 0)}`, full ? 'occ1' : 'occ0']);

/** Frame keys a density lists, each once. */
export function keysAt(map: Keys, density: 2 | 4): string[] {
  return [...map.values()].flatMap((e) => (density === 2 ? e.keys2 ?? e.keys : e.keys));
}

/**
 * A ride's pictures repeat with its period: every angle slot a shows the picture of slot a % period (so slot 32
 * wrapped, i.e. 0, and slot `period` match slot 0), and within the first period consecutive even slots map to
 * pictures in baking order (never backwards).
 */
export function periodOk(map: Keys, item: string, period: number, full = false): void {
  for (let a = 0; a < 32; a++) {
    expect(pictureOf(map, keyAt(item, a, full)), `slot ${a}`).toBe(pictureOf(map, keyAt(item, a % period, full)));
  }
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

/**
 * Density 2 against density 4 (flatRides.js withD2): both list the same frame keys, each once; density 2 shows only
 * density-4 pictures; a full frame at slot a shows at density 2 the density-4 picture of slot a floored to `step` slots
 * (so as a run's slot moves forwards, the density-2 picture never comes from a later slot, never steps back, and slot
 * 32 wraps to slot 0); an empty frame shows the empty slot-0 picture (`walkThrough`: the density-4 picture).
 */
export function d2FloorOk(map: Keys, item: string, step: number, opts: { walkThrough?: boolean; swings?: number[] } = {}): void {
  const k4 = keysAt(map, 4);
  const k2 = keysAt(map, 2);
  expect(new Set(k2).size, `${item}: density-2 keys listed once`).toBe(k2.length);
  expect([...k2].sort(), `${item}: the same keys at both densities`).toEqual([...k4].sort());
  for (const s of opts.swings ?? [0]) {
    for (let a = 0; a <= 32; a++) {
      const full = pictureOf(map, keyAt(item, a % 32, true, s), 2);
      expect(full, `${item} slot ${a} swing ${s}`).toBe(pictureOf(map, keyAt(item, Math.floor((a % 32) / step) * step, true, s)));
      const empty = pictureOf(map, keyAt(item, a % 32, false, s), 2);
      expect(empty, `${item} slot ${a} empty`).toBe(pictureOf(map, keyAt(item, opts.walkThrough ? a % 32 : 0, false, opts.walkThrough ? s : 0)));
    }
  }
}
