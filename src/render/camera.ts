/** Camera math (Phase 0 §4.9). Owner: W1-A. Signatures are a contract. */
import type { Camera } from './types';

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
  cam.zoom = Math.min(2, Math.max(0.25, cam.zoom * factor));
  const after = screenToWorld(cam, px, py, viewW, viewH);
  cam.centerX += before.x - after.x;
  cam.centerY += before.y - after.y;
}

/** Keep the camera centre inside a world-pixel box. */
export function clampCamera(cam: Camera, box: { minX: number; minY: number; maxX: number; maxY: number }): void {
  cam.centerX = Math.min(box.maxX, Math.max(box.minX, cam.centerX));
  cam.centerY = Math.min(box.maxY, Math.max(box.minY, cam.centerY));
}
