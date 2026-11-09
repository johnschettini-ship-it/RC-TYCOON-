import { expect, test, type Page } from '@playwright/test';
import { CAMPAIGNS } from '../../src/data/tuning/management';
import { FLAT_RIDES, PATH_ITEMS, SCENERY, SCENERY_THEMES, SHOW_SITES, STAFF, STALLS, TRACK_RIDES } from '../../src/data/catalog';
import { defaultSettings, serializeSettings } from '../../src/settings/schema';

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

/** Content names come from catalog `name` fields; the catalog has no `nameKey` yet (contract change request). */
const DATA_NAMES: readonly string[] = [...FLAT_RIDES, ...TRACK_RIDES, ...STALLS, ...PATH_ITEMS, ...STAFF, ...SCENERY_THEMES, ...SCENERY, ...SHOW_SITES, ...CAMPAIGNS].map((d) => d.name);

/** Plain English left after removing the known gaps and content names (longest first). */
function unexpectedEnglish(found: readonly string[]): string[] {
  const known = [...KNOWN_GAPS, ...DATA_NAMES].sort((a, b) => b.length - a.length);
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
      await page.getByTestId(`tool-${tool}`).click();
      await expect(page.getByTestId(`tool-${tool}`)).toHaveAttribute('aria-pressed', 'true');
      expect(unexpectedEnglish(await plainEnglish(page)), tool).toEqual([]);
      await page.getByTestId(`tool-${tool}`).click();
    }
  });
});
