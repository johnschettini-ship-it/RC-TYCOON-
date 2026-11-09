import { describe, expect, it } from 'vitest';
import {
  Layer,
  compareDepth,
  footprintColumns,
  packDepth,
  pointDepth,
  sortIndex,
  sortKey,
  tileDepth,
  type DepthKey,
} from '../../../src/render/depth';

describe('depth order (master 6.4: x + y, then z, then layer)', () => {
  const k = (depth: number, z: number, layer: number): DepthKey => ({ depth, z, layer });

  it('orders by x + y first', () => {
    expect(compareDepth(k(3, 50, Layer.Overlay), k(4, 0, Layer.Ground))).toBeLessThan(0);
    expect(compareDepth(k(10, 0, Layer.Ground), k(9.5, 60, Layer.Overlay))).toBeGreaterThan(0);
  });

  it('then by base z', () => {
    expect(compareDepth(k(5, 8, Layer.Guest), k(5, 9, Layer.Ground))).toBeLessThan(0);
    expect(compareDepth(k(5, 12, Layer.Ground), k(5, 9, Layer.Guest))).toBeGreaterThan(0);
  });

  it('then by layer: ground, path, object, guest, overlay', () => {
    expect([Layer.Ground, Layer.Path, Layer.Object, Layer.Guest, Layer.Overlay]).toEqual([0, 1, 2, 3, 4]);
    expect(compareDepth(k(5, 8, Layer.Path), k(5, 8, Layer.Object))).toBeLessThan(0);
    expect(compareDepth(k(5, 8, Layer.Guest), k(5, 8, Layer.Object))).toBeGreaterThan(0);
    expect(compareDepth(k(5, 8, Layer.Guest), k(5, 8, Layer.Guest))).toBe(0);
  });

  it('tile objects sort by their centre; points by their position', () => {
    expect(tileDepth(3, 4)).toBe(8);
    expect(pointDepth(3.5, 4.5)).toBe(8);
    // A fence on the south edge of (3, 4) sorts after a guest at the tile centre.
    expect(pointDepth(3.5, 5)).toBeGreaterThan(tileDepth(3, 4));
    // A fence on the north edge sorts before it.
    expect(pointDepth(3.5, 4)).toBeLessThan(tileDepth(3, 4));
  });

  it('packed keys sort exactly like the comparator', () => {
    let seed = 3;
    const rnd = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const items: DepthKey[] = [];
    for (let i = 0; i < 3000; i++) {
      items.push(k(Math.floor(rnd() * 130 * 16) / 16, Math.floor(rnd() * 64), Math.floor(rnd() * 5)));
    }
    const keys = new Float64Array(items.length);
    items.forEach((it, i) => (keys[i] = sortKey(packDepth(it.depth, it.z, it.layer), i)));
    keys.sort();
    const order = Array.from(keys, (key) => sortIndex(key));
    const expected = items.map((_, i) => i).sort((a, b) => compareDepth(items[a]!, items[b]!) || a - b);
    expect(order).toEqual(expected);
  });

  it('packed keys keep insertion order for equal depth (stable)', () => {
    const p = packDepth(7, 8, Layer.Object);
    const keys = new Float64Array([sortKey(p, 5), sortKey(p, 1), sortKey(p, 3)]);
    keys.sort();
    expect(Array.from(keys, sortIndex)).toEqual([1, 3, 5]);
  });
});

describe('multi-tile slices', () => {
  it('splits a 3 × 3 footprint into 6 screen columns, each owned by its front tile', () => {
    const cols = footprintColumns(3, 3);
    expect(cols.length).toBe(6);
    expect(cols.map((c) => [c.dx, c.dy])).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
      [2, 2],
      [2, 1],
      [2, 0],
    ]);
  });

  it('handles non-square footprints', () => {
    const cols = footprintColumns(5, 3);
    expect(cols.length).toBe(8);
    expect(cols[0]).toEqual({ dx: 0, dy: 2 });
    expect(cols[7]).toEqual({ dx: 4, dy: 0 });
    // Every column's tile is inside the footprint and on its front boundary.
    for (const c of cols) expect(c.dx === 4 || c.dy === 2).toBe(true);
    expect(footprintColumns(1, 1)).toEqual([
      { dx: 0, dy: 0 },
      { dx: 0, dy: 0 },
    ]);
  });
});
