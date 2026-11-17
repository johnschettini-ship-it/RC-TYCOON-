import { describe, expect, it } from 'vitest';
import { hexRgb, luma, tintPixels, tintRect, tintShadedPixels, tintSheetShaded } from '../../../../src/render/real/tint';
import type { Decoded } from '../../../../src/render/real/setManager';

const px = (...v: number[]): Uint8ClampedArray => new Uint8ClampedArray(v);

describe('tintPixels', () => {
  it('leaves pixels unchanged at strength 0', () => {
    const base = px(10, 200, 30, 255, 90, 80, 70, 128);
    const mask = px(0, 0, 0, 255, 0, 9, 9, 255);
    expect(Array.from(tintPixels(base, mask, [255, 0, 0]))).toEqual(Array.from(base));
  });

  it('gives rgb x 0.5 luminance on mid-grey at strength 255', () => {
    const base = px(128, 128, 128, 255);
    const out = tintPixels(base, px(255, 0, 0, 255), [200, 100, 50]);
    expect(Math.abs(out[0]! - 100)).toBeLessThanOrEqual(1);
    expect(Math.abs(out[1]! - 50)).toBeLessThanOrEqual(1);
    expect(Math.abs(out[2]! - 25)).toBeLessThanOrEqual(1);
  });

  it('keeps alpha from base and length equal to input', () => {
    const base = px(128, 128, 128, 77, 5, 5, 5, 0);
    const out = tintPixels(base, px(255, 0, 0, 255, 128, 0, 0, 255), [255, 255, 255]);
    expect(out.length).toBe(base.length);
    expect(out[3]!).toBe(77);
    expect(out[7]!).toBe(0);
  });

  it('mixes by strength', () => {
    const out = tintPixels(px(255, 255, 255, 255), px(128, 0, 0, 255), [0, 0, 0]);
    expect(Math.abs(out[0]! - 127)).toBeLessThanOrEqual(1);
  });

  it('uses Rec. 709 luminance', () => {
    const out = tintPixels(px(0, 255, 0, 255), px(255, 0, 0, 255), [255, 255, 255]);
    expect(Math.abs(out[0]! - 182)).toBeLessThanOrEqual(1);
  });

  it('does not mutate inputs', () => {
    const base = px(1, 2, 3, 4);
    tintPixels(base, px(255, 0, 0, 255), [9, 9, 9]);
    expect(Array.from(base)).toEqual([1, 2, 3, 4]);
  });
});

class PixCanvas {
  data: Uint8ClampedArray;
  constructor(public width: number, public height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
  getContext() {
    const self = this;
    return {
      drawImage(src: PixCanvas, ...a: number[]) {
        const [sx = 0, sy = 0, sw = 0, sh = 0, dx = 0, dy = 0] = a.length === 2 ? [0, 0, src.width, src.height, a[0], a[1]] : a;
        for (let y = 0; y < sh; y++) {
          for (let x = 0; x < sw; x++) {
            const si = ((sy + y) * src.width + sx + x) * 4;
            const di = ((dy + y) * self.width + dx + x) * 4;
            self.data.set(src.data.subarray(si, si + 4), di);
          }
        }
      },
      clearRect(x: number, y: number, w: number, h: number) {
        for (let r = 0; r < h; r++) self.data.fill(0, ((y + r) * self.width + x) * 4, ((y + r) * self.width + x + w) * 4);
      },
      getImageData(x: number, y: number, w: number, h: number) {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let r = 0; r < h; r++) data.set(self.data.subarray(((y + r) * self.width + x) * 4, ((y + r) * self.width + x + w) * 4), r * w * 4);
        return { width: w, height: h, data };
      },
      putImageData(img: { width: number; height: number; data: Uint8ClampedArray }, x = 0, y = 0) {
        for (let r = 0; r < img.height; r++) self.data.set(img.data.subarray(r * img.width * 4, (r + 1) * img.width * 4), ((y + r) * self.width + x) * 4);
      },
    };
  }
}

