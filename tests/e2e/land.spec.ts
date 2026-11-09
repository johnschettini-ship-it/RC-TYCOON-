/**
 * Land and Water tools smoke (Phase 4 §9.5, W3-A). Desktop: raise land with the 3 × 3 brush (cash drops), paint
 * snow, hold to repeat, raise water. Phone: tap Land, tap a tile, tap Raise twice. No console errors.
 */
import { expect, test, type Page } from '@playwright/test';
import { centerOn, isPhone, tilePoint, type TcGame } from './helpers';

interface TcWorld extends TcGame {
  world: { state: { map: { width: number; heights: ArrayLike<number>; content: ArrayLike<number>; terrain: ArrayLike<number>; water: ArrayLike<number> }; park: { cash: number } } };
}

async function newPausedPark(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('title-new').click();
  // The classic 64 × 64 Build 1 layout these tile coordinates use (New Park starts on 96 × 96).
  await page.getByTestId('title-size-64').click();
  await page.getByTestId('title-start').click();
  await expect(page.locator('.title-screen')).toBeHidden();
  // Pause so hourly costs do not move the cash during the checks.
  await page.getByRole('group', { name: 'Game speed' }).getByRole('button', { name: 'Pause' }).click();
}

async function mapValue(page: Page, layer: 'heights' | 'terrain' | 'water', x: number, y: number): Promise<number> {
  return page.evaluate(
    ([l, tx, ty]) => {
      const map = (window as unknown as { __tc: TcWorld }).__tc.world.state.map;
      return map[l as 'heights'][(ty as number) * map.width + (tx as number)] ?? -1;
    },
    [layer, x, y] as const,
  );
}

async function cash(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __tc: TcWorld }).__tc.world.state.park.cash);
}

test.describe('Land and Water tools (Phase 4 §7)', () => {
  let errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await newPausedPark(page);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('desktop: raise land with the 3 × 3 brush (cash drops), paint snow, hold to repeat, raise water', async ({ page }, info) => {
    test.skip(isPhone(info), 'mouse flow');
    await page.getByTestId('tool-land').click();
    await expect(page.getByTestId('land-bar')).toBeVisible();
    await page.getByTestId('land-size-3').click();
    await expect(page.getByTestId('land-size-3')).toHaveAttribute('aria-pressed', 'true');
    await centerOn(page, 20, 20);

    // The ghost follows the cursor with its cost: 9 tiles × ($4 + 4 × $6).
    const p = await tilePoint(page, 20, 20);
    await page.mouse.move(p.x, p.y);
    await expect(page.getByTestId('land-detail')).toHaveText('Cost $252');
    const before = await cash(page);
    await page.mouse.click(p.x, p.y);
    await expect.poll(() => mapValue(page, 'heights', 20, 20)).toBe(9);
    for (const [x, y] of [
      [19, 19],
      [21, 21],
      [21, 19],
    ] as const) {
      expect(await mapValue(page, 'heights', x, y)).toBe(9);
    }
    expect(await mapValue(page, 'heights', 22, 20)).toBe(8);
    expect(await cash(page)).toBe(before - 25_200);

    // Paint snow with the same brush.
    await page.getByTestId('land-mode-paint').click();
    await page.getByTestId('land-paint-snow').click();
    const q = await tilePoint(page, 25, 20);
    await page.mouse.click(q.x, q.y);
    await expect.poll(() => mapValue(page, 'terrain', 25, 20)).toBe(4);
    expect(await mapValue(page, 'terrain', 24, 21)).toBe(4);
    expect(await mapValue(page, 'heights', 25, 20)).toBe(8);

    // Hold the button: the brush repeats every 300 ms.
    await page.getByTestId('land-mode-raise').click();
    await page.getByTestId('land-size-1').click();
    const r = await tilePoint(page, 30, 24);
    await page.mouse.move(r.x, r.y);
    await page.mouse.down();
    await expect.poll(() => mapValue(page, 'heights', 30, 24), { timeout: 5_000 }).toBeGreaterThanOrEqual(11);
    await page.mouse.up();

    // Water: a click raises the surface above the ground.
    await page.getByTestId('tool-water').click();
    await expect(page.getByTestId('water-mode-raise')).toHaveAttribute('aria-pressed', 'true');
    const w = await tilePoint(page, 16, 26);
    await page.mouse.click(w.x, w.y);
    await expect.poll(() => mapValue(page, 'water', 16, 26)).toBe(9);
  });

  test('desktop: Page Up raises at the ghost and Esc leaves the tool', async ({ page }, info) => {
    test.skip(isPhone(info), 'keyboard flow');
    await page.getByTestId('tool-land').click();
    await centerOn(page, 20, 30);
    const p = await tilePoint(page, 20, 30);
    await page.mouse.move(p.x, p.y);
    await page.keyboard.press('PageUp');
    await expect.poll(() => mapValue(page, 'heights', 20, 30)).toBe(9);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('land-bar')).toBeHidden();
  });

  test('phone: tap Land, tap a tile, tap Raise twice', async ({ page }, info) => {
    test.skip(!isPhone(info), 'touch flow');
    await page.getByTestId('tool-land').tap();
    await expect(page.getByTestId('land-bar')).toBeVisible();
    await centerOn(page, 20, 20);
    const p = await tilePoint(page, 20, 20);
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.getByTestId('land-detail')).toHaveText('Cost $28');
    const before = await cash(page);
    await page.getByTestId('land-raise').tap();
    await expect.poll(() => mapValue(page, 'heights', 20, 20)).toBe(9);
    await page.getByTestId('land-raise').tap();
    await expect.poll(() => mapValue(page, 'heights', 20, 20)).toBe(10);
    expect(await cash(page)).toBe(before - 2 * 2_800);
    // Neighbours are untouched by the 1 × 1 brush.
    expect(await mapValue(page, 'heights', 21, 20)).toBe(8);
  });
});
