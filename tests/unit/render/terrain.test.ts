import { describe, expect, it } from 'vitest';
import { CHUNK_CACHE_MB, chunkBounds, chunkViewRect, grassShade, TerrainLayer } from '../../../src/render/terrain';
import { generateMap, tileIndex } from '../../../src/sim/map';
import { GROUND_LEVEL } from '../../../src/data/tuning/core';
import { mapToView, viewSize } from '../../../src/render/view';
import { install, make } from './fakeCanvas';

describe('terrain chunks', () => {
  it('bounds an inner chunk by its tiles at ground level', () => {
    const map = generateMap();
    const b = chunkBounds(map, 1, 1);
    // Tiles x, y in [16, 32): left corner of (16, 31), right corner of (31, 16).
    expect(b.left).toBe((16 - 32) * 32);
    expect(b.right).toBe((32 - 16) * 32);
    expect(b.top).toBe(32 * 16 - (GROUND_LEVEL + 2) * 8);
    expect(b.bottom).toBe(64 * 16 - GROUND_LEVEL * 8);
  });

  it('extends front-edge chunks down to height 0 for the map edge faces', () => {
    const map = generateMap();
    const b = chunkBounds(map, 3, 3);
    expect(b.bottom).toBe(128 * 16);
  });

  it('picks one of two grass shades per tile, deterministically from the seed', () => {
    const seen = new Set<number>();
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const s = grassShade(1234, x, y);
        expect(s).toBe(grassShade(1234, x, y));
        seen.add(s);
      }
    }
    expect([...seen].sort()).toEqual([0, 1]);
    let differ = 0;
    for (let x = 0; x < 64; x++) if (grassShade(1, x, 7) !== grassShade(2, x, 7)) differ++;
    expect(differ).toBeGreaterThan(0);
  });
});

describe('renderer module', () => {
  it('imports without a DOM (canvas work only happens at draw time)', async () => {
    const mod = await import('../../../src/render/renderer');
    expect(typeof mod.createCanvasRenderer).toBe('function');
    expect(typeof mod.drawPreview).toBe('function');
  });
});

describe('terrain chunks under view rotation (Phase 4 §4.8, §4.10)', () => {
  it('a chunk covers the turned view rectangle of its map tiles', () => {
    const map = generateMap({ width: 48, height: 32 });
    for (const r of [0, 1, 2, 3] as const) {
      const vs = viewSize(map, r);
      for (let cy = 0; cy < 2; cy++) {
        for (let cx = 0; cx < 3; cx++) {
          const vr = chunkViewRect(map, cx, cy, r);
          expect(vr.u1 - vr.u0).toBe(16);
          expect(vr.v1 - vr.v0).toBe(16);
          // Every map tile of the chunk lands inside the view rectangle.
          for (let y = cy * 16; y < cy * 16 + 16; y++) {
            for (let x = cx * 16; x < cx * 16 + 16; x++) {
              const t = mapToView(x, y, r, 48, 32);
              expect(t.u >= vr.u0 && t.u < vr.u1 && t.v >= vr.v0 && t.v < vr.v1).toBe(true);
            }
          }
          const b = chunkBounds(map, cx, cy, r);
          expect(b.left).toBe((vr.u0 - vr.v1) * 32);
          expect(b.right).toBe((vr.u1 - vr.v0) * 32);
          const front = vr.u1 === vs.w || vr.v1 === vs.h;
          expect(b.bottom).toBe((vr.u1 + vr.v1) * 16 - (front ? 0 : GROUND_LEVEL) * 8);
        }
      }
    }
    expect(chunkBounds(map, 1, 1, 0)).toEqual(chunkBounds(map, 1, 1));
  });

  it('draws chunks back to front in the view and keeps images per rotation until a tile changes', () => {
    install();
    const map = generateMap({ width: 48, height: 32 });
    const layer = new TerrainLayer();
    expect(layer.budgetPixels).toBe((CHUNK_CACHE_MB * 1024 * 1024) / 4);
    const env = { seed: 1, rides: [], stalls: [] };
    const view = { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 };
    for (const r of [0, 1, 2, 3] as const) {
      const canvas = make(100, 100);
      const ctx = canvas.getContext() as CanvasRenderingContext2D;
      layer.sync(map);
      expect(layer.draw(ctx, map, env, view, 1, 1, 0, 0, r)).toBe(6);
      expect(layer.builds).toBe(6);
      // Draw order = view row-major order of the chunks (back to front).
      const order = canvas.draws.map((d) => {
        for (let c = 0; c < 6; c++) {
          const b = chunkBounds(map, c % 3, Math.floor(c / 3), r);
          if (Math.abs(d.x - (b.left - 2)) < 1.5 && Math.abs(d.y - (b.top - 2)) < 1.5) return c;
        }
        return -1;
      });
      const keyOf = (c: number): number => {
        const vr = chunkViewRect(map, c % 3, Math.floor(c / 3), r);
        return vr.v0 * 1000 + vr.u0;
      };
      expect(order).not.toContain(-1);
      expect(order.map(keyOf)).toEqual([...order.map(keyOf)].sort((a, b) => a - b));
      // A second frame builds nothing.
      layer.draw(ctx, map, env, view, 1, 1, 0, 0, r);
      expect(layer.builds).toBe(0);
    }
    // Images of all four rotations stay cached (LRU under the cap)…
    for (const r of [0, 1, 2, 3] as const) expect(layer.hasImage(0, r, 1)).toBe(true);
    // …until a tile of the chunk changes: every rotation's image of that chunk is dropped.
    map.heights[tileIndex(map, 3, 3)] = 12;
    layer.sync(map);
    for (const r of [0, 1, 2, 3] as const) expect(layer.hasImage(0, r, 1)).toBe(false);
    expect(layer.hasImage(5, 2, 1)).toBe(true);
  });
});
