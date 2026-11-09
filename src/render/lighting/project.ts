/**
 * Allocation-free projection for the light pass and the Light overlay. Owner: W3-F. Same table as `../view.ts`
 * (`mapToViewContinuous`, Phase 4 §4.8) and the master 6.4 formula, writing into scratch objects so the per-frame
 * loops create no garbage.
 */
import type { Dir } from '../../sim/map';

export interface ViewXY {
  u: number;
  v: number;
}

/** Continuous map position → view position (W and H in place of W − 1 and H − 1). */
export function toView(fx: number, fy: number, r: Dir, w: number, h: number, out: ViewXY): ViewXY {
  switch (r) {
    case 1:
      out.u = h - fy;
      out.v = fx;
      break;
    case 2:
      out.u = w - fx;
      out.v = h - fy;
      break;
    case 3:
      out.u = fy;
      out.v = w - fx;
      break;
    default:
      out.u = fx;
      out.v = fy;
  }
  return out;
}

/** View tile (u, v) → map tile index, or −1 outside the map. Inverse of the tile table. */
export function viewTileToIndex(u: number, v: number, r: Dir, w: number, h: number): number {
  let x: number;
  let y: number;
  switch (r) {
    case 1:
      x = v;
      y = h - 1 - u;
      break;
    case 2:
      x = w - 1 - u;
      y = h - 1 - v;
      break;
    case 3:
      x = w - 1 - v;
      y = u;
      break;
    default:
      x = u;
      y = v;
  }
  return x >= 0 && y >= 0 && x < w && y < h ? y * w + x : -1;
}

/** World pixel x of a view position (zoom 1). */
export function worldX(u: number, v: number): number {
  return (u - v) * 32;
}

/** World pixel y of a view position at height `z` steps plus `px` pixels up (zoom 1). */
export function worldY(u: number, v: number, z: number, px = 0): number {
  return (u + v) * 16 - z * 8 - px;
}

export interface TileRange {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  aMin: number;
  aMax: number;
  bMin: number;
  bMax: number;
}

/**
 * View tiles that can show inside the visible world rectangle, with heights up to `zMax` steps: a bounding box in
 * (u, v) plus the diamond limits on `a = u − v` and `b = u + v` to skip the corners of the box.
 */
export function visibleTileRange(view: { x0: number; y0: number; x1: number; y1: number }, vw: number, vh: number, zMax: number, out: TileRange): TileRange {
  out.aMin = Math.floor(view.x0 / 32) - 2;
  out.aMax = Math.ceil(view.x1 / 32) + 2;
  out.bMin = Math.floor(view.y0 / 16) - 3;
  out.bMax = Math.ceil((view.y1 + zMax * 8) / 16) + 3;
  out.u0 = Math.max(0, Math.floor((out.aMin + out.bMin) / 2));
  out.u1 = Math.min(vw - 1, Math.ceil((out.aMax + out.bMax) / 2));
  out.v0 = Math.max(0, Math.floor((out.bMin - out.aMax) / 2));
  out.v1 = Math.min(vh - 1, Math.ceil((out.bMax - out.aMin) / 2));
  return out;
}
