/**
 * View rotation (Phase 4 §4.8). Owner: W3-G. Signatures are a contract for every Wave 3 render and input module:
 * new drawing code projects map coordinates through `mapToView` (then the master 6.4 formula on (u, v, z)),
 * turns object sprites with `viewSpriteRotation`, slope masks with `rotateSlopeMask`, and picks with `viewToMap`.
 *
 * `r` ∈ {0, 1, 2, 3}: each step turns the view 90° clockwise. Map → view for a tile (map size W × H):
 * | r | u           | v           |
 * | 0 | x           | y           |
 * | 1 | (H − 1) − y | x           |
 * | 2 | (W − 1) − x | (H − 1) − y |
 * | 3 | y           | (W − 1) − x |
 * Continuous positions use W and H in place of W − 1 and H − 1.
 *
 * The pure table functions have real bodies (W3-G owns their tests). The renderer turns every Build 1 object with
 * them: terrain chunks are painted in view space, depth sorts by u + v, sprite cache keys hold the view rotation, and
 * picking runs through the inverse (`pickTile(map, sx, sy, r)` in `./iso.ts`). Hot loops use `viewAffine`.
 */
import { STEP_PX } from './heightStep';
import type { Dir, MapState } from '../sim/map';
import type { Camera } from './types';

export type ViewRotation = Dir;

export interface ViewPoint {
  u: number;
  v: number;
}

/** Tile (x, y) → view tile (u, v). */
export function mapToView(x: number, y: number, r: ViewRotation, w: number, h: number): ViewPoint {
  switch (r) {
    case 1:
      return { u: h - 1 - y, v: x };
    case 2:
      return { u: w - 1 - x, v: h - 1 - y };
    case 3:
      return { u: y, v: w - 1 - x };
    default:
      return { u: x, v: y };
  }
}

/** View tile (u, v) → map tile (x, y): the inverse of `mapToView`. */
export function viewToMap(u: number, v: number, r: ViewRotation, w: number, h: number): { x: number; y: number } {
  switch (r) {
    case 1:
      return { x: v, y: h - 1 - u };
    case 2:
      return { x: w - 1 - u, y: h - 1 - v };
    case 3:
      return { x: w - 1 - v, y: u };
    default:
      return { x: u, y: v };
  }
}

/** Continuous map position (fx, fy) → view position (W and H in place of W − 1 and H − 1). */
export function mapToViewContinuous(fx: number, fy: number, r: ViewRotation, w: number, h: number): ViewPoint {
  switch (r) {
    case 1:
      return { u: h - fy, v: fx };
    case 2:
      return { u: w - fx, v: h - fy };
    case 3:
      return { u: fy, v: w - fx };
    default:
      return { u: fx, v: fy };
  }
}

/** Map size as seen in the view: W and H swap at r = 1 and 3. */
export function viewSize(map: Pick<MapState, 'width' | 'height'>, r: ViewRotation): { w: number; h: number } {
  return r % 2 === 1 ? { w: map.height, h: map.width } : { w: map.width, h: map.height };
}

/** A slope mask (bits N = 1, E = 2, S = 4, W = 8) as seen in the view: rotated by `r` positions in N → E → S → W order. */
export function rotateSlopeMask(mask: number, r: ViewRotation): number {
  const m = mask & 15;
  return ((m << r) | (m >> (4 - r))) & 15;
}

/** Sprite rotation of an object with map rotation `rotation`: `(rotation + r) mod 4`. */
export function viewSpriteRotation(rotation: Dir, r: ViewRotation): Dir {
  return ((rotation + r) % 4) as Dir;
}

/** The map rotation a new object gets when the player chose `viewRotation` in view terms: `(viewRotation − r) mod 4`. */
export function mapRotationFromView(viewRotation: Dir, r: ViewRotation): Dir {
  return (((viewRotation - r) % 4) + 4) % 4 as Dir;
}

/** A map direction (N, E, S, W) as seen in the view: `(dir + r) mod 4`, like sprites and slope bits. */
export function viewDir(dir: Dir, r: ViewRotation): Dir {
  return ((dir + r) & 3) as Dir;
}

/** View position (u, v) → continuous map position: the inverse of `mapToViewContinuous`. */
export function viewToMapContinuous(u: number, v: number, r: ViewRotation, w: number, h: number): { x: number; y: number } {
  switch (r) {
    case 1:
      return { x: v, y: h - u };
    case 2:
      return { x: w - u, y: h - v };
    case 3:
      return { x: w - v, y: u };
    default:
      return { x: u, y: v };
  }
}

/**
 * The table as an affine map, for hot loops (no switch, no allocation per call):
 * continuous `u = ux·fx + uy·fy + u0`, `v = vx·fx + vy·fy + v0`; tiles use `tu0`, `tv0` in place of `u0`, `v0`.
 */
export interface ViewAffine {
  r: ViewRotation;
  /** Map size. */
  w: number;
  h: number;
  ux: number;
  uy: number;
  u0: number;
  vx: number;
  vy: number;
  v0: number;
  tu0: number;
  tv0: number;
}

