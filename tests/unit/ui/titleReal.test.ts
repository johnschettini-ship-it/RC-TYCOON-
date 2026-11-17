/**
 * The realistic title screen (VITE_ART=real build): the poster cover's layout, its index check, the bulbs, the name's
 * colours, the loading of the poster and its life cycle. The layout runs on the real cover index (`art-src/title/`,
 * the owner's stand-in poster) at the owner's sizes, normal and large text.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import COVER from '../../../art-src/title/index.json';
import { checkCoverIndex, coverLayout, DRIFT, type CoverIndex, type Rect } from '../../../src/ui/titleScreen/real/layout';
import { findBulbs } from '../../../src/ui/titleScreen/real/bulbs';
import { createTitleSession, loadTitleArt, type TitleBitmap } from '../../../src/ui/titleScreen/real/load';
import { TITLE_COLOURS } from '../../../src/ui/titleScreen/real/view';
import { releasePark, setParkRelease, setTitleHold, titleHolds } from '../../../src/render/real/titleHold';

const REAL = COVER as unknown as CoverIndex;
/** A cover with its own tall poster (the owner's later files): the loader decodes one file per framing. */
const IDX: CoverIndex = {
  ...REAL,
  tall: { file: 'poster-tall.webp', w: 1440, h: 2080, crop: { x: 0, y: 0, w: 1440, h: 2080 }, focus: { x: 160, y: 400, w: 1120, h: 1400 }, wheel: { x: 200, y: 420, w: 1040, h: 980 }, title: { x: 120, y: 60, w: 1200, h: 420 }, lights: { x: 0, y: 0, w: 1440, h: 2080 } },
};

/** The owner's sizes, with the menu heights the browser measures at normal and large (175 %) text, about. */
const SIZES = [
  { w: 390, h: 844, menuH: [262, 380] },
  { w: 360, h: 640, menuH: [124, 210] },
  { w: 812, h: 375, menuH: [56, 96] },
  { w: 1366, h: 768, menuH: [178, 290] },
  { w: 1920, h: 1080, menuH: [200, 330] },
  { w: 1024, h: 768, menuH: [178, 290] },
  { w: 1280, h: 800, menuH: [200, 320] },
];
const INSETS = [undefined, { top: 47, right: 0, bottom: 34, left: 0 }, { top: 0, right: 44, bottom: 21, left: 44 }];
const E = 1e-6;

