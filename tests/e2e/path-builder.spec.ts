/**
 * Touch controls spec 2026-11-18 §3, §5: the path step builder. A tap sets the start (nothing built), the arrows add
 * one tile each, the ghost tag shows the cost, Undo takes the last step back, Done leaves the tool. The panel is one
 * row of 44 × 44 controls that fits at 390 × 844, 360 × 640 and 812 × 375 at text 100 and 175.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { contentAt, isPhone, newPark, openTool, scan, showTile, tilePoint, watchErrors } from './helpers';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface PbTc {
  tool: { tool: string; pathHeight: { z: number | null; ramp: string } };
  world: { state: { park: { cash: number } } };
  settings: { set(k: string, v: unknown): void };
  setSpeed(n: number): void;
}
const tc = <T>(page: Page, fn: (g: PbTc) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__tc)`) as Promise<T>;

async function frames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

/** Text clipped by an element of `root` (hidden overflow, ellipsis). */
async function clippedText(root: Locator): Promise<string[]> {
  return root.evaluate((el) => {
    const out: string[] = [];
    for (const e of [el, ...el.querySelectorAll<HTMLElement>('*')]) {
      if (e.closest('.sr-only, [hidden]')) continue;
      const cs = getComputedStyle(e);
      const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
      if (clips && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) && (e.textContent ?? '').trim() !== '') out.push(`${e.className} ${e.scrollWidth}/${e.clientWidth} ${e.scrollHeight}/${e.clientHeight}`);
    }
    return out;
  });
}

/** Press as the project does: a tap on the phone, a click on the desktop. */
async function press(page: Page, l: Locator, phone: boolean): Promise<void> {
  if (phone) await l.tap();
  else await l.click();
}

async function pressMap(page: Page, p: { x: number; y: number }, phone: boolean): Promise<void> {
  if (phone) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await frames(page);
}

