/**
 * The realistic title screen (VITE_ART=real build): its layout, the loading of the baked title pictures, and their
 * life cycle (spec `2026-11-16-realistic-title-and-cards-design.md`, Task 2). The title index is a fixture of the
 * schema in the plan (Task 1 bakes the real one).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkTitleIndex, realTitleLayout, type TitleIndex } from '../../../src/ui/titleScreen/real/layout';
import { createTitleSession, loadTitleArt, type TitleBitmap } from '../../../src/ui/titleScreen/real/load';
import { releasePark, setParkRelease, setTitleHold, titleHolds } from '../../../src/render/real/titleHold';

const IDX: TitleIndex = {
  wide: {
    w: 1920,
    h: 800,
    layers: { sky: 'wide-sky.webp', park: 'wide-park.webp', front: 'wide-front.webp' },
    wheel: { file: 'wide-wheel.webp', frames: 8, fw: 300, fh: 320, x: 760, y: 310 },
    nameRow: 300,
    menuAnchorX: 760,
  },
  tall: {
    w: 900,
    h: 1300,
    layers: { sky: 'tall-sky.webp', park: 'tall-park.webp', front: 'tall-front.webp' },
    wheel: { file: 'tall-wheel.webp', frames: 8, fw: 260, fh: 280, x: 500, y: 560 },
    nameRow: 520,
    menuAnchorX: 500,
  },
  sign: { line: { file: 'sign-line.webp', w: 1000, h: 140 }, stack: { file: 'sign-stack.webp', w: 560, h: 380 } },
};

/** Phone, phone small, phone sideways, laptop, desktop (menu heights as the browser measures them, about). */
const SIZES = [
  { w: 390, h: 844, menuH: 262 },
  { w: 360, h: 640, menuH: 124 },
  { w: 812, h: 375, menuH: 56 },
  { w: 1366, h: 768, menuH: 300 },
  { w: 1920, h: 1080, menuH: 320 },
  { w: 2560, h: 1440, menuH: 450 },
  { w: 1024, h: 1366, menuH: 300 },
];

