import { describe, expect, it } from 'vitest';
import { mapScreenBox, pickTile, screenToTileFlat, STEP_PX, TILE_H, TILE_W } from '../../../src/render/iso';
import { mapToView, mapToViewContinuous, viewAffine, viewCornerHeights, viewSize, viewToMap, type ViewRotation } from '../../../src/render/view';
import { packDepth, Layer, viewPointDepth, viewTileDepth } from '../../../src/render/depth';
import { fenceEdgeDepth } from '../../../src/render/fence';
import { generateMap, tileIndex, type Dir } from '../../../src/sim/map';
import { GROUND_LEVEL } from '../../../src/data/tuning/core';

const ROTS: readonly ViewRotation[] = [0, 1, 2, 3];
const HW = TILE_W / 2;
const HH = TILE_H / 2;

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** World point (zoom 1 px) of local (lu, lv) on view tile (u, v) at height z. */
function viewPoint(u: number, v: number, z: number): { sx: number; sy: number } {
  return { sx: (u - v) * HW, sy: (u + v) * HH - z * STEP_PX };
}

describe('picking under rotation (Phase 4 §4.8: screen → view tile → inverse table → map tile)', () => {
  it('equals the flat inverse through the table for 10,000 random points per rotation', () => {
    const map = generateMap({ width: 48, height: 30 });
    const z = map.heights[0] as number;
    const rand = rng(7);
    for (const r of ROTS) {
      const box = mapScreenBox(map, r);
      const vs = viewSize(map, r);
      let inside = 0;
      for (let k = 0; k < 10_000; k++) {
        const sx = box.minX - 64 + rand() * (box.maxX - box.minX + 128);
        const sy = box.minY - 64 + rand() * (box.maxY - box.minY + 128);
        const f = screenToTileFlat(sx, sy, z);
        const expected = f.x >= 0 && f.y >= 0 && f.x < vs.w && f.y < vs.h ? viewToMap(f.x, f.y, r, map.width, map.height) : null;
        const got = pickTile(map, sx, sy, r);
        if (expected === null) expect(got).toBeNull();
        else {
          inside++;
          expect(got).toBe(tileIndex(map, expected.x, expected.y));
        }
      }
      expect(inside).toBeGreaterThan(2_000);
    }
  });

  it('round-trips the drawn top face of flat, sloped, and raised tiles in every rotation', () => {
    const map = generateMap({ width: 12, height: 12 });
    // A raised plateau tile, and sloped tiles with one raised corner each.
    const raised = tileIndex(map, 5, 5);
    map.heights[raised] = 11;
    for (const [x, y, m] of [
      [2, 8, 1],
      [3, 8, 2],
      [8, 2, 4],
      [8, 3, 8],
      [9, 9, 3],
    ] as const) {
      map.slope[tileIndex(map, x, y)] = m;
    }
    for (const r of ROTS) {
      for (let i = 0; i < map.width * map.height; i++) {
        const x = i % map.width;
        const y = (i - x) / map.width;
        const t = mapToView(x, y, r, map.width, map.height);
        const [hN, hE, , hW] = viewCornerHeights(map, i, r);
        // Local (0.4, 0.4): inside the N-E-W triangle of the drawn face.
        const z = hN + (hE - hN) * 0.4 + (hW - hN) * 0.4;
        const p = viewPoint(t.u + 0.4, t.v + 0.4, z);
        const got = pickTile(map, p.sx, p.sy, r);
        // Only the plateau can hide a tile behind it.
        if (got !== i) expect(got).toBe(raised);
      }
      const t = mapToView(5, 5, r, map.width, map.height);
      const p = viewPoint(t.u + 0.5, t.v + 0.5, 11);
      expect(pickTile(map, p.sx, p.sy, r)).toBe(raised);
    }
  });

  it('the map screen box swaps width and height at r = 1 and 3', () => {
    const map = generateMap({ width: 40, height: 24 });
    const b0 = mapScreenBox(map, 0);
    const b1 = mapScreenBox(map, 1);
    expect(b0.minX).toBe(-24 * HW);
    expect(b0.maxX).toBe(40 * HW);
    expect(b1.minX).toBe(-40 * HW);
    expect(b1.maxX).toBe(24 * HW);
    expect(b1.maxY).toBe(b0.maxY);
    expect(mapScreenBox(map)).toEqual(b0);
  });
});

describe('depth order under rotation (sort by u + v)', () => {
  it('the tile nearer the viewer in the view sorts later, for every map direction and rotation', () => {
    const w = 20;
    const h = 14;
    const DX = [0, 1, 0, -1];
    const DY = [-1, 0, 1, 0];
    for (const r of ROTS) {
      const a = viewAffine(r, w, h);
      for (let d = 0; d < 4; d++) {
        const x = 7;
        const y = 6;
        const nx = x + DX[d]!;
        const ny = y + DY[d]!;
        const va = mapToView(x, y, r, w, h);
        const vb = mapToView(nx, ny, r, w, h);
        const da = viewTileDepth(x, y, a);
        const db = viewTileDepth(nx, ny, a);
        expect(da).toBe(va.u + va.v + 1);
        expect(db).toBe(vb.u + vb.v + 1);
        // Nearer = larger u + v; it must draw later (larger packed key).
        const nearer = vb.u + vb.v > va.u + va.v;
        expect(packDepth(db, GROUND_LEVEL, Layer.Object) > packDepth(da, GROUND_LEVEL, Layer.Object)).toBe(nearer);
      }
      // Points use the continuous table.
      const c = mapToViewContinuous(3.25, 4.5, r, w, h);
      expect(viewPointDepth(3.25, 4.5, a)).toBeCloseTo(c.u + c.v, 12);
    }
  });

  it('a guest on a tile sorts between the fence on its far edge and the fence on its near edge', () => {
    const map = generateMap({ width: 16, height: 16 });
    const tile = tileIndex(map, 6, 9);
    for (const r of ROTS) {
      const a = viewAffine(r, 16, 16);
      const guest = viewPointDepth(6.5, 9.5, a);
      for (let d = 0; d < 4; d++) {
        const e = fenceEdgeDepth(map, tile, d as Dir, a);
        // The edge midpoint is half a tile from the centre along one view axis.
        expect(Math.abs(e - guest)).toBeCloseTo(0.5, 12);
      }
      // Rotation 0 keeps the Build 1 values.
      if (r === 0) expect(fenceEdgeDepth(map, tile, 2, a)).toBe(fenceEdgeDepth(map, tile, 2));
    }
  });
});
