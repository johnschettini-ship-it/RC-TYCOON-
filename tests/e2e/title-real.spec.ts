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
 * The whole wheel inside the window at every size and text size, and the fills above and below the picture continuing
 * the sky's top row and the lawn's bottom row (no seam). Screenshots go to `$SHOT_DIR` (default: the test's output
 * folder), named `title-real-<name><$SHOT_SUFFIX>.png`.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { openTool, scan } from './helpers';

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
  picture: Box;
  wheel: Box;
  framing: string;
  sign: string;
  box: { x: number; y: number; w: number; h: number };
  nameRow: number;
  anchor: number;
}
async function placed(page: Page): Promise<Placed> {
  const raw = await page.locator('canvas.title-real-scene').evaluate((c) => ({ ...(c as HTMLCanvasElement).dataset }));
  const [sign, nums] = (raw.sign ?? ':').split(':');
  return {
    picture: parseBox(raw.picture),
    wheel: parseBox(raw.wheel),
    framing: raw.framing ?? '',
    sign: sign ?? '',
    box: parseBox(nums),
    nameRow: Number(raw.nameRow),
    anchor: Number(raw.anchor),
  };
}

/**
 * The checks of one size: the framing, the sign in the window and above the ride tops (and the menu), the whole wheel
 * in the window (at both ends of its drift), the desktop menu clear of the wheel, the phone menu below it, the menu
 * buttons in the window, no sideways scroll.
 */
