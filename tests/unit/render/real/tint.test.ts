import { describe, expect, it } from 'vitest';
import { startTint, tintPixels, tintSheet } from '../../../../src/render/real/tint';
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
        if (a.length === 2) { self.data.set(src.data.subarray(0, self.data.length)); return; }
        const [sx = 0, sy = 0, sw = 0, sh = 0, dx = 0, dy = 0] = a;
        for (let y = 0; y < sh; y++) {
          for (let x = 0; x < sw; x++) {
            const si = ((sy + y) * src.width + sx + x) * 4;
            const di = ((dy + y) * self.width + dx + x) * 4;
            self.data.set(src.data.subarray(si, si + 4), di);
          }
        }
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
    // The result is the first canvas made (the scratch band canvas comes after).
    const out = tintSheet(mkD(2, 2), mkD(2, 2), [1, 2, 3], (w, h) => { const c = new PixCanvas(w, h); made ??= c; return c; });
    const canvas = out.image as unknown as PixCanvas;
    expect(canvas).toBe(made);
    out.close();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
    expect(() => out.image).toThrow(/closed/);
  });
  it('zeroes its scratch canvas once the sheet is done; the result stays', () => {
    const made: PixCanvas[] = [];
    tintSheet(mkD(2, 2), mkD(2, 2), [1, 2, 3], (w, h) => { const c = new PixCanvas(w, h); made.push(c); return c; });
    expect(made).toHaveLength(2);
    expect([made[0]!.width, made[0]!.height]).toEqual([2, 2]);
    expect([made[1]!.width, made[1]!.height]).toEqual([0, 0]);
  });

  it('a canvas without a 2D context throws a plain error and zeroes every canvas it made (I6)', () => {
    for (const bad of [1, 2]) {
      const made: PixCanvas[] = [];
      let n = 0;
      const mk = (w: number, h: number) => {
        const c = new PixCanvas(w, h);
        made.push(c);
        // The result (1st) or the scratch (2nd) canvas has no context.
        if (++n === bad) (c as unknown as { getContext: () => null }).getContext = () => null;
        return c;
      };
      expect(() => tintSheet(mkD(2, 2), mkD(2, 2), [1, 2, 3], mk)).toThrow(/no 2D context/);
      expect(made.map((c) => [c.width, c.height])).toEqual(made.map(() => [0, 0]));
    }
  });
});

describe('startTint (round 3 item 4): band by band', () => {
  /** A w × h sheet of mid-grey with a full-strength mask. */
  const grey = (w: number, h: number): [Decoded, Decoded] => {
    const b = new PixCanvas(w, h);
    const m = new PixCanvas(w, h);
    for (let i = 0; i < b.data.length; i += 4) { b.data.set([128, 128, 128, 255], i); m.data.set([255, 0, 0, 255], i); }
    return [{ image: b as unknown as CanvasImageSource, bytes: 0, close() {} }, { image: m as unknown as CanvasImageSource, bytes: 0, close() {} }];
  };

  it('holds the untinted sheet at once and tints one band of rows per step, top first', () => {
    const [b, m] = grey(4, 10);
    // 12 px per band: 3 rows of 4 px.
    const job = startTint(b, m, [200, 100, 50], (w, h) => new PixCanvas(w, h), 12);
    const out = job.out.image as unknown as PixCanvas;
    const red = (row: number) => out.data[row * 4 * 4]!;
    expect(job.rows).toBe(0);
    expect(red(0)).toBe(128);
    expect(job.step()).toBe(false);
    expect(job.rows).toBe(3);
    expect(Math.abs(red(2) - 100)).toBeLessThanOrEqual(1);
    expect(red(3)).toBe(128);
    let steps = 1;
    while (!job.step()) steps++;
    expect(steps + 1).toBe(4); // 3 + 3 + 3 + 1 rows
    expect(job.done).toBe(true);
    for (let r = 0; r < 10; r++) expect(Math.abs(red(r) - 100)).toBeLessThanOrEqual(1);
    // Same result as tinting the whole sheet at once.
    const [b2, m2] = grey(4, 10);
    const whole = tintSheet(b2, m2, [200, 100, 50], (w, h) => new PixCanvas(w, h)).image as unknown as PixCanvas;
    expect(Array.from(out.data)).toEqual(Array.from(whole.data));
  });

  it('close frees the result and the scratch canvas mid-way', () => {
    const [b, m] = grey(4, 10);
    const made: PixCanvas[] = [];
    const job = startTint(b, m, [1, 2, 3], (w, h) => { const c = new PixCanvas(w, h); made.push(c); return c; }, 12);
    job.step();
    job.close();
    expect(made.map((c) => [c.width, c.height])).toEqual([[0, 0], [0, 0]]);
    expect(() => job.out.image).toThrow(/closed/);
  });
});
