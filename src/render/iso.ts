/**
 * Isometric math (Phase 0 §4.7, master 6.4). Owner: W1-A, W3-G (view rotation). Signatures are a contract; the
 * optional view rotation `r` (Phase 4 §4.8) defaults to 0, so Build 1 callers keep their behaviour.
 */
import { STEP_PX } from './heightStep';
import type { MapState } from '../sim/map';
import { rotateSlopeMask, viewSize, viewToMap, type ViewRotation } from './view';

export const TILE_W = 64;
export const TILE_H = 32;
export { STEP_PX, setStepPx } from './heightStep';

const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

/** Screen position (world pixels, zoom 1) of the top corner of tile (x, y) at height z. */
export function tileToScreen(x: number, y: number, z: number): { sx: number; sy: number } {
  return { sx: (x - y) * HALF_W, sy: (x + y) * HALF_H - z * STEP_PX };
}

/** Inverse at height `z` (default 0). Returns fractional tile coordinates. */
export function screenToTileExact(sx: number, sy: number, z = 0): { x: number; y: number } {
  const syz = sy + z * STEP_PX;
  const a = sx / HALF_W;
  const b = syz / HALF_H;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Tile under a world-pixel point on a flat plane at height `z`. */
export function screenToTileFlat(sx: number, sy: number, z = 0): { x: number; y: number } {
  const t = screenToTileExact(sx, sy, z);
  return { x: Math.floor(t.x), y: Math.floor(t.y) };
}

/** Slope mask bits (Phase 4 §4.1): N = (x, y), E = (x + 1, y), S = (x + 1, y + 1), W = (x, y + 1). */
export const SLOPE_N = 1;
export const SLOPE_E = 2;
export const SLOPE_S = 4;
export const SLOPE_W = 8;

/** Corner heights [N, E, S, W] of tile `i` in height steps. */
export function cornerHeights(map: MapState, i: number): [number, number, number, number] {
  const h = map.heights[i] ?? 0;
  const s = map.slope[i] ?? 0;
  return [h + (s & SLOPE_N ? 1 : 0), h + (s & SLOPE_E ? 1 : 0), h + (s & SLOPE_S ? 1 : 0), h + (s & SLOPE_W ? 1 : 0)];
}

/**
 * Height (steps) of the ground surface at continuous map point (fx, fy): bilinear over the corners of the tile under
 * it (the same surface the terrain painter draws paths and decals on). Points off the map use the nearest edge tile.
 */
export function surfaceHeight(map: Pick<MapState, 'width' | 'height' | 'heights' | 'slope'>, fx: number, fy: number): number {
  let x = Math.floor(fx);
  let y = Math.floor(fy);
  if (x < 0) x = 0;
  else if (x >= map.width) x = map.width - 1;
  if (y < 0) y = 0;
  else if (y >= map.height) y = map.height - 1;
  const i = y * map.width + x;
  const h = (map.heights[i] as number | undefined) ?? 0;
  const s = (map.slope[i] as number | undefined) ?? 0;
  if (s === 0) return h;
  let u = fx - x;
  let v = fy - y;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  v = v < 0 ? 0 : v > 1 ? 1 : v;
  return h + (1 - u) * (1 - v) * (s & SLOPE_N ? 1 : 0) + u * (1 - v) * (s & SLOPE_E ? 1 : 0) + u * v * (s & SLOPE_S ? 1 : 0) + (1 - u) * v * (s & SLOPE_W ? 1 : 0);
}

/** Lowest base height and highest corner height on the map. */
export function heightRange(map: MapState): { zMin: number; zMax: number } {
  const hs = map.heights;
  const sl = map.slope;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i] as number;
    if (h < zMin) zMin = h;
    const top = h + ((sl[i] as number) !== 0 ? 1 : 0);
    if (top > zMax) zMax = top;
  }
  if (zMin === Infinity) return { zMin: 0, zMax: 0 };
  return { zMin, zMax };
}

