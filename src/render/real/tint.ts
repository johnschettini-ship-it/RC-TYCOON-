/**
 * Tint masks: a pre-rendered sprite sheet ships with a mask sheet whose red channel marks pixels
 * (shirts, ride colours) to be recoloured. Frames are tinted one at a time, as they are drawn, into the shared tint
 * atlas (`./tintAtlas.ts`, Task 4); no whole sheet is ever tinted for those. Ride colours (Task 5 of the flat ride
 * colours plan) are the exception: a coloured ride set is tinted whole, once, when it loads (`tintSheetShaded`, run by
 * the set manager band by band), and only the tinted copy is kept.
 */
import type { Decoded } from './setManager';

export type Rgb = [number, number, number];

/**
 * Tinting budget per frame, ms (round 3 item 4): the tint atlas tints frames, and the set manager tints a coloured
 * ride set's bands, while a frame has spent less than this on them (at least one frame or band a frame).
 */
export const TINT_FRAME_MS = 3;

/** `#rrggbb` → [r, g, b]. */
export function hexRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Rec. 709 luma on sRGB values, 0-255 (the measure the bake used to pick each ride's base colour). */
export function luma(rgb: readonly number[]): number {
  return 0.2126 * (rgb[0] as number) + 0.7152 * (rgb[1] as number) + 0.0722 * (rgb[2] as number);
}

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
 * Ride colour transfer that keeps shading (spec builder-check answer 5, Task 5): per pixel with mask weight m (red
 * channel / 255), `c` = the target colour at the pixel's lightness relative to the base colour, and
 * `out = pixel × (1 − m) + c × m`; alpha is kept.
 *
 * Lightness: `L = lum(target) × lum(pixel) / lum(base)` (luma, as the bake measured its shades), the global formula.
 * Highlights (pixel lighter than the base) are where that formula breaks: a shade 1.69× the base tinted to a light
 * target asks for more than white, and per-channel clamping then shifts the hue (sunset gondolas turn yellow) or
 * clips to white (a glint on a dark door tinted lemon). So above the base, `L` is also held to the pixel's own share
 * of the way to white: `h = (lum(pixel) − lum(base)) / (255 − lum(base))`, `L ≤ lum(target) + h × (255 − lum(target))`.
 * A pixel goes white only when it was near white; where the plain formula fits (a dark target) it is used unchanged.
 *
 * Colour at `L` with the target's hue: the target scaled by `L / lum(target)`; when a channel would pass 255 it is
 * scaled to fit and the rest of the lightness is a blend toward white. Scaling and blending toward white both keep
 * the HSV hue, so the hue is always the target's; only saturation gives way in the brightest highlights.
 */
export function tintShadedPixels(base: Uint8ClampedArray, mask: Uint8ClampedArray, baseRgb: Rgb, targetRgb: Rgb): Uint8ClampedArray {
  const out = new Uint8ClampedArray(base);
  tintShadedInPlace(out, mask, baseRgb, targetRgb);
  return out;
}

function tintShadedInPlace(px: Uint8ClampedArray, mask: Uint8ClampedArray, baseRgb: Rgb, targetRgb: Rgb): void {
  const [tr, tg, tb] = targetRgb;
  const lb = Math.max(1, luma(baseRgb));
  const lt = luma(targetRgb);
  const room = 255 - lb;
  for (let i = 0; i + 3 < px.length; i += 4) {
    const m = (mask[i] ?? 0) / 255;
    if (m === 0) continue;
    const r = px[i] as number;
    const g = px[i + 1] as number;
    const b = px[i + 2] as number;
    const lp = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let L = (lt * lp) / lb;
    if (lp > lb) {
      const h = room > 0 ? Math.min(1, (lp - lb) / room) : 1;
      const cap = lt + h * (255 - lt);
      if (L > cap) L = cap;
    }
    let cr: number, cg: number, cb: number;
    if (lt <= 0) cr = cg = cb = L;
    else {
      const s = L / lt;
      cr = tr * s; cg = tg * s; cb = tb * s;
      const mx = Math.max(cr, cg, cb);
      if (mx > 255) {
        const f = 255 / mx;
        cr *= f; cg *= f; cb *= f;
        const l1 = L * f;
        const w = l1 < 255 ? Math.min(1, (L - l1) / (255 - l1)) : 0;
        cr += (255 - cr) * w; cg += (255 - cg) * w; cb += (255 - cb) * w;
      }
    }
    px[i] = r + (cr - r) * m;
    px[i + 1] = g + (cg - g) * m;
    px[i + 2] = b + (cb - b) * m;
  }
}

/** A whole-sheet tint in progress (`tintSheetShaded`). */
export interface TintJob {
  /** Bytes it holds while it runs: the tinted sheet and its band scratch canvas. */
  readonly bytes: number;
  /** True once every band is tinted. */
  readonly done: boolean;
  /** Tints the next band; true when the sheet is done (the scratch canvas is then released). Throws on a canvas error. */
  step(): boolean;
  /** The tinted sheet once done, as a decoded sheet (its `close` frees the canvas). */
  result(): Decoded;
  /** Frees everything it made (a job abandoned or failed). */
  close(): void;
}

const sizeOf = (img: CanvasImageSource): { w: number; h: number } => {
  const i = img as unknown as { width: number; height: number };
  return { w: i.width, h: i.height };
};

/**
 * Starts tinting a whole sheet (Task 5): `base` mixed with the colour by `mask` as `tintShadedPixels`, into a new
 * canvas the size of `base`, `bandPx` rows a `step`. Bands are read through a scratch canvas `bandPx` rows tall
 * (asked for `willReadFrequently`, so its reads stay in CPU memory); the tinted canvas is only written. Both canvases
 * and their 2D contexts are made here, so a canvas without one throws at once and the caller keeps the base.
 *
 * Mask-0 pixels: `tintShadedPixels` leaves them exactly as they were, but that holds for the pixel arrays only. Through
 * canvases (`drawImage` → `getImageData` → `putImageData`) a semi-transparent pixel's colour round-trips through
 * premultiplied alpha and may move by a step or so even where the mask is 0; opaque pixels come back unchanged.
 */
export function tintSheetShaded(base: Decoded, mask: Decoded, baseRgb: Rgb, targetRgb: Rgb, make: (w: number, h: number) => CanvasLike, bandPx: number): TintJob {
  const { w, h } = sizeOf(base.image);
  const band = Math.max(1, Math.min(bandPx, h));
  const out = make(w, h);
  const scratch = make(w, band);
  let octx: Ctx2D;
  let sctx: Ctx2D;
  try {
    octx = ctx2d(out);
    sctx = ctx2d(scratch, true);
  } catch (err) {
    out.width = out.height = 0;
    scratch.width = scratch.height = 0;
    throw err;
  }
  const scratchBytes = w * band * 4;
  let y = 0;
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    scratch.width = scratch.height = 0;
  };
  const cut = (img: CanvasImageSource, rows: number): ImageData => {
    sctx.clearRect?.(0, 0, w, rows);
    sctx.drawImage(img, 0, y, w, rows, 0, 0, w, rows);
    return sctx.getImageData(0, 0, w, rows);
  };
  return {
    get bytes() { return w * h * 4 + (released ? 0 : scratchBytes); },
    get done() { return y >= h; },
    step() {
      if (y >= h) return true;
      const rows = Math.min(band, h - y);
      const m = cut(mask.image, rows);
      const b = cut(base.image, rows);
      tintShadedInPlace(b.data, m.data, baseRgb, targetRgb);
      octx.putImageData(b, 0, y);
      y += rows;
      if (y >= h) release();
      return y >= h;
    },
    result() {
      if (y < h) throw new Error('tint job not done');
      return { image: out as unknown as CanvasImageSource, bytes: w * h * 4, close() { out.width = out.height = 0; } };
    },
    close() {
      release();
      out.width = out.height = 0;
    },
  };
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
