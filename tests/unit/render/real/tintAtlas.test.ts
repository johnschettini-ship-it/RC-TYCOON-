import { describe, expect, it } from 'vitest';
import {
  TINT_ATLAS_MAX_BYTES, TINT_ATLAS_MAX_PAGES, TINT_PAGE_BYTES, TINT_PAGE_PX, TintAtlas,
} from '../../../../src/render/real/tintAtlas';
import { tintPixels, type CanvasLike } from '../../../../src/render/real/tint';
import type { Decoded } from '../../../../src/render/real/setManager';

/** A canvas that holds pixels (drawImage with a source rectangle, get/putImageData, clearRect). */
class PixCanvas {
  data: Uint8ClampedArray;
  constructor(public width: number, public height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
  getContext(): unknown {
    const self = this;
    return {
      drawImage(src: PixCanvas, ...a: number[]) {
        const [sx = 0, sy = 0, sw = src.width, sh = src.height, dx = 0, dy = 0] = a.length === 2 ? [0, 0, src.width, src.height, a[0], a[1]] : a;
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

/** A sheet of pseudo-random pixels (seeded), as a Decoded. */
function noise(w: number, h: number, seed: number): Decoded {
  const c = new PixCanvas(w, h);
  let s = seed >>> 0;
  for (let i = 0; i < c.data.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    c.data[i] = s >>> 24;
  }
  return { image: c as unknown as CanvasImageSource, bytes: w * h * 4, close() {} };
}

/** A fake set manager: room in bytes for everything held. */
class FakeSets {
  held = new Map<string, number>();
  room = Number.POSITIVE_INFINITY;
  hold(id: string, bytes: number): void { if (bytes > 0) this.held.set(id, bytes); else this.held.delete(id); }
  admit(id: string, bytes: number): boolean {
    let total = bytes;
    for (const [k, v] of this.held) if (k !== id) total += v;
    if (total > this.room) return false;
    this.hold(id, bytes);
    return true;
  }
  total(): number { let n = 0; for (const v of this.held.values()) n += v; return n; }
}

const made: PixCanvas[] = [];
const make = (w: number, h: number): CanvasLike => { const c = new PixCanvas(w, h); made.push(c); return c as unknown as CanvasLike; };

function atlas(sets = new FakeSets()) {
  return { sets, a: new TintAtlas(sets, make) };
}

describe('TintAtlas (Task 4: per-frame tint in a shared atlas)', () => {
  it('tints only the requested frame', () => {
    const base = noise(400, 300, 1);
    const mask = noise(400, 300, 2);
    const { sets, a } = atlas();
    const rect = { x: 120, y: 60, w: 40, h: 80 };
    const rgb = 0x3366cc;
    a.beginFrame();
    a.request(7, 3, rgb, base, mask, rect);
    a.step(Number.POSITIVE_INFINITY);
    // One page, admitted to the set manager under `tint:<page>`.
    expect(a.bytes()).toBe(TINT_PAGE_BYTES);
    expect([...sets.held.entries()]).toEqual([['tint:0', TINT_PAGE_BYTES]]);
    const sp = a.get(7, 3, rgb)!;
    expect(sp).toBeTruthy();
    expect([sp.w, sp.h]).toEqual([40, 80]);
    const page = sp.image as unknown as PixCanvas;
    expect(page.width).toBe(TINT_PAGE_PX);
    // The tinted pixels equal tintPixels of the base rectangle with its mask rectangle.
    const cut = (d: Decoded) => (d.image as unknown as PixCanvas).getContext() as { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } };
    const want = tintPixels(cut(base).getImageData(rect.x, rect.y, rect.w, rect.h).data, cut(mask).getImageData(rect.x, rect.y, rect.w, rect.h).data, [0x33, 0x66, 0xcc]);
    const got = (page.getContext() as ReturnType<typeof cut>).getImageData(sp.sx!, sp.sy!, sp.w, sp.h).data;
    expect(Array.from(got)).toEqual(Array.from(want));
  });

  it('returns undefined until tinted, then a sprite', () => {
    const { a } = atlas();
    const base = noise(64, 64, 3);
    const mask = noise(64, 64, 4);
    a.beginFrame();
    expect(a.get(1, 0, 0xff0000)).toBeUndefined();
    expect(a.request(1, 0, 0xff0000, base, mask, { x: 0, y: 0, w: 10, h: 20, ox: 5, oy: 19, scale: 4 })).toBe(true);
    expect(a.get(1, 0, 0xff0000)).toBeUndefined();
    a.step(Number.POSITIVE_INFINITY);
    const sp = a.get(1, 0, 0xff0000)!;
    expect(sp).toBeTruthy();
    expect([sp.w, sp.h, sp.ox, sp.oy, sp.scale]).toEqual([10, 20, 5, 19, 4]);
    // The same object every draw; another colour is another frame.
    expect(a.get(1, 0, 0xff0000)).toBe(sp);
    expect(a.get(1, 0, 0x00ff00)).toBeUndefined();
  });

  it('tints at least one frame a frame, then stops when the budget is spent', () => {
    let t = 0;
    const a = new TintAtlas(new FakeSets(), make, { now: () => (t += 2) });
    const base = noise(64, 64, 5);
    const mask = noise(64, 64, 6);
    a.beginFrame();
    for (let c = 0; c < 4; c++) a.request(1, 0, c, base, mask, { x: 0, y: 0, w: 8, h: 8 });
    a.step(1); // each job measures 2 ms: one job, though the budget is 1 ms
    expect([0, 1, 2, 3].map((c) => a.get(1, 0, c) !== undefined)).toEqual([true, false, false, false]);
    a.step(1); // the frame's budget is spent and one job ran: nothing more this frame
    expect(a.get(1, 0, 1)).toBeUndefined();
    a.beginFrame();
    a.step(3); // 2 ms, then 4 ms >= 3: two jobs
    expect([0, 1, 2, 3].map((c) => a.get(1, 0, c) !== undefined)).toEqual([true, true, true, false]);
  });

  it('evicts least recently used when full', () => {
    const { a } = atlas();
    const base = noise(1024, 256, 7);
    const mask = noise(1024, 256, 8);
    // One full-page frame per request: 12 pages.
    const rect = { x: 0, y: 0, w: TINT_PAGE_PX, h: 256 };
    for (let i = 0; i < TINT_ATLAS_MAX_PAGES; i++) {
      a.beginFrame();
      expect(a.request(1, 0, i, base, mask, rect)).toBe(true);
      a.step(Number.POSITIVE_INFINITY);
    }
    expect(a.pages()).toBe(TINT_ATLAS_MAX_PAGES);
    expect(a.bytes()).toBe(TINT_ATLAS_MAX_BYTES);
    // Colour 0 is touched again later: colour 1 is now the one not used for the longest.
    a.beginFrame();
    expect(a.get(1, 0, 0)).toBeTruthy();
    // Frames drawn this frame or the one before are kept (no thrash): two frames later, the LRU frame may go.
    a.beginFrame();
    a.beginFrame();
    expect(a.request(1, 0, 99, base, mask, rect)).toBe(true);
    a.step(Number.POSITIVE_INFINITY);
    expect(a.get(1, 0, 1)).toBeUndefined();
    expect(a.get(1, 0, 99)).toBeTruthy();
    expect(a.get(1, 0, 0)).toBeTruthy();
    expect(a.bytes()).toBe(TINT_ATLAS_MAX_BYTES);
  });

  it('refuses (never evicts) frames drawn this frame or the frame before', () => {
    const { a } = atlas();
    const base = noise(1024, 256, 9);
    const mask = noise(1024, 256, 10);
    const rect = { x: 0, y: 0, w: TINT_PAGE_PX, h: 256 };
    a.beginFrame();
    for (let i = 0; i < TINT_ATLAS_MAX_PAGES; i++) a.request(1, 0, i, base, mask, rect);
    expect(a.request(1, 0, 99, base, mask, rect)).toBe(false);
    a.beginFrame();
    expect(a.request(1, 0, 99, base, mask, rect)).toBe(false);
    a.beginFrame();
    expect(a.request(1, 0, 99, base, mask, rect)).toBe(true);
  });

  it('reuses the slot of an evicted frame of the same size', () => {
    const { a } = atlas();
    const base = noise(512, 512, 11);
    const mask = noise(512, 512, 12);
    // 12 pages of 75 guest frames (3 shelves of 80 rows, 25 frames of 40 a shelf).
    const n = TINT_ATLAS_MAX_PAGES * 75;
    a.beginFrame();
    for (let i = 0; i < n; i++) expect(a.request(1, i, 0, base, mask, { x: 0, y: 0, w: 40, h: 80 })).toBe(true);
    a.step(Number.POSITIVE_INFINITY);
    expect(a.pages()).toBe(TINT_ATLAS_MAX_PAGES);
    a.beginFrame();
    a.beginFrame();
    expect(a.request(1, n, 0, base, mask, { x: 0, y: 0, w: 40, h: 80 })).toBe(true);
    expect(a.get(1, 0, 0)).toBeUndefined(); // the oldest went
    expect(a.get(1, 1, 0)).toBeTruthy(); // only it
    expect(a.pages()).toBe(TINT_ATLAS_MAX_PAGES);
  });

  it('1,000 guests in 12 colours at d4 stay within 12 MB', () => {
    const { sets, a } = atlas();
    const base = noise(1280, 640, 13);
    const mask = noise(1280, 640, 14);
    // 32 sets x 8 facings x 4 walk frames x 12 colours of 40 x 80 frames.
    let s = 12345;
    const rnd = (n: number) => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) % n; };
    const draw = (set: number, facing: number, walk: number, colour: number): boolean => {
      const frame = facing * 4 + walk;
      const rect = { x: (frame % 32) * 40, y: (frame >> 5) * 80, w: 40, h: 80 };
      let sp = a.get(set, frame, colour);
      if (!sp) { a.request(set, frame, colour, base, mask, rect); a.step(Number.POSITIVE_INFINITY); sp = a.get(set, frame, colour); }
      expect(a.bytes()).toBeLessThanOrEqual(12 * 2 ** 20);
      return sp !== undefined;
    };
    // 1,000 random requests, frame after frame (the worst case: nothing repeats).
    for (let f = 0; f < 5; f++) {
      a.beginFrame();
      for (let g = 0; g < 1000; g++) draw(rnd(32), rnd(8), rnd(4), rnd(12));
    }
    expect(a.pages()).toBe(TINT_ATLAS_MAX_PAGES);
    // Then a steady crowd of 1,000 guests on screen (each its own set, facing, walk frame and colour): about 960
    // different frames, more than the ~900 that fit, so the atlas stays full and the rest draw untinted.
    const crowd = Array.from({ length: 1000 }, () => [rnd(32), rnd(8), rnd(4), rnd(12)] as const);
    let tinted = 0;
    for (let f = 0; f < 6; f++) {
      a.beginFrame();
      tinted = crowd.filter(([s1, fc, w, c]) => draw(s1, fc, w, c)).length;
    }
    expect(a.bytes()).toBeLessThanOrEqual(12 * 2 ** 20);
    expect(a.pages()).toBeLessThanOrEqual(TINT_ATLAS_MAX_PAGES);
    expect(sets.total()).toBe(a.bytes());
    // The crowd's frames evicted the random ones (least recently used) and fill the atlas; none thrash.
    expect(tinted).toBeGreaterThanOrEqual(850);
    expect(tinted).toBeLessThan(1000);
  });

  it('a page refused by the set manager is not made; the request says no room', () => {
    const sets = new FakeSets();
    sets.room = TINT_PAGE_BYTES - 1;
    const { a } = atlas(sets);
    const before = made.length;
    a.beginFrame();
    expect(a.request(1, 0, 0, noise(8, 8, 1), noise(8, 8, 2), { x: 0, y: 0, w: 4, h: 4 })).toBe(false);
    expect(made.length).toBe(before);
    expect(a.bytes()).toBe(0);
    expect(sets.held.size).toBe(0);
  });

  it('reclaim frees whole pages not drawn this frame, least recently used first', () => {
    const { sets, a } = atlas();
    const base = noise(1024, 256, 15);
    const mask = noise(1024, 256, 16);
    const rect = { x: 0, y: 0, w: TINT_PAGE_PX, h: 256 };
    const pages: PixCanvas[] = [];
    for (let i = 0; i < 3; i++) { a.beginFrame(); a.request(1, 0, i, base, mask, rect); a.step(Infinity); pages.push(a.get(1, 0, i)!.image as unknown as PixCanvas); }
    // Colour 2 is drawn this frame: kept.
    expect(a.reclaim(1)).toBe(TINT_PAGE_BYTES);
    expect(a.get(1, 0, 0)).toBeUndefined();
    expect(pages[0]!.width).toBe(0);
    expect(a.reclaim(1e12)).toBe(TINT_PAGE_BYTES);
    expect(a.get(1, 0, 2)).toBeTruthy();
    expect(sets.total()).toBe(TINT_PAGE_BYTES);
  });

  it('drop frees the frames of one sheet and empty pages; sweep frees frames unused for a while', () => {
    const { sets, a } = atlas();
    const base = noise(64, 64, 17);
    const mask = noise(64, 64, 18);
    a.beginFrame();
    a.request(1, 0, 0, base, mask, { x: 0, y: 0, w: 8, h: 8 });
    a.request(2, 0, 0, base, mask, { x: 0, y: 0, w: 8, h: 8 });
    a.step(Infinity);
    a.drop(1);
    expect(a.get(1, 0, 0)).toBeUndefined();
    expect(a.get(2, 0, 0)).toBeTruthy();
    expect(a.pages()).toBe(1);
    for (let i = 0; i < 5; i++) a.beginFrame();
    a.sweep(3);
    expect(a.get(2, 0, 0)).toBeUndefined();
    expect(a.pages()).toBe(0);
    expect(sets.held.size).toBe(0);
  });

  it('a frame taller than a page row band gets a taller page; one bigger than a page is refused', () => {
    const { a } = atlas();
    const base = noise(1100, 400, 19);
    const mask = noise(1100, 400, 20);
    a.beginFrame();
    expect(a.request(1, 0, 0, base, mask, { x: 0, y: 0, w: 256, h: 348 })).toBe(true);
    a.step(Infinity);
    const sp = a.get(1, 0, 0)!;
    expect((sp.image as unknown as PixCanvas).height).toBe(348);
    expect(a.bytes()).toBe(TINT_PAGE_PX * 348 * 4);
    expect(a.request(1, 1, 0, base, mask, { x: 0, y: 0, w: 1100, h: 10 })).toBe(false);
  });

  it('a canvas failure marks the sheet failed, reports it once and frees what it made', () => {
    const errors: [number, number, unknown][] = [];
    const sets = new FakeSets();
    const bad = (w: number, h: number): CanvasLike => { const c = new PixCanvas(w, h); (c as unknown as { getContext: () => null }).getContext = () => null; return c as unknown as CanvasLike; };
    const a = new TintAtlas(sets, bad, { onError: (k, c, e) => errors.push([k, c, e]) });
    a.beginFrame();
    a.request(5, 0, 0x123456, noise(8, 8, 1), noise(8, 8, 2), { x: 0, y: 0, w: 4, h: 4 });
    a.step(Infinity);
    expect(a.failed(5)).toBe(true);
    expect(errors.map(([k, c]) => [k, c])).toEqual([[5, 0x123456]]);
    expect(a.get(5, 0, 0x123456)).toBeUndefined();
    expect(a.bytes()).toBe(0);
    expect(sets.held.size).toBe(0);
  });

  it('dispose frees every page', () => {
    const { sets, a } = atlas();
    a.beginFrame();
    a.request(1, 0, 0, noise(8, 8, 1), noise(8, 8, 2), { x: 0, y: 0, w: 4, h: 4 });
    a.step(Infinity);
    const page = a.get(1, 0, 0)!.image as unknown as PixCanvas;
    a.dispose();
    expect(page.width).toBe(0);
    expect(a.bytes()).toBe(0);
    expect(sets.held.size).toBe(0);
  });
});