test('step builder: tap a start, Forward, Turn right, Undo, a far tap, Done', async ({ page }, info) => {
  const phone = isPhone(info);
  const watch = watchErrors(page);
  await newPark(page);
  await tc(page, (g) => g.setSpeed(0));
  await openTool(page, 'footpath', { tap: phone });
  const panel = page.getByTestId('path-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('path-hint')).toHaveText('Tap a tile to start');
  await expect(page.getByTestId('path-forward')).toBeHidden();
  // The old stacked panels are gone.
  await expect(page.getByTestId('path-height-bar')).toHaveCount(0);
  await expect(page.locator('.tool-status:not(.path-panel):not([hidden])')).toHaveCount(0);

  const start = await showTile(page, 30, 30);
  await frames(page);
  const cash0 = await tc(page, (g) => g.world.state.park.cash);
  await pressMap(page, start, phone);
  expect(await contentAt(page, 30, 30)).toBe(0);
  await expect(panel).toHaveAttribute('data-started', '1');
  const tag = page.getByTestId('path-cost-tag');
  await expect(tag).toBeVisible();
  // The ghost is the start tile itself: Forward builds it first.
  await expect(tag).toHaveText('$10');
  await expect(page.getByTestId('path-forward')).toHaveAttribute('aria-label', 'Forward, $10');

  await press(page, page.getByTestId('path-forward'), phone);
  await frames(page);
  expect(await contentAt(page, 30, 30)).toBe(1);
  expect(await tc(page, (g) => g.world.state.park.cash)).toBe(cash0 - 1_000);
  await expect(tag).toHaveText('$10');
  await press(page, page.getByTestId('path-forward'), phone);
  await press(page, page.getByTestId('path-right'), phone);
  await press(page, page.getByTestId('path-forward'), phone);
  await frames(page);
  expect(await tc(page, (g) => g.world.state.park.cash)).toBe(cash0 - 4_000);

  const built: Array<[number, number]> = [];
  for (let x = 26; x <= 34; x++) for (let y = 26; y <= 34; y++) if ((await contentAt(page, x, y)) === 1) built.push([x, y]);
  expect(built).toHaveLength(4);
  await press(page, page.getByTestId('path-undo'), phone);
  await frames(page);
  // Undo of a tile built in this session refunds its full price.
  expect(await tc(page, (g) => g.world.state.park.cash)).toBe(cash0 - 3_000);
  let after = 0;
  for (let x = 26; x <= 34; x++) for (let y = 26; y <= 34; y++) if ((await contentAt(page, x, y)) === 1) after++;
  expect(after).toBe(3);

  // A far tap moves the start, building nothing.
  const cash1 = await tc(page, (g) => g.world.state.park.cash);
  await pressMap(page, await tilePoint(page, 36, 36), phone);
  expect(await tc(page, (g) => g.world.state.park.cash)).toBe(cash1);

  await scan(page, 'path builder');
  await press(page, page.getByTestId('path-done'), phone);
  await expect(panel).toBeHidden();
  expect(await tc(page, (g) => g.tool.tool)).toBe('inspect');
  watch.expectNoErrors();
});

test('step builder: the Height and slope menu raises the path; Up builds a ramp at the height', async ({ page }, info) => {
  const phone = isPhone(info);
  const watch = watchErrors(page);
  await newPark(page);
  await tc(page, (g) => g.setSpeed(0));
  await openTool(page, 'footpath', { tap: phone });
  const start = await showTile(page, 24, 30);
  await frames(page);
  await press(page, page.getByTestId('path-slope'), phone);
  const menu = page.getByTestId('path-slope-menu');
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('path-ramp-up')).toBeDisabled();
  await pressMap(page, start, phone);
  await press(page, page.getByTestId('path-height-up'), phone);
  await press(page, page.getByTestId('path-height-up'), phone);
  await press(page, page.getByTestId('path-height-up'), phone);
  await expect(page.getByTestId('path-panel')).toHaveAttribute('data-height', '11');
  await expect(page.getByTestId('path-height-value')).toHaveText('11 m · +3 m');
  await press(page, page.getByTestId('path-ramp-up'), phone);
  await expect(page.getByTestId('path-slope')).toHaveAttribute('aria-label', 'Height and slope: 11 m · +3 m, Up');
  await press(page, page.getByTestId('path-slope'), phone);
  await expect(menu).toBeHidden();
  await press(page, page.getByTestId('path-forward'), phone);
  await frames(page);
  const decks = await page.evaluate(() => (window as unknown as { __tc: { world: { state: { elevatedPaths: Array<{ x: number; y: number; z: number; rampDir: number }> } } } }).__tc.world.state.elevatedPaths.map((p) => [p.z, p.rampDir]));
  // One ramp tile at the start, rising from 11 m: the next tile starts at 12 m.
  expect(decks).toHaveLength(1);
  expect(decks[0]?.[0]).toBe(11);
  await expect(page.getByTestId('path-panel')).toHaveAttribute('data-height', '12');
  watch.expectNoErrors();
});

