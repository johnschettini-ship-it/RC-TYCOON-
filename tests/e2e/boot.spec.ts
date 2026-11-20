import { expect, test } from '@playwright/test';
import { dismissWelcome } from './helpers';

test('the game boots without console errors and draws the map', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  if (process.env.VITE_ART === 'real') {
    // The realistic build draws no park while its title covers the window (the park's pictures are released for the
    // title's: spec 2026-11-16-realistic-title-and-cards-design.md, builder-check answers 2 and 4; `titleHolds` in
    // src/render/real/titleHold.ts), so the map is drawn once a park opens.
    await page.getByTestId('title-new').click();
    await page.getByTestId('title-start').click();
    await dismissWelcome(page);
  }
  const canvas = page.locator('#game');
  await expect(canvas).toHaveAttribute('data-zoom', /\d/);
  const nonBackground = await page.evaluate(() => {
    const c = document.getElementById('game') as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) return 0;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 4 * 97) if (data[i + 1]! > 120) n++;
    return n;
  });
  expect(nonBackground).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
