import { describe, expect, it } from 'vitest';
import { tintPixels, tintSheet, type Decoded } from '../../../../src/render/real/tint';

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
});
