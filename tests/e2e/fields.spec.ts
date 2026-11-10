/**
 * Calm and Buzz overlays (W3-E, Phase 4 §7, §9.5): desktop cycles the overlays with `V` and reads a tile value on
 * hover; the phone opens the chip row from the Overlays button, picks Calm, and taps a tile. The legend shows the
 * 4 band names and thresholds. No console errors.
 */
import { expect, test, type Page } from '@playwright/test';
import { centerOn, newPark, openTool, setSpeed, tilePoint, watchErrors } from './helpers';

const FOUNTAIN_X = 30;
const FOUNTAIN_Y = 30;

/** A Carved Fountain (Calm 6, 2 × 2) written straight into the state (W3-D's placement tool is not under test). */
async function addFountain(page: Page): Promise<void> {
  await page.evaluate(
    ([x, y]) => {
      const g = (window as unknown as { __tc: { world: { state: { nextId: number; scenery: unknown[] } } } }).__tc;
      const s = g.world.state;
      s.scenery.push({ id: s.nextId++, defId: 'fountain_carved', x, y, z: 8, rotation: 0, edge: -1, waterLevel: 255 });
    },
    [FOUNTAIN_X, FOUNTAIN_Y] as const,
  );
}

async function pause(page: Page): Promise<void> {
  await setSpeed(page, 'Pause');
}

async function overlay(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { __tc: { tool: { overlay: string } } }).__tc.tool.overlay);
}

const BANDS = ['None < 20', 'Low 20–59', 'Medium 60–119', 'High ≥ 120'];

test.describe('Calm and Buzz overlays', () => {
  test('desktop: V cycles the overlays, the legend shows the bands, hover shows the value', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'keyboard and hover are desktop flows');
    const watch = watchErrors(page);
    await newPark(page);
    await pause(page);
    await addFountain(page);
    await centerOn(page, FOUNTAIN_X, FOUNTAIN_Y);
    const legend = page.getByTestId('overlay-legend');
    await expect(legend).toBeHidden();

    await page.keyboard.press('v');
    expect(await overlay(page)).toBe('calm');
    await expect(legend).toBeVisible();
    await expect(page.getByTestId('overlay-legend-title')).toHaveText('Calm');
    await expect(page.getByTestId('overlay-legend-rows').locator('li')).toHaveText(BANDS);
    // Hover the fountain's own tile: raw Calm 102 there (Medium).
    const p = await tilePoint(page, FOUNTAIN_X, FOUNTAIN_Y);
    await page.mouse.move(p.x, p.y);
    await expect(page.getByTestId('overlay-value')).toHaveText('Calm here: 102 (Medium)');

    await page.keyboard.press('v');
    await expect(page.getByTestId('overlay-legend-title')).toHaveText('Buzz');
    await expect(page.getByTestId('overlay-value')).toHaveText('Buzz here: 0 (None)');
    await page.keyboard.press('v');
    await expect(page.getByTestId('overlay-legend-title')).toHaveText('Light');
    await page.keyboard.press('v');
    await expect(page.getByTestId('overlay-legend-title')).toHaveText('Temperament');
    await page.keyboard.press('v');
    expect(await overlay(page)).toBe('none');
    await expect(legend).toBeHidden();
    watch.expectNoErrors();
  });

  test('phone: the Overlays button opens the chip row; Calm shows the legend card; a tap shows the value', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'touch flow');
    const watch = watchErrors(page);
    await newPark(page);
    await pause(page);
    await addFountain(page);
    await centerOn(page, FOUNTAIN_X, FOUNTAIN_Y);

    await openTool(page, 'overlays', { tap: true });
    const chips = page.getByTestId('overlay-chips');
    await expect(chips).toBeVisible();
    for (const id of ['none', 'calm', 'buzz', 'light', 'temperament']) {
      const box = await page.getByTestId(`overlay-chip-${id}`).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await page.getByTestId('overlay-chip-calm').tap();
    await expect(page.getByTestId('overlay-chip-calm')).toHaveAttribute('aria-pressed', 'true');
    const legend = page.getByTestId('overlay-legend');
    await expect(legend).toBeVisible();
    await expect(page.getByTestId('overlay-legend-rows').locator('li')).toHaveCount(4);
    await expect(page.getByTestId('overlay-value')).toHaveText('Tap a tile to see its value');

    // Close the chips so the tap reaches the map, then tap the fountain tile at the screen centre.
    await page.getByTestId('overlay-close').tap();
    await expect(chips).toBeHidden();
    const p = await tilePoint(page, FOUNTAIN_X, FOUNTAIN_Y);
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.getByTestId('overlay-value')).toHaveText('Calm here: 102 (Medium)');

    await openTool(page, 'overlays', { tap: true });
    await page.getByTestId('overlay-chip-none').tap();
    await expect(legend).toBeHidden();
    watch.expectNoErrors();
  });
});