describe('tintRect (Task 4): one frame rectangle into a page', () => {
  const sheet = (w: number, h: number, f: (i: number) => number): Decoded => {
    const c = new PixCanvas(w, h);
    for (let i = 0; i < c.data.length; i++) c.data[i] = f(i);
    return { image: c as unknown as CanvasImageSource, bytes: w * h * 4, close() {} };
  };
  const read = (d: Decoded | PixCanvas, x: number, y: number, w: number, h: number): Uint8ClampedArray => {
    const c = ('image' in d ? d.image : d) as unknown as PixCanvas;
    return (c.getContext() as { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } }).getImageData(x, y, w, h).data;
  };
  const base = sheet(16, 12, (i) => (i * 37) & 255);
  const mask = sheet(16, 12, (i) => (i * 11 + 5) & 255);
  const rect = { x: 3, y: 2, w: 5, h: 7 };
  const want = (): number[] => Array.from(tintPixels(read(base, 3, 2, 5, 7), read(mask, 3, 2, 5, 7), [10, 200, 90]));

  it('writes tintPixels of the rectangle at (dx, dy) and nothing else', () => {
    const dst = new PixCanvas(20, 20);
    tintRect(base, mask, rect, [10, 200, 90], dst, 9, 4);
    expect(Array.from(read(dst, 9, 4, 5, 7))).toEqual(want());
    // Outside the rectangle the page is untouched.
    let outside = 0;
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if ((x < 9 || x >= 14 || y < 4 || y >= 11) && dst.data[(y * 20 + x) * 4 + 3]) outside++;
    expect(outside).toBe(0);
  });

  it('with a scratch canvas, reads only through it (willReadFrequently) and only writes the page', () => {
    const asked: [string, unknown][] = [];
    const spy = (name: string, c: PixCanvas): PixCanvas => {
      const get = c.getContext.bind(c);
      (c as unknown as { getContext: (k: string, o?: unknown) => unknown }).getContext = (_k, o) => {
        asked.push([name, o]);
        const ctx = get() as Record<string, unknown>;
        if (name === 'page') ctx.getImageData = () => { throw new Error('read back from the page'); };
        return ctx;
      };
      return c;
    };
    const dst = spy('page', new PixCanvas(20, 20));
    const scratch = spy('scratch', new PixCanvas(8, 8));
    tintRect(base, mask, rect, [10, 200, 90], dst, 1, 1, scratch);
    expect(asked.filter(([n]) => n === 'scratch').every(([, o]) => (o as { willReadFrequently?: boolean } | undefined)?.willReadFrequently === true)).toBe(true);
    expect(asked.filter(([n]) => n === 'page').every(([, o]) => o === undefined)).toBe(true);
    const page = new PixCanvas(20, 20);
    page.data.set(dst.data);
    expect(Array.from(read(page, 1, 1, 5, 7))).toEqual(want());
  });

  it('a canvas without a 2D context throws a plain error', () => {
    const dst = new PixCanvas(20, 20);
    (dst as unknown as { getContext: () => null }).getContext = () => null;
    expect(() => tintRect(base, mask, rect, [1, 2, 3], dst, 0, 0)).toThrow(/no 2D context/);
  });
});

/** HSV hue in degrees and saturation 0-1 of an rgb triple. */
function hsv(r: number, g: number, b: number): { h: number; s: number } {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: mx ? d / mx : 0 };
}
const rgbOf = (a: Uint8ClampedArray, i = 0): [number, number, number] => [a[i]!, a[i + 1]!, a[i + 2]!];
const shade = (rgb: [number, number, number], base: string, target: string, m = 255): [number, number, number] =>
  rgbOf(tintShadedPixels(px(...rgb, 255), px(m, m, m, 255), hexRgb(base), hexRgb(target)));

