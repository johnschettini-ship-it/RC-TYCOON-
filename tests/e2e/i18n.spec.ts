import { expect, test, type Page } from '@playwright/test';
import { defaultSettings, serializeSettings } from '../../src/settings/schema';
import { cardOf, openTool, toolControl } from './helpers';

/**
 * Localization (Phase 6 §4.8, §9; master R28). The pseudo-locale `en-XA` accents every letter of every string, so
 * plain ASCII words on screen did not come from the string table: they are hard-coded text (or player-typed names).
 */

interface TcHook {
  settings: { set(key: string, value: unknown): boolean };
}

/** Store settings with the pseudo-locale before the page loads (the language is picked before any UI is built). */
async function bootInPseudoLocale(page: Page): Promise<void> {
  const doc = serializeSettings({ ...defaultSettings(), locale: 'en-XA' });
  await page.addInitScript((d) => window.localStorage.setItem('tc.settings', d), doc);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-XA');
}

/**
 * Visible text, `aria-label`, `title`, and `placeholder` in the UI that still has two or more plain ASCII letters in
 * a row. Player-typed names are skipped by the caller.
 */
async function plainEnglish(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = new Set<string>();
    const root = document.getElementById('ui') as HTMLElement;
    const shown = (el: Element): boolean => el.closest('.sr-only') !== null || el.getClientRects().length > 0;
    const check = (s: string | null): void => {
      const v = (s ?? '').trim();
      if (/[A-Za-z]{2,}/.test(v)) out.add(v);
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (el && el.closest('[hidden]') === null && shown(el)) check(n.textContent);
    }
    for (const el of root.querySelectorAll('[aria-label], [title], [placeholder]')) {
      if (el.closest('[hidden]') !== null || !shown(el)) continue;
      check(el.getAttribute('aria-label'));
      check(el.getAttribute('title'));
      check(el.getAttribute('placeholder'));
    }
    return [...out].sort();
  });
}

