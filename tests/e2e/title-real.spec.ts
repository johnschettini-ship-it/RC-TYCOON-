/**
 * The realistic title screen: the owner's poster cover (`art-src/title/`, chosen 2026-11-17) with the name as real text
 * in Fredoka. Needs a VITE_ART=real build with the baked art copied to `art/real/` and the cover in `art/real/title/`
 * (the bake copies it; without a bake, `node tools/art3d/cover.mjs --out <dir>/art/real` copies the cover alone):
 *
 *   VITE_ART=real npx vite build --outDir <dir> && cp -r dist-art/real <dir>/art/real
 *   npx vite preview --outDir <dir> --port <port> &  PW_PORT=<port> VITE_ART=real npx playwright test tests/e2e/title-real.spec.ts
 *
 * Checks: the menu and the name at once over the sky fill, the poster fading in, the framing, the focus box (wheel and
 * arch) inside the window at every size and text size, the name in the window above the wheel's hub, the desktop menu
 * clear of the wheel, the phone menu below the wheel and arch, the name's contrast (each word against its outline) and
 * the axe scan, a slow and a failed download (menu and name work, no error), a rotation without a blank frame, reduced
 * motion (a still picture, no twinkle), three round trips to a park (title bitmaps closed in the park, the park's
 * released at the title, no growth), the fill under the poster on phones (no seam). Screenshots go to `$SHOT_DIR`
 * (default: the test's output folder), named `title-real-<name><$SHOT_SUFFIX>.png`.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { dismissWelcome, openTool, scan } from './helpers';

const REAL = process.env.VITE_ART === 'real';
const SIZES = [
  { name: 'phone-390x844', w: 390, h: 844, dpr: 3, mobile: true },
  { name: 'phone-360x640', w: 360, h: 640, dpr: 2, mobile: true },
  { name: 'sideways-812x375', w: 812, h: 375, dpr: 3, mobile: true },
  { name: 'desktop-1366x768', w: 1366, h: 768, dpr: 1, mobile: false },
  { name: 'desktop-1920x1080', w: 1920, h: 1080, dpr: 1, mobile: false },
  { name: 'desktop-1280x800', w: 1280, h: 800, dpr: 2, mobile: false },
  { name: 'desktop-1024x768', w: 1024, h: 768, dpr: 1, mobile: false },
] as const;
type Size = (typeof SIZES)[number];

/** Counts live ImageBitmaps (made by createImageBitmap, not yet closed): the title's and the park's decodes. */
const COUNT_BITMAPS = (): void => {
  const live = new Set<ImageBitmap>();
  const make = window.createImageBitmap.bind(window) as (...a: unknown[]) => Promise<ImageBitmap>;
  (window as unknown as { createImageBitmap: unknown }).createImageBitmap = async (...a: unknown[]) => {
    const b = await make(...a);
    live.add(b);
    return b;
  };
  const close = ImageBitmap.prototype.close;
  ImageBitmap.prototype.close = function (this: ImageBitmap) {
    live.delete(this);
    close.call(this);
  };
  (window as unknown as { __liveBitmaps: () => number }).__liveBitmaps = () => live.size;
};

async function open(browser: Browser, s: { w: number; h: number; dpr: number; mobile: boolean }, reducedMotion: 'reduce' | 'no-preference' = 'no-preference'): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr, isMobile: s.mobile, hasTouch: s.mobile, reducedMotion });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(COUNT_BITMAPS);
  return { ctx, page, errors };
}

const shot = async (page: Page, name: string): Promise<void> => {
  const dir = process.env.SHOT_DIR ?? test.info().outputPath();
  await page.screenshot({ path: `${dir}/title-real-${name}${process.env.SHOT_SUFFIX ?? ''}.png` });
};

const ready = (page: Page) => page.locator('canvas.title-real-scene[data-ready]');