test.describe('the path row fits (spec §3, §5)', () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(!isPhone(info), 'phone sizes');
  });
  for (const [w, hgt] of [[390, 844], [360, 640], [812, 375]] as const) {
    for (const scale of [100, 175] as const) {
      test(`${w} × ${hgt}, text ${scale}: one row, 44 px controls, inside the window, nothing clipped or covered`, async ({ page }) => {
        const watch = watchErrors(page);
        await page.setViewportSize({ width: w, height: hgt });
        await newPark(page);
        await tc(page, (g) => g.setSpeed(0));
        if (scale !== 100) await page.evaluate((s) => (window as unknown as { __tc: PbTc }).__tc.settings.set('textScale', s), scale);
        await openTool(page, 'queue', { tap: true });
        const panel = page.getByTestId('path-panel');
        await expect(panel).toBeVisible();
        await expect(page.getByTestId('path-hint')).toBeVisible();
        expect(await clippedText(panel)).toEqual([]);
        const p = await showTile(page, 30, 30);
        await frames(page);
        await page.touchscreen.tap(p.x, p.y);
        await frames(page);
        await expect(page.getByTestId('path-forward')).toBeVisible();
        if (process.env.TC_PATH_SHOT) await page.screenshot({ path: `${process.env.TC_PATH_SHOT}-${w}x${hgt}-${scale}.png` });
        const boxes: Array<{ name: string; box: Box }> = [];
        for (const c of await panel.locator('.path-row > button:visible, .path-row > .path-slope-wrap > button:visible').all()) {
          boxes.push({ name: (await c.getAttribute('data-testid')) ?? '', box: (await c.boundingBox()) as Box });
        }
        expect(boxes.map((b) => b.name)).toEqual(['path-left', 'path-forward', 'path-right', 'path-slope', 'path-undo', 'path-done']);
        const top = boxes[0]?.box.y ?? 0;
        for (const a of boxes) {
          expect(a.box.width, a.name).toBeGreaterThanOrEqual(44);
          expect(a.box.height, a.name).toBeGreaterThanOrEqual(44);
          expect(Math.abs(a.box.y - top), `${a.name} on the row`).toBeLessThanOrEqual(2);
          expect(a.box.x).toBeGreaterThanOrEqual(0);
          expect(a.box.x + a.box.width).toBeLessThanOrEqual(w);
          expect(a.box.y + a.box.height).toBeLessThanOrEqual(hgt);
          for (const b of boxes) if (a !== b) expect(overlaps(a.box, b.box), `${a.name} / ${b.name}`).toBe(false);
          // A press at its centre reaches it (nothing covers it).
          const reach = await page.getByTestId(a.name).evaluate((el) => {
            const r = el.getBoundingClientRect();
            const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return t !== null && el.contains(t);
          });
          expect(reach, a.name).toBe(true);
        }
        const plate = (await panel.boundingBox()) as Box;
        expect(plate.height, 'a single row').toBeLessThanOrEqual(70);
        expect(await clippedText(panel)).toEqual([]);
        // The menu fits too.
        await page.getByTestId('path-slope').tap();
        const menu = page.getByTestId('path-slope-menu');
        await expect(menu).toBeVisible();
        const mb = (await menu.boundingBox()) as Box;
        expect(mb.x).toBeGreaterThanOrEqual(0);
        expect(mb.x + mb.width).toBeLessThanOrEqual(w);
        expect(mb.y).toBeGreaterThanOrEqual(0);
        expect(await clippedText(menu)).toEqual([]);
        for (const id of ['path-height-down', 'path-height-up', 'path-ramp-flat', 'path-ramp-up', 'path-ramp-down']) {
          const b = (await page.getByTestId(id).boundingBox()) as Box;
          expect(b.width, id).toBeGreaterThanOrEqual(44);
          expect(b.height, id).toBeGreaterThanOrEqual(44);
        }
        watch.expectNoErrors();
      });
    }
  }
});

test('mouse players see the Shift-drag tip once; a Shift-drag draws a line and the builder goes on from its end', async ({ page }, info) => {
  test.skip(isPhone(info), 'mouse');
  const watch = watchErrors(page);
  await newPark(page);
  await tc(page, (g) => g.setSpeed(0));
  await openTool(page, 'footpath');
  const tip = page.getByTestId('path-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Shift + drag');
  const a = await showTile(page, 30, 30);
  await frames(page);
  const b = await tilePoint(page, 33, 30);
  await page.keyboard.down('Shift');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  for (let x = 30; x <= 33; x++) expect(await contentAt(page, x, 30)).toBe(1);
  await expect(page.getByTestId('path-panel')).toHaveAttribute('data-started', '1');
  await page.getByTestId('path-tip-close').click();
  await expect(tip).toBeHidden();
  await page.getByTestId('path-done').click();
  await openTool(page, 'queue');
  await expect(tip).toBeHidden();
  // A new page load: still seen.
  await newPark(page);
  await openTool(page, 'footpath');
  await expect(page.getByTestId('path-panel')).toBeVisible();
  await expect(tip).toBeHidden();
  watch.expectNoErrors();
});
