import { describe, expect, it } from 'vitest';
import {
  mapRotationFromView,
  mapToView,
  mapToViewContinuous,
  rotateCameraView,
  rotateSlopeMask,
  viewAffine,
  viewCornerHeights,
  viewDir,
  viewPointSX,
  viewPointSY,
  viewSize,
  viewTileSX,
  viewTileSY,
  viewTileU,
  viewTileV,
  viewSpriteRotation,
  viewToMap,
  viewToMapContinuous,
  type ViewRotation,
} from '../../../src/render/view';
import { cornerHeights, screenToTileExact, tileToScreen } from '../../../src/render/iso';
import { generateMap, type Dir } from '../../../src/sim/map';
import type { Camera } from '../../../src/render/types';

const ROTS: readonly ViewRotation[] = [0, 1, 2, 3];

describe('view rotation table (Phase 4 §4.8)', () => {
  it('map → view → map is the identity for every tile and every r (square and non-square maps)', () => {
    for (const [w, h] of [
      [8, 8],
      [7, 5],
      [3, 11],
    ] as const) {
      for (const r of ROTS) {
        const vs = viewSize({ width: w, height: h }, r);
        const seen = new Set<number>();
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const p = mapToView(x, y, r, w, h);
            expect(p.u).toBeGreaterThanOrEqual(0);
            expect(p.v).toBeGreaterThanOrEqual(0);
            expect(p.u).toBeLessThan(vs.w);
            expect(p.v).toBeLessThan(vs.h);
            seen.add(p.v * vs.w + p.u);
            expect(viewToMap(p.u, p.v, r, w, h)).toEqual({ x, y });
          }
        }
        // A bijection onto the view rectangle.
        expect(seen.size).toBe(w * h);
      }
    }
  });

  it('matches the §4.8 table rows', () => {
    const w = 10;
    const h = 6;
    expect(mapToView(2, 1, 0, w, h)).toEqual({ u: 2, v: 1 });
    expect(mapToView(2, 1, 1, w, h)).toEqual({ u: h - 1 - 1, v: 2 });
    expect(mapToView(2, 1, 2, w, h)).toEqual({ u: w - 1 - 2, v: h - 1 - 1 });
    expect(mapToView(2, 1, 3, w, h)).toEqual({ u: 1, v: w - 1 - 2 });
    expect(mapToViewContinuous(2.25, 1.5, 1, w, h)).toEqual({ u: h - 1.5, v: 2.25 });
  });

  it('continuous positions round-trip and agree with tile centres', () => {
    const w = 9;
    const h = 5;
    for (const r of ROTS) {
      for (const [fx, fy] of [
        [0, 0],
        [9, 5],
        [3.25, 1.75],
        [8.5, 0.5],
      ] as const) {
        const p = mapToViewContinuous(fx, fy, r, w, h);
        const q = viewToMapContinuous(p.u, p.v, r, w, h);
        expect(q.x).toBeCloseTo(fx, 12);
        expect(q.y).toBeCloseTo(fy, 12);
      }
      // Tile (x, y) centre → view tile centre.
      const t = mapToView(3, 2, r, w, h);
      const c = mapToViewContinuous(3.5, 2.5, r, w, h);
      expect(c).toEqual({ u: t.u + 0.5, v: t.v + 0.5 });
    }
  });

  it('the affine form equals the table for tiles and continuous positions', () => {
    const w = 12;
    const h = 7;
    for (const r of ROTS) {
      const a = viewAffine(r, w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const t = mapToView(x, y, r, w, h);
          expect(a.ux * x + a.uy * y + a.tu0).toBe(t.u);
          expect(a.vx * x + a.vy * y + a.tv0).toBe(t.v);
          const c = mapToViewContinuous(x + 0.3, y + 0.8, r, w, h);
          expect(a.ux * (x + 0.3) + a.uy * (y + 0.8) + a.u0).toBeCloseTo(c.u, 12);
          expect(a.vx * (x + 0.3) + a.vy * (y + 0.8) + a.v0).toBeCloseTo(c.v, 12);
        }
      }
    }
    // Reuses the output record.
    const out = viewAffine(0, 4, 4);
    expect(viewAffine(2, 4, 4, out)).toBe(out);
    expect(out.r).toBe(2);
  });

  it('slope mask rotation matches the corner heights seen at each view corner', () => {
    const w = 4;
    const h = 3;
    const map = generateMap({ width: w, height: h });
    const i = 1 * w + 2; // tile (2, 1)
    for (let mask = 0; mask < 16; mask++) {
      map.slope[i] = mask;
      const mc = cornerHeights(map, i);
      // Map corner points N (x, y), E (x + 1, y), S (x + 1, y + 1), W (x, y + 1).
      const pts: Array<[number, number]> = [
        [2, 1],
        [3, 1],
        [3, 2],
        [2, 2],
      ];
      for (const r of ROTS) {
        const t = mapToView(2, 1, r, w, h);
        // View corners of the view tile: N (u, v), E (u + 1, v), S (u + 1, v + 1), W (u, v + 1).
        const want = [
          [t.u, t.v],
          [t.u + 1, t.v],
          [t.u + 1, t.v + 1],
          [t.u, t.v + 1],
        ];
        const rot = rotateSlopeMask(mask, r);
        const vc = viewCornerHeights(map, i, r);
        for (let k = 0; k < 4; k++) {
          // Which map corner lands on view corner k?
          const m = pts.findIndex(([px, py]) => {
            const p = mapToViewContinuous(px, py, r, w, h);
            return p.u === want[k]![0] && p.v === want[k]![1];
          });
          expect(m).toBeGreaterThanOrEqual(0);
          expect(vc[k]).toBe(mc[m]);
          expect(vc[k]).toBe((map.heights[i] as number) + ((rot >> k) & 1));
        }
      }
    }
  });

  it('sprite rotations add r; new objects store (viewRotation − r) mod 4; directions turn like sprites', () => {
    for (const r of ROTS) {
      for (const rot of ROTS) {
        const v = viewSpriteRotation(rot as Dir, r);
        expect(v).toBe((rot + r) % 4);
        expect(mapRotationFromView(v, r)).toBe(rot);
        expect(viewDir(rot as Dir, r)).toBe(v);
      }
    }
    // A map direction step, seen in the view, moves the view tile by that view direction.
    const w = 6;
    const h = 6;
    const DX = [0, 1, 0, -1];
    const DY = [-1, 0, 1, 0];
    for (const r of ROTS) {
      for (let d = 0; d < 4; d++) {
        const a = mapToView(2, 3, r, w, h);
        const b = mapToView(2 + DX[d]!, 3 + DY[d]!, r, w, h);
        const vd = viewDir(d as Dir, r);
        expect(b.u - a.u).toBe(DX[vd]);
        expect(b.v - a.v).toBe(DY[vd]);
      }
    }
  });
});

