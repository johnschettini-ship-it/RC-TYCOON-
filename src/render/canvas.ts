/** Offscreen canvas factory and sprite building. Owner: W1-A. */
import { artStyle } from './pixel/style';
import { ART_SCALE, PixelSurface, type SurfaceOptions } from './pixel/surface';
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
 * Phase 8 (§5.1): the log of Pixel builds. Only tests set a member to an array. `hashes` comes in stage 1a-ii and
 * stays null here; `surfaces` is a stage 0 prototype seam for the Node sheet (each Pixel build pushes its surface
 * and image while it is an array).
 */
export const artBuildLog: {
  hashes: number[] | null;
  surfaces: Array<{ surface: PixelSurface; image: AnyCanvas }> | null;
} = { hashes: null, surfaces: null };

/**
 * Phase 8 stage 0 prototype seam: build times and sizes. This file writes `spriteBuildMsMax` (the slowest Pixel
 * sprite build); the terrain writes `chunkBuildMsMax`; the renderer writes the rest. Timing only measures.
 */
export const artBuildStats = {
  spriteBuildMsMax: 0,
  chunkBuildMsMax: 0,
  turnFrameMsMax: 0,
  rideBuildMsMax: 0,
  spriteMb: 0,
  chunkMb: 0,
};

/** Bounds widened to even world pixels, so the anchor is a whole art pixel (§5.1). */
function evenBounds(b: ArtBounds): ArtBounds {
  return {
    left: 2 * Math.floor(b.left / 2),
    right: 2 * Math.ceil(b.right / 2),
    top: 2 * Math.floor(b.top / 2),
    bottom: 2 * Math.ceil(b.bottom / 2),
  };
}

/**
 * The Pixel branch (§5.1 steps 1, 2, 3, 5 and 6 without `artHash`). No tint remap in stage 0 (step 4): a tinted
 * build paints with no tint.
 */
function buildPixelSprite(bounds: ArtBounds, paint: (ctx: Ctx) => void, opts?: SurfaceOptions): Sprite {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const s = new PixelSurface(evenBounds(bounds), opts);
  paint(s as unknown as Ctx);
  s.finish();
  const { canvas, ctx } = makeCanvas(s.w, s.h);
  s.blitTo(ctx);
  if (artBuildLog.surfaces) artBuildLog.surfaces.push({ surface: s, image: canvas });
  if (typeof performance !== 'undefined') {
    const ms = performance.now() - t0;
    if (ms > artBuildStats.spriteBuildMsMax) artBuildStats.spriteBuildMsMax = ms;
  }
  return { image: canvas, w: s.w, h: s.h, ox: s.ox, oy: s.oy, scale: ART_SCALE };
}

/**
 * Draw `paint` (world-pixel coordinates around the anchor) into a new canvas at `scale` image pixels
 * per world pixel. An optional `tint` washes every drawn pixel (ghosts).
 */
export function buildSprite(
  bounds: ArtBounds,
  scale: number,
  paint: (ctx: Ctx) => void,
  tint: string | null = null,
  opts?: SurfaceOptions,
): Sprite {
  if (artStyle() === 'pixel') return buildPixelSprite(bounds, paint, opts);
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
