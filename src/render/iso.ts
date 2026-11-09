/** Isometric math (Phase 0 §4.7, master 6.4). Owner: W1-A. Signatures are a contract. */
import type { MapState } from '../sim/map';

export const TILE_W = 64;
export const TILE_H = 32;
export const STEP_PX = 8;

/** Screen position (world pixels, zoom 1) of the top corner of tile (x, y) at height z. */
export function tileToScreen(x: number, y: number, z: number): { sx: number; sy: number } {
  return { sx: (x - y) * (TILE_W / 2), sy: (x + y) * (TILE_H / 2) - z * STEP_PX };
}

/** Inverse at height `z` (default 0). Returns fractional tile coordinates. */
export function screenToTileExact(sx: number, sy: number, z = 0): { x: number; y: number } {
  const syz = sy + z * STEP_PX;
  const a = sx / (TILE_W / 2);
  const b = syz / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Tile under a world-pixel point on a flat plane at height `z`. */
export function screenToTileFlat(sx: number, sy: number, z = 0): { x: number; y: number } {
  const t = screenToTileExact(sx, sy, z);
  return { x: Math.floor(t.x), y: Math.floor(t.y) };
}

/** Tile index under a world-pixel point, or null outside the map. Height-aware (W1-A refines for slopes). */
export function pickTile(map: MapState, sx: number, sy: number): number | null {
  // Build 1 maps are flat: every tile has the same height.
  const z = map.heights[0] ?? 0;
  const { x, y } = screenToTileFlat(sx, sy, z);
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return y * map.width + x;
}