describe('projection through the view (master 6.4 on (u, v, z))', () => {
  it('tile anchors and points equal tileToScreen of the view position', () => {
    const w = 11;
    const h = 7;
    for (const r of ROTS) {
      const a = viewAffine(r, w, h);
      for (const [x, y] of [
        [0, 0],
        [10, 6],
        [4, 2],
      ] as const) {
        const t = mapToView(x, y, r, w, h);
        expect(viewTileU(a, x, y)).toBe(t.u);
        expect(viewTileV(a, x, y)).toBe(t.v);
        const s = tileToScreen(t.u, t.v, 9);
        expect(viewTileSX(a, x, y)).toBe(s.sx);
        expect(viewTileSY(a, x, y, 9)).toBe(s.sy);
        const c = mapToViewContinuous(x + 0.25, y + 0.75, r, w, h);
        const q = tileToScreen(c.u, c.v, 8.5);
        expect(viewPointSX(a, x + 0.25, y + 0.75)).toBeCloseTo(q.sx, 9);
        expect(viewPointSY(a, x + 0.25, y + 0.75, 8.5)).toBeCloseTo(q.sy, 9);
      }
    }
  });
});

describe('rotateCameraView keeps the map point at the screen centre', () => {
  const map = { width: 64, height: 40 };

  function centrePoint(cam: Camera, z: number): { x: number; y: number } {
    const t = screenToTileExact(cam.centerX, cam.centerY, z);
    const vs = viewSize(map, cam.rotation);
    expect(vs.w).toBeGreaterThan(0);
    return viewToMapContinuous(t.x, t.y, cam.rotation, map.width, map.height);
  }

  it('turns one step either way and returns after four steps', () => {
    const start = tileToScreen(20.3, 11.7, 8);
    const cam: Camera = { centerX: start.sx, centerY: start.sy, zoom: 1, rotation: 0 };
    const p0 = centrePoint(cam, 8);
    for (let k = 1; k <= 4; k++) {
      rotateCameraView(cam, map, 1, 8);
      expect(cam.rotation).toBe(k % 4);
      const p = centrePoint(cam, 8);
      expect(p.x).toBeCloseTo(p0.x, 9);
      expect(p.y).toBeCloseTo(p0.y, 9);
    }
    expect(cam.centerX).toBeCloseTo(start.sx, 9);
    expect(cam.centerY).toBeCloseTo(start.sy, 9);
    rotateCameraView(cam, map, -1, 8);
    expect(cam.rotation).toBe(3);
    const p = centrePoint(cam, 8);
    expect(p.x).toBeCloseTo(p0.x, 9);
    expect(p.y).toBeCloseTo(p0.y, 9);
    rotateCameraView(cam, map, 1, 8);
    expect(cam.rotation).toBe(0);
    expect(cam.zoom).toBe(1);
  });

  it('uses the ground height of a full map when no height is given', () => {
    const full = generateMap({ width: 32, height: 32 });
    const start = tileToScreen(10.5, 20.5, full.heights[0] as number);
    const cam: Camera = { centerX: start.sx, centerY: start.sy, zoom: 1, rotation: 0 };
    rotateCameraView(cam, full, 1);
    const t = screenToTileExact(cam.centerX, cam.centerY, full.heights[0] as number);
    const m = viewToMapContinuous(t.x, t.y, 1, 32, 32);
    expect(m.x).toBeCloseTo(10.5, 9);
    expect(m.y).toBeCloseTo(20.5, 9);
  });
});