async function checkPlaced(page: Page, s: Size): Promise<void> {
  const p = await placed(page);
  expect(p.framing).toBe(s.h > s.w ? 'tall' : 'wide');
  expect(p.box.x).toBeGreaterThanOrEqual(16 - 0.1);
  expect(p.box.x + p.box.w).toBeLessThanOrEqual(s.w - 16 + 0.1);
  expect(p.box.y).toBeGreaterThanOrEqual(12 - 0.1);
  expect(p.box.y + p.box.h).toBeLessThanOrEqual(p.nameRow - 8 + 0.1);
  const menu = await page.locator('.title-menu').boundingBox();
  if (!menu) throw new Error('no menu');
  expect(p.box.y + p.box.h).toBeLessThanOrEqual(menu.y + 0.5);
  expect(p.wheel.x, 'wheel left').toBeGreaterThanOrEqual(-0.1);
  expect(p.wheel.x + p.wheel.w, 'wheel right').toBeLessThanOrEqual(s.w + 0.1);
  expect(p.wheel.y, 'wheel top').toBeGreaterThanOrEqual(-0.1);
  expect(p.wheel.y + p.wheel.h, 'wheel bottom').toBeLessThanOrEqual(s.h + 0.1);
  if (s.w >= 900) {
    expect(p.anchor).toBeGreaterThanOrEqual(menu.x + menu.width);
    expect(p.wheel.x).toBeGreaterThanOrEqual(menu.x + menu.width);
    // The whole picture shows on the desktop (the lake at its bottom).
    expect(p.picture.y).toBeGreaterThanOrEqual(-0.1);
    expect(p.picture.y + p.picture.h).toBeLessThanOrEqual(s.h + 0.1);
  } else expect(p.wheel.y + p.wheel.h, 'wheel above the menu').toBeLessThanOrEqual(menu.y + 0.5);
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
      await checkPlaced(page, s);
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

  for (const s of SIZES) {
    test(`${s.name}, large text (175 %): the menu, the sign and the whole wheel still fit`, async ({ browser }) => {
      const { ctx, page, errors } = await open(browser, s);
      await page.goto('/');
      test.skip(!(await hasTitleArt(page)), 'no title art in art/real/title/');
      await page.waitForFunction(() => (window as unknown as { __tc?: unknown }).__tc !== undefined);
      await page.evaluate(() => (window as unknown as { __tc: { settings: { set(k: string, v: unknown): void } } }).__tc.settings.set('textScale', 175));
      await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
      await page.waitForTimeout(400);
      await checkPlaced(page, s);
      await shot(page, `${s.name}-text175`);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }

  for (const s of [SIZES[0], SIZES[3]]) {
    test(`${s.name}: the fills continue the sky's top row above the picture and the lawn below it (no seam)`, async ({ browser }) => {
      const { ctx, page } = await open(browser, s, 'reduce');
      await page.goto('/');
      test.skip(!(await hasTitleArt(page)), 'no title art in art/real/title/');
      await expect(ready(page)).toHaveCount(1, { timeout: 10_000 });
      await page.waitForTimeout(300);
      const p = await placed(page);
      const out = await page.evaluate(async ({ P, sign }) => {
        const c = document.querySelector('canvas.title-real-scene') as HTMLCanvasElement;
        const k = c.width / window.innerWidth;
        const x = c.getContext('2d') as CanvasRenderingContext2D;
        const px = (cx: number, cy: number): number[] => [...x.getImageData(Math.floor(cx * k), Math.floor(cy * k), 1, 1).data].slice(0, 3);
        const ix = (await (await fetch('art/real/title/index.json')).json()) as Record<string, { w: number; layers: { sky: string } }>;
        const framing = c.dataset.framing as string;
        const sky = await createImageBitmap(await (await fetch(`art/real/title/${ix[framing]?.layers.sky}`)).blob());
        const t = document.createElement('canvas');
        t.width = sky.width;
        t.height = 1;
        const tx = t.getContext('2d') as CanvasRenderingContext2D;
        tx.drawImage(sky, 0, 0, sky.width, 1, 0, 0, sky.width, 1);
        const top = tx.getImageData(0, 0, sky.width, 1).data;
        const skyW = sky.width;
        sky.close();
        // Points across the window, clear of the sign (it stands in the sky).
        const xs = [0.04, 0.1, 0.3, 0.5, 0.7, 0.9, 0.96].map((f) => f * window.innerWidth).filter((cx) => cx < sign.x - 4 || cx > sign.x + sign.w + 4);
        const above = P.y > 4 ? xs.map((cx) => {
          const sx = Math.min(skyW - 1, Math.max(0, Math.floor(((cx - P.x) / P.w) * skyW)));
          return { fill: px(cx, P.y / 2), seam: px(cx, P.y - 1.5), sky: [top[sx * 4], top[sx * 4 + 1], top[sx * 4 + 2]] as number[] };
        }) : [];
        const bottom = P.y + P.h;
        // Below: the softened lawn against the picture's last row, both averaged over the window's width.
        const avg = (cy: number): number[] => {
          const n = 64;
          const sum = [0, 0, 0];
          for (let i = 0; i < n; i++) px(((i + 0.5) * window.innerWidth) / n, cy).forEach((v, j) => (sum[j] = (sum[j] ?? 0) + v / n));
          return sum;
        };
        const below = bottom < window.innerHeight - 4 ? [{ fill: avg(bottom + 1.5), picture: avg(bottom - 1 / k) }] : [];
        return { above, below };
      }, { P: p.picture, sign: p.box });
      const near = (a: number[], b: number[], tol: number): boolean => a.every((v, i) => Math.abs(v - (b[i] ?? 0)) <= tol);
      expect(out.above.length + out.below.length, 'a fill to check').toBeGreaterThan(0);
      for (const a of out.above) {
        expect(near(a.fill, a.sky, 10), `fill ${a.fill} vs sky top ${a.sky}`).toBe(true);
        expect(near(a.seam, a.sky, 10), `seam ${a.seam} vs sky top ${a.sky}`).toBe(true);
      }
      for (const b of out.below) expect(near(b.fill, b.picture, 12), `lawn fill ${b.fill} vs the picture's last row ${b.picture}`).toBe(true);
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
      // The plate (or sheet) starts under the sign (low windows: 8 px from the top, as design E) and ends in the
      // window; a long list scrolls inside it.
      const kind = await page.locator('.title-screen').getAttribute('data-kind');
      expect(plate.y).toBeGreaterThanOrEqual(kind === 'low' ? 0 : p.box.y + p.box.h - 0.5);
      expect(plate.y + plate.height).toBeLessThanOrEqual(s.h + 0.5);
      await first.scrollIntoViewIfNeeded();
      const r = await first.boundingBox();
      expect(r && r.y >= plate.y - 0.5 && r.y + r.height <= s.h + 0.5, `first card ${JSON.stringify(r)}`).toBe(true);
      await press((await first.getAttribute('data-testid')) ?? '');
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }

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
    expect(await liveBesideCards(page)).toBe(6);
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
    const live = (): Promise<number> => liveBesideCards(page);
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
    const live = (): Promise<number> => liveBesideCards(page);
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
