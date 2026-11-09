import { expect, test, type Page } from '@playwright/test';

/** Start a new park from the title screen. */
async function newPark(page: Page, name = 'Test Park'): Promise<void> {
  await page.goto('/');
  await page.getByTestId('title-new').click();
  await page.getByTestId('title-name').fill(name);
  // The classic 64 × 64 Build 1 layout these tile coordinates use (New Park starts on 96 × 96).
  await page.getByTestId('title-size-64').click();
  await page.getByTestId('title-start').click();
  await expect(page.locator('.title-screen')).toBeHidden();
}

test.describe('HUD and toolbar', () => {
  let errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await newPark(page);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('the HUD shows the park name, cash, and a date with the clock', async ({ page }, info) => {
    await expect(page.getByTestId('hud-date')).toHaveText(/^(Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Jan|Feb) · Year \d+ · \d\d:\d\d$/);
    // A new park runs at 1×, so hourly costs (research budget) start at once: check format and range, not an exact amount.
    await expect(page.getByTestId('hud-cash')).toHaveText(/^\$1[45],\d{3}(\.\d{2})?$/);
    if (info.project.name === 'desktop') await expect(page.getByTestId('hud-name')).toHaveText('Test Park');
  });

  test('a speed button toggles its active state', async ({ page }) => {
    const speeds = page.getByRole('group', { name: 'Game speed' });
    const two = speeds.getByRole('button', { name: 'Speed 2×' });
    const pause = speeds.getByRole('button', { name: 'Pause' });
    await two.click();
    await expect(two).toHaveAttribute('aria-pressed', 'true');
    await expect(two).toHaveClass(/active/);
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await expect(two).toHaveAttribute('aria-pressed', 'false');
    await expect(two).not.toHaveClass(/active/);
  });

  test('the toolbar is visible with labelled buttons of at least 44 × 44 px', async ({ page }, info) => {
    const bar = page.getByRole('toolbar', { name: 'Tools' });
    await expect(bar).toBeVisible();
    for (const name of ['Inspect', 'Footpath', 'Queue', 'Rides', 'Stalls', 'Demolish', 'Finance', 'Park', 'Temperament overlay', 'Menu']) {
      const b = bar.getByRole('button', { name, exact: true });
      await expect(b).toHaveCount(1);
      const box = await b.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    const box = await bar.boundingBox();
    const vp = page.viewportSize();
    if (!box || !vp) throw new Error('no layout');
    if (info.project.name === 'desktop') {
      // Wide screen: toolbar on the left side.
      expect(box.x).toBeLessThan(40);
      expect(box.height).toBeGreaterThan(box.width);
    } else {
      // Narrow screen: toolbar at the bottom.
      expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(vp.height - 2);
      expect(box.width).toBeGreaterThan(box.height);
    }
    // Picking a tool marks it pressed.
    const footpath = bar.getByRole('button', { name: 'Footpath', exact: true });
    await footpath.click();
    await expect(footpath).toHaveAttribute('aria-pressed', 'true');
    await expect(bar.getByRole('button', { name: 'Inspect', exact: true })).toHaveAttribute('aria-pressed', 'false');
  });
});
