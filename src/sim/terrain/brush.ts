/**
 * Tiles a terrain or water tool covers (Phase 4 §4.1, §4.3). Owner: W3-A. Pure. Every list is in ascending tile
 * index (row-major) so "the first reason" of a brush is deterministic.
 */
import { BRUSH_SIZES } from '../../data/tuning/terrain';
import type { MapState } from '../map';
import type { BrushSize, Corner } from './types';

export function isBrushSize(size: unknown): size is BrushSize {
  return (BRUSH_SIZES as readonly unknown[]).includes(size);
}

/** Inclusive tile rectangle clipped to the map, or null when nothing is left. */
export interface TileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function clipRect(map: Pick<MapState, 'width' | 'height'>, ax: number, ay: number, bx: number, by: number): TileRect | null {
  const x0 = Math.max(0, Math.min(ax, bx));
  const y0 = Math.max(0, Math.min(ay, by));
  const x1 = Math.min(map.width - 1, Math.max(ax, bx));
  const y1 = Math.min(map.height - 1, Math.max(ay, by));
  return x0 > x1 || y0 > y1 ? null : { x0, y0, x1, y1 };
}

/** The `size` × `size` square centred on (x, y), clipped to the map. */
export function brushRect(map: Pick<MapState, 'width' | 'height'>, x: number, y: number, size: BrushSize): TileRect | null {
  const half = (size - 1) / 2;
  return clipRect(map, x - half, y - half, x + half, y + half);
}

export function rectTiles(map: Pick<MapState, 'width'>, r: TileRect | null): number[] {
  const out: number[] = [];
  if (!r) return out;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) out.push(y * map.width + x);
  return out;
}

/** Brush tiles in ascending index order (empty when the brush is fully off the map). */
export function brushTiles(map: Pick<MapState, 'width' | 'height'>, x: number, y: number, size: BrushSize): number[] {
  return rectTiles(map, brushRect(map, x, y, size));
}

/** Map vertex (corner point) of corner `corner` of tile (x, y): N = (x, y), E = (x + 1, y), S = (x + 1, y + 1), W = (x, y + 1). */
export function cornerVertex(x: number, y: number, corner: Corner): { vx: number; vy: number } {
  return { vx: x + (corner === 1 || corner === 2 ? 1 : 0), vy: y + (corner === 2 || corner === 3 ? 1 : 0) };
}

/** A tile that touches a vertex, and which of its corners sits on it. */
export interface VertexTile {
  tile: number;
  corner: Corner;
}

/**
 * The up to 4 map tiles that share vertex (vx, vy), in ascending tile index: (vx − 1, vy − 1) by its S corner,
 * (vx, vy − 1) by W, (vx − 1, vy) by E, (vx, vy) by N.
 */
export function vertexTiles(map: Pick<MapState, 'width' | 'height'>, vx: number, vy: number): VertexTile[] {
  const out: VertexTile[] = [];
  const add = (x: number, y: number, corner: Corner): void => {
    if (x >= 0 && y >= 0 && x < map.width && y < map.height) out.push({ tile: y * map.width + x, corner });
  };
  add(vx - 1, vy - 1, 2);
  add(vx, vy - 1, 3);
  add(vx - 1, vy, 1);
  add(vx, vy, 0);
  return out;
}