export function viewAffine(r: ViewRotation, w: number, h: number, out?: ViewAffine): ViewAffine {
  const a = out ?? { r: 0, w: 0, h: 0, ux: 1, uy: 0, u0: 0, vx: 0, vy: 1, v0: 0, tu0: 0, tv0: 0 };
  a.r = r;
  a.w = w;
  a.h = h;
  switch (r) {
    case 1:
      a.ux = 0;
      a.uy = -1;
      a.u0 = h;
      a.vx = 1;
      a.vy = 0;
      a.v0 = 0;
      break;
    case 2:
      a.ux = -1;
      a.uy = 0;
      a.u0 = w;
      a.vx = 0;
      a.vy = -1;
      a.v0 = h;
      break;
    case 3:
      a.ux = 0;
      a.uy = 1;
      a.u0 = 0;
      a.vx = -1;
      a.vy = 0;
      a.v0 = w;
      break;
    default:
      a.ux = 1;
      a.uy = 0;
      a.u0 = 0;
      a.vx = 0;
      a.vy = 1;
      a.v0 = 0;
  }
  // Tile (x, y) → view tile: the continuous map of the tile centre, less half a tile.
  a.tu0 = a.u0 + (a.ux + a.uy) / 2 - 0.5;
  a.tv0 = a.v0 + (a.vx + a.vy) / 2 - 0.5;
  return a;
}

/** Corner heights [N, E, S, W] of map tile `i` as seen in the view (the slope mask turned by `r`). */
export function viewCornerHeights(
  map: Pick<MapState, 'heights' | 'slope'>,
  i: number,
  r: ViewRotation,
  out: [number, number, number, number] = [0, 0, 0, 0],
): [number, number, number, number] {
  const h = (map.heights[i] as number | undefined) ?? 0;
  const m = rotateSlopeMask((map.slope[i] as number | undefined) ?? 0, r);
  out[0] = h + (m & 1);
  out[1] = h + ((m >> 1) & 1);
  out[2] = h + ((m >> 2) & 1);
  out[3] = h + ((m >> 3) & 1);
  return out;
}

/** Master 6.4 projection constants (`./iso.ts`), repeated so this module stays free of imports. */
const HALF_W = 32;
const HALF_H = 16;

/**
 * Height (steps) of the ground under the camera centre on a full map: the base height of the tile the centre ray
 * meets, found by a few fixed-point steps (exact on flat ground and on plateaus). 0 without height data.
 */
function centreHeight(cam: Camera, map: Pick<MapState, 'width' | 'height'> & Partial<Pick<MapState, 'heights'>>): number {
  const hs = map.heights;
  if (!hs || hs.length === 0) return 0;
  const r = cam.rotation;
  let z = hs[0] as number;
  for (let k = 0; k < 4; k++) {
    const a = cam.centerX / HALF_W;
    const b = (cam.centerY + z * STEP_PX) / HALF_H;
    const p = viewToMapContinuous((a + b) / 2, (b - a) / 2, r, map.width, map.height);
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) break;
    const next = hs[y * map.width + x] as number;
    if (next === z) break;
    z = next;
  }
  return z;
}

/**
 * Turn the view by one step (`dir` 1 = clockwise `]`, −1 = counter-clockwise `[`), keeping the same map point at
 * the screen centre (Phase 4 §4.8). The point is the centre ray at height `z` (steps); without `z` it is the ground
 * height there when `map` carries heights, else 0. Input passes the height of the picked centre tile.
 */
export function rotateCameraView(cam: Camera, map: Pick<MapState, 'width' | 'height'>, dir: 1 | -1, z?: number): void {
  const zz = z ?? centreHeight(cam, map as Pick<MapState, 'width' | 'height'> & Partial<Pick<MapState, 'heights'>>);
  const a = cam.centerX / HALF_W;
  const b = (cam.centerY + zz * STEP_PX) / HALF_H;
  const p = viewToMapContinuous((a + b) / 2, (b - a) / 2, cam.rotation, map.width, map.height);
  const r = ((cam.rotation + (dir > 0 ? 1 : 3)) & 3) as ViewRotation;
  const q = mapToViewContinuous(p.x, p.y, r, map.width, map.height);
  cam.rotation = r;
  cam.centerX = (q.u - q.v) * HALF_W;
  cam.centerY = (q.u + q.v) * HALF_H - zz * STEP_PX;
}

// ------------------------------------------------------------------ projection with the view (hot loops)

/** View tile u of map tile (x, y). */
export function viewTileU(a: ViewAffine, x: number, y: number): number {
  return a.ux * x + a.uy * y + a.tu0;
}

/** View tile v of map tile (x, y). */
export function viewTileV(a: ViewAffine, x: number, y: number): number {
  return a.vx * x + a.vy * y + a.tv0;
}

/** World px x (zoom 1, master 6.4 on (u, v, z)) of the top corner of map tile (x, y) as seen in the view. */
export function viewTileSX(a: ViewAffine, x: number, y: number): number {
  return ((a.ux - a.vx) * x + (a.uy - a.vy) * y + a.tu0 - a.tv0) * HALF_W;
}

/** World px y of the top corner of map tile (x, y) at height `z` (steps) as seen in the view. */
export function viewTileSY(a: ViewAffine, x: number, y: number, z: number): number {
  return ((a.ux + a.vx) * x + (a.uy + a.vy) * y + a.tu0 + a.tv0) * HALF_H - z * STEP_PX;
}

/** World px x of continuous map point (fx, fy) as seen in the view. */
export function viewPointSX(a: ViewAffine, fx: number, fy: number): number {
  return ((a.ux - a.vx) * fx + (a.uy - a.vy) * fy + a.u0 - a.v0) * HALF_W;
}

/** World px y of continuous map point (fx, fy) at height `z` (steps) as seen in the view. */
export function viewPointSY(a: ViewAffine, fx: number, fy: number, z: number): number {
  return ((a.ux + a.vx) * fx + (a.uy + a.vy) * fy + a.u0 + a.v0) * HALF_H - z * STEP_PX;
}
