/** Phase 8 stage 0 prototype (never merged): the pixel surface rules (spec §5.3, §8.1 item 5, §15). */
import { beforeEach, describe, expect, it } from 'vitest';
import { INK_SLOT, SLOT_NAMES, SLOT_RGBA, slotIndex } from '../../../../src/render/pixel/palette';
import { ART_SCALE, BAYER4, PixelSurface, SURFACE_PAD, isPixelSurface } from '../../../../src/render/pixel/surface';
import type { Ctx } from '../../../../src/render/sprites/shapes';
import { Recorder } from '../content/recorder';
import { FakeCanvas } from '../fakeCanvas';

const B = { left: -40, right: 40, top: -40, bottom: 40 };
const SIGNAL = new Set(['x', 'y', 'q', 'u']);
const rampOf = (slot: number): string => (SLOT_NAMES[slot] as string).replace(/\d+$/, '');

/** Every pixel of the surface, row by row. */
function pixels(p: PixelSurface): number[] {
  const out: number[] = [];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) out.push(p.pixel(x, y));
  return out;
}
const opaque = (p: PixelSurface): number => pixels(p).filter((v) => v !== 0).length;

let s: PixelSurface;
beforeEach(() => {
  s = new PixelSurface(B);
});

describe('PixelSurface (§5.3)', () => {
  it('size and anchor (§5.3)', () => expect([s.w, s.h, s.ox, s.oy]).toEqual([44, 44, 22, 22]));

  it('constants (§15)', () => {
    expect(BAYER4).toEqual([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
    expect([SURFACE_PAD, ART_SCALE]).toEqual([2, 0.5]);
  });

  it('a 2:1 stroke is a clean stair', () => {
    s.strokeStyle = 'g2';
    s.lineWidth = 2;
    s.beginPath();
    s.moveTo(-32, -16);
    s.lineTo(32, 16);
    s.stroke();
    const rows: number[] = [];
    for (let y = 0; y < s.h; y++) {
      let n = 0;
      for (let x = 0; x < s.w; x++) if (s.pixel(x, y) !== 0) n++;
      rows.push(n);
    }
    const first = rows.findIndex((n) => n > 0);
    const last = rows.length - 1 - [...rows].reverse().findIndex((n) => n > 0);
    expect(last - first).toBe(16);
    for (let y = first + 1; y < last; y++) expect(rows[y], `row ${y}`).toBe(2);
  });

  it('two fills with a shared edge leave no gap', () => {
    s.fillStyle = 'g2';
    s.beginPath();
    s.moveTo(0, 0);
    s.lineTo(40, 0);
    s.lineTo(0, 40);
    s.closePath();
    s.fill();
    s.fillStyle = 's2';
    s.beginPath();
    s.moveTo(40, 0);
    s.lineTo(40, 40);
    s.lineTo(0, 40);
    s.closePath();
    s.fill();
    // Image pixel (ix, iy) has its centre at world ((ix − ox) × 2 + 1, (iy − oy) × 2 + 1).
    for (let ax = 0; ax < 20; ax++) for (let ay = 0; ay < 20; ay++) expect(s.pixel(s.ox + ax, s.oy + ay), `${ax},${ay}`).not.toBe(0);
  });

  it('a fill thinner than one art pixel sets at least one pixel', () => {
    s.fillStyle = 'g2';
    s.fillRect(0.2, 0, 0.5, 10);
    expect(opaque(s)).toBeGreaterThanOrEqual(1);
  });

  it('a stroke makes no ink ring', () => {
    s.strokeStyle = 'g2';
    s.lineWidth = 2;
    s.beginPath();
    s.moveTo(-20, 0);
    s.lineTo(20, 10);
    s.stroke();
    s.finish();
    expect(opaque(s)).toBeGreaterThan(0);
    expect(pixels(s)).not.toContain(INK_SLOT);
  });

  it('layer() puts ink between two layers', () => {
    s.fillStyle = 'g2';
    s.fillRect(-10, -10, 20, 20);
    s.layer();
    s.fillStyle = 's2';
    s.fillRect(10, -10, 20, 20);
    s.finish();
    expect(s.pixel(s.ox + 4, s.oy)).toBe(INK_SLOT);
  });

  it('cut pixels make no ink', () => {
    s.cut(true);
    s.fillStyle = 'g2';
    s.fillRect(-10, -10, 20, 20);
    s.cut(false);
    s.finish();
    expect(opaque(s)).toBe(100);
    expect(pixels(s)).not.toContain(INK_SLOT);
    expect(s.inkMask().every((v) => v === 0)).toBe(true);
  });

  it('a surface with { ink: false } has no ink', () => {
    const p = new PixelSurface(B, { ink: false });
    p.fillStyle = 'g2';
    p.fillRect(-10, -10, 20, 20);
    p.finish();
    expect(opaque(p)).toBe(100);
    expect(pixels(p)).not.toContain(INK_SLOT);
  });

  it('a translucent fill on nothing dithers by BAYER4', () => {
    s.fillStyle = 'rgba(255,0,0,0.5)';
    s.fillRect(0, 0, 16, 16);
    s.finish();
    expect(opaque(s)).toBe(32);
    const mask = s.inkMask();
    for (let k = 0; k < mask.length; k++) expect(mask[k]).toBe(0);
  });

  it('the dither is anchored to world art pixels, not to image pixels (§8.1 item 5)', () => {
    const a = new PixelSurface({ left: -40, right: 40, top: -40, bottom: 40 });
    const b = new PixelSurface({ left: -42, right: 40, top: -40, bottom: 40 });
    for (const p of [a, b]) {
      p.fillStyle = 'rgba(255,0,0,0.5)';
      p.fillRect(0, 0, 16, 16);
      p.finish();
    }
    expect(b.ox - a.ox).toBe(1);
    for (let ax = 0; ax < 8; ax++) {
      for (let ay = 0; ay < 8; ay++) {
        expect(a.pixel(a.ox + ax, a.oy + ay) !== 0, `${ax},${ay}`).toBe(b.pixel(b.ox + ax, b.oy + ay) !== 0);
      }
    }
  });

  it('mix and snap never gives a signal slot or ink', () => {
    s.fillStyle = 'g2';
    s.fillRect(-10, -10, 20, 20);
    s.fillStyle = 'rgba(0,114,178,0.5)';
    s.fillRect(-10, -10, 20, 20);
    expect(pixels(s)).not.toContain(INK_SLOT);
    expect(s.pixel(s.ox, s.oy)).not.toBe(slotIndex('g2'));
    s.finish();
    for (const v of pixels(s)) if (v !== 0) expect(SIGNAL.has(rampOf(v)), SLOT_NAMES[v]).toBe(false);
    for (let ax = -5; ax < 5; ax++) for (let ay = -5; ay < 5; ay++) expect(s.pixel(s.ox + ax, s.oy + ay)).not.toBe(INK_SLOT);
  });

  it('inkMask marks only ink-making pixels', () => {
    s.fillStyle = 'g2';
    s.fillRect(-30, -30, 10, 10); // opaque fill: art (−15..−11, −15..−11)
    s.strokeStyle = 'g2';
    s.lineWidth = 2;
    s.beginPath();
    s.moveTo(10, -30);
    s.lineTo(30, -30);
    s.stroke(); // stroke: art row −15, columns 5..15
    s.cut(true);
    s.fillRect(-30, 10, 10, 10); // cut fill: art (−15..−11, 5..9)
    s.cut(false);
    s.fillStyle = 'rgba(255,0,0,0.5)';
    s.fillRect(10, 10, 16, 16); // dither on nothing: art (5..12, 5..12)
    s.finish();
    const mask = s.inkMask();
    const at = (ax: number, ay: number): number => mask[(s.oy + ay) * s.w + s.ox + ax] as number;
    expect(mask.length).toBe(s.w * s.h);
    expect(at(-13, -13)).toBe(1);
    let strokePx = 0;
    for (let ax = 5; ax <= 15; ax++) {
      if (s.pixel(s.ox + ax, s.oy - 15) !== 0) {
        strokePx++;
        expect(at(ax, -15)).toBe(0);
      }
    }
    expect(strokePx).toBeGreaterThan(0);
    expect(s.pixel(s.ox - 13, s.oy + 7)).not.toBe(0);
    expect(at(-13, 7)).toBe(0);
    let ditherPx = 0;
    for (let ax = 5; ax <= 12; ax++) {
      for (let ay = 5; ay <= 12; ay++) {
        if (s.pixel(s.ox + ax, s.oy + ay) !== 0) {
          ditherPx++;
          expect(at(ax, ay)).toBe(0);
        }
      }
    }
    expect(ditherPx).toBe(32);
    expect(mask.reduce((n, v) => n + v, 0)).toBe(25);
  });

  it('emitRuns and the ImageData path give the same pixels', () => {
    s.fillStyle = 'g2';
    s.fillRect(-20, -20, 30, 24);
    s.layer();
    s.fillStyle = 'b2';
    s.beginPath();
    s.arc(8, 6, 14, 0, Math.PI * 2);
    s.fill();
    s.finish();
    const want = pixels(s).map((v) => SLOT_RGBA[v] as number);

    // emitRuns into a recording context rebuilds the grid.
    const runs = new Array<number>(s.w * s.h).fill(0);
    const rec = {
      fillStyle: '',
      fillRect(x: number, y: number, w: number, h: number): void {
        const v = parseInt(this.fillStyle.slice(1), 16);
        const rgba = ((255 << 24) | ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255)) >>> 0;
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) runs[yy * s.w + xx] = rgba;
      },
    };
    s.emitRuns(rec as unknown as Ctx);
    expect(runs).toEqual(want);

    // The ImageData path, through a stub class.
    class ImageDataStub {
      readonly data: Uint8ClampedArray;
      constructor(
        readonly width: number,
        readonly height: number,
      ) {
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    }
    const g = globalThis as unknown as { ImageData?: unknown };
    g.ImageData = ImageDataStub;
    try {
      let put: ImageDataStub | null = null;
      const ctx = {
        createImageData: (w: number, h: number) => new ImageDataStub(w, h),
        putImageData: (img: ImageDataStub, x: number, y: number) => {
          expect([x, y]).toEqual([0, 0]);
          put = img;
        },
        fillRect: () => {
          throw new Error('runs used while ImageData exists');
        },
      };
      s.blitTo(ctx as unknown as Ctx);
      const img = put as ImageDataStub | null;
      expect(img).not.toBeNull();
      expect([img!.width, img!.height]).toEqual([s.w, s.h]);
      expect(Array.from(new Uint32Array(img!.data.buffer))).toEqual(want);
    } finally {
      delete g.ImageData;
    }
  });

  it('same input, same hash; other input, other hash', () => {
    const paint = (fill: string): PixelSurface => {
      const p = new PixelSurface(B);
      p.fillStyle = fill;
      p.fillRect(-10, -10, 20, 20);
      p.finish();
      return p;
    };
    expect(paint('g2').hash()).toBe(paint('g2').hash());
    expect(paint('s2').hash()).not.toBe(paint('g2').hash());
  });

  it('isPixelSurface is false for a recorder and FakeCanvas', () => {
    expect(isPixelSurface(new Recorder().ctx())).toBe(false);
    expect(isPixelSurface(new FakeCanvas().getContext())).toBe(false);
    expect(isPixelSurface(s)).toBe(true);
  });

  it("fillStyle = 'y1' paints slot y1 and counts no miss", () => {
    s.fillStyle = 'y1';
    s.fillRect(0, 0, 4, 4);
    expect(s.pixel(s.ox, s.oy)).toBe(slotIndex('y1'));
    expect(s.misses).toBe(0);
  });

  it('a colour with no map entry counts one miss on the surface', () => {
    s.fillStyle = '#123456';
    expect(s.misses).toBe(1);
  });

  it('the matrix stack serves translate, save and restore', () => {
    s.fillStyle = 'g2';
    s.save();
    s.translate(10, 0);
    s.fillRect(0, 0, 2, 2);
    s.restore();
    s.fillRect(0, 0, 2, 2);
    expect(s.pixel(s.ox + 5, s.oy)).not.toBe(0);
    expect(s.pixel(s.ox, s.oy)).not.toBe(0);
  });

  it('curves become segments of at most 1 art pixel (§5.3 rule 4)', () => {
    /** The points of the last sub-path, read through a cast (they are private). */
    const longest = (p: PixelSurface): number => {
      const subs = (p as unknown as { subs: { pts: number[] }[] }).subs;
      const pts = (subs[subs.length - 1] as { pts: number[] }).pts;
      let m = 0;
      for (let k = 2; k < pts.length; k += 2) {
        m = Math.max(m, Math.hypot((pts[k] as number) - (pts[k - 2] as number), (pts[k + 1] as number) - (pts[k - 1] as number)));
      }
      return m;
    };
    const quad = new PixelSurface(B);
    quad.beginPath();
    quad.moveTo(-30, 0);
    quad.quadraticCurveTo(30, 0, 30, 0);
    expect(longest(quad)).toBeLessThanOrEqual(1);
    const cubic = new PixelSurface(B);
    cubic.beginPath();
    cubic.moveTo(-30, 0);
    cubic.bezierCurveTo(30, 0, 30, 0, 30, 0);
    expect(longest(cubic)).toBeLessThanOrEqual(1);
    const arc = new PixelSurface(B);
    arc.beginPath();
    arc.arc(0, 0, 30, 0, Math.PI * 2);
    expect(longest(arc)).toBeLessThanOrEqual(1);
  });
});
