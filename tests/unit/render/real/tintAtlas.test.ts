import { describe, expect, it } from 'vitest';
import {
  TINT_ATLAS_MAX_BYTES, TINT_ATLAS_MAX_PAGES, TINT_GUTTER_PX, TINT_PAGE_BYTES, TINT_PAGE_PX, TINT_SCRATCH_HOLD, TINT_STALE_FRAMES, TintAtlas,
  TINT_CANVAS_FAIL_LIMIT,
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
  refused: string[] = [];
  hold(id: string, bytes: number): void { if (bytes > 0) this.held.set(id, bytes); else this.held.delete(id); }
  admit(id: string, bytes: number): boolean {
    let total = bytes;
    for (const [k, v] of this.held) if (k !== id) total += v;
    if (total > this.room) { this.refused.push(id); return false; }
    this.hold(id, bytes);
    return true;
  }
  total(): number { let n = 0; for (const v of this.held.values()) n += v; return n; }
  /** Page holds only (`tint:<page>`), without the scratch canvas. */
  pages(): string[] { return [...this.held.keys()].filter((k) => k !== TINT_SCRATCH_HOLD); }
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
    // The scratch canvas the frame was read through is held too (all picture memory counts).
    expect([...sets.held.entries()]).toEqual([['tint:0', TINT_PAGE_BYTES], [TINT_SCRATCH_HOLD, 40 * 80 * 4]]);
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
    // One full-page frame per request (with its gutter it fills the page): 12 pages.
    const rect = { x: 0, y: 0, w: TINT_PAGE_PX - TINT_GUTTER_PX, h: 256 - TINT_GUTTER_PX };
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
    const rect = { x: 0, y: 0, w: TINT_PAGE_PX - TINT_GUTTER_PX, h: 256 - TINT_GUTTER_PX };
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
    // 12 pages of 72 guest frames: slots of 42 x 82 with the gutter, 3 shelves of 24.
    const n = TINT_ATLAS_MAX_PAGES * 72;
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

  it('1,000 guests in 12 colours at d4 stay within the atlas cap (24 MiB since Task 4b)', () => {
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
      expect(a.bytes()).toBeLessThanOrEqual(TINT_ATLAS_MAX_BYTES);
      return sp !== undefined;
    };
    // 1,000 random requests, frame after frame (the worst case: nothing repeats).
    for (let f = 0; f < 5; f++) {
      a.beginFrame();
      for (let g = 0; g < 1000; g++) draw(rnd(32), rnd(8), rnd(4), rnd(12));
    }
    expect(a.pages()).toBe(TINT_ATLAS_MAX_PAGES);
    // Then a steady crowd of 1,000 guests on screen (each its own set, facing, walk frame and colour): about 960
    // different frames: all fit (the full-atlas case is "evicts least recently used when full" and "refuses ...").
    const crowd = Array.from({ length: 1000 }, () => [rnd(32), rnd(8), rnd(4), rnd(12)] as const);
    let tinted = 0;
    for (let f = 0; f < 6; f++) {
      a.beginFrame();
      tinted = crowd.filter(([s1, fc, w, c]) => draw(s1, fc, w, c)).length;
    }
    expect(a.bytes()).toBeLessThanOrEqual(TINT_ATLAS_MAX_BYTES);
    expect(a.pages()).toBeLessThanOrEqual(TINT_ATLAS_MAX_PAGES);
    expect(sets.total()).toBe(a.bytes() + a.scratchBytes());
    // The crowd's frames evicted the random ones (least recently used); its ~960 frames fit the 1,728 slots of 24 pages.
    expect(tinted).toBe(1000);
  }, 30_000); // ~1,000 software tints at d4 take seconds alone; under machine load they pass the 5 s default.

  it('a coaster-like d4 view and the turn after it fit without refusal (Task 4b: the coaster bench stall)', () => {
    // Sizes from the coaster bench at density 4: rail tiles up to 163 x 347 (a 350-row page each 6), rail tiles of
    // 163 x 269, guests about 72 x 71, cars 191 x 85. On a turn, the old view's frames are still protected (drawn the
    // frame before) while the new view's are asked for, so both views are held for a moment.
    const { a } = atlas();
    const base = noise(1200, 400, 31);
    const mask = noise(1200, 400, 32);
    const view = (from: number): [number, { x: number; y: number; w: number; h: number }][] => {
      const v: [number, { x: number; y: number; w: number; h: number }][] = [];
      let id = from;
      for (let i = 0; i < 12; i++) v.push([id++, { x: 0, y: 0, w: 163, h: 347 }]);
      for (let i = 0; i < 6; i++) v.push([id++, { x: 0, y: 0, w: 163, h: 269 }]);
      for (let i = 0; i < 100; i++) v.push([id++, { x: 0, y: 0, w: 72, h: 71 }]);
      for (let i = 0; i < 10; i++) v.push([id++, { x: 0, y: 0, w: 191, h: 85 }]);
      return v;
    };
    const draw = (v: ReturnType<typeof view>): number => {
      let refused = 0;
      for (const [f, rect] of v) if (!a.get(1, f, 0) && !a.request(1, f, 0, base, mask, rect)) refused++;
      a.step(Infinity);
      return refused;
    };
    const before = view(0);
    const after = view(1000);
    for (let f = 0; f < 3; f++) { a.beginFrame(); expect(draw(before)).toBe(0); }
    // The turn: the new view's frames come in while the old view's were drawn the frame before.
    for (let f = 0; f < 3; f++) { a.beginFrame(); expect(draw(after)).toBe(0); }
    expect(a.bytes()).toBeLessThanOrEqual(TINT_ATLAS_MAX_BYTES);
    // Below the 29 MB the whole-sheet tints held in the same scene.
    expect(TINT_ATLAS_MAX_BYTES).toBeLessThan(29 * 2 ** 20);
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
    const rect = { x: 0, y: 0, w: TINT_PAGE_PX - TINT_GUTTER_PX, h: 256 - TINT_GUTTER_PX };
    const pages: PixCanvas[] = [];
    for (let i = 0; i < 3; i++) { a.beginFrame(); a.request(1, 0, i, base, mask, rect); a.step(Infinity); pages.push(a.get(1, 0, i)!.image as unknown as PixCanvas); }
    // Colour 2 is drawn this frame: kept.
    expect(a.reclaim(1)).toBe(TINT_PAGE_BYTES);
    expect(a.get(1, 0, 0)).toBeUndefined();
    expect(pages[0]!.width).toBe(0);
    expect(a.reclaim(1e12)).toBe(TINT_PAGE_BYTES);
    expect(a.get(1, 0, 2)).toBeTruthy();
    expect(sets.total() - a.scratchBytes()).toBe(TINT_PAGE_BYTES);
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
    expect(sets.pages()).toEqual([]);
  });

  it('a frame taller than a page row band gets a taller page; one bigger than a page is refused', () => {
    const { a } = atlas();
    const base = noise(1100, 400, 19);
    const mask = noise(1100, 400, 20);
    a.beginFrame();
    expect(a.request(1, 0, 0, base, mask, { x: 0, y: 0, w: 256, h: 348 })).toBe(true);
    a.step(Infinity);
    const sp = a.get(1, 0, 0)!;
    expect((sp.image as unknown as PixCanvas).height).toBe(348 + TINT_GUTTER_PX);
    expect(a.bytes()).toBe(TINT_PAGE_PX * (348 + TINT_GUTTER_PX) * 4);
    expect(a.request(1, 1, 0, base, mask, { x: 0, y: 0, w: 1100, h: 10 })).toBe(false);
    // With its gutter a 1023-px frame no longer fits a page.
    expect(a.request(1, 2, 0, base, mask, { x: 0, y: 0, w: TINT_PAGE_PX - 1, h: 10 })).toBe(false);
  });

  it('a page without a 2D context is freed and only that request fails; the sheet is not blamed (fix round 1, item 5)', () => {
    const errors: unknown[] = [];
    const sheetErrors: number[] = [];
    const sets = new FakeSets();
    let broken = true;
    const mk = (w: number, h: number): CanvasLike => {
      const c = new PixCanvas(w, h);
      if (broken && w === TINT_PAGE_PX) (c as unknown as { getContext: () => null }).getContext = () => null;
      return c as unknown as CanvasLike;
    };
    const a = new TintAtlas(sets, mk, { onError: (k) => sheetErrors.push(k), onCanvasError: (e) => errors.push(e) });
    a.beginFrame();
    expect(a.request(5, 0, 0x123456, noise(8, 8, 1), noise(8, 8, 2), { x: 0, y: 0, w: 4, h: 4 })).toBe(true);
    a.step(Infinity);
    expect(errors).toHaveLength(1);
    expect(sheetErrors).toEqual([]);
    expect(a.failed(5)).toBe(false);
    expect(a.get(5, 0, 0x123456)).toBeUndefined();
    expect(a.pages()).toBe(0);
    expect(a.bytes()).toBe(0);
    expect(sets.pages()).toEqual([]);
    // Asked again with a working canvas: tinted.
    broken = false;
    a.beginFrame();
    expect(a.request(5, 0, 0x123456, noise(8, 8, 1), noise(8, 8, 2), { x: 0, y: 0, w: 4, h: 4 })).toBe(true);
    a.step(Infinity);
    expect(a.get(5, 0, 0x123456)).toBeTruthy();
  });

  it('pages that never get a 2D context stop the atlas after TINT_CANVAS_FAIL_LIMIT tries: requests say no room, reported once (final review minor 3)', () => {
    const errors: unknown[] = [];
    const sets = new FakeSets();
    let pagesMade = 0;
    const mk = (w: number, h: number): CanvasLike => {
      const c = new PixCanvas(w, h);
      if (w === TINT_PAGE_PX) { pagesMade++; (c as unknown as { getContext: () => null }).getContext = () => null; }
      return c as unknown as CanvasLike;
    };
    const a = new TintAtlas(sets, mk, { onCanvasError: (e) => errors.push(e) });
    expect(TINT_CANVAS_FAIL_LIMIT).toBe(3);
    const ask = (): boolean => a.request(5, 0, 0x123456, noise(8, 8, 1), noise(8, 8, 2), { x: 0, y: 0, w: 4, h: 4 });
    for (let f = 0; f < TINT_CANVAS_FAIL_LIMIT; f++) {
      a.beginFrame();
      expect(ask()).toBe(true);
      a.step(Infinity);
    }
    expect(a.stopped()).toBe(true);
    expect(errors).toHaveLength(TINT_CANVAS_FAIL_LIMIT);
    expect(String(errors.at(-1))).toMatch(/tinting stopped/);
    for (let f = 0; f < 10; f++) {
      a.beginFrame();
      expect(ask()).toBe(false);
      a.step(Infinity);
    }
    expect(errors).toHaveLength(TINT_CANVAS_FAIL_LIMIT);
    expect(pagesMade).toBe(TINT_CANVAS_FAIL_LIMIT);
    expect(a.failed(5)).toBe(false);
    expect(sets.pages()).toEqual([]);
  });

  it('a tinted frame between canvas failures resets the count', () => {
    let broken = true;
    const mk = (w: number, h: number): CanvasLike => {
      const c = new PixCanvas(w, h);
      if (broken && w === TINT_PAGE_PX) (c as unknown as { getContext: () => null }).getContext = () => null;
      return c as unknown as CanvasLike;
    };
    const a = new TintAtlas(new FakeSets(), mk, {});
    // A whole page per frame, so every request makes a new page.
    const base = noise(1100, 300, 3);
    const mask = noise(1100, 300, 4);
    const ask = (frame: number): boolean => a.request(5, frame, 0x123456, base, mask, { x: 0, y: 0, w: TINT_PAGE_PX - TINT_GUTTER_PX, h: 256 - TINT_GUTTER_PX });
    for (const [n, b] of [[0, true], [1, true], [2, false], [3, true], [4, true]] as const) {
      broken = b;
      a.beginFrame();
      expect(ask(n)).toBe(true);
      a.step(Infinity);
      expect(!!a.get(5, n, 0x123456)).toBe(!b);
    }
    expect(a.stopped()).toBe(false);
  });

  it('a sheet that cannot be read (mask read throws) fails that sheet, reported once, and frees what it made', () => {
    const errors: [number, number][] = [];
    const sets = new FakeSets();
    const a = new TintAtlas(sets, make, { onError: (k, c) => errors.push([k, c]) });
    // A mask image with no pixels to copy: drawImage throws on it.
    const badMask: Decoded = { image: { width: 8, height: 8 } as unknown as CanvasImageSource, bytes: 0, close() {} };
    a.beginFrame();
    a.request(5, 0, 0x123456, noise(8, 8, 1), badMask, { x: 0, y: 0, w: 4, h: 4 });
    a.request(5, 1, 0x123456, noise(8, 8, 1), badMask, { x: 0, y: 0, w: 4, h: 4 });
    a.step(Infinity);
    expect(a.failed(5)).toBe(true);
    expect(errors).toEqual([[5, 0x123456]]);
    expect(a.get(5, 0, 0x123456)).toBeUndefined();
    expect(a.request(5, 2, 0, noise(8, 8, 1), noise(8, 8, 2), { x: 0, y: 0, w: 4, h: 4 })).toBe(false);
    expect(a.bytes()).toBe(0);
    expect(sets.pages()).toEqual([]);
  });

  it('frames are packed with a transparent gutter between them (fix round 1, item 1)', () => {
    const { a } = atlas();
    // Fully opaque sheet: every tinted pixel has alpha 255.
    const base = noise(64, 64, 21);
    const mask = noise(64, 64, 22);
    for (let i = 3; i < (base.image as unknown as PixCanvas).data.length; i += 4) (base.image as unknown as PixCanvas).data[i] = 255;
    a.beginFrame();
    a.request(1, 0, 0, base, mask, { x: 0, y: 0, w: 10, h: 12 });
    a.request(1, 1, 0, base, mask, { x: 10, y: 0, w: 10, h: 12 });
    a.request(1, 2, 0, base, mask, { x: 20, y: 0, w: 10, h: 20 }); // a new shelf below
    a.step(Infinity);
    const [p, q, r] = [0, 1, 2].map((f) => a.get(1, f, 0)!);
    const page = p!.image as unknown as PixCanvas;
    const alpha = (x: number, y: number) => page.data[(y * page.width + x) * 4 + 3]!;
    // Side by side on one shelf, TINT_GUTTER_PX apart; the next shelf TINT_GUTTER_PX below.
    expect(q!.sy).toBe(p!.sy);
    expect(q!.sx! - (p!.sx! + p!.w)).toBe(TINT_GUTTER_PX);
    expect(r!.sy! - (p!.sy! + p!.h)).toBe(TINT_GUTTER_PX);
    for (let y = p!.sy!; y < p!.sy! + p!.h + TINT_GUTTER_PX; y++) {
      for (let x = p!.sx! + p!.w; x < q!.sx!; x++) expect(alpha(x, y)).toBe(0);
    }
    for (let y = p!.sy! + p!.h; y < r!.sy!; y++) for (let x = 0; x < 40; x++) expect(alpha(x, y)).toBe(0);
    expect(alpha(p!.sx!, p!.sy!)).toBe(255);
  });

  it('a reused slot holds no pixels of the frame before it outside the new frame (fix round 1, item 1)', () => {
    const { a } = atlas();
    const base = noise(600, 200, 23);
    const mask = noise(600, 200, 24);
    for (let i = 3; i < (base.image as unknown as PixCanvas).data.length; i += 4) (base.image as unknown as PixCanvas).data[i] = 255;
    a.beginFrame();
    // A wide frame, then a small one on the same shelf (kept drawn, so the page stays).
    a.request(1, 0, 0, base, mask, { x: 0, y: 0, w: 500, h: 100 });
    a.request(1, 1, 0, base, mask, { x: 0, y: 0, w: 40, h: 80 });
    a.step(Infinity);
    const big = a.get(1, 0, 0)!;
    const page = big.image as unknown as PixCanvas;
    for (let f = 0; f < 4; f++) { a.beginFrame(); a.get(1, 1, 0); }
    a.sweep(2); // the wide frame goes; its slot is free
    expect(a.get(1, 0, 0)).toBeUndefined();
    a.request(1, 2, 0, base, mask, { x: 0, y: 0, w: 40, h: 80 });
    a.step(Infinity);
    const small = a.get(1, 2, 0)!;
    expect([small.sx, small.sy]).toEqual([big.sx, big.sy]);
    // The new slot (frame + gutter, the shelf's full height) holds only the new frame's pixels.
    let stale = 0;
    for (let y = big.sy!; y < big.sy! + big.h + TINT_GUTTER_PX; y++) {
      for (let x = small.sx!; x < small.sx! + small.w + TINT_GUTTER_PX; x++) {
        const inside = x < small.sx! + small.w && y < small.sy! + small.h;
        if (!inside && page.data[(y * page.width + x) * 4 + 3]) stale++;
      }
    }
    expect(stale).toBe(0);
  });

  it('the scratch canvas grows to the biggest frame once: alternating shapes make it at most twice (fix round 1, item 2)', () => {
    const sets = new FakeSets();
    const scratches: [number, number][] = [];
    const mk = (w: number, h: number): CanvasLike => { if (w !== TINT_PAGE_PX) scratches.push([w, h]); return new PixCanvas(w, h) as unknown as CanvasLike; };
    const a = new TintAtlas(sets, mk);
    const base = noise(300, 400, 25);
    const mask = noise(300, 400, 26);
    a.beginFrame();
    // 40 x 80 guests and 256 x 348 rail tiles; then shapes that each grow only one side (wide-short, narrow-tall),
    // which remade the scratch on every switch when its old size was read after zeroing it.
    for (let i = 0; i < 6; i++) {
      const rect = i % 2 ? { x: 0, y: 0, w: 256, h: 348 } : { x: 0, y: 0, w: 40, h: 80 };
      a.request(1, i, 0, base, mask, rect);
      a.step(Infinity);
      expect(a.get(1, i, 0)).toBeTruthy();
    }
    expect(scratches).toEqual([[40, 80], [256, 348]]);
    const b = new TintAtlas(sets, mk);
    scratches.length = 0;
    b.beginFrame();
    for (let i = 0; i < 6; i++) {
      const rect = i % 2 ? { x: 0, y: 0, w: 40, h: 348 } : { x: 0, y: 0, w: 256, h: 80 };
      b.request(2, i, 0, base, mask, rect);
      b.step(Infinity);
      expect(b.get(2, i, 0)).toBeTruthy();
    }
    expect(scratches).toEqual([[256, 80], [256, 348]]);
  });

  it('the scratch canvas is held in the set manager as tint:scratch, updated when it grows, released on dispose (fix round 1, item 3)', () => {
    const { sets, a } = atlas();
    const base = noise(300, 400, 27);
    const mask = noise(300, 400, 28);
    a.beginFrame();
    a.request(1, 0, 0, base, mask, { x: 0, y: 0, w: 40, h: 80 });
    a.step(Infinity);
    expect(sets.held.get(TINT_SCRATCH_HOLD)).toBe(40 * 80 * 4);
    a.request(1, 1, 0, base, mask, { x: 0, y: 0, w: 30, h: 120 });
    a.step(Infinity);
    expect(sets.held.get(TINT_SCRATCH_HOLD)).toBe(40 * 120 * 4);
    expect(a.scratchBytes()).toBe(40 * 120 * 4);
    a.dispose();
    expect(sets.held.has(TINT_SCRATCH_HOLD)).toBe(false);
  });

  it('stale frames are evicted before a new page is asked of a full budget: no refusal counted (fix round 1, item 4)', () => {
    const { sets, a } = atlas();
    const base = noise(1024, 256, 29);
    const mask = noise(1024, 256, 30);
    a.beginFrame();
    a.request(1, 0, 0, base, mask, { x: 0, y: 0, w: TINT_PAGE_PX - TINT_GUTTER_PX, h: 256 - TINT_GUTTER_PX });
    a.step(Infinity);
    // The global budget is full: nothing more than what is held fits.
    sets.room = sets.total();
    // The full-page frame is now stale (not drawn for more than TINT_STALE_FRAMES frames).
    for (let f = 0; f <= TINT_STALE_FRAMES; f++) a.beginFrame();
    expect(a.request(1, 1, 0, base, mask, { x: 0, y: 0, w: 40, h: 80 })).toBe(true);
    a.step(Infinity);
    expect(a.get(1, 1, 0)).toBeTruthy();
    expect(a.get(1, 0, 0)).toBeUndefined();
    expect(sets.refused).toEqual([]);
    expect(a.pages()).toBe(1);
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