async function hasTitleArt(page: Page): Promise<boolean> {
  return page.evaluate(() => fetch('art/real/title/index.json').then((r) => r.ok, () => false));
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const parseBox = (v: string | undefined): Box => {
  const [x, y, w, h] = (v ?? '').split(',').map(Number);
  return { x: x ?? NaN, y: y ?? NaN, w: w ?? NaN, h: h ?? NaN };
};
interface Placed {
  framing: string;
  shown: Box;
  /** Focus box and wheel with the drift added round them. */
  focus: Box;
  wheel: Box;
  /** The wheel's hub at the top of its drift. */
  hub: number;
  kind: string;
  title: Box;
  bulbs: number;
}
async function placed(page: Page): Promise<Placed> {
  const raw = await page.locator('canvas.title-real-scene').evaluate((c) => ({ ...(c as HTMLCanvasElement).dataset }));
  const [kind, nums] = (raw.title ?? ':').split(':');
  return { framing: raw.framing ?? '', shown: parseBox(raw.shown), focus: parseBox(raw.focus), wheel: parseBox(raw.wheel), hub: Number(raw.hub), kind: kind ?? '', title: parseBox(nums), bulbs: Number(raw.bulbs) };
}
const overlaps = (a: Box, b: { x: number; y: number; width: number; height: number }): boolean => a.x < b.x + b.width && b.x < a.x + a.w && a.y < b.y + b.height && b.y < a.y + a.h;

/**
 * The checks of one size: the framing, the focus box (wheel and arch) inside the window at both ends of its drift, the
 * name (the heading itself, real text) in the window, above the wheel's hub and the menu, the desktop menu clear of
 * the wheel, the phone menu below the focus box, the menu buttons in the window, no sideways scroll.
 */
async function checkPlaced(page: Page, s: Size): Promise<void> {
  const p = await placed(page);
  expect(p.framing).toBe(s.h > s.w ? 'tall' : 'wide');
  expect(p.kind).toBe(s.h > s.w ? 'stack' : 'line');
  expect(p.focus.x, 'focus left').toBeGreaterThanOrEqual(-0.1);
  expect(p.focus.x + p.focus.w, 'focus right').toBeLessThanOrEqual(s.w + 0.1);
  expect(p.focus.y, 'focus top').toBeGreaterThanOrEqual(-0.1);
  expect(p.focus.y + p.focus.h, 'focus bottom').toBeLessThanOrEqual(s.h + 0.1);
  // The heading as the browser lays it out: where the layout put it, inside the window, above the hub.
  const heading = await page.locator('.title-logo').boundingBox();
  if (!heading) throw new Error('no heading');
  expect(Math.abs(heading.x - p.title.x), 'heading x').toBeLessThanOrEqual(1);
  expect(Math.abs(heading.y - p.title.y), 'heading y').toBeLessThanOrEqual(1);
  expect(heading.x).toBeGreaterThanOrEqual(16 - 0.5);
  expect(heading.x + heading.width).toBeLessThanOrEqual(s.w - 16 + 0.5);
  expect(heading.y).toBeGreaterThanOrEqual(12 - 0.5);
  expect(heading.y + heading.height, 'the name above the wheel hub').toBeLessThanOrEqual(p.hub + 0.5);
  // The words fit their box: none wider than the heading (no overflow).
  const words = await page.locator('.title-logo .tr-word').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ l: r.left, r: r.right })));
  for (const w of words) expect(w.l >= heading.x - 1 && w.r <= heading.x + heading.width + 1, JSON.stringify(w)).toBe(true);
  const menu = await page.locator('.title-menu').boundingBox();
  if (!menu) throw new Error('no menu');
  expect(heading.y + heading.height).toBeLessThanOrEqual(menu.y + 0.5);
  if (s.w >= 900) {
    // Desktop: the menu block never over the wheel.
    expect(p.wheel.x).toBeGreaterThanOrEqual(menu.x + menu.width);
    expect(overlaps(p.wheel, menu)).toBe(false);
  } else if (s.h > s.w) expect(p.focus.y + p.focus.h, 'wheel and arch above the menu').toBeLessThanOrEqual(menu.y + 0.5);
  for (const b of await page.locator('.title-menu button:visible').all()) {
    const r = await b.boundingBox();
    expect(r && r.x >= 0 && r.y >= 0 && r.x + r.width <= s.w + 0.5 && r.y + r.height <= s.h + 0.5, await b.innerText()).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

/** The realistic look's memory by owner, and the card set's decoded bytes when it is resident (else 0). */
async function released(page: Page): Promise<{ sets: number; tints: number; ground: number; cards: number } | null> {
  return page.evaluate(async () => {
    const r = (window as unknown as { __tcReal?: { sets: { split(): { sets: number; tints: number; ground: number }; state(k: string): string } } }).__tcReal;
    if (!r) return null;
    const key = 'preview:cards:d2:rall';
    const ix = (await (await fetch('art/real/index.json')).json()) as { sets: Array<{ key: string; sheets: Array<{ w: number; h: number }> }> };
    const entry = ix.sets.find((e) => e.key === key);
    const cards = entry && r.sets.state(key) === 'ready' ? entry.sheets.reduce((n, sh) => n + sh.w * sh.h * 4, 0) : 0;
    return { ...r.sets.split(), cards };
  });
}

/**
 * Live bitmaps other than the card pictures: the card set (boot step 4) stays decoded at the title by design (the park
 * release keeps it), so with a bake that has one, its sheets are live beside the title's 6 pictures.
 */
async function liveBesideCards(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const all = (window as unknown as { __liveBitmaps(): number }).__liveBitmaps();
    const r = (window as unknown as { __tcReal?: { sets: { state(k: string): string } } }).__tcReal;
    const key = 'preview:cards:d2:rall';
    if (!r || r.sets.state(key) !== 'ready') return all;
    const ix = (await (await fetch('art/real/index.json')).json()) as { sets: Array<{ key: string; sheets: unknown[] }> };
    return all - (ix.sets.find((e) => e.key === key)?.sheets.length ?? 0);
  });
}

