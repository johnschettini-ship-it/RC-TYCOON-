/**
 * Tint masks: a pre-rendered sprite sheet ships with a mask sheet whose red channel marks pixels
 * (shirts, ride colours) to be recoloured. Frames are tinted one at a time, as they are drawn, into the shared tint
 * atlas (`./tintAtlas.ts`, Task 4); no whole sheet is ever tinted.
 */
import type { Decoded } from './setManager';

type Rgb = [number, number, number];

interface Ctx2D {
  drawImage(img: CanvasImageSource, ...args: number[]): void;
  getImageData(x: number, y: number, w: number, h: number): ImageData;
  putImageData(img: ImageData, x: number, y: number): void;
  clearRect?(x: number, y: number, w: number, h: number): void;
}
export interface CanvasLike {
  width: number;
  height: number;
  getContext(kind: '2d', options?: { willReadFrequently?: boolean }): unknown;
}

/**
 * Per pixel: tinted = Rec. 709 luminance of base x rgb/255; result = base mixed with tinted by the
 * mask's red channel / 255. Alpha comes from base.
 */
export function tintPixels(base: Uint8ClampedArray, mask: Uint8ClampedArray, rgb: Rgb): Uint8ClampedArray {
  const out = new Uint8ClampedArray(base);
  tintInPlace(out, mask, rgb);
  return out;
}

/** `tintPixels` into `px` itself (no copy). */
function tintInPlace(px: Uint8ClampedArray, mask: Uint8ClampedArray, rgb: Rgb): void {
  const [tr, tg, tb] = rgb;
  for (let i = 0; i + 3 < px.length; i += 4) {
    const s = (mask[i] ?? 0) / 255;
    if (s === 0) continue;
    const r = px[i] as number;
    const g = px[i + 1] as number;
    const b = px[i + 2] as number;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    px[i] = r + (lum * tr - r) * s;
    px[i + 1] = g + (lum * tg - g) * s;
    px[i + 2] = b + (lum * tb - b) * s;
  }
}

/**
 * The canvas's 2D context; a canvas without one (out of memory, too big) throws, and the caller draws today's art.
 * `read`: a scratch canvas read back every frame (kept in CPU memory, never drawn to the screen).
 */
function ctx2d(c: CanvasLike, read = false): Ctx2D {
  const ctx = (read ? c.getContext('2d', { willReadFrequently: true }) : c.getContext('2d')) as Ctx2D | null;
  if (!ctx) throw new Error(`no 2D context for a ${c.width} x ${c.height} tint canvas`);
  return ctx;
}

/** A frame's rectangle in its sheet, px. */
export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Tints one frame (Task 4): rectangle `rect` of `base`, mixed by the same rectangle of its `mask` (as `tintPixels`),
 * written to `dst` at (`dx`, `dy`); nothing else of `dst` changes. Both rectangles are read through `scratch` (a canvas
 * at least `rect` big, asked for `willReadFrequently`, so the reads stay in CPU memory) and the result is only written
 * to `dst` (`putImageData`), never read back. Without `scratch` the reads go through `dst` itself at (`dx`, `dy`).
 * Throws when a canvas has no 2D context.
 */
export function tintRect(base: Decoded, mask: Decoded, rect: Rect, rgb: Rgb, dst: CanvasLike, dx: number, dy: number, scratch?: CanvasLike): void {
  const { x, y, w, h } = rect;
  const out = ctx2d(dst);
  const rd = scratch ? ctx2d(scratch, true) : out;
  const rx = scratch ? 0 : dx;
  const ry = scratch ? 0 : dy;
  const cut = (img: CanvasImageSource): ImageData => {
    rd.clearRect?.(rx, ry, w, h);
    rd.drawImage(img, x, y, w, h, rx, ry, w, h);
    return rd.getImageData(rx, ry, w, h);
  };
  const m = cut(mask.image);
  const b = cut(base.image);
  tintInPlace(b.data, m.data, rgb);
  out.putImageData(b, dx, dy);
}
