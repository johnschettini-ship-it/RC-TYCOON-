/** Phase 8 stage 0 prototype (never merged): the Pixel ground chunks (spec §8.1 item 7, Prototype decision 6). */
import { describe, expect, it } from 'vitest';
import { paintGroundChunk } from '../../../../src/render/pixel/ground';
import { SLOT_NAMES } from '../../../../src/render/pixel/palette';
import { PixelSurface } from '../../../../src/render/pixel/surface';
import { chunkBounds, chunkViewRect, type TerrainEnv } from '../../../../src/render/terrain';
import type { ViewRotation } from '../../../../src/render/view';
import { createWorld } from '../../../../src/sim/world';
import type { MapState } from '../../../../src/sim/map';
import type { World } from '../../../../src/sim/types';
import { placeFootpath, placeQueue } from '../../../helpers/world';

const newWorld = (): World => createWorld({ seed: 1, parkName: 'G', mapSize: 32 });
const world = newWorld();
const m = world.state.map;
const envOf = (w: World): TerrainEnv => ({ seed: w.state.seed, rides: w.state.rides, stalls: w.state.stalls });
const env = envOf(world);

function paint(map: MapState, cx: number, cy: number, r: ViewRotation, e: TerrainEnv = env): PixelSurface {
  const s = new PixelSurface(chunkBounds(map, cx, cy, r), { ink: false });
  paintGroundChunk(s, map, chunkViewRect(map, cx, cy, r), r, e, false);
  return s;
}

/** View position (u, v) of the centre of image pixel (x, y) on flat ground at height `z` (steps). */
function viewAt(s: PixelSurface, x: number, y: number, z: number): { u: number; v: number } {
  const wx = (x - s.ox + 0.5) * 2;
  const wy = (y - s.oy + 0.5) * 2;
  const a = wx / 32;
  const b = (wy + z * 8) / 16;
  return { u: (a + b) / 2, v: (b - a) / 2 };
}

/** Image pixels whose centre lies in a tile top of the rect (flat ground at height `z`), with their view tile. */
function topPixels(s: PixelSurface, rect: { u0: number; v0: number; u1: number; v1: number }, z: number, margin = 0): Array<{ x: number; y: number; u: number; v: number }> {
  const out: Array<{ x: number; y: number; u: number; v: number }> = [];
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const p = viewAt(s, x, y, z);
      if (p.u < rect.u0 + margin || p.v < rect.v0 + margin || p.u >= rect.u1 - margin || p.v >= rect.v1 - margin) continue;
      out.push({ x, y, u: Math.floor(p.u), v: Math.floor(p.v) });
    }
  }
  return out;
}

const Z = m.heights[0] as number;
const name = (s: PixelSurface, x: number, y: number): string => SLOT_NAMES[s.pixel(x, y)] as string;