test.describe('realistic title screen (VITE_ART=real build)', () => {
  test.skip(!REAL, 'needs a VITE_ART=real build (set VITE_ART=real)');
  // Each test makes its own phone or desktop context: once is enough.
  test.beforeEach(({ browserName }, info) => {
    void browserName;
    test.skip(info.project.name !== 'desktop', 'runs in the desktop project only');
  });

  for (const s of SIZES) {
    test(`${s.name}: menu and name at once, poster fades in, focus box visible, name above the wheel, menu clear of it`, async ({ browser }) => {
      const { ctx, page, errors } = await open(browser, s);
      await page.goto('/');
      // The menu and the name show over the sky fill before (and whether or not) the art arrives.
      await expect(page.getByTestId('title-new')).toBeVisible();
      const bg = await page.locator('.title-screen').evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(bg).toContain('linear-gradient');
      // The name is real text in Fredoka, visible, and names the heading.
      const heading = page.getByRole('heading', { level: 1, name: 'Thrills & Chills' });
      await expect(heading).toBeVisible();
      expect(await heading.evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Fredoka');
      expect(await heading.evaluate((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim())).toBe('Thrills & Chills');
      test.skip(!(await hasTitleArt(page)), 'no title art in art/real/title/');
      await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
      await expect(ready(page)).toHaveCSS('opacity', '1');
      await page.evaluate(() => document.fonts.ready);
      await checkPlaced(page, s);
      expect((await heading.boundingBox())?.width ?? 0).toBeGreaterThan(100);
      // The twinkling bulbs were found on the poster.
      expect((await placed(page)).bulbs).toBeGreaterThan(50);
      await page.waitForTimeout(300);
      await shot(page, s.name);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }

  for (const s of SIZES) {
    test(`${s.name}, large text (175 %): the menu, the name and the focus box still fit`, async ({ browser }) => {
      const { ctx, page, errors } = await open(browser, s);
      await page.goto('/');
      test.skip(!(await hasTitleArt(page)), 'no title art in art/real/title/');
      await page.waitForFunction(() => (window as unknown as { __tc?: unknown }).__tc !== undefined);
      await page.evaluate(() => (window as unknown as { __tc: { settings: { set(k: string, v: unknown): void } } }).__tc.settings.set('textScale', 175));
      await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
      await page.waitForTimeout(400);
      await page.evaluate(() => document.fonts.ready);
      await checkPlaced(page, s);
      await shot(page, `${s.name}-text175`);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }

  for (const s of [SIZES[0], SIZES[1]]) {
    test(`${s.name}: the fill under the poster continues its bottom row (no seam), then plain ground`, async ({ browser }) => {
      const { ctx, page } = await open(browser, s, 'reduce');
      await page.goto('/');
      test.skip(!(await hasTitleArt(page)), 'no title art in art/real/title/');
      await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
      await page.waitForTimeout(300);
      const p = await placed(page);
      const out = await page.evaluate(({ P }) => {
        const c = document.querySelector('canvas.title-real-scene') as HTMLCanvasElement;
        const k = c.width / window.innerWidth;
        const x = c.getContext('2d') as CanvasRenderingContext2D;
        const px = (cx: number, cy: number): number[] => [...x.getImageData(Math.floor(cx * k), Math.floor(cy * k), 1, 1).data].slice(0, 3);
        // The softened fill against the poster's last row, both averaged across the poster's width.
        const avg = (cy: number): number[] => {
          const n = 64;
          const sum = [0, 0, 0];
          for (let i = 0; i < n; i++) px(P.x + ((i + 0.5) * P.w) / n, cy).forEach((v, j) => (sum[j] = (sum[j] ?? 0) + v / n));
          return sum;
        };
        const bottom = P.y + P.h;
        // Far below: one plain colour across the window (no streaks).
        const spread = (cy: number): number => {
          const v = Array.from({ length: 24 }, (_, i) => px(((i + 0.5) * window.innerWidth) / 24, cy));
          return Math.max(...[0, 1, 2].map((j) => Math.max(...v.map((c) => c[j] ?? 0)) - Math.min(...v.map((c) => c[j] ?? 0))));
        };
        return bottom < window.innerHeight - 80 ? { fill: avg(bottom + 1.5), poster: avg(bottom - 1 / k), spread: spread(window.innerHeight - 2) } : null;
      }, { P: p.shown });
      expect(out, 'a fill under the poster').not.toBeNull();
      const near = (a: number[], b: number[], tol: number): boolean => a.every((v, i) => Math.abs(v - (b[i] ?? 0)) <= tol);
      if (out) {
        expect(near(out.fill, out.poster, 12), `fill ${out.fill} vs the poster's last row ${out.poster}`).toBe(true);
        expect(out.spread, 'the ground under the menu is one colour').toBeLessThanOrEqual(2);
      }
      await ctx.close();
    });
  }

  for (const s of SIZES) {
    test(`${s.name}: the scenario list stays in the window under the sign and scrolls (its first card reachable)`, async ({ browser }) => {
      const { ctx, page, errors } = await open(browser, s);
      await page.goto('/');
      test.skip(!(await hasTitleArt(page)), 'no title art in art/real/title/');
      await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
      const press = (id: string) => (s.mobile ? page.getByTestId(id).tap() : page.getByTestId(id).click());
      await press('title-new');
      await press('title-scenarios');
      const first = page.locator('[data-testid^="scenario-card-"]').first();
      await expect(first).toBeVisible();
      await page.waitForTimeout(300);
      const p = await placed(page);
      const plate = await page.locator('.title-plate').boundingBox();
      if (!plate) throw new Error('no plate');
      // The plate (or sheet) starts under the name (low windows: 8 px from the top, as design E) and ends in the
      // window; a long list scrolls inside it.
      const kind = await page.locator('.title-screen').getAttribute('data-kind');
      expect(plate.y).toBeGreaterThanOrEqual(kind === 'low' ? 0 : p.title.y + p.title.h - 0.5);
      expect(plate.y + plate.height).toBeLessThanOrEqual(s.h + 0.5);
      await first.scrollIntoViewIfNeeded();
      const r = await first.boundingBox();
      expect(r && r.y >= plate.y - 0.5 && r.y + r.height <= s.h + 0.5, `first card ${JSON.stringify(r)}`).toBe(true);
      await press((await first.getAttribute('data-testid')) ?? '');
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }

  test('a failed title download: the menu and the name work, the sky fill stays, no error is shown', async ({ browser }) => {
    const { ctx, page, errors } = await open(browser, SIZES[0]);
    await page.route('**/art/real/title/**', (r) => r.abort());
    await page.goto('/');
    await expect(page.getByTestId('title-new')).toBeVisible();
    await page.waitForTimeout(800);
    await expect(ready(page)).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await page.locator('.title-screen').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
    // The name at the top, inside the window, above the menu.
    const name = await page.getByRole('heading', { level: 1, name: 'Thrills & Chills' }).boundingBox();
    const menu = await page.locator('.title-menu').boundingBox();
    expect(name && menu && name.x >= 0 && name.x + name.width <= 390 && name.y >= 0 && name.y + name.height <= menu.y).toBe(true);
    await shot(page, 'failed-download-390x844');
    await page.getByTestId('title-new').click();
    await expect(page.getByTestId('title-newgame')).toBeVisible();
    // The aborted requests themselves are the browser's lines; nothing else.
    expect(errors.filter((e) => !/net::ERR_FAILED|Failed to load resource/.test(e))).toEqual([]);
    await ctx.close();
  });

  test('a slow title download: the menu first, the poster when it arrives', async ({ browser }) => {
    const { ctx, page } = await open(browser, SIZES[3]);
    await page.route('**/art/real/title/**', async (r) => {
      await new Promise((res) => setTimeout(res, 1500));
      await r.continue();
    });
    await page.goto('/');
    await expect(page.getByTestId('title-new')).toBeVisible();
    test.skip(!(await page.evaluate(() => fetch('art/real/title/index.json').then((r) => r.ok, () => false))), 'no title art');
    await expect(ready(page)).toHaveCount(0);
    await expect(ready(page)).toHaveCount(1, { timeout: 15_000 });
    await ctx.close();
  });

  test('rotation: the old framing stays until the new one is decoded (no blank frame), then switches', async ({ browser }) => {
    const { ctx, page } = await open(browser, SIZES[0]);
    await page.goto('/');
    test.skip(!(await hasTitleArt(page)), 'no title art in art/real/title/');
    await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
    expect((await placed(page)).framing).toBe('tall');
    // Hold the wide pictures back; every frame meanwhile still shows the tall ones.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    // The tall framing crops the same file: once the route is on (it turns the HTTP cache off), the wide framing's
    // own decode fetches it again and waits here.
    await page.route('**/art/real/title/poster-*', async (r) => {
      await gate;
      await r.continue();
    });
    await page.setViewportSize({ width: 844, height: 390 });
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(100);
      await expect(ready(page)).toHaveCount(1);
      expect((await placed(page)).framing).toBe('tall');
    }
    await shot(page, 'rotating-844x390-old-framing');
    release();
    await expect.poll(async () => (await placed(page)).framing, { timeout: 10_000 }).toBe('wide');
    await expect(ready(page)).toHaveCount(1);
    // Only one framing decoded at a time: one poster.
    expect(await liveBesideCards(page)).toBe(1);
    await shot(page, 'rotated-844x390');
    await ctx.close();
  });

  test('reduced motion: no drift and no twinkle; without it the picture moves', async ({ browser }) => {
    for (const rm of ['reduce', 'no-preference'] as const) {
      const { ctx, page } = await open(browser, SIZES[3], rm);
      await page.goto('/');
      test.skip(!(await hasTitleArt(page)), 'no title art in art/real/title/');
      await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
      await page.waitForTimeout(500);
      const a = await page.locator('canvas.title-real-scene').screenshot();
      await page.waitForTimeout(700);
      const b = await page.locator('canvas.title-real-scene').screenshot();
      if (rm === 'reduce') expect(Buffer.compare(a, b)).toBe(0);
      else expect(Buffer.compare(a, b)).not.toBe(0);
      await ctx.close();
    }
  });

  test('three round trips to a park: title bitmaps closed in the park, park released at the title, no growth', async ({ browser }) => {
    const { ctx, page, errors } = await open(browser, SIZES[3]);
    await page.goto('/');
    test.skip(!(await hasTitleArt(page)), 'no title art in art/real/title/');
    const live = (): Promise<number> => liveBesideCards(page);
    await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
    const atTitle = await live();
    expect(atTitle).toBe(1);
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('title-new').click();
      await page.getByTestId('title-name').fill(`Trip ${i}`);
      await page.getByTestId('title-size-64').click();
      await page.getByTestId('title-start').click();
      await expect(page.locator('.title-screen')).toBeHidden();
      await dismissWelcome(page);
      // In the park: no title bitmap left, the title canvas emptied.
      expect(await page.locator('canvas.title-real-scene').evaluate((c) => (c as HTMLCanvasElement).width)).toBe(0);
      await page.waitForTimeout(400);
      // With no park pictures decoded, nothing at all is open (the title's are all closed).
      const parkResident = await page.evaluate(() => (window as unknown as { __tcReal?: { sets: { residentBytes(): number } } }).__tcReal?.sets.residentBytes() ?? 0);
      if (parkResident === 0) expect(await live()).toBe(0);
      await openTool(page, 'menu');
      await page.getByTestId('menu-quit').click();
      const yes = page.getByRole('button', { name: 'Quit', exact: true });
      if (await yes.isVisible().catch(() => false)) await yes.click();
      await expect(page.locator('.title-screen')).toBeVisible();
      await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
      // Back at the title: the park released (nothing resident but the card pictures: no ground chunk, no tint page),
      // the title's own poster.
      const parkAtTitle = await released(page);
      expect(parkAtTitle).not.toBeNull();
      expect(parkAtTitle).toMatchObject({ tints: 0, ground: 0 });
      expect(parkAtTitle?.sets).toBe(parkAtTitle?.cards);
      expect(await live()).toBeLessThanOrEqual(atTitle);
    }
    await shot(page, 'after-3-round-trips-1366x768');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('the bench hiding the title element closes the title art and stops its frames; shown again, it decodes again', async ({ browser }) => {
    const { ctx, page, errors } = await open(browser, SIZES[3]);
    await page.goto('/');
    test.skip(!(await hasTitleArt(page)), 'no title art in art/real/title/');
    const live = (): Promise<number> => liveBesideCards(page);
    await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
    expect(await live()).toBe(1);
    // Count the title's frames: the canvas's drawImage calls.
    await page.evaluate(() => {
      const c = document.querySelector('canvas.title-real-scene') as HTMLCanvasElement;
      const x = c.getContext('2d') as CanvasRenderingContext2D & { __n?: number };
      const draw = x.drawImage.bind(x) as (...a: unknown[]) => void;
      x.__n = 0;
      (x as unknown as { drawImage: unknown }).drawImage = (...a: unknown[]) => {
        x.__n = (x.__n ?? 0) + 1;
        draw(...a);
      };
    });
    const draws = (): Promise<number> => page.evaluate(() => ((document.querySelector('canvas.title-real-scene') as HTMLCanvasElement).getContext('2d') as { __n?: number }).__n ?? 0);
    // As realBenchCard.ts does: the title steps aside visually, it stays open.
    await page.evaluate(() => ((document.querySelector('.title-screen') as HTMLElement).hidden = true));
    await expect.poll(live).toBe(0);
    expect(await page.locator('canvas.title-real-scene').evaluate((c) => (c as HTMLCanvasElement).width)).toBe(0);
    await page.waitForTimeout(150);
    const before = await draws();
    await page.waitForTimeout(500);
    expect(await draws()).toBe(before);
    await page.evaluate(() => ((document.querySelector('.title-screen') as HTMLElement).hidden = false));
    await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
    expect(await live()).toBe(1);
    const park = await released(page);
    if (park) expect(park).toMatchObject({ tints: 0, ground: 0 });
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('reduced motion switched on while the title shows takes effect at once', async ({ browser }) => {
    const { ctx, page } = await open(browser, SIZES[3]);
    await page.goto('/');
    test.skip(!(await hasTitleArt(page)), 'no title art in art/real/title/');
    await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
    await page.waitForFunction(() => (window as unknown as { __tc?: unknown }).__tc !== undefined);
    await page.evaluate(() => {
      const c = document.querySelector('canvas.title-real-scene') as HTMLCanvasElement;
      const x = c.getContext('2d') as CanvasRenderingContext2D & { __n?: number };
      const draw = x.drawImage.bind(x) as (...a: unknown[]) => void;
      x.__n = 0;
      (x as unknown as { drawImage: unknown }).drawImage = (...a: unknown[]) => {
        x.__n = (x.__n ?? 0) + 1;
        draw(...a);
      };
    });
    const draws = (): Promise<number> => page.evaluate(() => ((document.querySelector('canvas.title-real-scene') as HTMLCanvasElement).getContext('2d') as { __n?: number }).__n ?? 0);
    await page.evaluate(() => (window as unknown as { __tc: { settings: { set(k: string, v: unknown): void } } }).__tc.settings.set('reducedMotion', 'on'));
    await page.waitForTimeout(200);
    const a = await page.locator('canvas.title-real-scene').screenshot();
    const n = await draws();
    await page.waitForTimeout(700);
    const b = await page.locator('canvas.title-real-scene').screenshot();
    expect(Buffer.compare(a, b)).toBe(0);
    // No frame loop with reduced motion: no draws at all while still.
    expect(await draws()).toBe(n);
    // And back on: it moves again.
    await page.evaluate(() => (window as unknown as { __tc: { settings: { set(k: string, v: unknown): void } } }).__tc.settings.set('reducedMotion', 'off'));
    await page.waitForTimeout(200);
    const c = await page.locator('canvas.title-real-scene').screenshot();
    await page.waitForTimeout(700);
    const d = await page.locator('canvas.title-real-scene').screenshot();
    expect(Buffer.compare(c, d)).not.toBe(0);
    await ctx.close();
  });

  test('the name: each word at least 4.5:1 against its outline, the outline drawn round it, axe clean; the heading names the dialog', async ({ browser }) => {
    for (const s of [SIZES[0], SIZES[3]]) {
      const { ctx, page } = await open(browser, s);
      await page.goto('/');
      await expect(page.getByTestId('title-new')).toBeVisible();
      if (await hasTitleArt(page)) await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      const words = await page.locator('.title-logo .tr-word').evaluateAll((els) =>
        els.map((e) => {
          const cs = getComputedStyle(e);
          const shadow = cs.textShadow;
          return { text: e.textContent, color: cs.color, shadow, font: parseFloat(cs.fontSize) };
        }),
      );
      expect(words.map((w) => w.text)).toEqual(['Thrills', '&', 'Chills']);
      const rgb = (c: string): number[] => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lum = (c: number[]): number => {
        const v = c.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
        return 0.2126 * (v[0] ?? 0) + 0.7152 * (v[1] ?? 0) + 0.0722 * (v[2] ?? 0);
      };
      const ratio = (a: number[], b: number[]): number => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
      for (const w of words) {
        // The outline: the first shadows of the ring, solid (no blur), offset about 0.06 em in every direction.
        const first = /rgba?\([^)]*\)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+0px/.exec(w.shadow);
        expect(first, `${w.text}: no outline ring in ${w.shadow.slice(0, 80)}`).not.toBeNull();
        const outline = rgb(w.shadow);
        expect(Math.hypot(Number(first?.[1]), Number(first?.[2])), `${w.text}: outline width`).toBeGreaterThanOrEqual(1.2);
        expect(ratio(rgb(w.color), outline), `${w.text} ${w.color} on ${outline}`).toBeGreaterThanOrEqual(4.5);
      }
      await scan(page, `title-real ${s.name}`);
      await expect(page.getByRole('dialog', { name: 'Thrills & Chills' })).toBeVisible();
      await ctx.close();
    }
  });
});
