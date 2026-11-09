/** Camera control helpers for input (Phase 0 §4.9–4.10). Owner: W1-B. Pure; uses the W1-A camera contract. */
import { clampCamera } from '../render/camera';
import { STEP_PX, TILE_H, TILE_W, tileToScreen } from '../render/iso';
import type { Camera } from '../render/types';
import type { MapState } from '../sim/map';

export const CAMERA_MARGIN_TILES = 4;
export const WHEEL_ZOOM_FACTOR = 1.15;
export const KEY_ZOOM_FACTOR = 1.15;

/** World-pixel box the camera centre must stay in: the map's screen box plus a 4-tile margin. */
export function mapCameraBox(map: MapState): { minX: number; minY: number; maxX: number; maxY: number } {
  const z = map.heights[0] ?? 0;
  const mx = CAMERA_MARGIN_TILES * TILE_W;
  const my = CAMERA_MARGIN_TILES * TILE_H;
  return {
    minX: -map.height * (TILE_W / 2) - mx,
    maxX: map.width * (TILE_W / 2) + mx,
    minY: -z * STEP_PX - my,
    maxY: (map.width + map.height) * (TILE_H / 2) - z * STEP_PX + my,
  };
}

export function clampToMap(cam: Camera, map: MapState): void {
  clampCamera(cam, mapCameraBox(map));
}

/** Drag the map by a screen-pixel delta (the map follows the finger), then clamp. */
export function panCamera(cam: Camera, dxScreen: number, dyScreen: number, map: MapState): void {
  cam.centerX -= dxScreen / cam.zoom;
  cam.centerY -= dyScreen / cam.zoom;
  clampToMap(cam, map);
}

export function centerOnMap(cam: Camera, map: MapState): void {
  const c = tileToScreen(map.width / 2, map.height / 2, map.heights[0] ?? 0);
  cam.centerX = c.sx;
  cam.centerY = c.sy;
  clampToMap(cam, map);
}

/** Centre the camera on the middle of tile `i`. */
export function centerOnTile(cam: Camera, map: MapState, i: number): void {
  const x = i % map.width;
  const y = Math.floor(i / map.width);
  const c = tileToScreen(x + 0.5, y + 0.5, map.heights[i] ?? 0);
  cam.centerX = c.sx;
  cam.centerY = c.sy;
  clampToMap(cam, map);
}

/**
 * Zoom factor for one wheel event: ×1.15 per notch (100 px or 3 lines), at most one notch per event.
 * Negative deltaY (wheel up) zooms in.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  if (deltaY === 0) return 1;
  const perNotch = deltaMode === 1 ? 3 : deltaMode === 2 ? 1 : 100;
  const notches = Math.max(-1, Math.min(1, -deltaY / perNotch));
  return WHEEL_ZOOM_FACTOR ** notches;
}
