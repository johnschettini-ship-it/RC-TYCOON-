/**
 * The realistic title screen (Task 2 of `docs/superpowers/plans/2026-11-16-realistic-title-and-cards.md`). Needs a
 * VITE_ART=real build with the baked art copied to `art/real/` (the title pictures in `art/real/title/`):
 *
 *   VITE_ART=real npx vite build --outDir <dir> && cp -r dist-art/real <dir>/art/real
 *   npx vite preview --outDir <dir> --port <port> &  PW_PORT=<port> VITE_ART=real npx playwright test tests/e2e/title-real.spec.ts
 *
 * Checks: the menu at once over the sky gradient, the panorama fading in, the framing and the name sign's place
 * (above the rides, inside the window), the desktop menu clear of the wheel, a slow and a failed download (menu works,
 * no error), a rotation without a blank frame, reduced motion (a still picture), three round trips to a park (title
 * bitmaps closed in the park, the park's released at the title), and the axe scan with the hidden heading.
 * Screenshots go to `$SHOT_DIR` (default: the test's output folder).
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { openTool, scan } from './helpers';

const REAL = process.env.VITE_ART === 'real';
const SIZES = [
  { name: 'phone-390x844', w: 390, h: 844, dpr: 3, mobile: true },
  { name: 'phone-360x640', w: 360, h: 640, dpr: 2, mobile: true },
  { name: 'sideways-812x375', w: 812, h: 375, dpr: 3, mobile: true },
  { name: 'desktop-1366x768', w: 1366, h: 768, dpr: 1, mobile: false },
] as const;

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
  await page.screenshot({ path: `${dir}/title-real-${name}.png` });
};

const ready = (page: Page) => page.locator('canvas.title-real-scene[data-ready]');

async function hasTitleArt(page: Page): Promise<boolean> {
  return page.evaluate(() => fetch('art/real/title/index.json').then((r) => r.ok, () => false));
}

interface Placed {
  framing: string;
  sign: string;
  box: { x: number; y: number; w: number; h: number };
  nameRow: number;
  anchor: number;
}
async function placed(page: Page): Promise<Placed> {
  return page.locator('canvas.title-real-scene').evaluate((c) => {
    const d = (c as HTMLCanvasElement).dataset;
    const [sign, nums] = (d.sign ?? ':').split(':');
    const [x, y, w, h] = (nums ?? '').split(',').map(Number);
    return { framing: d.framing ?? '', sign: sign ?? '', box: { x: x ?? NaN, y: y ?? NaN, w: w ?? NaN, h: h ?? NaN }, nameRow: Number(d.nameRow), anchor: Number(d.anchor) };
  });
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

test.describe('realistic title screen (VITE_ART=real build)', () => {
  test.skip(!REAL, 'needs a VITE_ART=real build (set VITE_ART=real)');
  // Each test makes its own phone or desktop context: once is enough.
  test.beforeEach(({ browserName }, info) => {
    void browserName;
    test.skip(info.project.name !== 'desktop', 'runs in the desktop project only');
  });

  for (const s of SIZES) {
    test(`${s.name}: menu at once, panorama fades in, name above the rides, menu clear of the wheel`, async ({ browser }) => {
      const { ctx, page, errors } = await open(browser, s);
      await page.goto('/');
      // The menu shows over the sky gradient before (and whether or not) the art arrives.
      await expect(page.getByTestId('title-new')).toBeVisible();
      const bg = await page.locator('.title-screen').evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(bg).toContain('linear-gradient');
      test.skip(!(await hasTitleArt(page)), 'no title art in art/real/title/');
      await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
      await expect(ready(page)).toHaveCSS('opacity', '1');
      const p = await placed(page);
      expect(p.framing).toBe(s.h > s.w ? 'tall' : 'wide');
      // The sign: in the window (16 px sides, 12 px top), 8 px above the ride tops.
      expect(p.box.x).toBeGreaterThanOrEqual(16 - 0.1);
      expect(p.box.x + p.box.w).toBeLessThanOrEqual(s.w - 16 + 0.1);
      expect(p.box.y).toBeGreaterThanOrEqual(12 - 0.1);
      expect(p.box.y + p.box.h).toBeLessThanOrEqual(p.nameRow - 8 + 0.1);
      // The sign does not run under the menu.
      const menu = await page.locator('.title-menu').boundingBox();
      if (!menu) throw new Error('no menu');
      expect(p.box.y + p.box.h).toBeLessThanOrEqual(menu.y + 0.5);
      if (s.w >= 900) expect(p.anchor).toBeGreaterThanOrEqual(menu.x + menu.width);
      // Every menu button inside the window, no sideways scroll.
      for (const b of await page.locator('.title-menu button:visible').all()) {
        const r = await b.boundingBox();
        expect(r && r.x >= 0 && r.y >= 0 && r.x + r.width <= s.w + 0.5 && r.y + r.height <= s.h + 0.5, await b.innerText()).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      // The name stays for screen readers, visually hidden.
      const heading = page.getByRole('heading', { level: 1, name: 'Thrills & Chills' });
      await expect(heading).toHaveCount(1);
      expect((await heading.boundingBox())?.width ?? 0).toBeLessThanOrEqual(1);
      await page.waitForTimeout(300);
      await shot(page, s.name);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }

  test('large text (175 %) at 390x844: the menu and the sign still fit', async ({ browser }) => {
    const s = SIZES[0];
    const { ctx, page, errors } = await open(browser, s);
    await page.goto('/');
    test.skip(!(await hasTitleArt(page)), 'no title art in art/real/title/');
    await page.waitForFunction(() => (window as unknown as { __tc?: unknown }).__tc !== undefined);
    await page.evaluate(() => (window as unknown as { __tc: { settings: { set(k: string, v: unknown): void } } }).__tc.settings.set('textScale', 175));
    await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
    await page.waitForTimeout(300);
    const p = await placed(page);
    const menu = await page.locator('.title-menu').boundingBox();
    if (!menu) throw new Error('no menu');
    expect(p.box.y + p.box.h).toBeLessThanOrEqual(Math.min(p.nameRow - 8, menu.y) + 0.5);
    expect(menu.y + menu.height).toBeLessThanOrEqual(s.h + 0.5);
    await shot(page, 'phone-390x844-text175');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('a failed title download: the menu works, the gradient stays, no error is shown', async ({ browser }) => {
    const { ctx, page, errors } = await open(browser, SIZES[0]);
    await page.route('**/art/real/title/**', (r) => r.abort());
    await page.goto('/');
    await expect(page.getByTestId('title-new')).toBeVisible();
    await page.waitForTimeout(800);
    await expect(ready(page)).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await shot(page, 'failed-download-390x844');
    await page.getByTestId('title-new').click();
    await expect(page.getByTestId('title-newgame')).toBeVisible();
    // The aborted requests themselves are the browser's lines; nothing else.
    expect(errors.filter((e) => !/net::ERR_FAILED|Failed to load resource/.test(e))).toEqual([]);
    await ctx.close();
  });

  test('a slow title download: the menu first, the panorama when it arrives', async ({ browser }) => {
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
    await page.route('**/art/real/title/wide-*', async (r) => {
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
    // Only one framing decoded at a time: 4 pictures and 2 signs.
    expect(await page.evaluate(() => (window as unknown as { __liveBitmaps(): number }).__liveBitmaps())).toBe(6);
    await shot(page, 'rotated-844x390');
    await ctx.close();
  });

  test('reduced motion: no drift and a still wheel; without it the picture moves', async ({ browser }) => {
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
    const live = (): Promise<number> => page.evaluate(() => (window as unknown as { __liveBitmaps(): number }).__liveBitmaps());
    await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
    const atTitle = await live();
    expect(atTitle).toBe(6);
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('title-new').click();
      await page.getByTestId('title-name').fill(`Trip ${i}`);
      await page.getByTestId('title-size-64').click();
      await page.getByTestId('title-start').click();
      await expect(page.locator('.title-screen')).toBeHidden();
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
      // the title's own 6 pictures.
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
    const live = (): Promise<number> => page.evaluate(() => (window as unknown as { __liveBitmaps(): number }).__liveBitmaps());
    await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
    expect(await live()).toBe(6);
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
    expect(await live()).toBe(6);
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
    await page.evaluate(() => (window as unknown as { __tc: { settings: { set(k: string, v: unknown): void } } }).__tc.settings.set('reducedMotion', 'on'));
    await page.waitForTimeout(200);
    const a = await page.locator('canvas.title-real-scene').screenshot();
    await page.waitForTimeout(700);
    const b = await page.locator('canvas.title-real-scene').screenshot();
    expect(Buffer.compare(a, b)).toBe(0);
    // And back on: it moves again.
    await page.evaluate(() => (window as unknown as { __tc: { settings: { set(k: string, v: unknown): void } } }).__tc.settings.set('reducedMotion', 'off'));
    await page.waitForTimeout(200);
    const c = await page.locator('canvas.title-real-scene').screenshot();
    await page.waitForTimeout(700);
    const d = await page.locator('canvas.title-real-scene').screenshot();
    expect(Buffer.compare(c, d)).not.toBe(0);
    await ctx.close();
  });

  test('axe: no serious issues on the realistic title; the hidden heading names the dialog', async ({ browser }) => {
    for (const s of [SIZES[0], SIZES[3]]) {
      const { ctx, page } = await open(browser, s);
      await page.goto('/');
      await expect(page.getByTestId('title-new')).toBeVisible();
      await page.waitForTimeout(500);
      await scan(page, `title-real ${s.name}`);
      await expect(page.getByRole('dialog', { name: 'Thrills & Chills' })).toBeVisible();
      await ctx.close();
    }
  });
});
