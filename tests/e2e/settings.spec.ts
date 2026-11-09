/** Settings screen (Phase 6 §4.9, §7, §9 "a volume change persists after reload"). Owner: W4-F. */
import { expect, test, type Page } from '@playwright/test';
import { centerOn, isPhone, newPark, tilePoint, watchErrors } from './helpers';

async function openFromTitle(page: Page): Promise<void> {
  await page.getByTestId('title-settings').click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
}

const stored = (page: Page): Promise<string | null> => page.evaluate(() => localStorage.getItem('tc.settings'));

test.describe('settings screen', () => {
  test('a volume change persists after reload', async ({ page }) => {
    const watch = watchErrors(page);
    await page.goto('/');
    await openFromTitle(page);
    const master = page.getByTestId('setting-masterVolume');
    await expect(master).toHaveValue('80');
    await master.fill('35');
    await expect(page.getByTestId('settings-screen').getByText('35%')).toBeVisible();
    const doc = JSON.parse((await stored(page)) ?? '{}');
    expect(doc.format).toBe('thrills-and-chills-settings');
    expect(doc.version).toBe(1);
    expect(doc.values.masterVolume).toBe(35);
    await page.reload();
    await openFromTitle(page);
    await expect(page.getByTestId('setting-masterVolume')).toHaveValue('35');
    expect(await page.evaluate(() => (window as unknown as { __tc: { settings: { get(k: string): unknown } } }).__tc.settings.get('masterVolume'))).toBe(35);
    watch.expectNoErrors();
  });

  test('unreadable settings show the notice, are never overwritten, and reset only on Reset settings', async ({ page }) => {
    const watch = watchErrors(page);
    const bad = '{"format":"thrills-and-chills-settings","version":1,"values":{"masterVolume":"loud"}}';
    await page.goto('/');
    await page.evaluate((t) => localStorage.setItem('tc.settings', t), bad);
    await page.reload();
    await openFromTitle(page);
    const notice = page.getByTestId('settings-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Settings could not be read');
    // Changes work in memory but the stored text stays as it was.
    await page.getByTestId('setting-muteAll').click();
    await expect(page.getByTestId('setting-muteAll')).toHaveAttribute('aria-pressed', 'true');
    expect(await stored(page)).toBe(bad);
    await page.getByTestId('settings-reset').click();
    await expect(notice).toBeHidden();
    await expect(page.getByTestId('setting-muteAll')).toHaveAttribute('aria-pressed', 'false');
    const doc = JSON.parse((await stored(page)) ?? '{}');
    expect(doc.values.masterVolume).toBe(80);
    watch.expectNoErrors();
  });

  test('display settings change the UI root: text scale, high contrast, reduced motion', async ({ page }) => {
    const watch = watchErrors(page);
    await page.goto('/');
    await openFromTitle(page);
    await page.getByTestId('setting-textScale-150').check();
    await expect(page.locator('#ui')).toHaveAttribute('data-text-scale', '150');
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('ui') as HTMLElement).fontSize)).toBe('21px');
    await page.getByTestId('setting-highContrast').click();
    await expect(page.locator('#ui')).toHaveClass(/tc-hc/);
    await page.getByTestId('setting-reducedMotion-on').check();
    await expect(page.locator('#ui')).toHaveClass(/tc-rm/);
    await page.getByTestId('setting-reducedMotion-off').check();
    await expect(page.locator('#ui')).not.toHaveClass(/tc-rm/);
    watch.expectNoErrors();
  });

  test('reduced motion follows the system preference on Auto', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('#ui')).toHaveClass(/tc-rm/);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('#ui')).not.toHaveClass(/tc-rm/);
  });

  test('the section list jumps to a section; Back closes the screen; Unlock all scenarios is stored', async ({ page }, info) => {
    const watch = watchErrors(page);
    await page.goto('/');
    await openFromTitle(page);
    await page.getByTestId('settings-tab-about').click();
    await expect(page.getByText('3.0.0').or(page.getByText(/^\d+\.\d+\.\d+$/))).toBeVisible();
    await page.getByTestId('title-unlock-all').click();
    expect(JSON.parse((await stored(page)) ?? '{}').values.unlockAllScenarios).toBe(true);
    // Phones: a full-screen sheet.
    if (isPhone(info)) {
      const box = await page.locator('.settings-card').boundingBox();
      const vp = page.viewportSize();
      expect(Math.round(box?.width ?? 0)).toBe(vp?.width);
    }
    await page.getByTestId('settings-back').click();
    await expect(page.getByTestId('settings-screen')).toHaveCount(0);
    await expect(page.getByTestId('title-settings')).toBeFocused();
    watch.expectNoErrors();
  });

  test('the in-game menu opens the settings screen and Back returns to the menu', async ({ page }) => {
    const watch = watchErrors(page);
    await newPark(page);
    await page.getByTestId('tool-menu').click();
    await page.getByTestId('menu-settings').click();
    await expect(page.getByTestId('settings-screen')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings-screen')).toHaveCount(0);
    await expect(page.getByTestId('menu-settings')).toBeFocused();
    watch.expectNoErrors();
  });

  test('Confirm demolish asks before removing a path; Autosave off writes no autosave', async ({ page }) => {
    const watch = watchErrors(page);
    await newPark(page);
    await page.evaluate(() => {
      const g = (window as unknown as { __tc: { settings: { set(k: string, v: unknown): boolean } } }).__tc;
      g.settings.set('confirmDemolish', true);
      g.settings.set('autosave', false);
    });
    // A footpath tile at (20, 20), then the Demolish tool taps it.
    await page.evaluate(() => {
      const g = (window as unknown as { __tc: { dispatch(c: unknown): { ok: boolean } } }).__tc;
      g.dispatch({ type: 'buildPathLine', x0: 20, y0: 20, x1: 20, y1: 20, kind: 'footpath' });
    });
    const content = (): Promise<number> =>
      page.evaluate(() => {
        const map = (window as unknown as { __tc: { world: { state: { map: { content: ArrayLike<number>; width: number } } } } }).__tc.world.state.map;
        return map.content[20 * map.width + 20] ?? -1;
      });
    expect(await content()).toBe(1);
    await centerOn(page, 20, 20);
    await page.getByTestId('tool-demolish').click();
    const at = await tilePoint(page, 20, 20);
    await page.mouse.click(at.x, at.y);
    await expect(page.getByRole('dialog', { name: 'Demolish this?' })).toBeVisible();
    expect(await content()).toBe(1);
    await page.getByTestId('confirm-yes').click();
    await expect.poll(content).toBe(0);
    // A month end with Autosave off stores no autosave.
    await page.evaluate(() => {
      const g = (window as unknown as { __tc: { step(n: number): void } }).__tc;
      g.step(3600);
    });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => localStorage.getItem('tc.save.auto'))).toBeNull();
    watch.expectNoErrors();
  });
});
