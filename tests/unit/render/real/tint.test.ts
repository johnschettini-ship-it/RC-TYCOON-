import { describe, expect, it } from 'vitest';
import { tintPixels, tintSheet } from '../../../../src/render/real/tint';
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
      drawImage(src: PixCanvas) {
        self.data.set(src.data);
      },
      getImageData(_x: number, _y: number, w: number, h: number) {
        return { width: w, height: h, data: self.data.slice() };
      },
      putImageData(img: { data: Uint8ClampedArray }) {
        self.data.set(img.data);
      },
    };
  }
}

describe('tintSheet', () => {
  it('tints a sheet and reports bytes', () => {
    const mk = (w: number, h: number, d: number[]): Decoded => {
      const c = new PixCanvas(w, h);
      c.data.set(d);
      return { image: c as unknown as CanvasImageSource, bytes: w * h * 4, close() {} };
    };
    const base = mk(1, 1, [128, 128, 128, 255]);
    const mask = mk(1, 1, [255, 0, 0, 255]);
    const out = tintSheet(base, mask, [200, 100, 50], (w, h) => new PixCanvas(w, h) as never);
    expect(out.bytes).toBe(4);
    const d = (out.image as unknown as PixCanvas).data;
    expect(Math.abs(d[0]! - 100)).toBeLessThanOrEqual(1);
    expect(d[3]!).toBe(255);
    out.close();
  });
  const mkD = (w: number, h: number): Decoded => ({ image: new PixCanvas(w, h) as unknown as CanvasImageSource, bytes: w * h * 4, close() {} });

  it('throws when the mask size differs from the base', () => {
    expect(() => tintSheet(mkD(2, 2), mkD(2, 1), [1, 2, 3], (w, h) => new PixCanvas(w, h))).toThrow(/mask/);
  });

  it('close() zeroes the result canvas before releasing it', () => {
    let made: PixCanvas | null = null;
    const out = tintSheet(mkD(2, 2), mkD(2, 2), [1, 2, 3], (w, h) => (made = new PixCanvas(w, h)));
    const canvas = out.image as unknown as PixCanvas;
    expect(canvas).toBe(made);
    out.close();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
    expect(() => out.image).toThrow(/closed/);
  });
  it('zeroes its scratch canvases once read', () => {
    const made: PixCanvas[] = [];
    tintSheet(mkD(2, 2), mkD(2, 2), [1, 2, 3], (w, h) => { const c = new PixCanvas(w, h); made.push(c); return c; });
    expect(made).toHaveLength(3);
    expect(made.slice(0, 2).map((c) => [c.width, c.height])).toEqual([[0, 0], [0, 0]]);
    expect([made[2]!.width, made[2]!.height]).toEqual([2, 2]);
  });

  it('a canvas without a 2D context throws a plain error and zeroes every canvas it made (I6)', () => {
    const made: PixCanvas[] = [];
    let n = 0;
    const mk = (w: number, h: number) => {
      const c = new PixCanvas(w, h);
      made.push(c);
      // The third canvas (the result) has no context.
      if (++n === 3) (c as unknown as { getContext: () => null }).getContext = () => null;
      return c;
    };
    expect(() => tintSheet(mkD(2, 2), mkD(2, 2), [1, 2, 3], mk)).toThrow(/no 2D context/);
    expect(made.map((c) => [c.width, c.height])).toEqual([[0, 0], [0, 0], [0, 0]]);
  });
});
