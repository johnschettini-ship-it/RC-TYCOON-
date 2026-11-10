import { expect, test, type Page } from '@playwright/test';
import { openTool } from './helpers';

/** "$14,774.45" → 1477445 cents; "−$5" → −500. */
function cents(text: string): number {
  const neg = text.includes('−') || text.includes('-');
  const v = Math.round(Number(text.replace(/[^0-9.]/g, '')) * 100);
  return neg ? -v : v;
}

async function newPark(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('[data-testid=title-new]').click();
  // The classic 64 × 64 Build 1 layout these tile coordinates use (New Park starts on 96 × 96).
  await page.locator('[data-testid=title-size-64]').click();
  await page.locator('[data-testid=title-start]').click();
  await expect(page.locator('.title-screen')).toBeHidden();
  // Pause so hourly costs do not move the cash during the checks.
  await page.getByRole('group', { name: 'Game speed' }).getByRole('button', { name: 'Pause' }).click();
}

test.describe('Phase 3 management UI', () => {
  let errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('console', (m) => {
      // A missing favicon is the browser's request, not the game's.
      if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await newPark(page);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('hire a Groundskeeper from the Staff panel, then open Research and Messages', async ({ page }) => {
    await openTool(page, 'staff');
    await expect(page.locator('.panel[data-kind=staff]')).toBeVisible();
    const before = cents((await page.getByTestId('hud-cash').textContent()) ?? '');
    await page.getByTestId('hire-groundskeeper').click();
    await expect(page.getByTestId('staff-row')).toHaveCount(1);
    await expect(page.getByTestId('staff-count')).toHaveText('1 of 200 staff');
    await expect.poll(async () => cents((await page.getByTestId('hud-cash').textContent()) ?? '')).toBe(before - 10_000);
    await expect(page.getByTestId('staff-detail')).toContainText('Groundskeeper');

    await openTool(page, 'research');
    await expect(page.locator('.panel[data-kind=research]')).toBeVisible();
    await expect(page.getByTestId('research-current')).toContainText('Spiral Slide');
    await page.getByTestId('research-level-high').click();
    await expect(page.getByTestId('research-level-high')).toHaveAttribute('aria-pressed', 'true');

    await openTool(page, 'messages');
    await expect(page.locator('.panel[data-kind=messages]')).toBeVisible();
    await expect(page.locator('.panel[data-kind=messages] .panel-title')).toHaveText('Messages');
  });

  test('paint a patrol area with the mouse, borrow $1,000, and start a campaign', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'mouse painting and the side panel are desktop flows');
    await openTool(page, 'staff');
    await page.getByTestId('hire-mechanic').click();
    await page.getByTestId('staff-edit-patrol').click();
    await expect(page.getByTestId('patrol-title')).toContainText('Patrol area of');
    const box = await page.locator('#game').boundingBox();
    if (!box) throw new Error('no canvas');
    const cx = box.x + box.width / 2 - 60;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy + 10, { steps: 6 });
    await page.mouse.move(cx + 120, cy + 20, { steps: 6 });
    await page.mouse.up();
    await page.getByTestId('patrol-done').click();
    await expect(page.locator('.panel[data-kind=staff]')).toBeVisible();
    await expect(page.getByTestId('staff-detail')).toContainText(/\d+ tiles/);

    await openTool(page, 'finance');
    await page.getByTestId('loan-borrow').click();
    await page.getByTestId('confirm-yes').click();
    await expect(page.getByTestId('loan-balance')).toContainText('$1,000');

    await openTool(page, 'marketing');
    await page.getByTestId('campaign-start-poster_run').click();
    await expect(page.getByTestId('campaigns-running')).toContainText('Town Poster Run');
    // A second start is refused with the exact reason.
    await page.getByTestId('campaign-start-poster_run').click();
    await expect(page.getByTestId('toast')).toHaveText('Campaign already running');
  });

  test('phone: one finger paints a patrol, two fingers paint nothing, and the loan repays', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'touch flow');
    await openTool(page, 'staff');
    await page.getByTestId('hire-mechanic').click();
    await page.getByTestId('staff-edit-patrol').click();
    // The bottom sheet closes so the map is free to paint.
    await expect(page.locator('.panel[data-kind=staff]')).toBeHidden();
    const box = await page.locator('#game').boundingBox();
    if (!box) throw new Error('no canvas');
    const x = box.x + box.width / 2;
    const y = box.y + box.height * 0.4;
    /** Synthetic touch pointers on the canvas (Playwright has no multi-touch drag API). */
    const touch = (type: string, id: number, px: number, py: number): Promise<void> =>
      page.locator('#game').evaluate(
        (el, a) => {
          el.dispatchEvent(new PointerEvent(a.type, { pointerId: a.id, pointerType: 'touch', isPrimary: a.id === 1, clientX: a.px, clientY: a.py, bubbles: true, button: 0 }));
        },
        { type, id, px, py },
      );
    const patrolTiles = (): Promise<number> =>
      page.evaluate(() => {
        const g = (window as unknown as { __tc: { world: { state: { staff: { members: Array<{ patrol: Uint8Array | null }> } } } } }).__tc;
        const p = g.world.state.staff.members[0]?.patrol;
        if (!p) return 0;
        let n = 0;
        for (const b of p) for (let k = 0; k < 8; k++) n += (b >> k) & 1;
        return n;
      });
    await touch('pointerdown', 1, x, y);
    for (let k = 1; k <= 6; k++) await touch('pointermove', 1, x + k * 15, y + k * 3);
    await touch('pointerup', 1, x + 90, y + 18);
    const painted = await patrolTiles();
    expect(painted).toBeGreaterThan(1);
    // Two fingers: the stroke drops and a pinch starts; nothing new is painted.
    await touch('pointerdown', 1, x - 80, y + 80);
    await touch('pointermove', 1, x - 60, y + 80);
    await touch('pointerdown', 2, x + 40, y + 120);
    await touch('pointermove', 1, x - 30, y + 60);
    await touch('pointermove', 2, x + 70, y + 140);
    await touch('pointerup', 2, x + 70, y + 140);
    await touch('pointerup', 1, x - 30, y + 60);
    expect(await patrolTiles()).toBe(painted);
    await page.getByTestId('patrol-done').click();
    await expect(page.locator('.panel[data-kind=staff]')).toBeVisible();

    await openTool(page, 'finance');
    await page.getByTestId('loan-borrow').click();
    await page.getByTestId('confirm-yes').click();
    await expect(page.getByTestId('loan-balance')).toContainText('$1,000');
    await page.getByTestId('loan-repay').click();
    await expect(page.getByTestId('loan-balance')).toContainText('$0');
  });
});