describe('coverLayout (the poster cover)', () => {
  it('picks the tall framing when the window is taller than wide, else the wide one', () => {
    expect(coverLayout({ w: 390, h: 844, menuH: 262 }, REAL).framing).toBe('tall');
    expect(coverLayout({ w: 1024, h: 1366, menuH: 300 }, REAL).framing).toBe('tall');
    expect(coverLayout({ w: 812, h: 375, menuH: 56 }, REAL).framing).toBe('wide');
    expect(coverLayout({ w: 1366, h: 768, menuH: 178 }, REAL).framing).toBe('wide');
    expect(coverLayout({ w: 800, h: 800, menuH: 200 }, REAL).framing).toBe('wide');
    // The other framing on request (its poster still decoding).
    expect(coverLayout({ w: 390, h: 844, menuH: 262, framing: 'wide' }, REAL).framing).toBe('wide');
  });

  for (const idx of [REAL, IDX]) {
    for (const z of SIZES) {
      for (const menuH of z.menuH) {
        for (const reducedMotion of [false, true]) {
          it(`${idx === REAL ? 'stand-in poster' : 'tall poster'} ${z.w}x${z.h}, menu ${menuH}px${reducedMotion ? ', reduced motion' : ''}: focus box visible, name above the wheel, menu clear`, () => {
            for (const safe of INSETS) {
              const l = coverLayout({ w: z.w, h: z.h, menuH, safe, reducedMotion }, idx);
              const sf = safe ?? { top: 0, right: 0, bottom: 0, left: 0 };
              const d = l.drift;
              const tag = `${JSON.stringify(safe)}`;
              // The focus box (wheel and arch) inside the window at both ends of its drift.
              expect(l.focus.x - d, tag).toBeGreaterThanOrEqual(-E);
              expect(l.focus.x + l.focus.w + d, tag).toBeLessThanOrEqual(z.w + E);
              expect(l.focus.y - d / 2, tag).toBeGreaterThanOrEqual(-E);
              expect(l.focus.y + l.focus.h + d / 2, tag).toBeLessThanOrEqual(z.h + E);
              // The name: inside the safe area, above the wheel's hub, over the poster's sky.
              const hub = l.wheel.y + l.wheel.h / 2 - d / 2;
              expect(l.title.y, tag).toBeGreaterThanOrEqual(sf.top + 12 - E);
              expect(l.title.x, tag).toBeGreaterThanOrEqual(sf.left + 16 - E);
              expect(l.title.x + l.title.w, tag).toBeLessThanOrEqual(z.w - sf.right - 16 + E);
              expect(l.title.y + l.title.h, tag).toBeLessThanOrEqual(hub - 8 + E);
              expect(l.title.font, tag).toBeGreaterThan(16);
              if (l.base.kind === 'desktop') {
                // The menu block (bottom left) never covers the wheel, drift included.
                const box = l.base.menuBox;
                if (!box) throw new Error('no menu box');
                expect(l.wheel.x - d, tag).toBeGreaterThanOrEqual(box.left + box.width - E);
                // The name clear of the menu.
                expect(l.title.y + l.title.h, tag).toBeLessThanOrEqual(z.h - l.base.mb - menuH + E);
              }
              if (l.base.kind === 'phone') {
                // Phones: the wheel and the arch above the menu.
                expect(l.focus.y + l.focus.h + d / 2, tag).toBeLessThanOrEqual(z.h - l.base.mb - menuH + E);
              }
              // Cover: the crop reaches every edge (drift included) unless the focus box decided the scale or the
              // place (its width or height fills the band, or it stands on the band's bottom: phones).
              const covers = l.shown.x <= -d + E && l.shown.y <= -d + E && l.shown.x + l.shown.w >= z.w + d - E && l.shown.y + l.shown.h >= z.h + d - E;
              const bandH = l.base.kind === 'phone' ? z.h - l.base.mb - menuH - 8 - sf.top : z.h - sf.top - sf.bottom;
              const focusBound = Math.abs(l.focus.w - (z.w - sf.left - sf.right - 2 * d)) < 1e-3 || Math.abs(l.focus.h - (bandH - 2 * d)) < 1e-3 || Math.abs(l.focus.y + l.focus.h + d / 2 - (sf.top + bandH)) < 1e-3;
              expect(covers || focusBound, `${tag} covers ${covers}`).toBe(true);
            }
          });
        }
      }
    }
  }

  it('one line on the wide framing, stacked on phones', () => {
    for (const z of SIZES) {
      const l = coverLayout({ w: z.w, h: z.h, menuH: z.menuH[0] as number }, REAL);
      expect(l.title.kind, `${z.w}x${z.h}`).toBe(z.h > z.w ? 'stack' : 'line');
    }
  });

  it('the desktop poster fills the window (no fill bands) at 1366x768, 1920x1080 and 1024x768', () => {
    for (const [w, h] of [[1366, 768], [1920, 1080], [1024, 768]] as const) {
      const l = coverLayout({ w, h, menuH: 178 }, REAL);
      expect(l.shown.x).toBeLessThanOrEqual(-DRIFT + E);
      expect(l.shown.y).toBeLessThanOrEqual(-DRIFT + E);
      expect(l.shown.x + l.shown.w).toBeGreaterThanOrEqual(w + DRIFT - E);
      expect(l.shown.y + l.shown.h).toBeGreaterThanOrEqual(h + DRIFT - E);
    }
  });

  it('allows a non-integer scale (smooth scaling)', () => {
    expect(Number.isInteger(coverLayout({ w: 1366, h: 768, menuH: 178 }, REAL).s)).toBe(false);
  });

  it('has no drift with reduced motion, and a few px of drift without', () => {
    expect(coverLayout({ w: 390, h: 844, menuH: 262, reducedMotion: true }, REAL).drift).toBe(0);
    const d = coverLayout({ w: 390, h: 844, menuH: 262 }, REAL).drift;
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(6);
  });

  it('keeps design E’s menu, plate and sheet (the base layout)', () => {
    const l = coverLayout({ w: 390, h: 844, menuH: 262 }, REAL);
    expect(l.base.kind).toBe('phone');
    expect(l.base.menuPlace).not.toBeNull();
  });
});