test('switching to en-XA changes the HUD text at once', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('title-new').click();
  await page.getByTestId('title-start').click();
  await expect(page.locator('.title-screen')).toBeHidden();
  const date = page.getByTestId('hud-date');
  await expect(date).toHaveText(/^(Mar|Apr) · Year \d+ · \d\d:\d\d$/);
  await expect(page.getByTestId('hud-cash')).toHaveText(/^\$/);

  await page.evaluate(() => (window as unknown as { __tc: TcHook }).__tc.settings.set('locale', 'en-XA'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-XA');
  await expect(date).toHaveText(/Ýéåŕ \d+/);
  await expect(date).not.toHaveText(/Year/);
  await expect(page.getByTestId('hud-cash')).toHaveText(/^\[\$[\d,.]+ .+\]$/u);

  await page.evaluate(() => (window as unknown as { __tc: TcHook }).__tc.settings.set('locale', 'en'));
  await expect(date).toHaveText(/^(Mar|Apr) · Year \d+ · \d\d:\d\d$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('a command reason shows in the current locale', async ({ page }) => {
  await bootInPseudoLocale(page);
  await page.getByTestId('title-new').click();
  await page.getByTestId('title-start').click();
  await expect(page.locator('.title-screen')).toBeHidden();
  // Demolish on an empty tile: the sim answers "Nothing to remove" in English; the toast shows the pseudo-locale.
  const reason = await page.evaluate(() => {
    const g = (window as unknown as { __tc: TcHook & { dispatch(c: unknown): { ok: boolean; reason?: string } } }).__tc;
    return g.dispatch({ type: 'demolish', x: 1, y: 1 }).reason ?? '';
  });
  expect(reason).toBe('Nothing to remove');
  await expect(page.getByTestId('toast')).toHaveText(/^\[Ñöţĥîñĝ ţö ŕéɱöṽé .+\]$/u);
});

/**
 * Text that is known not to come from the string table yet, each reported to its owner (W4-G report). The test
 * fails on any other plain English, so new hard-coded text is caught; remove an entry once it is fixed.
 */
const KNOWN_GAPS: readonly string[] = [
  // The title logo wordmark (brand name, aria-hidden).
  'Thrills',
  'Chills',
  // The default park name of the boot world (main.ts) behind the title screen.
  'New Park',
];

/**
 * Plain English left after removing the known gaps (longest first). Content names (rides, track types and pieces,
 * stalls, path items, staff, scenery themes and items, show sites, campaigns) are `content.<id>` strings since the
 * Build 3 gate, so they must show in the pseudo-locale like any other text.
 */
function unexpectedEnglish(found: readonly string[]): string[] {
  const known = [...KNOWN_GAPS].sort((a, b) => b.length - a.length);
  return found.filter((t) => {
    let rest = t;
    for (const k of known) rest = rest.split(k).join(' ');
    return /[A-Za-z]{2,}/.test(rest);
  });
}

test.describe('hard-coded text', () => {
  test('booting in en-XA, the title screen shows only string-table text', async ({ page }) => {
    await bootInPseudoLocale(page);
    await expect(page.getByTestId('title-new')).toBeVisible();
    expect(unexpectedEnglish(await plainEnglish(page))).toEqual([]);
    await page.getByTestId('title-new').click();
    await expect(page.getByTestId('title-start')).toBeVisible();
    expect(unexpectedEnglish(await plainEnglish(page))).toEqual([]);
    // Scenario names and the detail sheet (description, goals) come from the string table too.
    await page.getByTestId('title-scenarios').click();
    await expect(page.getByTestId('scenario-select')).toBeVisible();
    expect(unexpectedEnglish(await plainEnglish(page)), 'scenarios').toEqual([]);
    await page.getByTestId('scenario-card-meadow_start').click();
    await expect(page.getByTestId('scenario-detail')).toBeVisible();
    expect(unexpectedEnglish(await plainEnglish(page)), 'scenario detail').toEqual([]);
  });

  test('booting in en-XA, the HUD, toolbar, and panels show only string-table text', async ({ page }) => {
    await bootInPseudoLocale(page);
    await page.getByTestId('title-new').click();
    // A player-typed name stays as typed; this one has no plain letters.
    await page.getByTestId('title-name').fill('Ļåķéšîðé');
    await page.getByTestId('title-start').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    expect(unexpectedEnglish(await plainEnglish(page))).toEqual([]);
    for (const tool of ['park', 'finance', 'rides', 'stalls', 'staff', 'research', 'marketing', 'messages']) {
      await openTool(page, tool);
      await expect(await toolControl(page, tool)).toHaveAttribute('aria-pressed', 'true');
      expect(unexpectedEnglish(await plainEnglish(page)), tool).toEqual([]);
      if (tool === 'rides') {
        // Track ride types in the second tab of the picker.
        await expect(await cardOf(page, 'track', 'steel_coaster')).toBeVisible();
        expect(unexpectedEnglish(await plainEnglish(page)), 'track rides').toEqual([]);
      }
      await openTool(page, tool);
    }
  });

  test('booting in en-XA, the scenery and show pickers show content names from the string table', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'the pickers are the same DOM on phones');
    await bootInPseudoLocale(page);
    await page.getByTestId('title-new').click();
    await page.getByTestId('title-name').fill('Ļåķéšîðé');
    await page.getByTestId('title-start').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    await openTool(page, 'scenery');
    await expect(page.getByTestId('scenery-picker')).toBeVisible();
    // Every theme tab: an open theme lists its items; a locked one names the theme in its note.
    for (const theme of ['base', 'classic_fair', 'frost_peaks', 'volcano_ridge', 'spooky_hollow', 'jungle_lagoon', 'starport']) {
      await page.getByTestId(`scenery-tab-${theme}`).click();
      await expect(page.getByTestId(`scenery-tab-${theme}`)).toHaveAttribute('aria-selected', 'true');
      expect(unexpectedEnglish(await plainEnglish(page)), theme).toEqual([]);
    }
    await page.getByTestId('scenery-close').click();
    await openTool(page, 'shows');
    await expect(page.getByTestId('show-picker')).toBeVisible();
    await expect(page.getByTestId('show-card-lightshow_tower')).not.toContainText('Lightshow');
    expect(unexpectedEnglish(await plainEnglish(page)), 'shows').toEqual([]);
  });
});
