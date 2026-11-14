import { describe, expect, it } from 'vitest';
import { tintPixels, tintRect } from '../../../../src/render/real/tint';
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
