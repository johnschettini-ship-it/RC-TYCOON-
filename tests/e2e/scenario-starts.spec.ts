import { expect, test, type Page } from '@playwright/test';
import { SCENARIOS } from '../../src/data/scenarios';
import { defaultSettings, serializeSettings } from '../../src/settings/schema';
import { isPhone, watchErrors } from './helpers';

/**
 * Phase 5 §10 "All 8 scenarios, the tutorial, and sandbox start from the title screen on desktop and phone" (Build 2
 * acceptance audit): every scenario card starts its scenario on Standard through title → New game → Scenarios →
 * card → Start, with mouse on desktop and taps on the phone. "Unlock all scenarios" (Settings → Gameplay) opens the
 * locked cards. The sandbox and the tutorial starts are in `scenario.spec.ts` and `tutorial.spec.ts`.
 */
type Debug = { world: { state: { scenario: { kind: string; id?: string; difficulty?: string; status?: string }; map: { width: number } } } };

async function press(page: Page, testId: string): Promise<void> {
  if (isPhone(test.info())) await page.getByTestId(testId).tap();
  else await page.getByTestId(testId).click();
}

test.describe('every scenario starts from the title screen', () => {
  test.beforeEach(async ({ page }) => {
    const doc = serializeSettings({ ...defaultSettings(), unlockAllScenarios: true });
    await page.addInitScript((d) => window.localStorage.setItem('tc.settings', d), doc);
  });

  for (const def of SCENARIOS) {
    test(`${def.id} (Standard)`, async ({ page }) => {
      const watch = watchErrors(page);
      await page.goto('/');
      await press(page, 'title-new');
      await press(page, 'title-scenarios');
      await expect(page.getByTestId('scenario-select')).toBeVisible();
      const card = page.getByTestId(`scenario-card-${def.id}`);
      await card.scrollIntoViewIfNeeded();
      await press(page, `scenario-card-${def.id}`);
      await expect(page.getByTestId('scenario-detail')).toBeVisible();
      await press(page, 'preset-standard');
      await expect(page.getByTestId('preset-standard')).toHaveAttribute('aria-checked', 'true');
      await page.getByTestId('scenario-start').scrollIntoViewIfNeeded();
      await press(page, 'scenario-start');
      await expect(page.locator('.title-screen')).toBeHidden();
      const s = await page.evaluate(() => (window as unknown as { __tc: Debug }).__tc.world.state.scenario);
      expect(s).toMatchObject({ kind: 'scenario', id: def.id, difficulty: 'standard', status: 'active' });
      watch.expectNoErrors();
    });
  }
});
