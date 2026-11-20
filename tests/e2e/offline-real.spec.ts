import { expect, test } from '@playwright/test';

/**
 * Offline play in the realistic test build (VITE_ART=real): it registers no service worker, by design (`src/main.ts`:
 * the realistic build shares the website's origin, and its worker would delete the main game's `tc-*` offline cache).
 * The website build's offline tests are `offline.spec.ts`.
 */
test.describe('offline play (VITE_ART=real build)', () => {
  test.skip(process.env.VITE_ART !== 'real', 'needs a VITE_ART=real build (set VITE_ART=real)');

  test('registers no service worker, and the page is not controlled by one', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('title-new')).toBeVisible();
    // The website build registers its worker on the window's load event (src/offline): wait past it.
    await page.waitForLoadState('load');
    await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
    const sw = await page.evaluate(async () => ({ registrations: (await navigator.serviceWorker.getRegistrations()).length, controlled: navigator.serviceWorker.controller !== null }));
    expect(sw).toEqual({ registrations: 0, controlled: false });
  });
});
