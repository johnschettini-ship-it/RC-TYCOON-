/**
 * The title-to-play bridge (`docs/superpowers/specs/2026-11-17-title-to-play-bridge-design.md`): the push through the
 * arch, the arrival glow, the welcome card and the "Make the poster real" goal panel. Needs a VITE_ART=real build with
 * the baked art in `art/real/` and the cover in `art/real/title/` (see `title-real.spec.ts`):
 *
 *   VITE_ART=real npx vite build --outDir <dir> && cp -r <baked art> <dir>/art/real && node tools/art3d/cover.mjs --out <dir>/art/real
 *   npx vite preview --outDir <dir> --port <port> &  PW_PORT=<port> VITE_ART=real npx playwright test tests/e2e/bridge-real.spec.ts
 *
 * Screenshots go to `$SHOT_DIR` (default: the test's output folder), named `bridge-<name>.png`.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const REAL = process.env.VITE_ART === 'real';
const DESKTOP = { w: 1366, h: 768, dpr: 1, mobile: false };

/** Counts live ImageBitmaps by size (the poster is the only 1376 x 768 one). */
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
  (window as unknown as { __posterBitmaps: () => number }).__posterBitmaps = () => [...live].filter((b) => b.width === 1376 && b.height === 768).length;
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
  await page.screenshot({ path: `${dir}/bridge-${name}.png` });
};

const posterReady = (page: Page) => page.locator('canvas.title-real-scene[data-ready]');

/** To the New Park form, with the poster on screen. */
async function toForm(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await expect(posterReady(page)).toHaveCount(1, { timeout: 10_000 });
  await page.getByTestId('title-new').click();
  await page.getByTestId('title-name').fill(name);
  await page.getByTestId('title-size-64').click();
}

/** Closes the welcome card when it shows (a new park). */
async function dismissWelcome(page: Page): Promise<void> {
  const go = page.getByTestId('welcome-go');
  await go.waitFor({ state: 'visible', timeout: 3000 }).catch(() => undefined);
  if (await go.isVisible()) await go.click();
  await expect(page.getByTestId('welcome-card')).toHaveCount(0);
}