describe('Pixel ground chunks (§8.1 item 7)', () => {
  it('the test map is flat', () => {
    expect(Array.from(m.heights).every((h) => h === Z)).toBe(true);
    expect(Array.from(m.slope).every((v) => v === 0)).toBe(true);
  });

  it('the same chunk twice gives the same hash', () => {
    expect(paint(m, 1, 1, 0).hash()).toBe(paint(m, 1, 1, 0).hash());
  });

  it('the 4 view rotations of one chunk give 4 hashes', () => {
    expect(new Set([0, 1, 2, 3].map((r) => paint(m, 1, 1, r as ViewRotation).hash())).size).toBe(4);
  });

  it('a pixel depends only on its world art pixel (Bayer phase across chunks)', () => {
    const s1 = paint(m, 1, 1, 0);
    const a = chunkViewRect(m, 1, 1, 0);
    const b = chunkViewRect(m, 2, 1, 0);
    const rect = { u0: Math.min(a.u0, b.u0), v0: Math.min(a.v0, b.v0), u1: Math.max(a.u1, b.u1), v1: Math.max(a.v1, b.v1) };
    const A = chunkBounds(m, 1, 1, 0);
    const B = chunkBounds(m, 2, 1, 0);
    const bounds = { left: Math.min(A.left, B.left), right: Math.max(A.right, B.right), top: Math.min(A.top, B.top), bottom: Math.max(A.bottom, B.bottom) };
    const s2 = new PixelSurface(bounds, { ink: false });
    paintGroundChunk(s2, m, rect, 0, env, false);
    // 2 art pixels = 4 world pixels, about 0.14 tile across a tile edge: 0.2 tile keeps them clear.
    let compared = 0;
    for (const p of topPixels(s1, a, Z, 0.2)) {
      if (s1.pixel(p.x, p.y) === 0) continue;
      expect(s2.pixel(p.x - s1.ox + s2.ox, p.y - s1.oy + s2.oy)).toBe(s1.pixel(p.x, p.y));
      compared++;
    }
    expect(compared).toBeGreaterThanOrEqual(100);
  });

  it('a flat grass chunk has no hole and only grass slots', () => {
    const s = paint(m, 1, 1, 0);
    const top = topPixels(s, chunkViewRect(m, 1, 1, 0), Z);
    expect(top.length).toBeGreaterThan(1000);
    for (const p of top) expect(s.pixel(p.x, p.y)).not.toBe(0);
    const seen = new Set<string>();
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.pixel(x, y) !== 0) seen.add(name(s, x, y));
    for (const n of seen) expect(['g1', 'g2', 'g3', 'g4', 'g5']).toContain(n);
    // Chunk (1, 1) is owned land: the owned tones only, and more than one of them.
    for (const n of seen) expect(['g1', 'g2', 'g3']).toContain(n);
    expect(seen.size).toBeGreaterThan(1);
  });

  it('land outside the park is 2 tones darker', () => {
    // Chunk (0, 0): row y = 0 and column x = 0 are not owned.
    const s = paint(m, 0, 0, 0);
    const seen = new Set<string>();
    for (const p of topPixels(s, chunkViewRect(m, 0, 0, 0), Z)) if (p.u === 0 || p.v === 0) seen.add(name(s, p.x, p.y));
    for (const n of seen) expect(['g3', 'g4', 'g5']).toContain(n);
    expect(seen.size).toBeGreaterThan(0);
  });

  it('a footpath tile is slabs', () => {
    const w = newWorld();
    placeFootpath(w, 12, 12);
    const s = paint(w.state.map, 1, 1, 0, envOf(w));
    const seen = new Set<string>();
    for (const p of topPixels(s, chunkViewRect(w.state.map, 1, 1, 0), Z)) {
      if (p.u !== 12 || p.v !== 12) continue;
      seen.add(name(s, p.x, p.y));
    }
    for (const n of seen) expect(['s1', 's2', 's3', 's4']).toContain(n);
    // The tile meets grass on all four sides: its edge is s4.
    expect(seen.has('s4')).toBe(true);
  });

  it('a queue tile uses the n tones', () => {
    const w = newWorld();
    placeQueue(w, 12, 13);
    const s = paint(w.state.map, 1, 1, 0, envOf(w));
    let count = 0;
    for (const p of topPixels(s, chunkViewRect(w.state.map, 1, 1, 0), Z)) {
      if (p.u !== 12 || p.v !== 13) continue;
      expect(['n2', 'n3', 'n4', 'n5']).toContain(name(s, p.x, p.y));
      count++;
    }
    expect(count).toBeGreaterThan(100);
  });

  it('map edge faces are w2 and w3', () => {
    // Chunk (3, 3) holds the map corner (32 × 32 map, 8-tile chunks): its front tiles have faces down to height 0.
    const s = paint(m, 3, 3, 0);
    const rect = chunkViewRect(m, 3, 3, 0);
    const top = new Set(topPixels(s, rect, Z).map((p) => p.y * s.w + p.x));
    const faces = new Map<string, number>();
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        if (s.pixel(x, y) === 0 || top.has(y * s.w + x)) continue;
        const n = name(s, x, y);
        faces.set(n, (faces.get(n) ?? 0) + 1);
      }
    }
    expect([...faces.keys()].sort()).toEqual(['w2', 'w3']);
    // Faces 8 steps (64 world px, 32 art px) high under 8 tiles on each front edge.
    expect(faces.get('w2') ?? 0).toBeGreaterThan(1000);
    expect(faces.get('w3') ?? 0).toBeGreaterThan(1000);
  });
});
