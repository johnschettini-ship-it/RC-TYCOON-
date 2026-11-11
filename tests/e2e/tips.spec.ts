/**
 * Mascot tips (Phase 7 §4.8): one tip at a time in a bubble with a small face; its button opens the place the tip
 * names; Close hides it; the Mascot tips setting, an open menu, the Tutorial, and a held card hide it.
 */
import { expect, test } from '@playwright/test';
import { newPark, openTool, pickCard } from './helpers';

test('a new park shows the noRide tip; its button opens the Rides deck; Close hides it', async ({ page }) => {
  await newPark(page, 'Tip Park');
  const tip = page.getByTestId('tip');
  await expect(tip).toBeVisible({ timeout: 4000 });
  await expect(tip).toHaveAttribute('data-tip', 'noRide');
  await expect(page.getByTestId('tip-text')).toHaveText('Build a ride and open it. Guests come for rides');
  await page.getByTestId('deck-paths').click();
  await page.getByTestId('tip-action').click();
  await expect(page.getByTestId('hand')).toHaveAttribute('data-deck', 'rides');
  await page.getByTestId('tip-close').click();
  await expect(tip).toBeHidden();
  await page.waitForTimeout(2500);
  await expect(tip).toBeHidden();
});

test('negative cash shows cashLow first; Open Finance opens the Finance panel', async ({ page }) => {
  await newPark(page, 'Tip Park');
  await page.evaluate(() => ((window as unknown as { __tc: { world: { state: { park: { cash: number } } } } }).__tc.world.state.park.cash = -100));
  await expect(page.getByTestId('tip')).toHaveAttribute('data-tip', 'cashLow', { timeout: 4000 });
  await page.getByTestId('tip-action').click();
  await expect(page.locator('.panel-title')).toHaveText(/Finance/);
});

test('the Mascot tips setting turns the tips off', async ({ page }) => {
  await newPark(page, 'Tip Park');
  await expect(page.getByTestId('tip')).toBeVisible({ timeout: 4000 });
  await page.evaluate(() => (window as unknown as { __tc: { settings: { set(k: string, v: boolean): boolean } } }).__tc.settings.set('mascotTips', false));
  await expect(page.getByTestId('tip')).toBeHidden({ timeout: 4000 });
});

test('the Tutorial shows no tip, and an open menu hides the tip', async ({ page }) => {
  await newPark(page, 'Tip Park');
  await expect(page.getByTestId('tip')).toBeVisible({ timeout: 4000 });
  await openTool(page, 'menu');
  await expect(page.getByTestId('tip')).toBeHidden();
  // The start steps of tutorial.spec.ts.
  await page.goto('/');
  await page.getByTestId('title-new').click();
  await page.getByTestId('title-tutorial').click();
  await expect(page.locator('.title-screen')).toBeHidden();
  await expect(page.getByTestId('tutorial-bubble')).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.getByTestId('tip')).toBeHidden();
});

test('a held card hides the tip; putting it back shows the tip again', async ({ page }) => {
  await newPark(page, 'Tip Park');
  const tip = page.getByTestId('tip');
  await expect(tip).toHaveAttribute('data-tip', 'noRide', { timeout: 4000 });
  await expect(tip).toBeVisible();
  await pickCard(page, 'flat', 'carousel');
  await expect(tip).toBeHidden();
  await openTool(page, 'inspect');
  await expect(tip).toBeVisible();
  await expect(tip).toHaveAttribute('data-tip', 'noRide');
});