test.describe('title-to-play bridge (VITE_ART=real build)', () => {
  test.skip(!REAL, 'needs a VITE_ART=real build (set VITE_ART=real)');
  test.beforeEach(({ browserName }, info) => {
    void browserName;
    test.skip(info.project.name !== 'desktop', 'runs in the desktop project only');
  });

  test('push through the arch: the park is set first, the title is gone and the poster freed within 1.2 s, the game takes input', async ({ browser }) => {
    const { ctx, page, errors } = await open(browser, DESKTOP);
    await toForm(page, 'Arch Park');
    expect(await page.evaluate(() => (window as unknown as { __posterBitmaps(): number }).__posterBitmaps())).toBe(1);
    // Watch the push from inside the page: the park behind the title at its first frame, and when the title is gone.
    await page.evaluate(() => {
      const w = window as unknown as { __push: { t0: number; parkAtStart: string | null; gone: number | null; scales: string[] }; __tc: { world: { state: { park: { name: string } } } } };
      w.__push = { t0: 0, parkAtStart: null, gone: null, scales: [] };
      const title = document.querySelector('.title-screen') as HTMLElement;
      const scene = document.querySelector('canvas.title-real-scene') as HTMLCanvasElement;
      document.querySelector('[data-testid="title-start"]')?.addEventListener('click', () => (w.__push.t0 = performance.now()), { capture: true });
      new MutationObserver(() => {
        if (title.classList.contains('tc-leaving') && w.__push.parkAtStart === null) w.__push.parkAtStart = w.__tc.world.state.park.name;
        if (title.hidden && w.__push.gone === null) w.__push.gone = performance.now();
      }).observe(title, { attributes: true, attributeFilter: ['class', 'hidden'] });
      new MutationObserver(() => w.__push.scales.push(scene.style.transform)).observe(scene, { attributes: true, attributeFilter: ['style'] });
    });
    await page.getByTestId('title-start').click();
    await expect(page.locator('.title-screen')).toBeHidden({ timeout: 3000 });
    const push = await page.evaluate(() => (window as unknown as { __push: { t0: number; parkAtStart: string | null; gone: number; scales: string[] } }).__push);
    // The park was ready behind the title when the push began.
    expect(push.parkAtStart).toBe('Arch Park');
    // It zoomed (some frames scaled past 1.5), and was gone within about 1.2 s.
    expect(push.scales.some((t) => /scale\((1\.[5-9]|2\.)/.test(t))).toBe(true);
    expect(push.gone - push.t0).toBeLessThan(1200);
    // The poster bitmap is closed and the title canvas emptied.
    expect(await page.evaluate(() => (window as unknown as { __posterBitmaps(): number }).__posterBitmaps())).toBe(0);
    expect(await page.locator('canvas.title-real-scene').evaluate((c) => (c as HTMLCanvasElement).width)).toBe(0);
    // The game takes input.
    await dismissWelcome(page);
    await page.getByTestId('deck-stalls').click({ timeout: 2000 });
    await expect(page.getByTestId('hand')).toHaveAttribute('data-deck', 'stalls');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('a tap skips the push at once', async ({ browser }) => {
    const { ctx, page } = await open(browser, DESKTOP);
    await toForm(page, 'Skip Park');
    await page.getByTestId('title-start').click();
    await expect(page.locator('.title-screen.tc-leaving')).toHaveCount(1);
    const t0 = Date.now();
    await page.mouse.click(683, 384);
    await expect(page.locator('.title-screen')).toBeHidden({ timeout: 500 });
    expect(Date.now() - t0).toBeLessThan(500);
    expect(await page.evaluate(() => (window as unknown as { __posterBitmaps(): number }).__posterBitmaps())).toBe(0);
    await ctx.close();
  });

  test('reduced motion: a cross-fade with no zoom, and no glow', async ({ browser }) => {
    const { ctx, page } = await open(browser, DESKTOP, 'reduce');
    await toForm(page, 'Calm Park');
    await page.evaluate(() => {
      const w = window as unknown as { __scales: string[] };
      w.__scales = [];
      const scene = document.querySelector('canvas.title-real-scene') as HTMLCanvasElement;
      new MutationObserver(() => w.__scales.push(scene.style.transform)).observe(scene, { attributes: true, attributeFilter: ['style'] });
    });
    const t0 = Date.now();
    await page.getByTestId('title-start').click();
    await expect(page.locator('.title-screen')).toBeHidden({ timeout: 1000 });
    expect(Date.now() - t0).toBeLessThan(900);
    expect((await page.evaluate(() => (window as unknown as { __scales: string[] }).__scales)).filter((t) => t.includes('scale'))).toEqual([]);
    await expect(page.locator('.tc-arrival-glow')).toHaveCount(0);
    await ctx.close();
  });

  test('the arrival glow follows the push, fades out, and takes no input; screenshots mid-push and of the glow', async ({ browser }) => {
    const { ctx, page } = await open(browser, DESKTOP);
    await toForm(page, 'Glow Park');
    // Hold the clock mid-push for the screenshot (the page's timers and frames are faked from here on).
    const t = Date.now();
    await page.clock.install({ time: t });
    await page.clock.pauseAt(t + 100);
    await page.getByTestId('title-start').click();
    await page.clock.runFor(500);
    await expect(page.locator('.title-screen.tc-leaving')).toHaveCount(1);
    await shot(page, 'mid-push-1366x768');
    await page.clock.runFor(420);
    await expect(page.locator('.title-screen')).toBeHidden();
    const glow = page.locator('.tc-arrival-glow');
    await expect(glow).toHaveCount(1);
    const style = await glow.evaluate((e) => ({ blend: getComputedStyle(e).mixBlendMode, pe: getComputedStyle(e).pointerEvents, o: Number(getComputedStyle(e).opacity), next: e.nextElementSibling?.id, prev: e.previousElementSibling?.id }));
    expect(style).toMatchObject({ blend: 'soft-light', pe: 'none', prev: 'game', next: 'ui' });
    expect(style.o).toBeGreaterThan(0.25);
    // The welcome card would cover the park in the glow shot: closed first (its own shots are below). The clock stays
    // held, so the shot shows the glow as it starts.
    if ((await page.getByTestId('welcome-go').count()) > 0) await page.getByTestId('welcome-go').click();
    await shot(page, 'arrival-glow-1366x768');
    await page.clock.runFor(2200);
    await expect(glow).toHaveCount(0);
    await ctx.close();
  });

  test('Continue from the title: the push and the glow, no welcome card', async ({ browser }) => {
    const { ctx, page } = await open(browser, DESKTOP);
    await toForm(page, 'Saved Park');
    await page.getByTestId('title-start').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    await dismissWelcome(page);
    await page.evaluate(() => (window as unknown as { __tc: { step(n: number): void } }).__tc.step(5));
    // Save to slot 1 through the game's own save actions, then back to the title and Continue.
    await page.getByTestId('tool-menu').click();
    await page.getByTestId('menu-save').click();
    await page.getByTestId('slot-1').click();
    await page.getByTestId('tool-menu').click();
    await page.getByTestId('menu-quit').click();
    const yes = page.getByRole('button', { name: 'Quit', exact: true });
    if (await yes.isVisible().catch(() => false)) await yes.click();
    await expect(page.getByTestId('title-continue')).toBeVisible();
    await expect(posterReady(page)).toHaveCount(1, { timeout: 10_000 });
    await page.getByTestId('title-continue').click();
    await expect(page.locator('.title-screen.tc-leaving')).toHaveCount(1);
    await expect(page.locator('.title-screen')).toBeHidden();
    await expect(page.locator('.tc-arrival-glow')).toHaveCount(1);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('welcome-card')).toHaveCount(0);
    await ctx.close();
  });
});