describe('realTitleLayout', () => {
  it('picks the tall framing when the window is taller than wide, else the wide one', () => {
    expect(realTitleLayout({ w: 390, h: 844, menuH: 262 }, IDX).framing).toBe('tall');
    expect(realTitleLayout({ w: 1024, h: 1366, menuH: 300 }, IDX).framing).toBe('tall');
    expect(realTitleLayout({ w: 812, h: 375, menuH: 56 }, IDX).framing).toBe('wide');
    expect(realTitleLayout({ w: 1366, h: 768, menuH: 300 }, IDX).framing).toBe('wide');
    expect(realTitleLayout({ w: 800, h: 800, menuH: 200 }, IDX).framing).toBe('wide');
    // The other framing on request (its pictures are still decoding).
    expect(realTitleLayout({ w: 390, h: 844, menuH: 262, framing: 'wide' }, IDX).framing).toBe('wide');
  });

  it('puts the name above nameRow, inside the safe area, on every size (with and without insets)', () => {
    for (const z of SIZES) {
      for (const safe of [undefined, { top: 47, right: 0, bottom: 34, left: 0 }, { top: 0, right: 44, bottom: 21, left: 44 }]) {
        const l = realTitleLayout({ ...z, safe }, IDX);
        const F = IDX[l.framing];
        const rideTop = l.picture.y + Math.min(F.nameRow, F.wheel.y) * l.s;
        const sf = safe ?? { top: 0, right: 0, bottom: 0, left: 0 };
        const tag = `${z.w}x${z.h} ${JSON.stringify(safe)}`;
        expect(l.signBox.y + l.signBox.h, tag).toBeLessThanOrEqual(rideTop - 8 + 1e-6);
        expect(l.signBox.y, tag).toBeGreaterThanOrEqual(sf.top + 12 - 1e-6);
        expect(l.signBox.x, tag).toBeGreaterThanOrEqual(sf.left + 16 - 1e-6);
        expect(l.signBox.x + l.signBox.w, tag).toBeLessThanOrEqual(z.w - sf.right - 16 + 1e-6);
        expect(l.signBox.w, tag).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the sign above the wheel when the wheel stands higher than nameRow', () => {
    const idx: TitleIndex = { ...IDX, wide: { ...IDX.wide, wheel: { ...IDX.wide.wheel, y: 200 } }, tall: { ...IDX.tall, wheel: { ...IDX.tall.wheel, y: 400 } } };
    for (const z of SIZES) {
      const l = realTitleLayout(z, idx);
      const F = idx[l.framing];
      expect(F.wheel.y).toBeLessThan(F.nameRow);
      expect(l.signBox.y + l.signBox.h, `${z.w}x${z.h}`).toBeLessThanOrEqual(l.wheel.y - 8 + 1e-6);
    }
  });

  it('uses the one-line sign on wide framings and the stacked sign on tall ones', () => {
    expect(realTitleLayout({ w: 1366, h: 768, menuH: 300 }, IDX).sign).toBe('line');
    expect(realTitleLayout({ w: 812, h: 375, menuH: 56 }, IDX).sign).toBe('line');
    expect(realTitleLayout({ w: 390, h: 844, menuH: 262 }, IDX).sign).toBe('stack');
  });

  it('never lets the desktop menu cover the wheel (menuAnchorX), drift included', () => {
    for (const z of SIZES.filter((s) => s.w >= 900 && s.w >= s.h)) {
      for (const reducedMotion of [false, true]) {
        const l = realTitleLayout({ ...z, reducedMotion }, IDX);
        expect(l.base.kind).toBe('desktop');
        const box = l.base.menuBox;
        if (!box) throw new Error('no menu box');
        const anchor = l.picture.x + IDX.wide.menuAnchorX * l.s - l.drift.park;
        expect(anchor, `${z.w}x${z.h}`).toBeGreaterThanOrEqual(box.left + box.width);
        expect(l.wheel.x).toBeCloseTo(l.picture.x + IDX.wide.wheel.x * l.s, 6);
      }
    }
  });

  it('covers the window width with the drift to spare on both sides, and fills under the picture to the bottom', () => {
    for (const z of SIZES) {
      const l = realTitleLayout(z, IDX);
      const d = Math.max(l.drift.sky, l.drift.park, l.drift.front);
      expect(l.picture.x).toBeLessThanOrEqual(-d + 1e-6);
      expect(l.picture.x + l.picture.w).toBeGreaterThanOrEqual(z.w + d - 1e-6);
      expect(l.fill.y).toBeCloseTo(l.picture.y + l.picture.h, 6);
      expect(l.fill.y + l.fill.h).toBeGreaterThanOrEqual(z.h - 1e-6);
      // Phones and low windows: the picture ends near the menu's top edge, so the menu stands on the fill.
      if (l.base.kind !== 'desktop') expect(l.picture.y + l.picture.h).toBeLessThanOrEqual(z.h - l.base.mb - z.menuH + 24 + 1e-6 + Math.max(0, -0));
    }
  });

  it('allows a non-integer scale (smooth scaling)', () => {
    const l = realTitleLayout({ w: 1366, h: 768, menuH: 300 }, IDX);
    expect(Number.isInteger(l.s)).toBe(false);
    expect(Number.isInteger(realTitleLayout({ w: 390, h: 844, menuH: 262 }, IDX).signS)).toBe(false);
  });

  it('has no drift with reduced motion, and a few px of drift without', () => {
    const still = realTitleLayout({ w: 390, h: 844, menuH: 262, reducedMotion: true }, IDX);
    expect(still.drift).toEqual({ sky: 0, park: 0, front: 0 });
    const moving = realTitleLayout({ w: 390, h: 844, menuH: 262 }, IDX);
    expect(moving.drift.sky).toBeGreaterThan(0);
    expect(moving.drift.sky).toBeLessThan(moving.drift.park);
    expect(moving.drift.park).toBeLessThan(moving.drift.front);
    expect(moving.drift.front).toBeLessThanOrEqual(12);
  });

  it('keeps design E’s menu, plate and sheet (the base layout)', () => {
    const l = realTitleLayout({ w: 390, h: 844, menuH: 262 }, IDX);
    expect(l.base.kind).toBe('phone');
    expect(l.base.menuPlace).not.toBeNull();
  });
});

/** The baked index (full bake, 2026-11-16): the numbers the owner's screenshots came from. */
const REAL_IDX: TitleIndex = {
  wide: { ...IDX.wide, wheel: { file: 'wide-wheel.webp', frames: 8, fw: 232, fh: 291, x: 1272, y: 284 }, nameRow: 232, menuAnchorX: 1276 },
  tall: { ...IDX.tall, wheel: { file: 'tall-wheel.webp', frames: 8, fw: 192, fh: 227, x: 607, y: 572 }, nameRow: 518, menuAnchorX: 611 },
  sign: { line: { file: 'sign-line.webp', w: 1100, h: 307 }, stack: { file: 'sign-stack.webp', w: 600, h: 553 } },
};
/** The owner's sizes, with the menu heights the browser measures at normal and large (175 %) text, about. */
const OWNER_SIZES = [
  { w: 1366, h: 768, menuH: [178, 290] },
  { w: 1920, h: 1080, menuH: [200, 330] },
  { w: 1280, h: 800, menuH: [200, 320] },
  { w: 1024, h: 768, menuH: [178, 290] },
  { w: 812, h: 375, menuH: [56, 96] },
  { w: 390, h: 844, menuH: [187, 300] },
  { w: 360, h: 640, menuH: [124, 210] },
];

describe('realTitleLayout on the baked index (owner review: phone seam, desktop crop)', () => {
  for (const z of OWNER_SIZES) {
    for (const menuH of z.menuH) {
      for (const reducedMotion of [false, true]) {
        it(`${z.w}x${z.h}, menu ${menuH}px${reducedMotion ? ', reduced motion' : ''}: whole wheel in the window, name above the rides, menu clear`, () => {
          const l = realTitleLayout({ w: z.w, h: z.h, menuH, reducedMotion }, REAL_IDX);
          const F = REAL_IDX[l.framing];
          const dp = l.drift.park;
          // The whole wheel, at both ends of its drift.
          expect(l.wheel.x - dp).toBeGreaterThanOrEqual(-1e-6);
          expect(l.wheel.x + l.wheel.w + dp).toBeLessThanOrEqual(z.w + 1e-6);
          expect(l.wheel.y).toBeGreaterThanOrEqual(-1e-6);
          expect(l.wheel.y + l.wheel.h).toBeLessThanOrEqual(z.h + 1e-6);
          // The name above the ride tops (nameRow) and the wheel, inside the window.
          const rideTop = l.picture.y + Math.min(F.nameRow, F.wheel.y) * l.s;
          expect(l.signBox.y + l.signBox.h).toBeLessThanOrEqual(rideTop - 8 + 1e-6);
          expect(l.signBox.y).toBeGreaterThanOrEqual(12 - 1e-6);
          expect(l.signBox.x).toBeGreaterThanOrEqual(16 - 1e-6);
          expect(l.signBox.x + l.signBox.w).toBeLessThanOrEqual(z.w - 16 + 1e-6);
          // The picture covers the width, drift included.
          const d = Math.max(l.drift.sky, l.drift.park, l.drift.front);
          expect(l.picture.x).toBeLessThanOrEqual(-d + 1e-6);
          expect(l.picture.x + l.picture.w).toBeGreaterThanOrEqual(z.w + d - 1e-6);
          // The fills meet the picture: sky above, lawn below, to the window's edges.
          expect(l.fillAbove.h).toBeCloseTo(Math.max(0, l.picture.y), 6);
          expect(l.fill.y).toBeCloseTo(l.picture.y + l.picture.h, 6);
          if (l.base.kind === 'desktop') {
            // The menu does not cover the wheel; the whole picture shows (the lake at its bottom too).
            const box = l.base.menuBox;
            if (!box) throw new Error('no menu box');
            expect(l.picture.x + F.menuAnchorX * l.s - dp).toBeGreaterThanOrEqual(box.left + box.width);
            expect(l.wheel.x - dp).toBeGreaterThanOrEqual(box.left + box.width);
            expect(l.picture.y).toBeGreaterThanOrEqual(-1e-6);
            expect(l.picture.y + l.picture.h).toBeLessThanOrEqual(z.h + 1e-6);
            // Fitted to the width, not to the height: not cropped at the sides beyond the drift.
            expect(l.picture.w).toBeCloseTo(z.w + 2 * d, 6);
          } else {
            // Phones and low windows: the wheel stands above the menu.
            expect(l.wheel.y + l.wheel.h).toBeLessThanOrEqual(z.h - l.base.mb - menuH + 1e-6);
          }
        });
      }
    }
  }
});

describe('checkTitleIndex', () => {
  it('accepts the plan’s schema and refuses layers over the caps or a broken entry', () => {
    expect(checkTitleIndex(IDX)).toBe(IDX);
    expect(checkTitleIndex({ ...IDX, wide: { ...IDX.wide, w: 1921 } })).toBeInstanceOf(Error);
    expect(checkTitleIndex({ ...IDX, tall: { ...IDX.tall, h: 1301 } })).toBeInstanceOf(Error);
    expect(checkTitleIndex({ ...IDX, sign: { line: IDX.sign.line } })).toBeInstanceOf(Error);
    expect(checkTitleIndex({ ...IDX, wide: { ...IDX.wide, layers: { ...IDX.wide.layers, sky: '../x.webp' } } })).toBeInstanceOf(Error);
    expect(checkTitleIndex(null)).toBeInstanceOf(Error);
    // The wheel turns in exactly 8 pictures.
    expect(checkTitleIndex({ ...IDX, wide: { ...IDX.wide, wheel: { ...IDX.wide.wheel, frames: 7 } } })).toBeInstanceOf(Error);
    expect(checkTitleIndex({ ...IDX, tall: { ...IDX.tall, wheel: { ...IDX.tall.wheel, frames: 16 } } })).toBeInstanceOf(Error);
  });
});

// ---- Loading and the life cycle -------------------------------------------------------------------------------

interface FakeBitmap extends TitleBitmap {
  file: string;
  closed: boolean;
}
/** A fake art folder: fetch serves the index and blobs named after the file; decode makes bitmaps that count closes. */
function fakeArt(opts: { failIndex?: boolean; failFile?: string; delay?: number } = {}) {
  const live = new Set<FakeBitmap>();
  const made: FakeBitmap[] = [];
  const log: string[] = [];
  const fetch = vi.fn(async (url: string) => {
    log.push(`fetch ${url}`);
    if (opts.delay) await new Promise((r) => setTimeout(r, opts.delay));
    if (url.endsWith('index.json')) {
      if (opts.failIndex) return { ok: false, status: 404, json: async () => ({}), blob: async () => new Blob() } as unknown as Response;
      return { ok: true, status: 200, json: async () => structuredClone(IDX), blob: async () => new Blob() } as unknown as Response;
    }
    const file = url.slice(url.lastIndexOf('/') + 1);
    if (file === opts.failFile) return { ok: false, status: 404, json: async () => ({}), blob: async () => new Blob() } as unknown as Response;
    return { ok: true, status: 200, json: async () => ({}), blob: async () => new Blob([file]) } as unknown as Response;
  });
  const decode = vi.fn(async (blob: Blob) => {
    const file = await blob.text();
    const b: FakeBitmap = {
      file,
      width: 10,
      height: 10,
      closed: false,
      close: vi.fn(() => {
        b.closed = true;
        live.delete(b);
      }),
    };
    live.add(b);
    made.push(b);
    return b;
  });
  return { fetch, decode, live, made, log };
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await tick();
};

describe('loadTitleArt', () => {
  it('decodes one framing’s layers, its wheel and both signs; close() releases every bitmap', async () => {
    const a = fakeArt();
    const art = await loadTitleArt('art/real/title/', a);
    expect(a.fetch).toHaveBeenCalledWith('art/real/title/index.json');
    const wide = await art.framing('wide');
    expect(wide).not.toBeNull();
    expect(new Set(a.made.map((b) => b.file))).toEqual(new Set(['wide-sky.webp', 'wide-park.webp', 'wide-front.webp', 'wide-wheel.webp', 'sign-line.webp', 'sign-stack.webp']));
    expect(art.open()).toBe(6);
    art.close();
    expect(a.live.size).toBe(0);
    expect(a.made.every((b) => b.closed)).toBe(true);
    expect(await art.framing('tall')).toBeNull();
  });

  it('keeps one framing at a time: drop() closes a framing’s layers and wheel, not the signs', async () => {
    const a = fakeArt();
    const art = await loadTitleArt('t/', a);
    await art.framing('wide');
    await art.framing('tall');
    expect(a.live.size).toBe(10);
    art.drop('wide');
    expect([...a.live].map((b) => b.file).sort()).toEqual(['sign-line.webp', 'sign-stack.webp', 'tall-front.webp', 'tall-park.webp', 'tall-sky.webp', 'tall-wheel.webp']);
    art.close();
    expect(a.live.size).toBe(0);
  });

  it('a failed index rejects; a failed picture gives null and leaves nothing open', async () => {
    await expect(loadTitleArt('t/', fakeArt({ failIndex: true }))).rejects.toThrow();
    const a = fakeArt({ failFile: 'wide-front.webp' });
    const art = await loadTitleArt('t/', a);
    expect(await art.framing('wide')).toBeNull();
    expect([...a.live].map((b) => b.file).sort()).toEqual(['sign-line.webp', 'sign-stack.webp']);
    art.close();
    expect(a.live.size).toBe(0);
  });

  it('close() while decoding closes the pictures as they land', async () => {
    const a = fakeArt({ delay: 5 });
    const art = await loadTitleArt('t/', a);
    const p = art.framing('wide');
    art.close();
    expect(await p).toBeNull();
    await settle();
    expect(a.live.size).toBe(0);
  });
});

describe('the title session (show, park opens, return)', () => {
  afterEach(() => {
    setParkRelease(null);
    setTitleHold(null);
  });

  it('a failed load keeps the gradient (no art) and does not throw', async () => {
    const a = fakeArt({ failIndex: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const changed = vi.fn();
    const s = createTitleSession({ load: () => loadTitleArt('t/', a), releasePark: () => undefined, changed });
    expect(() => {
      s.open();
      s.want('wide');
    }).not.toThrow();
    await settle();
    expect(s.current()).toBeNull();
    expect(s.index()).toBeNull();
    s.close();
    warn.mockRestore();
  });

  it('a failed picture keeps the gradient and the session usable', async () => {
    const a = fakeArt({ failFile: 'tall-park.webp' });
    const s = createTitleSession({ load: () => loadTitleArt('t/', a), releasePark: () => undefined, changed: () => undefined });
    s.open();
    s.want('tall');
    await settle();
    expect(s.current()).toBeNull();
    s.want('wide');
    await settle();
    expect(s.current()?.framing).toBe('wide');
    s.close();
    expect(a.live.size).toBe(0);
  });

  it('shows the wanted framing; on a framing switch the old one stays until the new one is decoded, then is closed', async () => {
    const a = fakeArt({ delay: 2 });
    const changed = vi.fn();
    const s = createTitleSession({ load: () => loadTitleArt('t/', a), releasePark: () => undefined, changed });
    s.open();
    s.want('wide');
    await settle();
    expect(s.current()?.framing).toBe('wide');
    s.want('tall');
    // Still the wide pictures while the tall ones decode (no blank frame).
    expect(s.current()?.framing).toBe('wide');
    await settle();
    expect(s.current()?.framing).toBe('tall');
    expect([...a.live].some((b) => b.file.startsWith('wide-'))).toBe(false);
    expect(changed).toHaveBeenCalled();
    s.close();
    expect(a.live.size).toBe(0);
  });

  it('returning to the title releases the park first, then decodes the title art again', async () => {
    const a = fakeArt();
    const order: string[] = [];
    setParkRelease(() => order.push('release park'));
    const s = createTitleSession({
      load: () => {
        order.push('load title');
        return loadTitleArt('t/', a);
      },
      releasePark,
      changed: () => undefined,
    });
    s.open();
    expect(order).toEqual(['release park', 'load title']);
    s.want('wide');
    await settle();
    s.close(); // a park opens
    expect(a.live.size).toBe(0);
    s.open(); // back to the title
    expect(order).toEqual(['release park', 'load title', 'release park', 'load title']);
    await settle();
    expect(s.current()?.framing).toBe('wide');
    s.close();
  });

  it('three round trips leave no extra held memory: every bitmap decoded is closed', async () => {
    const a = fakeArt();
    const release = vi.fn();
    const s = createTitleSession({ load: () => loadTitleArt('t/', a), releasePark: release, changed: () => undefined });
    for (let i = 0; i < 3; i++) {
      s.open();
      s.want(i % 2 ? 'tall' : 'wide');
      await settle();
      expect(a.live.size).toBe(6);
      s.close();
      expect(a.live.size).toBe(0);
    }
    expect(release).toHaveBeenCalledTimes(3);
    expect(a.made).toHaveLength(18);
    const closes = a.made.reduce((n, b) => n + (b.close as ReturnType<typeof vi.fn>).mock.calls.length, 0);
    expect(closes).toBe(18);
  });

  it('a park opened while the title art is still loading leaves nothing open', async () => {
    const a = fakeArt({ delay: 5 });
    const s = createTitleSession({ load: () => loadTitleArt('t/', a), releasePark: () => undefined, changed: () => undefined });
    s.open();
    s.want('wide');
    await tick();
    s.close();
    await settle();
    await new Promise((r) => setTimeout(r, 30));
    expect(a.live.size).toBe(0);
    expect(s.current()).toBeNull();
  });
});

describe('titleHold (the park behind the title)', () => {
  afterEach(() => {
    setParkRelease(null);
    setTitleHold(null);
  });
  it('holds while the title says so, and releasePark calls the boot’s release (a throw is contained)', () => {
    expect(titleHolds()).toBe(false);
    let open = true;
    setTitleHold(() => open);
    expect(titleHolds()).toBe(true);
    open = false;
    expect(titleHolds()).toBe(false);
    const fn = vi.fn();
    setParkRelease(fn);
    releasePark();
    expect(fn).toHaveBeenCalledTimes(1);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setParkRelease(() => {
      throw new Error('boom');
    });
    expect(() => releasePark()).not.toThrow();
    warn.mockRestore();
  });
});