/** World-pixel box that holds every tile top face of the map as seen with view rotation `r`. */
export function mapScreenBox(map: MapState, r: ViewRotation = 0): { minX: number; minY: number; maxX: number; maxY: number } {
  const { zMin, zMax } = heightRange(map);
  const vs = viewSize(map, r);
  return {
    minX: -vs.h * HALF_W,
    maxX: vs.w * HALF_W,
    minY: -zMax * STEP_PX,
    maxY: (vs.w + vs.h) * HALF_H - zMin * STEP_PX,
  };
}

/**
 * Does the drawn top face of a sloped tile (x, y) contain world point (sx, sy)?
 * The face is two planar triangles split along the W–E diagonal: N-E-W (u + v ≤ 1) and E-S-W.
 */
function slopedFaceContains(x: number, y: number, c: readonly [number, number, number, number], sx: number, sy: number): boolean {
  const [hN, hE, hS, hW] = c;
  const A = sx / HALF_W - (x - y);
  const C = sy - (x + y) * HALF_H;
  // Triangle N-E-W: Z = hN + (hE − hN)·u + (hW − hN)·v.
  {
    const c0 = hN;
    const cu = hE - hN;
    const cv = hW - hN;
    const v = (C + STEP_PX * c0 - HALF_H * A + STEP_PX * cu * A) / (TILE_H - STEP_PX * (cu + cv));
    const u = v + A;
    if (u >= 0 && v >= 0 && u + v <= 1) return true;
  }
  // Triangle E-S-W: Z = (hW + hE − hS) + (hS − hW)·u + (hS − hE)·v.
  {
    const c0 = hW + hE - hS;
    const cu = hS - hW;
    const cv = hS - hE;
    const v = (C + STEP_PX * c0 - HALF_H * A + STEP_PX * cu * A) / (TILE_H - STEP_PX * (cu + cv));
    const u = v + A;
    if (u < 1 && v < 1 && u + v > 1) return true;
  }
  return false;
}

/** Scratch corner record for `pickTile` (no allocation per candidate). */
const pickCorners: [number, number, number, number] = [0, 0, 0, 0];

/**
 * Map tile index under a world-pixel point, or null when no tile top face contains it.
 * Walks candidate view tiles front-to-back along the screen column (largest u + v first), turns each back into a
 * map tile with the inverse table (Phase 4 §4.8), and returns the first whose drawn top face (height and slope as
 * seen in the view) contains the point. On a flat map this equals `screenToTileFlat` at the ground height, then the
 * inverse table.
 */
export function pickTile(map: MapState, sx: number, sy: number, r: ViewRotation = 0): number | null {
  const { zMin, zMax } = heightRange(map);
  const a = sx / HALF_W;
  const fa = Math.floor(a);
  const sHi = Math.floor((sy + zMax * STEP_PX) / HALF_H) + 1;
  const sLo = Math.floor((sy + zMin * STEP_PX) / HALF_H) - 1;
  const w = map.width;
  const vs = viewSize(map, r);
  for (let s = sHi; s >= sLo; s--) {
    // u − v must have the parity of s; it is floor(a) or floor(a) + 1.
    const k = ((s - fa) & 1) === 0 ? fa : fa + 1;
    const u = (s + k) / 2;
    const v = (s - k) / 2;
    if (u < 0 || v < 0 || u >= vs.w || v >= vs.h) continue;
    const m = r === 0 ? { x: u, y: v } : viewToMap(u, v, r, w, map.height);
    const i = m.y * w + m.x;
    const slope = map.slope[i] as number;
    const h = map.heights[i] as number;
    if (slope === 0) {
      const t = screenToTileExact(sx, sy, h);
      if (Math.floor(t.x) === u && Math.floor(t.y) === v) return i;
    } else {
      const vm = rotateSlopeMask(slope, r);
      pickCorners[0] = h + (vm & 1);
      pickCorners[1] = h + ((vm >> 1) & 1);
      pickCorners[2] = h + ((vm >> 2) & 1);
      pickCorners[3] = h + ((vm >> 3) & 1);
      if (slopedFaceContains(u, v, pickCorners, sx, sy)) return i;
    }
  }
  return null;
}
