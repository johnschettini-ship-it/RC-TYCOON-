/** Camera math (Phase 0 §4.9). Owner: W1-A. Signatures are a contract. */
import type { MapState } from '../sim/map';
import { mapScreenBox, TILE_H, TILE_W } from './iso';
import type { Camera } from './types';

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 2;
/** Sprite and terrain-chunk scales (Phase 0 §8). */
export const ZOOM_BUCKETS: readonly [0.5, 1, 2] = [0.5, 1, 2];
export type ZoomBucket = 0.5 | 1 | 2;
/** The camera centre may leave the map's screen box by this many tiles. */
export const CAMERA_MARGIN_TILES = 4;

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** World-pixel point under a CSS-pixel screen point. */
export function screenToWorld(cam: Camera, px: number, py: number, viewW: number, viewH: number): { x: number; y: number } {
  return { x: cam.centerX + (px - viewW / 2) / cam.zoom, y: cam.centerY + (py - viewH / 2) / cam.zoom };
}

export function worldToScreen(cam: Camera, wx: number, wy: number, viewW: number, viewH: number): { x: number; y: number } {
  return { x: (wx - cam.centerX) * cam.zoom + viewW / 2, y: (wy - cam.centerY) * cam.zoom + viewH / 2 };
}

/** Zoom by `factor` keeping the world point under screen point (px, py) fixed. Clamps to 0.25–2.0. */
export function zoomAt(cam: Camera, factor: number, px: number, py: number, viewW: number, viewH: number): void {
  const before = screenToWorld(cam, px, py, viewW, viewH);
  cam.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cam.zoom * factor));
  const after = screenToWorld(cam, px, py, viewW, viewH);
  cam.centerX += before.x - after.x;
  cam.centerY += before.y - after.y;
}

/** Keep the camera centre inside a world-pixel box. */
export function clampCamera(cam: Camera, box: Box): void {
  cam.centerX = Math.min(box.maxX, Math.max(box.minX, cam.centerX));
  cam.centerY = Math.min(box.maxY, Math.max(box.minY, cam.centerY));
}

/** The map's screen box plus a margin (default 4 tiles) on every side. */
export function cameraBounds(map: MapState, marginTiles = CAMERA_MARGIN_TILES): Box {
  const b = mapScreenBox(map);
  const mx = marginTiles * TILE_W;
  const my = marginTiles * TILE_H;
  return { minX: b.minX - mx, minY: b.minY - my, maxX: b.maxX + mx, maxY: b.maxY + my };
}

/** Clamp zoom to 0.25–2.0 and the centre to `cameraBounds(map)`. The renderer calls this every frame. */
export function clampCameraToMap(cam: Camera, map: MapState): void {
  if (!(cam.zoom >= ZOOM_MIN)) cam.zoom = ZOOM_MIN;
  else if (cam.zoom > ZOOM_MAX) cam.zoom = ZOOM_MAX;
  if (!Number.isFinite(cam.centerX)) cam.centerX = 0;
  if (!Number.isFinite(cam.centerY)) cam.centerY = 0;
  clampCamera(cam, cameraBounds(map));
}

/** Move the view by a screen-pixel delta (keyboard pan, drag pan). World moves by delta / zoom. */
export function panByScreen(cam: Camera, dx: number, dy: number): void {
  cam.centerX += dx / cam.zoom;
  cam.centerY += dy / cam.zoom;
}

/** Nearest bucket in log scale for an effective device scale (zoom × devicePixelRatio). */
export function zoomBucket(scale: number): ZoomBucket {
  if (scale < Math.SQRT1_2) return 0.5;
  if (scale < Math.SQRT2) return 1;
  return 2;
}
