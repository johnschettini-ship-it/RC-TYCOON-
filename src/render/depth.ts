/**
 * Depth ordering (master 6.4): by x + y, then base z, then layer. Owner: W1-A.
 * Depth is the x + y sum of a point in continuous map coordinates. A tile object uses its centre,
 * (x + 0.5) + (y + 0.5) = x + y + 1; a guest uses its interpolated position; a fence uses its edge midpoint.
 */

export const Layer = { Ground: 0, Path: 1, Object: 2, Guest: 3, Overlay: 4 } as const;
export type LayerCode = (typeof Layer)[keyof typeof Layer];

export interface DepthKey {
  depth: number;
  z: number;
  layer: number;
}

export function compareDepth(a: DepthKey, b: DepthKey): number {
  return a.depth - b.depth || a.z - b.z || a.layer - b.layer;
}

/** Depth of a tile-anchored object on tile (x, y). */
export function tileDepth(x: number, y: number): number {
  return x + y + 1;
}

/** Depth of a point in continuous map coordinates (tile (x, y) spans [x, x + 1) × [y, y + 1)). */
export function pointDepth(fx: number, fy: number): number {
  return fx + fy;
}

/** Depth resolution: 1/64 of a tile diagonal. */
const DEPTH_SCALE = 64;
const DEPTH_MAX = 0xffff;
const INDEX_BITS = 20;
const INDEX_SPAN = 2 ** INDEX_BITS;

/**
 * Pack (depth, z, layer) into one non-negative integer that sorts like `compareDepth`.
 * Depth 0–1023 at 1/64 resolution (16 bits), z 0–255 (8 bits), layer 0–7 (3 bits).
 */
export function packDepth(depth: number, z: number, layer: number): number {
  let q = Math.floor(depth * DEPTH_SCALE);
  if (q < 0) q = 0;
  else if (q > DEPTH_MAX) q = DEPTH_MAX;
  let zz = Math.floor(z);
  if (zz < 0) zz = 0;
  else if (zz > 255) zz = 255;
  return (q * 256 + zz) * 8 + (layer & 7);
}

/** Composite sort key: packed depth, then insertion index (stable). Fits in 47 bits. */
export function sortKey(packed: number, index: number): number {
  return packed * INDEX_SPAN + index;
}

export function sortIndex(key: number): number {
  return key % INDEX_SPAN;
}

/** Maximum drawables per frame the packed keys can index. */
export const MAX_DRAWABLES = INDEX_SPAN;

export interface ColumnTile {
  dx: number;
  dy: number;
}

/**
 * Per-tile slices of a multi-tile object with map extent ex × ey (origin at local (0, 0)).
 * The sprite splits into ex + ey screen columns of TILE_W / 2 px, from the left corner of tile
 * (0, ey − 1) to the right corner of tile (ex − 1, 0). Each column is owned by the front-most
 * footprint tile (largest dx + dy) whose diamond covers it; the slice sorts at that tile's depth.
 */
export function footprintColumns(ex: number, ey: number): ColumnTile[] {
  const n = ex + ey;
  const best: ColumnTile[] = [];
  const bestSum: number[] = [];
  for (let k = 0; k < n; k++) {
    best.push({ dx: 0, dy: 0 });
    bestSum.push(-1);
  }
  for (let dy = 0; dy < ey; dy++) {
    for (let dx = 0; dx < ex; dx++) {
      const k0 = dx - dy - 1 + ey;
      for (let k = k0; k <= k0 + 1; k++) {
        if (k < 0 || k >= n) continue;
        if (dx + dy > (bestSum[k] as number)) {
          bestSum[k] = dx + dy;
          best[k] = { dx, dy };
        }
      }
    }
  }
  return best;
}
