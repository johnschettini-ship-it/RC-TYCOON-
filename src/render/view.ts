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
 * The pure table functions have real bodies (W3-G owns their tests). The renderer integration (terrain chunks,
 * depth sort by u + v, sprite cache keys, picking through the inverse) and `rotateCameraView` are W3-G's work.
 */
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

/**
 * Turn the view by one step (`dir` 1 = clockwise `]`, −1 = counter-clockwise `[`), keeping the same map point at
 * the screen centre (Phase 4 §4.8). Stub: no-op (the camera stays at rotation 0 until W3-G's renderer support lands).
 */
export function rotateCameraView(_cam: Camera, _map: Pick<MapState, 'width' | 'height'>, _dir: 1 | -1): void {}
