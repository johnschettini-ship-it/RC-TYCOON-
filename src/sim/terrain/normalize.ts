/**
 * The normalize rule (Phase 4 §4.1). Owner: W3-A. Pure; every terrain and water edit goes through it, and scenario
 * generation (W3-H) may use it to write heights.
 *
 * 1. `m = min(c)`. Each corner above `m + 1` drops to `m + 1`.
 * 2. `height = m`. `slope` = bits of corners at `m + 1`. If all 4 bits are set, `height = m + 1` and `slope = 0`.
 * 3. Corner heights stay in 0–63. Base height stays in 0–63.
 */
import { MAX_CORNER_HEIGHT } from '../../data/tuning/terrain';
import type { MapState } from '../map';
import { CORNER_BIT, type CornerHeights, type NormalizedTile } from './types';

function clampHeight(v: number): number {
  return v < 0 ? 0 : v > MAX_CORNER_HEIGHT ? MAX_CORNER_HEIGHT : v;
}

/**
 * Height and slope mask of a tile from its 4 corner heights [N, E, S, W]. Inputs outside 0–63 are clamped first
 * (callers reject them before with `"The land cannot go higher"` / `"… lower"`), so the result always has every
 * corner in 0–63.
 */
export function normalizeCorners(c: CornerHeights): NormalizedTile {
  const n = clampHeight(c[0]);
  const e = clampHeight(c[1]);
  const s = clampHeight(c[2]);
  const w = clampHeight(c[3]);
  const m = Math.min(n, e, s, w);
  let slope = 0;
  if (n > m) slope |= CORNER_BIT[0];
  if (e > m) slope |= CORNER_BIT[1];
  if (s > m) slope |= CORNER_BIT[2];
  if (w > m) slope |= CORNER_BIT[3];
  // Unreachable with m = min(c) (one corner is always at m), kept as the spec states it.
  if (slope === 15) return { height: m + 1, slope: 0 };
  return { height: m, slope };
}

/** Normalize `corners` and write the tile's height and slope. Water is not touched (see `dryIfLandAbove`). */
export function setTileCorners(map: MapState, i: number, corners: CornerHeights): void {
  const t = normalizeCorners(corners);
  map.heights[i] = t.height;
  map.slope[i] = t.slope;
}

/**
 * Phase 4 §4.3: land raised to or above the water surface makes the tile dry, so the water normalizes to 0.
 * Returns the water value the tile keeps for base height `height`.
 */
export function waterAfterLandEdit(water: number, height: number): number {
  return water !== 0 && water <= height ? 0 : water;
}
