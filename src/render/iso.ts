/** Isometric math (Phase 0 §4.7, master 6.4). Owner: W1-A. Signatures are a contract. */
import type { MapState } from '../sim/map';

export const TILE_W = 64;
export const TILE_H = 32;
export const STEP_PX = 8;

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

/** World-pixel box that holds every tile top face of the map. */
export function mapScreenBox(map: MapState): { minX: number; minY: number; maxX: number; maxY: number } {
  const { zMin, zMax } = heightRange(map);
  return {
    minX: -map.height * HALF_W,
    maxX: map.width * HALF_W,
    minY: -zMax * STEP_PX,
    maxY: (map.width + map.height) * HALF_H - zMin * STEP_PX,
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

/**
 * Tile index under a world-pixel point, or null when no tile top face contains it.
 * Walks candidate tiles front-to-back along the screen column (largest x + y first) and returns the
 * first whose drawn top face (height and slope) contains the point. On a flat map this equals
 * `screenToTileFlat` at the ground height.
 */
export function pickTile(map: MapState, sx: number, sy: number): number | null {
  const { zMin, zMax } = heightRange(map);
  const a = sx / HALF_W;
  const fa = Math.floor(a);
  const sHi = Math.floor((sy + zMax * STEP_PX) / HALF_H) + 1;
  const sLo = Math.floor((sy + zMin * STEP_PX) / HALF_H) - 1;
  const w = map.width;
  for (let s = sHi; s >= sLo; s--) {
    // x − y must have the parity of s; it is floor(a) or floor(a) + 1.
    const k = ((s - fa) & 1) === 0 ? fa : fa + 1;
    const x = (s + k) / 2;
    const y = (s - k) / 2;
    if (x < 0 || y < 0 || x >= w || y >= map.height) continue;
    const i = y * w + x;
    if ((map.slope[i] as number) === 0) {
      const t = screenToTileExact(sx, sy, map.heights[i] as number);
      if (Math.floor(t.x) === x && Math.floor(t.y) === y) return i;
    } else if (slopedFaceContains(x, y, cornerHeights(map, i), sx, sy)) {
      return i;
    }
  }
  return null;
}
