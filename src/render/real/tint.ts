/**
 * Tint masks: a pre-rendered sprite sheet ships with a mask sheet whose red channel marks pixels
 * (shirts, ride colours) to be recoloured at decode time.
 */
import type { Decoded } from './setManager';

type Rgb = [number, number, number];

interface Ctx2D {
  drawImage(img: CanvasImageSource, x: number, y: number): void;
  getImageData(x: number, y: number, w: number, h: number): ImageData;
  putImageData(img: ImageData, x: number, y: number): void;
}
export interface CanvasLike {
  width: number;
  height: number;
  getContext(kind: '2d'): unknown;
}

/**
 * Per pixel: tinted = Rec. 709 luminance of base x rgb/255; result = base mixed with tinted by the
 * mask's red channel / 255. Alpha comes from base.
 */
export function tintPixels(base: Uint8ClampedArray, mask: Uint8ClampedArray, rgb: Rgb): Uint8ClampedArray {
  const out = new Uint8ClampedArray(base.length);
  for (let i = 0; i + 3 < base.length; i += 4) {
    const r = base[i] ?? 0;
    const g = base[i + 1] ?? 0;
    const b = base[i + 2] ?? 0;
    const s = (mask[i] ?? 0) / 255;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    out[i] = r + (lum * rgb[0] - r) * s;
    out[i + 1] = g + (lum * rgb[1] - g) * s;
    out[i + 2] = b + (lum * rgb[2] - b) * s;
    out[i + 3] = base[i + 3] ?? 0;
  }
  return out;
}

function sizeOf(img: CanvasImageSource): { w: number; h: number } {
  const s = img as unknown as { width: number; height: number };
  return { w: s.width, h: s.height };
}

function read(d: Decoded, make: (w: number, h: number) => CanvasLike, w: number, h: number): ImageData {
  const c = make(w, h);
  const ctx = c.getContext('2d') as Ctx2D;
  ctx.drawImage(d.image, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  c.width = 0; // free the scratch canvas's pixels now
  c.height = 0;
  return img;
}

/** Tint a decoded sheet with its mask (same size, or this throws). Counted by the set manager under `${setKey}#${hex}`. */
export function tintSheet(base: Decoded, mask: Decoded, rgb: Rgb, make: (w: number, h: number) => CanvasLike): Decoded {
  const { w, h } = sizeOf(base.image);
  const ms = sizeOf(mask.image);
  if (ms.w !== w || ms.h !== h) throw new Error(`tint mask is ${ms.w}x${ms.h}, base is ${w}x${h}`);
  const b = read(base, make, w, h);
  const m = read(mask, make, w, h);
  const out = make(w, h);
  const ctx = out.getContext('2d') as Ctx2D;
  const img = ctx.getImageData(0, 0, w, h);
  img.data.set(tintPixels(b.data, m.data, rgb));
  ctx.putImageData(img, 0, 0);
  let canvas: CanvasLike | null = out;
  return {
    get image(): CanvasImageSource {
      if (!canvas) throw new Error('tinted sheet was closed');
      return canvas as unknown as CanvasImageSource;
    },
    bytes: w * h * 4,
    close() {
      if (!canvas) return;
      // Zero the size first: browsers free a canvas's pixels only once it is 0 x 0 or collected.
      canvas.width = 0;
      canvas.height = 0;
      canvas = null;
    },
  };
}
