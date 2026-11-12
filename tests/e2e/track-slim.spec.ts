/**
 * Task 20 (the owner's test play): on the phone (upright, `data-layout="bottom"`) and in the low layout (`data-low="1"`)
 * the station step of the track builder is one slim row: the ride name, the length stepper (− n +), a round Rotate
 * button, Confirm with the price, and a "⋯" button whose small menu holds Details and Cancel. The Temperament colour key
 * is a one-line strip under the top region: three colour dots with the band names (the ranges in its accessible name).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { isPhone, newPark, pickCard, scan, showTile, watchErrors } from './helpers';
import { defaultSettings, serializeSettings } from '../../src/settings/schema';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The free space between two boxes in px (0 when they touch or overlap). */
const boxGap = (a: Box, b: Box): number => Math.hypot(Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width)), Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height)));
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

async function frames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

interface SlimTc {
  tool: { tool: string; rotation: number };
  setSpeed(n: number): void;
  dispatch(cmd: Record<string, unknown>): { ok: boolean };
}
const tc = <T>(page: Page, fn: (g: SlimTc) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__tc)`) as Promise<T>;

async function park(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await newPark(page);
  await tc(page, (g) => g.setSpeed(0));
  await frames(page);
}

/** Hold the Mini Railway card and put its station ghost on tile (x, y) with a tap. */
async function station(page: Page, x = 30, y = 30): Promise<void> {
  await pickCard(page, 'track', 'mini_railway', { tap: true });
  await expect(page.getByTestId('track-builder')).toBeVisible();
  await expect(page.getByTestId('track-builder')).toHaveAttribute('data-phase', 'station');
  const p = await showTile(page, x, y);
  await frames(page);
  await page.touchscreen.tap(p.x, p.y);
  await frames(page);
}

/** The text of an element is clipped by it or by one of its children (ellipsis and hidden overflow count). */
async function clippedText(control: Locator): Promise<string[]> {
  return control.evaluate((el) => {
    const out: string[] = [];
    for (const e of [el, ...el.querySelectorAll<HTMLElement>('*')]) {
      if (e.closest('.sr-only, [hidden]')) continue;
      const cs = getComputedStyle(e);
      const clips = cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.overflowY === 'hidden' || cs.overflowY === 'clip';
      if (clips && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) && (e.textContent ?? '').trim() !== '') out.push(`${e.className} ${e.scrollWidth}/${e.clientWidth} ${e.scrollHeight}/${e.clientHeight}`);
    }
    return out;
  });
}

/** The control is inside the window and a press at its centre reaches it. */
async function reachable(control: Locator): Promise<boolean> {
  return control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.left < -0.5 || r.top < -0.5 || r.right > window.innerWidth + 0.5 || r.bottom > window.innerHeight + 0.5) return false;
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top !== null && el.contains(top);
  });
}

test.describe('slim track station row and colour key strip (Task 20)', () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(!isPhone(info), 'the phone and the low layout');
  });

  for (const [w, h] of [[390, 844], [844, 390]] as const) {
    test(`${w} × ${h}: the station step is one slim row; its controls are 44 px with 8 px gaps; Confirm carries the price`, async ({ page }) => {
      const watch = watchErrors(page);
      await park(page, w, h);
      await expect(page.locator('#ui')).toHaveAttribute('data-layout', 'bottom');
      if (h < 500) await expect(page.locator('#ui')).toHaveAttribute('data-low', '1');
      await station(page);
      const builder = page.getByTestId('track-builder');
      const plate = (await builder.boundingBox())!;
      expect(plate.height, 'the plate of the row').toBeLessThanOrEqual(65);
      expect(plate.y + plate.height).toBeLessThanOrEqual(h);

      const confirm = page.getByTestId('track-confirm');
      await expect(confirm).toBeEnabled();
      await expect(confirm).toContainText('$1,308');
      await expect(confirm).toHaveAttribute('aria-label', 'Confirm Mini Railway station, $1,308');
      await expect(page.getByTestId('track-rotate')).toHaveAttribute('aria-label', 'Rotate');
      await expect(page.getByTestId('track-more')).toHaveAttribute('aria-label', 'More');
      await expect(page.getByTestId('track-builder-title')).toHaveText('Mini Railway');
      // A narrow upright phone at 100 %: the name is left out of the row (it would show as "Mi…"); wider rows show it.
      if (w < 480) await expect(page.getByTestId('track-builder-title')).toBeHidden();
      else await expect(page.getByTestId('track-builder-title')).toBeVisible();
      if (process.env.TC_SLIM_SHOT) await page.screenshot({ path: `${process.env.TC_SLIM_SHOT}-${w}x${h}.png` });
      // The hint is the row's accessible description, not a line on the screen.
      await expect(builder.getByText('Tap the map to move the station, then Confirm')).toBeHidden();
      await expect(builder).toHaveAccessibleDescription('Tap the map to move the station, then Confirm');
      // Details and Cancel are in the "⋯" menu, closed.
      await expect(page.getByTestId('track-details')).toBeHidden();
      await expect(page.getByTestId('track-cancel')).toBeHidden();

      // Every control of the row: 44 × 44 or more, 8 px from each other, all on one line.
      const controls = builder.locator('button:visible');
      const boxes: Array<{ name: string; box: Box }> = [];
      for (const c of await controls.all()) boxes.push({ name: (await c.getAttribute('aria-label')) ?? (await c.textContent()) ?? '', box: (await c.boundingBox())! });
      expect(boxes.map((b) => b.name)).toEqual(['Shorter station', 'Longer station', 'Rotate', 'Confirm Mini Railway station, $1,308', 'More']);
      for (const a of boxes) {
        expect(a.box.width, a.name).toBeGreaterThanOrEqual(44);
        expect(a.box.height, a.name).toBeGreaterThanOrEqual(44);
        expect(a.box.x).toBeGreaterThanOrEqual(0);
        expect(a.box.x + a.box.width).toBeLessThanOrEqual(w);
        for (const b of boxes) if (a !== b) expect(boxGap(a.box, b.box), `${a.name} to ${b.name}`).toBeGreaterThanOrEqual(7.9);
      }

      // The stepper changes the length (and the price); Rotate turns the station.
      const len = page.getByTestId('track-station-length');
      await expect(len).toHaveText('3 tiles');
      await builder.getByRole('button', { name: 'Longer station' }).tap();
      await expect(len).toHaveText('4 tiles');
      await expect(confirm).not.toContainText('$1,308');
      await builder.getByRole('button', { name: 'Shorter station' }).tap();
      await expect(len).toHaveText('3 tiles');
      await expect(confirm).toContainText('$1,308');
      const r0 = await tc(page, (g) => g.tool.rotation);
      await page.getByTestId('track-rotate').tap();
      await expect.poll(() => tc(page, (g) => g.tool.rotation)).toBe((r0 + 1) % 4);
      await page.getByTestId('track-rotate').tap();
      await page.getByTestId('track-rotate').tap();
      await page.getByTestId('track-rotate').tap();
      await expect.poll(() => tc(page, (g) => g.tool.rotation)).toBe(r0);

      // "⋯" → Details opens the card details panel; closing it brings the row back.
      const more = page.getByTestId('track-more');
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      await more.tap();
      await expect(more).toHaveAttribute('aria-expanded', 'true');
      const menu = page.getByTestId('track-more-menu');
      await expect(menu).toBeVisible();
      for (const id of ['track-details', 'track-cancel']) {
        const b = (await page.getByTestId(id).boundingBox())!;
        expect(b.width).toBeGreaterThanOrEqual(44);
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(await reachable(page.getByTestId(id)), id).toBe(true);
      }
      expect(boxGap((await page.getByTestId('track-details').boundingBox())!, (await page.getByTestId('track-cancel').boundingBox())!)).toBeGreaterThanOrEqual(7.9);
      await page.getByTestId('track-details').tap();
      const panel = page.locator('.panel');
      await expect(panel.locator('.panel-title')).toHaveText('Mini Railway');
      await expect(menu).toBeHidden();
      await panel.getByRole('button', { name: 'Close' }).tap();
      await expect(panel).toBeHidden();
      await expect(builder).toBeVisible();
      expect(await tc(page, (g) => g.tool.tool)).toBe('track');

      // "⋯" → Cancel ends the tool.
      await more.tap();
      await page.getByTestId('track-cancel').tap();
      await expect(builder).toBeHidden();
      await expect.poll(() => tc(page, (g) => g.tool.tool)).not.toBe('track');

      // Confirm places the station and the builder goes on to the pieces.
      await station(page);
      await confirm.tap();
      await expect(builder).toHaveAttribute('data-phase', 'pieces');
      await expect(page.getByTestId('track-more')).toBeHidden();
      await expect(page.getByTestId('track-build')).toBeVisible();
      watch.expectNoErrors();
    });
  }

  test('390 × 844: a station that does not fit disables Confirm and shows the reason', async ({ page }) => {
    await park(page, 390, 844);
    // A footpath across the tiles the station would take.
    await tc(page, (g) => g.dispatch({ type: 'buildPathLine', x0: 26, y0: 30, x1: 34, y1: 30, kind: 'footpath' }));
    await station(page, 30, 30);
    const confirm = page.getByTestId('track-confirm');
    await expect(confirm).toBeDisabled();
    const reason = page.getByTestId('track-reason');
    await expect(reason).toBeVisible();
    await expect(reason).not.toHaveText('');
    await expect(reason).not.toHaveText('Fits here');
    expect(await reachable(reason)).toBe(true);
    // Directly above the row.
    expect((await reason.boundingBox())!.y + (await reason.boundingBox())!.height).toBeLessThanOrEqual((await confirm.boundingBox())!.y);
  });

  for (const [w, h] of [[390, 844], [844, 390]] as const) {
    test(`${w} × ${h}: the Temperament colour key is a slim strip under the top region`, async ({ page }) => {
      await park(page, w, h);
      await page.locator('[data-tool="temperament"]').tap();
      const legend = page.getByTestId('overlay-legend');
      await expect(legend).toBeVisible();
      await frames(page);
      const box = (await legend.boundingBox())!;
      expect(box.height, 'the strip').toBeLessThanOrEqual(28.5);
      const hud = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('ui') as HTMLElement).getPropertyValue('--hud-bottom')));
      expect(box.y).toBeGreaterThanOrEqual(hud - 0.5);
      expect(box.y).toBeLessThanOrEqual(hud + 16);
      const seen = await legend.evaluate((el) => (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim());
      expect(seen).toContain('Chill');
      expect(seen).toContain('Family');
      expect(seen).toContain('Thrill');
      expect(seen).not.toMatch(/\d/);
      await expect(legend.locator('li')).toHaveCount(3);
      // The view controls shown (the two rotate buttons; on the upright phone, Task 24, the one turn button).
      for (const id of ['view-rotate-left', 'view-rotate-right', 'view-turn']) {
        const control = page.getByTestId(id);
        if (await control.isVisible()) expect(overlaps(box, (await control.boundingBox())!), id).toBe(false);
      }
      expect(await page.locator('.hud .view-controls button:not([hidden])').count()).toBeGreaterThan(0);
      const label = (await legend.getAttribute('aria-label')) ?? '';
      for (const r of ['Chill 0–35', 'Family 36–64', 'Thrill 65–100']) expect(label).toContain(r);
    });
  }

  test('390 × 844 at 175% text with en-XA: nothing in the station row or the strip clips its text; every control can be reached', async ({ page }) => {
    const doc = serializeSettings({ ...defaultSettings(), locale: 'en-XA', textScale: 175 });
    await page.addInitScript((d) => window.localStorage.setItem('tc.settings', d), doc);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-XA');
    await page.getByTestId('title-new').click();
    await page.getByTestId('title-size-64').click();
    await page.getByTestId('title-start').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await tc(page, (g) => g.setSpeed(0));
    await station(page);
    const builder = page.getByTestId('track-builder');
    expect(await clippedText(builder)).toEqual([]);
    for (const id of ['track-rotate', 'track-confirm', 'track-more', 'track-builder-title']) {
      const c = page.getByTestId(id);
      await c.scrollIntoViewIfNeeded();
      expect(await clippedText(c), id).toEqual([]);
      if (id !== 'track-builder-title') expect(await reachable(c), id).toBe(true);
    }
    for (const c of await builder.locator('.tb-station .stepper button').all()) expect(await reachable(c)).toBe(true);
    await page.getByTestId('track-more').tap();
    for (const id of ['track-details', 'track-cancel']) {
      expect(await clippedText(page.getByTestId(id)), id).toEqual([]);
      expect(await reachable(page.getByTestId(id)), id).toBe(true);
    }
    await page.getByTestId('track-cancel').tap();
    await expect(builder).toBeHidden();

    await page.locator('[data-tool="temperament"]').tap();
    const legend = page.getByTestId('overlay-legend');
    await expect(legend).toBeVisible();
    expect(await clippedText(legend)).toEqual([]);
    const box = (await legend.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  });

  test('390 × 844: an axe scan of the station step finds no serious or critical issue', async ({ page }) => {
    await park(page, 390, 844);
    await station(page);
    await scan(page, 'station step');
    await page.getByTestId('track-more').tap();
    await expect(page.getByTestId('track-more-menu')).toBeVisible();
    await scan(page, 'station step, the menu open');
  });
});