describe('checkCoverIndex', () => {
  const bad = (f: (c: CoverIndex) => void): unknown => {
    const c = structuredClone(REAL);
    f(c);
    return checkCoverIndex(c);
  };
  const box = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
  it('accepts the real cover index (the tall framing may crop the wide file) and a separate tall poster', () => {
    expect(checkCoverIndex(REAL)).toBe(REAL);
    expect(checkCoverIndex(IDX)).toBe(IDX);
  });
  it('refuses a broken index', () => {
    expect(checkCoverIndex(null)).toBeInstanceOf(Error);
    expect(bad((c) => ((c as { format: string }).format = 'real/1'))).toBeInstanceOf(Error);
    expect(bad((c) => (c.wide.file = '../x.webp'))).toBeInstanceOf(Error);
    expect(bad((c) => (c.tall.file = 'a/b.webp'))).toBeInstanceOf(Error);
    expect(bad((c) => (c.wide.w = 2561))).toBeInstanceOf(Error);
    expect(bad((c) => (c.wide.crop = box(0, 0, 1400, 768)))).toBeInstanceOf(Error);
    expect(bad((c) => (c.wide.focus = box(0, 0, 1376, 800)))).toBeInstanceOf(Error);
    expect(bad((c) => (c.tall.wheel = box(10, 10, 100, 100)))).toBeInstanceOf(Error);
    expect(bad((c) => (c.wide.title = box(300, 56, 776, 300)))).toBeInstanceOf(Error); // reaches below the hub
    expect(bad((c) => (c.wide.title = box(-1, 56, 776, 100)))).toBeInstanceOf(Error);
    expect(bad((c) => delete (c as Partial<CoverIndex>).tall)).toBeInstanceOf(Error);
    // Decoded cap: 24 MB per framing.
    expect(bad((c) => Object.assign(c.tall, { file: 't.webp', w: 1600, h: 2400, crop: box(0, 0, 1600, 2400), lights: box(0, 0, 1600, 2400) }))).not.toBeInstanceOf(Error);
    expect(checkCoverIndex({ ...IDX, tall: { ...IDX.tall, w: 2000, h: 3100 } })).toBeInstanceOf(Error);
  });
});

describe('findBulbs (the twinkle spots)', () => {
  /** A dark picture with warm dots, a large bright warm area (a sunset band, not bulbs) and a cool bright dot. */
  const picture = () => {
    const w = 120;
    const h = 80;
    const px = new Uint8ClampedArray(w * h * 4);
    const set = (x: number, y: number, r: number, g: number, b: number): void => {
      const i = (y * w + x) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, 40, 30, 50);
    for (let y = 50; y < 80; y++) for (let x = 0; x < 120; x++) set(x, y, 250, 225, 120);
    const dot = (cx: number, cy: number, c: [number, number, number]): void => {
      for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) set(x, y, c[0] - 20, c[1] - 20, c[2] - 20);
      set(cx, cy, ...c);
    };
    dot(10, 10, [255, 240, 170]);
    dot(30, 12, [255, 230, 150]);
    dot(60, 20, [255, 235, 160]);
    dot(90, 30, [200, 230, 255]); // cool: not a bulb
    return { px, w, h };
  };
  it('finds the warm dots, not the bright band nor a cool dot', () => {
    const { px, w, h } = picture();
    const b = findBulbs(px, w, h);
    expect(b.map((p) => [p.x, p.y]).sort((p, q) => p[0]! - q[0]!)).toEqual([[10, 10], [30, 12], [60, 20]]);
    for (const p of b) expect(p.phase >= 0 && p.phase < 1).toBe(true);
  });
  it('looks only inside the box and keeps the strongest when capped', () => {
    const { px, w, h } = picture();
    expect(findBulbs(px, w, h, { box: { x: 0, y: 0, w: 40, h: 40 } }).map((p) => p.x).sort((a, c) => a - c)).toEqual([10, 30]);
    expect(findBulbs(px, w, h, { max: 1 })).toHaveLength(1);
  });
});

