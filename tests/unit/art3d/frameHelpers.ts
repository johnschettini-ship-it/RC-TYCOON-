import { expect } from 'vitest';
import { encodeRideFrame } from '../../../src/render/anim';
import { frameKey } from '../../../src/render/real/indexFormat';

// Shared by the flat-ride tests: a ride's baked pictures, as returned by cycleKeys / timeKeys / rideKeys.
export type Keys = Map<string, { keys: string[] }>;

/** Picture id that serves a frame key. */
export function pictureOf(map: Keys, key: string): string | undefined {
  for (const [id, e] of map) if (e.keys.includes(key)) return id;
  return undefined;
}

export const keyAt = (item: string, angle: number, full: boolean): string =>
  frameKey([item, `f${encodeRideFrame(angle, 0, 0)}`, full ? 'occ1' : 'occ0']);

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
