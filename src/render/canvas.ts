/** Offscreen canvas factory and sprite building. Owner: W1-A. */
import type { ArtBounds } from './sprites/rides';
import type { Ctx } from './sprites/shapes';
import type { Sprite } from './spriteCache';

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** Canvases made so far (sprites, chunk images, layers): the perf overlay's cache-churn figure. */
export const canvasStats = { made: 0 };

/** `opaque`: a canvas with no alpha channel (every pixel is drawn; copies of it need no blending). */
export function makeCanvas(w: number, h: number, opaque = false): { canvas: AnyCanvas; ctx: Ctx } {
  canvasStats.made++;
  let canvas: AnyCanvas;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    canvas = c;
  } else {
    canvas = new OffscreenCanvas(w, h);
  }
  const ctx = (opaque ? canvas.getContext('2d', { alpha: false }) : canvas.getContext('2d')) as Ctx | null;
  if (!ctx) throw new Error('Canvas 2D is not available');
  return { canvas, ctx };
}

/**
 * Phone-sized screens (either CSS side below this) get the phone budgets: a capped canvas pixel ratio and the
 * 32 MB terrain chunk cache (Phase 4 §11).
 */
export const PHONE_SCREEN_MAX_CSS = 600;
/**
 * Canvas pixel ratio cap on phone-sized screens. Build 1 finding: the phone frame rate is bound by drawing a
 * full-DPR canvas (2.6 × 2.6 device px per CSS px on a Pixel 7). At 2 the art stays sharp (sprites are built at
 * the zoom-2 bucket) and the canvas has about 40% fewer pixels.
 */
export const PHONE_MAX_PIXEL_RATIO = 2;

export function isPhoneScreen(cssW: number, cssH: number): boolean {
  return Math.min(cssW, cssH) < PHONE_SCREEN_MAX_CSS;
}

/** Device pixels per CSS pixel for the game canvas: the device ratio, capped on phone-sized screens. */
export function canvasPixelRatio(cssW: number, cssH: number, dpr: number): number {
  const d = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  return isPhoneScreen(cssW, cssH) ? Math.min(d, PHONE_MAX_PIXEL_RATIO) : d;
}

const PAD = 2;

/**
 * Draw `paint` (world-pixel coordinates around the anchor) into a new canvas at `scale` image pixels
 * per world pixel. An optional `tint` washes every drawn pixel (ghosts).
 */
export function buildSprite(bounds: ArtBounds, scale: number, paint: (ctx: Ctx) => void, tint: string | null = null): Sprite {
  const w = Math.max(1, Math.ceil((bounds.right - bounds.left) * scale) + PAD * 2);
  const h = Math.max(1, Math.ceil((bounds.bottom - bounds.top) * scale) + PAD * 2);
  const { canvas, ctx } = makeCanvas(w, h);
  const ox = PAD - bounds.left * scale;
  const oy = PAD - bounds.top * scale;
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  paint(ctx);
  if (tint) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
  return { image: canvas, w, h, ox, oy, scale };
}
