/**
 * Terrain and water editing contracts (Phase 4 §4.1, §4.3). Owner: W3-A.
 * Terrain has no slice of its own: heights, slopes, water, and terrain types live in `MapState` (map.ts).
 */
import type { TerrainCode } from '../map';

/** Tile corners: N = (x, y), E = (x + 1, y), S = (x + 1, y + 1), W = (x, y + 1). Slope mask bits 1, 2, 4, 8. */
export type Corner = 0 | 1 | 2 | 3;
export const CORNER_BIT: readonly [1, 2, 4, 8] = [1, 2, 4, 8];

/** Brush tools: size 1, 3, 5, or 7, centred on the tile. */
export type BrushSize = 1 | 3 | 5 | 7;

/** Corner heights [N, E, S, W] in height steps. */
export type CornerHeights = readonly [number, number, number, number];

/** Result of the normalize rule for one tile (Phase 4 §4.1). */
export interface NormalizedTile {
  height: number;
  slope: number;
}

export type { TerrainCode };
