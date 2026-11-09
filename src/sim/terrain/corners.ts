/**
 * Read-only corner and water helpers (Phase 4 §4.1, §4.3). Owner: W3-A. Real bodies: every Wave 3 card
 * uses them for slope, flatness, clearance, and wet checks. Pure; no state changes.
 */
import type { MapState } from '../map';
import { CORNER_BIT, type Corner, type CornerHeights } from './types';

/** Height of one corner of tile `i`: `height[i] + bit`. */
export function cornerHeight(map: MapState, i: number, corner: Corner): number {
  const h = map.heights[i] as number;
  return h + (((map.slope[i] as number) & CORNER_BIT[corner]) !== 0 ? 1 : 0);
}

/** Corner heights [N, E, S, W] of tile `i`. */
export function cornerHeightsOf(map: MapState, i: number): CornerHeights {
  return [cornerHeight(map, i, 0), cornerHeight(map, i, 1), cornerHeight(map, i, 2), cornerHeight(map, i, 3)];
}

/** Lowest corner = the base height (normalized tiles always have a corner at the base). */
export function minCorner(map: MapState, i: number): number {
  return map.heights[i] as number;
}

/** Highest corner: base + 1 on a sloped tile. */
export function maxCorner(map: MapState, i: number): number {
  return (map.heights[i] as number) + ((map.slope[i] as number) !== 0 ? 1 : 0);
}

export function isFlat(map: MapState, i: number): boolean {
  return (map.slope[i] as number) === 0;
}

/** A tile is wet when its water surface is above its lowest corner (Phase 4 §4.3). */
export function isWet(map: MapState, i: number): boolean {
  return (map.water[i] as number) > minCorner(map, i);
}

/** Water depth in steps (0 when dry). */
export function waterDepth(map: MapState, i: number): number {
  return Math.max(0, (map.water[i] as number) - minCorner(map, i));
}
