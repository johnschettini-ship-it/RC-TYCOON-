/**
 * Camera control helpers for input (Phase 0 §4.9–4.10, Phase 4 §4.8). Owner: W1-B, W3-G. Pure; uses the W1-A
 * camera contract. With a view rotation (`cam.rotation`) every map position goes through the table in
 * `render/view.ts` first.
 */
import { clampCamera } from '../render/camera';
import { pickTile, STEP_PX, TILE_H, TILE_W } from '../render/iso';
import type { Camera } from '../render/types';
import { mapToViewContinuous, rotateCameraView, viewSize, type ViewRotation } from '../render/view';
import type { MapState } from '../sim/map';

export const CAMERA_MARGIN_TILES = 4;
export const WHEEL_ZOOM_FACTOR = 1.15;
export const KEY_ZOOM_FACTOR = 1.15;

/** World-pixel box the camera centre must stay in: the map's screen box (as seen with rotation `r`) plus a 4-tile margin. */
export function mapCameraBox(map: MapState, r: ViewRotation = 0): { minX: number; minY: number; maxX: number; maxY: number } {
  const z = map.heights[0] ?? 0;
  const mx = CAMERA_MARGIN_TILES * TILE_W;
  const my = CAMERA_MARGIN_TILES * TILE_H;
  const vs = viewSize(map, r);
  return {
    minX: -vs.h * (TILE_W / 2) - mx,
    maxX: vs.w * (TILE_W / 2) + mx,
    minY: -z * STEP_PX - my,
    maxY: (vs.w + vs.h) * (TILE_H / 2) - z * STEP_PX + my,
  };
}

export function clampToMap(cam: Camera, map: MapState): void {
  clampCamera(cam, mapCameraBox(map, cam.rotation));
}

/** Drag the map by a screen-pixel delta (the map follows the finger), then clamp. */
export function panCamera(cam: Camera, dxScreen: number, dyScreen: number, map: MapState): void {
  cam.centerX -= dxScreen / cam.zoom;
  cam.centerY -= dyScreen / cam.zoom;
  clampToMap(cam, map);
}

/** World point (zoom 1 px) of continuous map position (fx, fy) at height z, as seen with view rotation `r`. */
export function mapPointToWorld(map: Pick<MapState, 'width' | 'height'>, fx: number, fy: number, z: number, r: ViewRotation): { sx: number; sy: number } {
  const p = mapToViewContinuous(fx, fy, r, map.width, map.height);
  return { sx: (p.u - p.v) * (TILE_W / 2), sy: (p.u + p.v) * (TILE_H / 2) - z * STEP_PX };
}

/** World point of the centre of tile `i` on its ground, as seen with view rotation `r`. */
export function tileCentreWorld(map: MapState, i: number, r: ViewRotation): { sx: number; sy: number } {
  const x = i % map.width;
  const y = Math.floor(i / map.width);
  return mapPointToWorld(map, x + 0.5, y + 0.5, map.heights[i] ?? 0, r);
}

export function centerOnMap(cam: Camera, map: MapState): void {
  const c = mapPointToWorld(map, map.width / 2, map.height / 2, map.heights[0] ?? 0, cam.rotation);
  cam.centerX = c.sx;
  cam.centerY = c.sy;
  clampToMap(cam, map);
}

/** Centre the camera on the middle of tile `i`. */
export function centerOnTile(cam: Camera, map: MapState, i: number): void {
  const c = tileCentreWorld(map, i, cam.rotation);
  cam.centerX = c.sx;
  cam.centerY = c.sy;
  clampToMap(cam, map);
}

/**
 * Turn the view one step (`]` / clockwise = 1, `[` / counter-clockwise = −1, Phase 4 §4.8), keeping the map point
 * under the screen centre: the ground of the tile picked there (or the camera's plane when the centre is off the map).
 */
export function rotateView(cam: Camera, map: MapState, dir: 1 | -1): void {
  const tile = pickTile(map, cam.centerX, cam.centerY, cam.rotation);
  rotateCameraView(cam, map, dir, tile === null ? undefined : (map.heights[tile] as number));
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
