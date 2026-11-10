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

  test('a speed button toggles its active state', async ({ page }, info) => {
    const phone = info.project.name === 'phone';
    const speeds = page.getByRole('group', { name: 'Game speed' });
    const two = speeds.getByRole('button', { name: 'Speed 2×' });
    const pause = speeds.getByRole('button', { name: 'Pause' });
    // The phone keeps the group in a menu that a choice closes.
    const openMenu = async (): Promise<void> => {
      if (phone) await page.getByTestId('speed-toggle').click();
    };
    await openMenu();
    await two.click();
    await openMenu();
    await expect(two).toHaveAttribute('aria-pressed', 'true');
    await expect(two).toHaveClass(/active/);
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await pause.click();
    await openMenu();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await expect(two).toHaveAttribute('aria-pressed', 'false');
    await expect(two).not.toHaveClass(/active/);
  });

  test('the toolbar is visible with labelled buttons of at least 44 × 44 px', async ({ page }, info) => {
    const bar = page.getByRole('toolbar', { name: 'Tools' });
    await expect(bar).toBeVisible();
    for (const name of ['Inspect', 'Footpath', 'Queue', 'Rides', 'Stalls', 'Demolish', 'Finance', 'Park']) {
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

  test('the status pill shows cash, guests, and rating, and opens the Park panel', async ({ page }, info) => {
    if (info.project.name === 'phone') await page.setViewportSize({ width: 390, height: 844 });
    for (const id of ['hud-cash', 'hud-guests', 'hud-rating']) await expect(page.getByTestId(id)).toBeVisible();
    await page.getByTestId('status-pill').click();
    await expect(page.locator('.panel-title')).toHaveText('Test Park');
  });

  test('the phone has one Speed button that opens the speed group', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone');
    const group = page.getByRole('group', { name: 'Game speed' });
    await expect(group).toBeHidden();
    await page.getByTestId('speed-toggle').click();
    await group.getByRole('button', { name: 'Speed 2×' }).click();
    await expect(group).toBeHidden();
    await expect(page.getByTestId('speed-toggle')).toHaveText('2×');
  });

  test('a resize across 900 px keeps exactly one visible speed control', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    const group = page.getByRole('group', { name: 'Game speed' });
    await page.setViewportSize({ width: 800, height: 800 });
    await page.getByTestId('speed-toggle').click();
    await expect(group).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(group).toBeVisible();
    await expect(page.getByTestId('speed-toggle')).toBeHidden();
    await page.setViewportSize({ width: 800, height: 800 });
    await expect(page.getByTestId('speed-toggle')).toBeVisible();
    await expect(group).toBeHidden();
  });

  test('a long park name and a ten-digit cash value keep the controls on the screen', async ({ page }) => {
    await page.evaluate(() => {
      const park = (window as unknown as { __tc: { world: { state: { park: { name: string; cash: number } } } } }).__tc.world.state.park;
      park.name = 'W'.repeat(32);
      park.cash = 999_999_999_900;
    });
    const vp = page.viewportSize();
    if (!vp) throw new Error('no viewport');
    for (const id of ['status-pill', 'tool-messages', 'tool-menu']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect(box!.x, id).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, id).toBeLessThanOrEqual(vp.width);
    }
  });
});