describe('the name’s colours (contrast against their outline)', () => {
  const lum = (hex: string): number => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
  };
  const ratio = (a: string, b: string): number => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  it('each word is at least 4.5:1 against the brown outline round it', () => {
    for (const k of ['thrills', 'amp', 'chills'] as const) expect(ratio(TITLE_COLOURS[k], TITLE_COLOURS.outline), k).toBeGreaterThanOrEqual(4.5);
  });
});

// ---- Loading and the life cycle -------------------------------------------------------------------------------

interface FakeBitmap extends TitleBitmap {
  file: string;
  closed: boolean;
}
/** A fake art folder: fetch serves the index and blobs named after the file; decode makes bitmaps that count closes. */
function fakeArt(opts: { failIndex?: boolean; failFile?: string; delay?: number; index?: CoverIndex } = {}) {
  const live = new Set<FakeBitmap>();
  const made: FakeBitmap[] = [];
  const log: string[] = [];
  const fetch = vi.fn(async (url: string) => {
    log.push(`fetch ${url}`);
    if (opts.delay) await new Promise((r) => setTimeout(r, opts.delay));
    if (url.endsWith('index.json')) {
      if (opts.failIndex) return { ok: false, status: 404, json: async () => ({}), blob: async () => new Blob() } as unknown as Response;
      return { ok: true, status: 200, json: async () => structuredClone(opts.index ?? IDX), blob: async () => new Blob() } as unknown as Response;
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
  it('decodes one framing’s poster; close() releases every bitmap', async () => {
    const a = fakeArt();
    const art = await loadTitleArt('art/real/title/', a);
    expect(a.fetch).toHaveBeenCalledWith('art/real/title/index.json');
    const wide = await art.framing('wide');
    expect(wide?.poster).toBeDefined();
    expect(a.made.map((b) => b.file)).toEqual(['poster-wide.webp']);
    expect(art.open()).toBe(1);
    art.close();
    expect(a.live.size).toBe(0);
    expect(a.made.every((b) => b.closed)).toBe(true);
    expect(await art.framing('tall')).toBeNull();
  });

  it('keeps one framing at a time: drop() closes that framing’s poster', async () => {
    const a = fakeArt();
    const art = await loadTitleArt('t/', a);
    await art.framing('wide');
    await art.framing('tall');
    expect(a.live.size).toBe(2);
    art.drop('wide');
    expect([...a.live].map((b) => b.file)).toEqual(['poster-tall.webp']);
    art.close();
    expect(a.live.size).toBe(0);
  });

  it('a tall framing that crops the wide file decodes its own copy, closed with it', async () => {
    const a = fakeArt({ index: REAL });
    const art = await loadTitleArt('t/', a);
    const wide = await art.framing('wide');
    const tall = await art.framing('tall');
    expect(tall?.poster).not.toBe(wide?.poster);
    expect(a.made.map((b) => b.file)).toEqual(['poster-wide.webp', 'poster-wide.webp']);
    art.drop('wide');
    expect(a.live.size).toBe(1);
    expect(tall?.poster && a.live.has(tall.poster as never)).toBe(true);
    art.close();
    expect(a.live.size).toBe(0);
  });

  it('a failed index rejects; a failed picture gives null and leaves nothing open', async () => {
    await expect(loadTitleArt('t/', fakeArt({ failIndex: true }))).rejects.toThrow();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const a = fakeArt({ failFile: 'poster-wide.webp' });
    const art = await loadTitleArt('t/', a);
    expect(await art.framing('wide')).toBeNull();
    expect(a.live.size).toBe(0);
    expect(await art.framing('tall')).not.toBeNull();
    warn.mockRestore();
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const a = fakeArt({ failFile: 'poster-tall.webp' });
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
    warn.mockRestore();
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
    expect([...a.live].map((b) => b.file)).toEqual(['poster-tall.webp']);
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
      expect(a.live.size).toBe(1);
      s.close();
      expect(a.live.size).toBe(0);
    }
    expect(release).toHaveBeenCalledTimes(3);
    expect(a.made).toHaveLength(3);
    const closes = a.made.reduce((n, b) => n + (b.close as ReturnType<typeof vi.fn>).mock.calls.length, 0);
    expect(closes).toBe(3);
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