describe('tintShadedPixels (Task 5): colour transfer that keeps shading', () => {
  const LEMON = '#f2c230';
  const SUNSET = '#f08a24';
  const DARK_RED = '#8a1c1c';

  it('a dark red base pixel tinted lemon is lemon (not dim), and its darker shade keeps its ratio to the base', () => {
    const atBase = shade([0x8a, 0x1c, 0x1c], DARK_RED, LEMON);
    for (let c = 0; c < 3; c++) expect(Math.abs(atBase[c]! - hexRgb(LEMON)[c]!)).toBeLessThanOrEqual(1);
    // A shadow of the red part (60 % of its lightness): lemon's hue, at 60 % of lemon's lightness.
    const dark: [number, number, number] = [0x53, 0x11, 0x11];
    const k = luma(dark) / luma(hexRgb(DARK_RED));
    const out = shade(dark, DARK_RED, LEMON);
    expect(Math.abs(hsv(...out).h - hsv(...hexRgb(LEMON)).h)).toBeLessThanOrEqual(2);
    expect(Math.abs(luma(out) - luma(hexRgb(LEMON)) * k)).toBeLessThanOrEqual(2);
  });

  it('mask 0 pixels are unchanged; a partial mask mixes; alpha is kept', () => {
    const base = px(0x53, 0x11, 0x11, 200, 10, 20, 30, 255);
    const out = tintShadedPixels(base, px(0, 0, 0, 255, 0, 0, 0, 255), hexRgb(DARK_RED), hexRgb(LEMON));
    expect(Array.from(out)).toEqual(Array.from(base));
    const half = tintShadedPixels(px(0x8a, 0x1c, 0x1c, 77), px(128, 128, 128, 255), hexRgb(DARK_RED), hexRgb(LEMON));
    const L = hexRgb(LEMON);
    expect(Math.abs(half[0]! - (0x8a + (L[0] - 0x8a) * 128 / 255))).toBeLessThanOrEqual(1);
    expect(Math.abs(half[1]! - (0x1c + (L[1] - 0x1c) * 128 / 255))).toBeLessThanOrEqual(1);
    expect(half[3]).toBe(77);
  });

  it('a light shade 1.69x the base (big_wheel yellow on its green base) tinted sunset keeps a sunset hue (no clip to yellow or white)', () => {
    const base = hexRgb('#3b7d4f');
    // A yellow of 1.69x the base's luma, as the big wheel's yellow gondolas.
    const yellow: [number, number, number] = [236, 186, 26];
    expect(luma(yellow) / luma(base)).toBeGreaterThan(1.66);
    expect(luma(yellow) / luma(base)).toBeLessThan(1.72);
    const out = shade(yellow, '#3b7d4f', SUNSET);
    const want = hsv(...hexRgb(SUNSET));
    const got = hsv(...out);
    expect(Math.abs(got.h - want.h)).toBeLessThanOrEqual(2);
    expect(got.s).toBeGreaterThan(0.4);
    // Lighter than the sunset base colour, so the gondolas still read as two shades.
    expect(luma(out)).toBeGreaterThan(luma(hexRgb(SUNSET)) + 20);
    // The plain formula clips this pixel to a yellow: the reason for the highlight rule.
    const plain = hexRgb(SUNSET).map((c) => Math.min(255, c * luma(yellow) / luma(base))) as [number, number, number];
    expect(hsv(...plain).h - want.h).toBeGreaterThan(15);
  });

  it('a specular pixel on a dark base (haunted_manor door #3b2a24) tinted lemon is a lighter lemon, not white; only a near-white pixel goes white', () => {
    const DOOR = '#3b2a24';
    const glint = shade([120, 100, 90], DOOR, LEMON);
    expect(Math.min(...glint)).toBeLessThan(200);
    expect(Math.abs(hsv(...glint).h - hsv(...hexRgb(LEMON)).h)).toBeLessThanOrEqual(2);
    expect(luma(glint)).toBeGreaterThan(luma(hexRgb(LEMON)));
    const white = shade([250, 250, 250], DOOR, LEMON);
    expect(Math.min(...white)).toBeGreaterThanOrEqual(240);
  });

  it('a light target on a light shade of a dark target keeps the plain formula where it fits (grape)', () => {
    const base = hexRgb('#3d9be0');
    const light: [number, number, number] = [120, 190, 240];
    const k = luma(light) / luma(base);
    const out = shade(light, '#3d9be0', '#7e57c2');
    const want = hexRgb('#7e57c2').map((c) => c * k);
    for (let c = 0; c < 3; c++) expect(Math.abs(out[c]! - want[c]!)).toBeLessThanOrEqual(1);
  });
});

