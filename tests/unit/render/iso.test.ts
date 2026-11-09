import { describe, expect, it } from 'vitest';
import {
  STEP_PX,
  TILE_H,
  TILE_W,
  cornerHeights,
  mapScreenBox,
  pickTile,
  screenToTileExact,
  screenToTileFlat,
  tileToScreen,
} from '../../../src/render/iso';
import { generateMap, tileIndex } from '../../../src/sim/map';
import { GROUND_LEVEL } from '../../../src/data/tuning/core';

/** Small deterministic RNG for test points (mulberry32). */
function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('iso projection (master 6.4)', () => {
  it('uses 64 × 32 tiles and 8 px height steps', () => {
    expect([TILE_W, TILE_H, STEP_PX]).toEqual([64, 32, 8]);
    expect(tileToScreen(0, 0, 0)).toEqual({ sx: 0, sy: 0 });
    expect(tileToScreen(1, 0, 0)).toEqual({ sx: 32, sy: 16 });
    expect(tileToScreen(0, 1, 0)).toEqual({ sx: -32, sy: 16 });
    expect(tileToScreen(2, 3, 8)).toEqual({ sx: -32, sy: 80 - 64 });
  });

  it('round-trips every tile of a 64 × 64 map at several heights', () => {
    for (const z of [0, GROUND_LEVEL, 63]) {
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          const { sx, sy } = tileToScreen(x, y, z);
          // The top corner maps back exactly; the tile centre floors to the tile.
          const exact = screenToTileExact(sx, sy, z);
          expect(exact.x).toBeCloseTo(x, 9);
          expect(exact.y).toBeCloseTo(y, 9);
          expect(screenToTileFlat(sx, sy + TILE_H / 2, z)).toEqual({ x, y });
        }
      }
    }
  });
});

describe('pickTile (Phase 0 §4.7)', () => {
  it('equals the flat inverse for 10,000 random points on a flat map', () => {
    const map = generateMap();
    const box = mapScreenBox(map);
    const r = rng(99);
    let inside = 0;
    for (let k = 0; k < 10_000; k++) {
      const sx = box.minX - 64 + r() * (box.maxX - box.minX + 128);
      const sy = box.minY - 64 + r() * (box.maxY - box.minY + 128);
      const flat = screenToTileFlat(sx, sy, GROUND_LEVEL);
      const expected = flat.x >= 0 && flat.y >= 0 && flat.x < map.width && flat.y < map.height ? tileIndex(map, flat.x, flat.y) : null;
      if (expected !== null) inside++;
      expect(pickTile(map, sx, sy)).toBe(expected);
    }
    expect(inside).toBeGreaterThan(3000);
  });

  it('picks a raised tile in front before the ground tile behind it', () => {
    const map = generateMap({ width: 16, height: 16 });
    const front = tileIndex(map, 6, 6);
    map.heights[front] = GROUND_LEVEL + 4;
    // Centre of the raised tile's top face.
    const c = tileToScreen(6.5, 6.5, GROUND_LEVEL + 4);
    expect(pickTile(map, c.sx, c.sy)).toBe(front);
    // The same screen point on a flat map hits a tile further back.
    const flat = screenToTileFlat(c.sx, c.sy, GROUND_LEVEL);
    expect(tileIndex(map, flat.x, flat.y)).not.toBe(front);
  });

  it('picks the tile behind a raised tile when the point is above its top face', () => {
    const map = generateMap({ width: 16, height: 16 });
    const raised = tileIndex(map, 6, 6);
    map.heights[raised] = GROUND_LEVEL + 1;
    // A point near the top of tile (5, 5) on the ground, not covered by the raised tile's face.
    const c = tileToScreen(5.5, 5.2, GROUND_LEVEL);
    expect(pickTile(map, c.sx, c.sy)).toBe(tileIndex(map, 5, 5));
  });

  it('is height-aware on sloped tiles (raised corners)', () => {
    const map = generateMap({ width: 16, height: 16 });
    const t = tileIndex(map, 7, 7);
    map.slope[t] = 1 | 2; // N and E raised: the back edge is 1 step higher.
    expect(cornerHeights(map, t)).toEqual([GROUND_LEVEL + 1, GROUND_LEVEL + 1, GROUND_LEVEL, GROUND_LEVEL]);
    // A point on the surface near the raised N corner.
    const p = tileToScreen(7.1, 7.1, GROUND_LEVEL + 0.85);
    expect(pickTile(map, p.sx, p.sy)).toBe(t);
    // A point near the low S corner.
    const q = tileToScreen(7.9, 7.9, GROUND_LEVEL + 0.05);
    expect(pickTile(map, q.sx, q.sy)).toBe(t);
  });

  it('returns null outside the map', () => {
    const map = generateMap();
    expect(pickTile(map, 0, -5000)).toBeNull();
    expect(pickTile(map, 99999, 0)).toBeNull();
  });
});

describe('mapScreenBox', () => {
  it('covers every tile corner of the map at ground level', () => {
    const map = generateMap();
    const b = mapScreenBox(map);
    expect(b.minX).toBe(-64 * 32);
    expect(b.maxX).toBe(64 * 32);
    expect(b.minY).toBe(-GROUND_LEVEL * STEP_PX);
    expect(b.maxY).toBe(128 * 16 - GROUND_LEVEL * STEP_PX);
  });

  it('grows upward for raised corners', () => {
    const map = generateMap({ width: 8, height: 8 });
    map.slope[0] = 1;
    expect(mapScreenBox(map).minY).toBe(-(GROUND_LEVEL + 1) * STEP_PX);
  });
});
