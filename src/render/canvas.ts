/** Offscreen canvas factory and sprite building. Owner: W1-A. */
import type { ArtBounds } from './sprites/rides';
import type { Ctx } from './sprites/shapes';
import type { Sprite } from './spriteCache';

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export function makeCanvas(w: number, h: number): { canvas: AnyCanvas; ctx: Ctx } {
  let canvas: AnyCanvas;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    canvas = c;
  } else {
    canvas = new OffscreenCanvas(w, h);
  }
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('Canvas 2D is not available');
  return { canvas, ctx };
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