describe('tintSheetShaded (Task 5): a whole sheet, band by band', () => {
  const sheet = (w: number, h: number, f: (i: number) => number): Decoded => {
    const c = new PixCanvas(w, h);
    for (let i = 0; i < c.data.length; i++) c.data[i] = f(i);
    return { image: c as unknown as CanvasImageSource, bytes: w * h * 4, close() {} };
  };
  const base = sheet(7, 10, (i) => ((i & 3) === 3 ? 255 : (i * 37) & 255));
  const mask = sheet(7, 10, (i) => (((i >> 2) % 3) * 120) & 255);
  const all = (c: PixCanvas): Uint8ClampedArray => c.data;

  it('tints one band a step and ends with the whole sheet tinted as tintShadedPixels', () => {
    const made: PixCanvas[] = [];
    const job = tintSheetShaded(base, mask, [138, 28, 28], [242, 194, 48], (w, h) => { const c = new PixCanvas(w, h); made.push(c); return c; }, 4);
    expect(job.bytes).toBe(7 * 10 * 4 + 7 * 4 * 4);
    let steps = 0;
    while (!job.step()) steps++;
    expect(steps + 1).toBe(3); // 10 rows in bands of 4
    expect(job.done).toBe(true);
    const out = job.result();
    expect(out.bytes).toBe(7 * 10 * 4);
    const want = tintShadedPixels(all(base.image as unknown as PixCanvas), all(mask.image as unknown as PixCanvas), [138, 28, 28], [242, 194, 48]);
    expect(Array.from(all(out.image as unknown as PixCanvas))).toEqual(Array.from(want));
    // The band scratch canvas is released once done.
    expect(made[1]!.width).toBe(0);
  });

  it('a canvas without a 2D context throws when the job is made', () => {
    expect(() => tintSheetShaded(base, mask, [1, 2, 3], [4, 5, 6], (w, h) => ({ width: w, height: h, getContext: () => null }), 4)).toThrow(/no 2D context/);
  });
});

describe('alpha-tint sheets (batch 5 Task 2: rails that take the track colour everywhere)', () => {
  /** A 5 x 3 picture with every alpha from transparent to opaque, and its full-white mask. */
  const sheet = (): { base: Decoded; white: Decoded } => {
    const b = new PixCanvas(5, 3);
    const m = new PixCanvas(5, 3);
    for (let i = 0; i < 15; i++) {
      b.data.set([(i * 37) & 255, (i * 91) & 255, (i * 13) & 255, Math.round((i / 14) * 255)], i * 4);
      m.data.set([255, 255, 255, 255], i * 4);
    }
    const d = (c: PixCanvas): Decoded => ({ image: c as unknown as CanvasImageSource, bytes: 60, close() {} });
    return { base: d(b), white: d(m) };
  };
  it('alpha-tint sheet tints like a full-white mask (every pixel, semi-transparent ones too), alpha kept', () => {
    const { base, white } = sheet();
    const rect = { x: 0, y: 0, w: 5, h: 3 };
    const a = new PixCanvas(5, 3);
    const w = new PixCanvas(5, 3);
    tintRect(base, null, rect, [200, 40, 90], a as never, 0, 0);
    tintRect(base, white, rect, [200, 40, 90], w as never, 0, 0);
    expect(Array.from(a.data)).toEqual(Array.from(w.data));
    const src = (base.image as unknown as PixCanvas).data;
    for (let i = 3; i < 60; i += 4) expect(a.data[i]).toBe(src[i]);
    // and it did tint: a mid pixel is not the base colour
    expect(Array.from(a.data.subarray(28, 31))).not.toEqual(Array.from(src.subarray(28, 31)));
  });
});
