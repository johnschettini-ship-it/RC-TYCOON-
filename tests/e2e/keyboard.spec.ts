/**
 * Keyboard-only play (Phase 6 §4.7, §9, §10 "keyboard-only play can build, inspect, and save"). Owner: W4-F.
 * Every step uses keys only: Tab to controls, Enter to press them, the map cursor (C, arrows, Shift + arrows, Enter)
 * on the map. The debug hook only reads the state for the checks.
 */
import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

type Tc = {
  world: { state: { map: { width: number; content: ArrayLike<number> }; rides: Array<{ id: number; defId: string }> } };
  tool: { tool: string; selectedEntity: { kind: string; id: number } | null };
};

/** Press Tab (or Shift + Tab) until the focused element matches `selector`. */
async function tabTo(page: Page, selector: string, max = 120): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab never reached ${selector}`);
}

const cursorTile = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const t = document.querySelector('[data-testid="cursor-line"]')?.textContent ?? '';
    const m = /(\d+), (\d+)/.exec(t);
    const map = (window as unknown as { __tc: Tc }).__tc.world.state.map;
    return m ? Number(m[2]) * map.width + Number(m[1]) : -1;
  });

const contentAt = (page: Page, tile: number): Promise<number> =>
  page.evaluate((t) => (window as unknown as { __tc: Tc }).__tc.world.state.map.content[t] ?? -1, tile);

test.describe('keyboard-only play', () => {
  test('start a park, build a path with the map cursor, place and open a ride, and save', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'keyboard play is a desktop check');
    test.setTimeout(90_000);
    const watch = watchErrors(page);
    await page.goto('/');
    // Title: New game, the 64 × 64 map (arrow keys in the size group), Start.
    await tabTo(page, '[data-testid="title-new"]');
    await page.keyboard.press('Enter');
    await tabTo(page, '[data-testid="title-size-96"]');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('title-size-64')).toBeFocused();
    await tabTo(page, '[data-testid="title-start"]');
    await page.keyboard.press('Enter');
    await expect(page.locator('.title-screen')).toBeHidden();
    await page.keyboard.press(' ');

    // Footpath tool (P), map cursor (C), Shift + arrows drag a line, letting go of Shift builds it.
    await page.keyboard.press('p');
    await page.keyboard.press('c');
    await expect(page.getByTestId('cursor-line')).toBeVisible();
    await expect(page.getByTestId('cursor-line')).toHaveText(/^Tile \d+, \d+: grass$/);
    const start = await cursorTile(page);
    await page.keyboard.down('Shift');
    for (let k = 0; k < 3; k++) await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    for (let k = 0; k <= 3; k++) await expect.poll(() => contentAt(page, start + k)).toBe(1);
    await expect(page.getByTestId('cursor-line')).toHaveText(/footpath/);

    // Rides: Tab to the toolbar button, Enter opens the picker (focus moves into it), Tab to the Carousel, Enter.
    await tabTo(page, '[data-testid="tool-rides"]');
    await page.keyboard.press('Enter');
    await expect(page.locator('.panel')).toBeVisible();
    await tabTo(page, '[data-def="carousel"]');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __tc: Tc }).__tc.tool.tool)).toBe('placeRide');
    // Away from the path, then Enter places the ride at the cursor.
    for (let k = 0; k < 4; k++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __tc: Tc }).__tc.world.state.rides.length)).toBe(1);

    // Esc back to Inspect; Enter on the ride opens its panel.
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __tc: Tc }).__tc.tool.tool)).toBe('inspect');
    await page.keyboard.press('Enter');
    await expect(page.locator('.panel')).toBeVisible();
    await expect(page.locator('.panel .panel-title')).toHaveText(/Carousel/);
    await expect(page.locator('.panel h2')).toBeFocused();

    // The shortcut list (?) opens and closes with the keyboard.
    await page.keyboard.press('Escape');
    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcut-list')).toBeVisible();
    await expect(page.getByTestId('shortcut-list')).toContainText('Map cursor on or off');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shortcut-list')).toBeHidden();

    // Save: Tab to Menu, Enter, Tab to Save, Enter, Enter on slot 1.
    await tabTo(page, '[data-testid="tool-menu"]');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('menu-resume')).toBeFocused();
    await tabTo(page, '[data-testid="menu-save"]');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('slot-1')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('toast')).toHaveText('Park saved to slot 1');
    expect(await page.evaluate(() => localStorage.getItem('tc.save.1'))).not.toBeNull();
    watch.expectNoErrors();
  });

  test('the focus ring is 3 px and visible on keyboard focus', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'keyboard check');
    await page.goto('/');
    await tabTo(page, '[data-testid="title-load"]');
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement as Element);
      return { width: s.outlineWidth, style: s.outlineStyle };
    });
    expect(outline).toEqual({ width: '3px', style: 'solid' });
  });
});
