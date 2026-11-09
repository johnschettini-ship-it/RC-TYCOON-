/**
 * Edge scrolling (Phase 6 §4.9 Controls, desktop): with the setting on, a mouse resting near an edge of the map
 * canvas pans toward that edge. Owner: W4-F. Pure.
 */
import { KEY_PAN_SPEED_PX } from './keyboard';

/** Band along each canvas edge that scrolls, in CSS px. */
export const EDGE_SCROLL_PX = 16;
/** Edge scrolling speed in screen px per second at 100% pan speed (the keyboard pan speed). */
export const EDGE_SCROLL_SPEED_PX = KEY_PAN_SPEED_PX;

/** Scroll direction (−1, 0, 1 per axis) for a mouse at (x, y) on a `w` × `h` canvas. Outside the canvas: none. */
export function edgeScrollDir(x: number, y: number, w: number, h: number): { dx: number; dy: number } {
  if (x < 0 || y < 0 || x > w || y > h) return { dx: 0, dy: 0 };
  const dx = x < EDGE_SCROLL_PX ? -1 : x >= w - EDGE_SCROLL_PX ? 1 : 0;
  const dy = y < EDGE_SCROLL_PX ? -1 : y >= h - EDGE_SCROLL_PX ? 1 : 0;
  return { dx, dy };
}
