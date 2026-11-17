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
import { scan } from './helpers';

const REAL = process.env.VITE_ART === 'real';
const DESKTOP = { w: 1366, h: 768, dpr: 1, mobile: false };
const PHONES = [
  { name: '390x844', w: 390, h: 844, dpr: 3, mobile: true },
  { name: '360x640', w: 360, h: 640, dpr: 2, mobile: true },
  { name: '812x375', w: 812, h: 375, dpr: 3, mobile: true },
] as const;
const speed = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __tc: { speed: number } }).__tc.speed);

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

/** To the New Park form, with the poster on screen (and the text scale given). */
async function toForm(page: Page, name: string, textScale = 100): Promise<void> {
  await page.goto('/');
  await expect(posterReady(page)).toHaveCount(1, { timeout: 10_000 });
  if (textScale !== 100) await page.evaluate((t) => (window as unknown as { __tc: { settings: { set(k: string, v: unknown): void } } }).__tc.settings.set('textScale', t), textScale);
  await page.getByTestId('title-new').click();
  await page.getByTestId('title-name').fill(name);
  await page.getByTestId('title-size-64').click();
}

/** A new park from the title, up to its welcome card. */
async function toWelcome(page: Page, name: string, textScale = 100): Promise<void> {
  await toForm(page, name, textScale);
  await page.getByTestId('title-start').click();
  await expect(page.getByTestId('welcome-card')).toBeVisible({ timeout: 3000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
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

  test('welcome card: on New game; focus on Let\'s go; the game paused; the first tip waits; Escape closes it; axe clean', async ({ browser }) => {
    const { ctx, page, errors } = await open(browser, DESKTOP);
    await toWelcome(page, 'Welcome Park');
    const card = page.getByRole('dialog', { name: 'Welcome to Thrills & Chills' });
    await expect(card).toBeVisible();
    await expect(page.getByTestId('welcome-go')).toBeFocused();
    await expect(card).toContainText('Your park is an empty field. Build the park on the poster!');
    // The game is paused while it is open, and the first tip ("no ride yet") waits.
    expect(await speed(page)).toBe(0);
    await page.waitForTimeout(2600);
    await expect(page.getByTestId('tip')).toBeHidden();
    // The look: cream paper, a coral frame, the name in Fredoka 700 with the title colours.
    const look = await card.evaluate((e) => {
      const cs = getComputedStyle(e);
      const words = [...e.querySelectorAll('.tc-word')].map((w) => getComputedStyle(w).color);
      const name = getComputedStyle(e.querySelector('.tc-welcome-name') as Element);
      return { bg: cs.backgroundColor, border: cs.borderTopColor, words, font: name.fontFamily, weight: name.fontWeight, go: getComputedStyle(e.querySelector('.tc-welcome-go') as Element).backgroundColor };
    });
    expect(look).toMatchObject({ bg: 'rgb(246, 236, 216)', border: 'rgb(217, 97, 74)', weight: '700', go: 'rgb(63, 169, 230)' });
    expect(look.font).toContain('Fredoka');
    expect(look.words).toEqual(['rgb(255, 217, 112)', 'rgb(255, 159, 122)', 'rgb(159, 224, 234)']);
    await scan(page, 'welcome card 1366x768');
    await shot(page, 'welcome-1366x768');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('welcome-card')).toHaveCount(0);
    // The focus is back on the game (nothing inside a dialog), the game runs again and the tip comes.
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    expect(await speed(page)).toBe(1);
    await expect(page.getByTestId('tip')).toBeVisible({ timeout: 4000 });
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('welcome card: a new sandbox shows it; a scenario, the tutorial and Load do not', async ({ browser }) => {
    const { ctx, page } = await open(browser, DESKTOP);
    await page.goto('/');
    await expect(posterReady(page)).toHaveCount(1, { timeout: 10_000 });
    // Sandbox.
    await page.getByTestId('title-new').click();
    await page.getByTestId('title-sandbox').click();
    await page.getByTestId('sandbox-start').click();
    await expect(page.getByTestId('welcome-card')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('welcome-go').click();
    // Save it, then Load it from the title: no card.
    await page.getByTestId('tool-menu').click();
    await page.getByTestId('menu-save').click();
    await page.getByTestId('slot-1').click();
    const quit = async (): Promise<void> => {
      await page.getByTestId('tool-menu').click();
      await page.getByTestId('menu-quit').click();
      const yes = page.getByRole('button', { name: 'Quit', exact: true });
      if (await yes.isVisible().catch(() => false)) await yes.click();
      await expect(page.getByTestId('title-new')).toBeVisible();
      await expect(posterReady(page)).toHaveCount(1, { timeout: 10_000 });
    };
    await quit();
    await page.getByTestId('title-load').click();
    await page.locator('.title-load button.slot').first().click();
    await expect(page.locator('.title-screen')).toBeHidden();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('welcome-card')).toHaveCount(0);
    // A scenario (its own briefing).
    await quit();
    await page.getByTestId('title-new').click();
    await page.getByTestId('title-scenarios').click();
    await page.locator('[data-testid^="scenario-card-"]').first().click();
    await page.getByTestId('scenario-start').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('welcome-card')).toHaveCount(0);
    // The tutorial.
    await quit();
    await page.getByTestId('title-new').click();
    await page.getByTestId('title-tutorial').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('welcome-card')).toHaveCount(0);
    await ctx.close();
  });

  for (const s of PHONES) {
    for (const ts of [100, 175]) {
      test(`welcome card fits at ${s.name}, text ${ts} %`, async ({ browser }) => {
        const { ctx, page } = await open(browser, s);
        await toWelcome(page, 'Fit Park', ts);
        const box = await page.getByTestId('welcome-card').boundingBox();
        if (!box) throw new Error('no card');
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(s.w + 0.5);
        expect(box.y + box.height).toBeLessThanOrEqual(s.h + 0.5);
        // Nothing inside is cut sideways, and the button can be reached (the card scrolls when it is taller than the window).
        const fit = await page.getByTestId('welcome-card').evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, words: [...e.querySelectorAll('.tc-word, .tc-welcome-to, .tc-welcome-body')].every((w) => w.getBoundingClientRect().right <= e.getBoundingClientRect().right + 0.5 && w.getBoundingClientRect().left >= e.getBoundingClientRect().left - 0.5) }));
        expect(fit.sw).toBeLessThanOrEqual(fit.cw);
        expect(fit.words).toBe(true);
        const go = page.getByTestId('welcome-go');
        await go.scrollIntoViewIfNeeded();
        const g = await go.boundingBox();
        expect(g && g.y >= 0 && g.y + g.height <= s.h + 0.5).toBe(true);
        if (s.name === '390x844' && ts === 100) {
          await scan(page, `welcome card ${s.name}`);
          await shot(page, 'welcome-390x844');
        }
        await go.tap();
        await expect(page.getByTestId('welcome-card')).toHaveCount(0);
        await ctx.close();
      });
    }
  }

  /** Mean colourfulness ((max - min) / 255) of the thumbnail inside a box given in poster px. */
  const colourIn = (page: Page, box: { x: number; y: number; w: number; h: number }): Promise<number> =>
    page.getByTestId('poster-goal-thumb').evaluate((c, b) => {
      const cv = c as HTMLCanvasElement;
      const k = cv.width / 1376;
      const x = cv.getContext('2d') as CanvasRenderingContext2D;
      const d = x.getImageData(Math.round(b.x * k), Math.round(b.y * k), Math.max(1, Math.round(b.w * k)), Math.max(1, Math.round(b.h * k))).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += (Math.max(d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0) - Math.min(d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0)) / 255;
      return sum / (d.length / 4);
    }, box);
  const WHEEL_BOX = { x: 560, y: 120, w: 250, h: 130 };
  const COASTER_BOX = { x: 1150, y: 150, w: 150, h: 200 };
  const buildWheel = (page: Page): Promise<boolean> =>
    page.evaluate(() => {
      const g = (window as unknown as { __tc: { dispatch(c: unknown): { ok: boolean } } }).__tc;
      return g.dispatch({ type: 'placeRide', defId: 'big_wheel', x: 26, y: 40, rotation: 0 }).ok;
    });
  const thumbReady = (page: Page) => expect.poll(() => page.getByTestId('poster-goal-thumb').evaluate((c) => (c as HTMLCanvasElement).width), { timeout: 5000 }).toBeGreaterThan(0);

  test('goal panel (desktop): 0 of 5 in grey; a big wheel built lights the wheel, 1 of 5; list text; axe clean', async ({ browser }) => {
    const { ctx, page, errors } = await open(browser, DESKTOP);
    await toWelcome(page, 'Poster Park');
    await page.getByTestId('welcome-go').click();
    const panel = page.getByRole('complementary', { name: 'Make the poster real' });
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('poster-goal-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('poster-goal-count')).toHaveText(' · 0 of 5');
    await thumbReady(page);
    expect(await colourIn(page, WHEEL_BOX)).toBeLessThan(0.08);
    expect(await colourIn(page, COASTER_BOX)).toBeLessThan(0.08);
    const items = await panel.locator('li').allInnerTexts();
    expect(items.length).toBe(5);
    expect(await panel.locator('li[data-goal="wheel"] .tc-goal-name').textContent()).toBe('Big wheel: to do');
    await scan(page, 'goal panel 0 of 5');
    await shot(page, 'goal-0of5-1366x768');
    expect(await buildWheel(page)).toBe(true);
    await expect(page.getByTestId('poster-goal-count')).toHaveText(' · 1 of 5', { timeout: 2000 });
    expect(await panel.locator('li[data-goal="wheel"] .tc-goal-name').textContent()).toBe('Big wheel: done');
    await expect(page.getByTestId('poster-goal-thumb')).toHaveAttribute('data-lit', 'wheel');
    expect(await colourIn(page, WHEEL_BOX)).toBeGreaterThan(0.25);
    expect(await colourIn(page, COASTER_BOX)).toBeLessThan(0.08);
    // The wheel's card panel may have opened over the right side: closed for the shot.
    await page.keyboard.press('Escape');
    await expect(panel).toBeVisible();
    await shot(page, 'goal-1of5-1366x768');
    // Demolish turns the goal back off.
    await page.evaluate(() => {
      const g = (window as unknown as { __tc: { dispatch(c: unknown): unknown; world: { state: { rides: Array<{ defId: string; x: number; y: number }> } } } }).__tc;
      const r = g.world.state.rides.find((x) => x.defId === 'big_wheel');
      if (r) g.dispatch({ type: 'demolish', x: r.x, y: r.y });
    });
    await expect(page.getByTestId('poster-goal-count')).toHaveText(' · 0 of 5', { timeout: 2000 });
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('goal panel (phone 390x844): a chip by default; opened it shows the poster; 1 of 5 with the wheel lit', async ({ browser }) => {
    const { ctx, page } = await open(browser, PHONES[0]);
    await toWelcome(page, 'Phone Park');
    await page.getByTestId('welcome-go').tap();
    const toggle = page.getByTestId('poster-goal-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('poster-goal-thumb')).toBeHidden();
    await shot(page, 'goal-0of5-390x844-chip');
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await thumbReady(page);
    const box = await page.getByTestId('poster-goal').boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390.5 && box.y + box.height <= 844.5).toBe(true);
    await shot(page, 'goal-0of5-390x844-open');
    expect(await buildWheel(page)).toBe(true);
    await expect(page.getByTestId('poster-goal-count')).toHaveText(' · 1 of 5', { timeout: 2000 });
    await expect(page.getByTestId('poster-goal-thumb')).toHaveAttribute('data-lit', 'wheel');
    expect(await colourIn(page, WHEEL_BOX)).toBeGreaterThan(0.25);
    // The tip ("build a ride and open it") shows by now: the panel sits below it, never over it.
    await page.waitForTimeout(2500);
    const tip = await page.getByTestId('tip').boundingBox();
    const me = await page.getByTestId('poster-goal').boundingBox();
    if (tip && me) expect(me.y, 'panel below the tip').toBeGreaterThanOrEqual(tip.y + tip.height);
    await shot(page, 'goal-1of5-390x844-open');
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Collapsed: the thumbnail copies are freed.
    expect(await page.getByTestId('poster-goal-thumb').evaluate((c) => (c as HTMLCanvasElement).width)).toBe(0);
    // Still below the tip after the next checks (it does not jump back over it).
    await page.waitForTimeout(1200);
    const tip2 = await page.getByTestId('tip').boundingBox();
    const chip = await page.getByTestId('poster-goal').boundingBox();
    if (tip2 && chip) expect(chip.y, 'chip below the tip').toBeGreaterThanOrEqual(tip2.y + tip2.height);
    await shot(page, 'goal-1of5-390x844-chip');
    await ctx.close();
  });

  test('goal panel: hidden in a scenario, and gone for good once dismissed (stored under tcreal:)', async ({ browser }) => {
    const { ctx, page } = await open(browser, DESKTOP);
    await page.goto('/');
    await expect(posterReady(page)).toHaveCount(1, { timeout: 10_000 });
    await page.getByTestId('title-new').click();
    await page.getByTestId('title-scenarios').click();
    await page.locator('[data-testid^="scenario-card-"]').first().click();
    await page.getByTestId('scenario-start').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    await page.waitForTimeout(800);
    await expect(page.getByTestId('poster-goal')).toBeHidden();
    await ctx.close();
    const second = await open(browser, DESKTOP);
    await second.page.addInitScript(() => window.localStorage.setItem('tcreal:tc.posterGoal', 'dismissed'));
    await toWelcome(second.page, 'Done Park');
    await second.page.getByTestId('welcome-go').click();
    await second.page.waitForTimeout(800);
    await expect(second.page.getByTestId('poster-goal')).toBeHidden();
    await second.ctx.close();
  });
});
