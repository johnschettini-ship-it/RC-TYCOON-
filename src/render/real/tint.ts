/**
 * Tint masks: a pre-rendered sprite sheet ships with a mask sheet whose red channel marks pixels
 * (shirts, ride colours) to be recoloured at decode time.
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
  getContext(kind: '2d'): unknown;
}

/** Pixels a tint job tints per band (round 3 item 4): a band is the unit of the per-frame tint budget. */
export const TINT_BAND_PX = 64 * 1024;

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

function sizeOf(img: CanvasImageSource): { w: number; h: number } {
  const s = img as unknown as { width: number; height: number };
  return { w: s.width, h: s.height };
}

/** The canvas's 2D context; a canvas without one (out of memory, too big) throws, and the caller draws today's art. */
function ctx2d(c: CanvasLike, w: number, h: number): Ctx2D {
  const ctx = c.getContext('2d') as Ctx2D | null;
  if (!ctx) throw new Error(`no 2D context for a ${w} x ${h} tint canvas`);
  return ctx;
}

/**
 * A sheet being tinted band by band (round 3 item 4), so the work spreads over frames under a time budget. `out` is
 * the tinted sheet: it holds the untinted sheet at once and each `step` tints the next band of rows in place, so rows
 * at or past `rows` are still untinted (a caller draws the untinted sheet for a frame below them).
 */
export interface TintJob {
  readonly out: Decoded;
  /** Rows tinted so far, top first. */
  readonly rows: number;
  readonly done: boolean;
  /** Tints the next band; true when the sheet is done. Throws when a canvas fails (the job is then freed). */
  step(): boolean;
  /** Frees the result and the scratch canvas. */
  close(): void;
}

/** Starts tinting a decoded sheet with its mask (same size, or this throws). Counted by the set manager under `${setKey}#${hex}`. */
export function startTint(base: Decoded, mask: Decoded, rgb: Rgb, make: (w: number, h: number) => CanvasLike, bandPx = TINT_BAND_PX): TintJob {
  const { w, h } = sizeOf(base.image);
  const ms = sizeOf(mask.image);
  if (ms.w !== w || ms.h !== h) throw new Error(`tint mask is ${ms.w}x${ms.h}, base is ${w}x${h}`);
  const band = Math.max(1, Math.min(h, Math.floor(bandPx / Math.max(1, w))));
  let canvas: CanvasLike | null = make(w, h);
  let scratch: CanvasLike | null = null;
  const zero = (c: CanvasLike | null): null => {
    // Zero the size first: browsers free a canvas's pixels only once it is 0 x 0 or collected.
    if (c) c.width = c.height = 0;
    return null;
  };
  let octx: Ctx2D;
  try {
    octx = ctx2d(canvas, w, h);
    octx.drawImage(base.image, 0, 0);
  } catch (err) {
    canvas = zero(canvas);
    throw err;
  }
  let rows = 0;
  const out: Decoded = {
    get image(): CanvasImageSource {
      if (!canvas) throw new Error('tinted sheet was closed');
      return canvas as unknown as CanvasImageSource;
    },
    bytes: w * h * 4,
    close() {
      canvas = zero(canvas);
      scratch = zero(scratch);
    },
  };
  return {
    out,
    get rows() { return rows; },
    get done() { return rows >= h; },
    step() {
      if (rows >= h) return true;
      if (!canvas) throw new Error('tinted sheet was closed');
      try {
        const bh = Math.min(band, h - rows);
        if (!scratch) scratch = make(w, band);
        const mctx = ctx2d(scratch, w, band);
        mctx.clearRect?.(0, 0, w, band);
        mctx.drawImage(mask.image, 0, rows, w, bh, 0, 0, w, bh);
        const m = mctx.getImageData(0, 0, w, bh);
        const b = octx.getImageData(0, rows, w, bh);
        tintInPlace(b.data, m.data, rgb);
        octx.putImageData(b, 0, rows);
        rows += bh;
      } catch (err) {
        out.close();
        throw err;
      }
      if (rows >= h) scratch = zero(scratch);
      return rows >= h;
    },
    close() {
      out.close();
    },
  };
}

/** Tint a decoded sheet with its mask at once (same size, or this throws). */
export function tintSheet(base: Decoded, mask: Decoded, rgb: Rgb, make: (w: number, h: number) => CanvasLike): Decoded {
  const job = startTint(base, mask, rgb, make);
  while (!job.step());
  return job.out;
}
