import { beforeEach, describe, expect, it } from 'vitest';
import { CHUNK_CACHE_MB, chunkBounds, chunkViewRect, EXACT_SETTLE_FRAMES, FIRST_BUILD_BUDGET_MS, grassShade, TerrainLayer, terrainClock } from '../../../src/render/terrain';
import { generateMap, tileIndex } from '../../../src/sim/map';
import { CHUNK_SIZE } from '../../../src/render/terrainTracker';
import { GROUND_LEVEL } from '../../../src/data/tuning/core';
import { mapToView, viewSize } from '../../../src/render/view';
import { install, make } from './fakeCanvas';

// The first-build budget reads this clock: frozen, every chunk builds at once unless a test moves it.
let now = 0;
beforeEach(() => {
  now = 0;
  terrainClock.now = () => now;
});

describe('terrain chunks', () => {
  it('bounds an inner chunk by its tiles at ground level', () => {
    const map = generateMap();
    const b = chunkBounds(map, 1, 1);
    // Tiles x, y in [8, 16): left corner of (8, 15), right corner of (15, 8).
    expect(b.left).toBe((8 - 16) * 32);
    expect(b.right).toBe((16 - 8) * 32);
    expect(b.top).toBe(16 * 16 - (GROUND_LEVEL + 2) * 8);
    expect(b.bottom).toBe(32 * 16 - GROUND_LEVEL * 8);
  });

  it('extends front-edge chunks down to height 0 for the map edge faces', () => {
    const map = generateMap();
    const b = chunkBounds(map, 7, 7);
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
          expect(vr.u1 - vr.u0).toBe(CHUNK_SIZE);
          expect(vr.v1 - vr.v0).toBe(CHUNK_SIZE);
          // Every map tile of the chunk lands inside the view rectangle.
          for (let y = cy * CHUNK_SIZE; y < (cy + 1) * CHUNK_SIZE; y++) {
            for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
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
    const map = generateMap({ width: 3 * CHUNK_SIZE, height: 2 * CHUNK_SIZE });
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

  it('once the zoom settles between buckets, chunks are rebuilt at the exact scale one per frame and drawn 1:1', () => {
    install();
    const map = generateMap({ width: 3 * CHUNK_SIZE, height: 2 * CHUNK_SIZE });
    const layer = new TerrainLayer();
    const env = { seed: 1, rides: [], stalls: [] };
    const view = { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 };
    const canvas = make(100, 100);
    const ctx = canvas.getContext() as CanvasRenderingContext2D;
    layer.sync(map);
    const frame = (): void => {
      canvas.reset();
      layer.draw(ctx, map, env, view, 1, 0.75, 10.3, 20.7, 0);
    };
    // The first frames use bucket-1 images, drawn scaled.
    frame();
    expect(layer.builds).toBe(6);
    for (let k = 1; k < EXACT_SETTLE_FRAMES; k++) {
      frame();
      expect(layer.builds).toBe(0);
    }
    const scaled = canvas.draws.filter((d) => d.w !== d.image.width).length;
    expect(scaled).toBe(6);
    // Then one exact-scale image per frame, until every chunk draws 1:1.
    for (let k = 0; k < 6; k++) {
      frame();
      expect(layer.builds).toBe(1);
    }
    frame();
    expect(layer.builds).toBe(0);
    expect(canvas.draws.length).toBe(6);
    for (const d of canvas.draws) {
      expect(d.w).toBe(d.image.width);
      expect(d.h).toBe(d.image.height);
    }
    // A zoom change goes back to the bucket images at once (no builds).
    canvas.reset();
    layer.draw(ctx, map, env, view, 1, 0.8, 0, 0, 0);
    expect(layer.builds).toBe(0);
    expect(canvas.draws.length).toBe(6);
  });
});

describe('terrain chunk builds per frame (Phase 6 §4.6: a view turn is not one long frame)', () => {
  const env = { seed: 1, rides: [], stalls: [] };
  const view = { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 };

  it('chunks with no image build while the frame budget lasts; the rest draw a placeholder until later frames', () => {
    install();
    const map = generateMap({ width: 3 * CHUNK_SIZE, height: 2 * CHUNK_SIZE });
    const layer = new TerrainLayer();
    const canvas = make(100, 100);
    const ctx = canvas.getContext() as CanvasRenderingContext2D;
    layer.sync(map);
    // Every build takes the whole budget: one chunk per frame.
    terrainClock.now = () => (now += FIRST_BUILD_BUDGET_MS);
    const built: number[] = [];
    for (let f = 0; f < 6; f++) {
      canvas.reset();
      layer.draw(ctx, map, env, view, 1, 1, 0, 0, 1);
      built.push(layer.builds);
      expect(layer.placeholders).toBe(5 - f);
      expect(canvas.draws.length).toBe(f + 1);
      expect(canvas.count('fill')).toBe(5 - f);
      expect(layer.complete).toBe(f === 5);
    }
    expect(built).toEqual([1, 1, 1, 1, 1, 1]);
    // All built: nothing more to do, and the frame is complete.
    canvas.reset();
    layer.draw(ctx, map, env, view, 1, 1, 0, 0, 1);
    expect(layer.builds).toBe(0);
    expect(layer.placeholders).toBe(0);
    expect(layer.complete).toBe(true);
  });

  it('a fast frame builds every missing chunk at once', () => {
    install();
    const map = generateMap({ width: 3 * CHUNK_SIZE, height: 2 * CHUNK_SIZE });
    const layer = new TerrainLayer();
    const canvas = make(100, 100);
    layer.sync(map);
    layer.draw(canvas.getContext() as CanvasRenderingContext2D, map, env, view, 1, 1, 0, 0, 2);
    expect(layer.builds).toBe(6);
    expect(layer.placeholders).toBe(0);
    expect(layer.complete).toBe(true);
  });

  it('is not complete while bucket images stand in or exact-scale images are still to come', () => {
    install();
    const map = generateMap({ width: 3 * CHUNK_SIZE, height: 2 * CHUNK_SIZE });
    const layer = new TerrainLayer();
    const canvas = make(100, 100);
    const ctx = canvas.getContext() as CanvasRenderingContext2D;
    layer.sync(map);
    layer.draw(ctx, map, env, view, 1, 0.75, 0, 0, 0);
    // Between buckets: exact images will replace these once the zoom settles.
    expect(layer.complete).toBe(false);
    for (let k = 0; k < EXACT_SETTLE_FRAMES + 6; k++) layer.draw(ctx, map, env, view, 1, 0.75, 0, 0, 0);
    expect(layer.complete).toBe(true);
    // At bucket 2 the bucket-1 images stand in, one refined per frame.
    layer.draw(ctx, map, env, view, 2, 2, 0, 0, 0);
    expect(layer.builds).toBe(1);
    expect(layer.complete).toBe(false);
  });

  it('phones keep 3 zoom buckets: no exact-scale images (Phase 6 §4.6)', () => {
    install();
    const map = generateMap({ width: 3 * CHUNK_SIZE, height: 2 * CHUNK_SIZE });
    const layer = new TerrainLayer();
    layer.allowExact = false;
    const canvas = make(100, 100);
    const ctx = canvas.getContext() as CanvasRenderingContext2D;
    layer.sync(map);
    let builds = 0;
    for (let k = 0; k < EXACT_SETTLE_FRAMES + 10; k++) {
      layer.draw(ctx, map, env, view, 1, 0.75, 0, 0, 0);
      builds += layer.builds;
    }
    // Only the 6 bucket images; the scaled draws are final.
    expect(builds).toBe(6);
    expect(layer.complete).toBe(true);
    for (let c = 0; c < 6; c++) {
      for (let r = 0; r < 4; r++) expect(layer.hasImage(c, r as 0 | 1 | 2 | 3, 0.5) || layer.hasImage(c, r as 0 | 1 | 2 | 3, 2)).toBe(false);
    }
  });
});
