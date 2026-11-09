import { expect, test } from '@playwright/test';

test('the game boots without console errors and draws the map', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
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
