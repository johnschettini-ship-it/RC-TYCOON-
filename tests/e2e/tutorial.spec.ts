/**
 * Tutorial (Phase 5 §4.11, §9 Playwright): desktop steps 1–4 with the mouse; phone steps 2–4 with touch pan, pinch,
 * and tap, then Skip tutorial. Bubbles never cover the ringed target. Every test fails on any console error.
 */
import { expect, test, type Page } from '@playwright/test';
import { centerOn, contentAt, isPhone, tilePoint, toolControl, touch, watchErrors } from './helpers';

const FOOTPATH = 1;

async function startTutorial(page: Page, tap: boolean): Promise<void> {
  await page.goto('/');
  const press = (id: string) => (tap ? page.getByTestId(id).tap() : page.getByTestId(id).click());
  await press('title-new');
  await press('title-tutorial');
  await expect(page.locator('.title-screen')).toBeHidden();
  await expect(page.getByTestId('tutorial-bubble')).toBeVisible();
}

const stepTitle = (page: Page) => page.getByTestId('tutorial-title');

async function tutorialState(page: Page): Promise<{ kind: string; stepIndex?: number; skipped?: boolean; done?: boolean }> {
  return page.evaluate(() => (window as unknown as { __tc: { world: { state: { scenario: { kind: string } } } } }).__tc.world.state.scenario);
}

/** The bubble and the ring around the target do not overlap. */
async function expectBubbleClearOfRing(page: Page): Promise<void> {
  const ring = await page.locator('.tc-ring').boundingBox();
  const bubble = await page.getByTestId('tutorial-bubble').boundingBox();
  expect(ring).not.toBeNull();
  expect(bubble).not.toBeNull();
  if (!ring || !bubble) return;
  const overlap = ring.x < bubble.x + bubble.width && bubble.x < ring.x + ring.width && ring.y < bubble.y + bubble.height && bubble.y < ring.y + ring.height;
  expect(overlap).toBe(false);
}

test.describe('Tutorial: desktop', () => {
  test.beforeEach(() => test.skip(isPhone(test.info()), 'desktop flow'));

  test('steps 1–4 with the mouse', async ({ page }) => {
    const watch = watchErrors(page);
    await startTutorial(page, false);
    const s = await tutorialState(page);
    expect(s).toEqual({ kind: 'tutorial', stepIndex: 0, skipped: false, done: false });
    await expect(stepTitle(page)).toHaveText('Welcome to Thrills & Chills');
    await expect(page.getByTestId('tutorial-step')).toHaveText('Step 1 of 16');
    // No speaker name since Task 23 (the owner scrapped the mascots).
    await expect(page.getByTestId('tutorial-guide')).toHaveCount(0);
    await expect(page.getByTestId('tutorial-hint')).toHaveText('Let us build a park for Thrill and Chill guests together');

    // 1: Next.
    await page.getByTestId('tutorial-next').click();
    await expect(stepTitle(page)).toHaveText('Move the view');
    await expect(page.getByTestId('tutorial-hint')).toHaveText('Drag the map with the mouse, or use the arrow keys');
    await expect(page.getByTestId('tutorial-guide')).toHaveCount(0);

    // 2: drag the map.
    const box = await page.locator('#game').boundingBox();
    if (!box) throw new Error('no canvas');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 260, cy - 140, { steps: 12 });
    await page.mouse.up();
    await expect(stepTitle(page)).toHaveText('Zoom in and out');

    // 3: wheel zoom.
    await page.mouse.move(cx, cy);
    for (let k = 0; k < 4 && (await stepTitle(page).textContent()) === 'Zoom in and out'; k++) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(100);
    }
    await expect(stepTitle(page)).toHaveText('Build a footpath from the entrance');
    await expect(page.getByTestId('tutorial-hint')).toHaveText(/^Click Paths, then Footpath/);

    // 4: the ring is on the Paths deck button until the deck opens, then on the Footpath card; the bubble stays clear.
    await expect(page.getByTestId('deck-paths')).toHaveAttribute('data-tutorial-target', 'footpath');
    await expect(page.locator('.tc-ring')).toBeVisible();
    await expectBubbleClearOfRing(page);
    await page.getByTestId('deck-paths').click();
    const footpathTool = await toolControl(page, 'footpath');
    await expect(footpathTool).toHaveAttribute('data-tutorial-target', 'footpath');
    await expect(page.locator('.tc-ring')).toBeVisible();
    await expectBubbleClearOfRing(page);
    await footpathTool.click();
    await centerOn(page, 24, 42);
    const a = await tilePoint(page, 24, 43);
    const b = await tilePoint(page, 24, 41);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.mouse.up();
    for (const y of [41, 42, 43]) expect(await contentAt(page, 24, y)).toBe(FOOTPATH);
    await expect(stepTitle(page)).toHaveText('Place a Carousel');
    await expect(page.getByTestId('tutorial-step')).toHaveText('Step 5 of 16');
    watch.expectNoErrors();
  });

  test('Skip step and the finished tutorial bubble', async ({ page }) => {
    const watch = watchErrors(page);
    await startTutorial(page, false);
    await page.getByTestId('tutorial-next').click();
    await page.getByTestId('tutorial-skip-step').click();
    await expect(stepTitle(page)).toHaveText('Zoom in and out');
    // Jump to the last step through the debug hook, then skip it: the finale shows and progress records it.
    await page.evaluate(() => {
      const g = (window as unknown as { __tc: { world: { state: { scenario: { stepIndex: number } } } } }).__tc;
      g.world.state.scenario.stepIndex = 15;
    });
    await expect(stepTitle(page)).toHaveText('Reach 100 guests');
    await page.getByTestId('tutorial-skip-step').click();
    await expect(stepTitle(page)).toHaveText('Tutorial complete!');
    const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('tc.progress') ?? 'null') as { tutorialDone: boolean } | null);
    expect(progress?.tutorialDone).toBe(true);
    await page.getByTestId('tutorial-close').click();
    await expect(page.getByTestId('tutorial-bubble')).toBeHidden();
    watch.expectNoErrors();
  });
});

test.describe('Tutorial: phone', () => {
  test.beforeEach(() => test.skip(!isPhone(test.info()), 'phone flow'));

  test('steps 2–4 with touch pan, pinch, and tap; Skip tutorial', async ({ page }) => {
    const watch = watchErrors(page);
    await startTutorial(page, true);
    await page.getByTestId('tutorial-next').tap();
    await expect(stepTitle(page)).toHaveText('Move the view');
    await expect(page.getByTestId('tutorial-hint')).toHaveText('Drag the map with one finger');

    const box = await page.locator('#game').boundingBox();
    if (!box) throw new Error('no canvas');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);

    // 2: one-finger pan.
    await touch(cdp, 'touchStart', [{ x: cx, y: cy, id: 1 }]);
    for (let k = 1; k <= 10; k++) await touch(cdp, 'touchMove', [{ x: cx - 15 * k, y: cy - 12 * k, id: 1 }]);
    await touch(cdp, 'touchEnd', []);
    await expect(stepTitle(page)).toHaveText('Zoom in and out');
    await expect(page.getByTestId('tutorial-hint')).toHaveText('Pinch with two fingers to zoom in and out');

    // 3: two-finger pinch.
    await touch(cdp, 'touchStart', [{ x: cx - 40, y: cy, id: 1 }]);
    await touch(cdp, 'touchStart', [
      { x: cx - 40, y: cy, id: 1 },
      { x: cx + 40, y: cy, id: 2 },
    ]);
    for (let k = 1; k <= 10; k++) {
      await touch(cdp, 'touchMove', [
        { x: cx - 40 - 8 * k, y: cy, id: 1 },
        { x: cx + 40 + 8 * k, y: cy, id: 2 },
      ]);
    }
    await touch(cdp, 'touchEnd', []);
    await expect(stepTitle(page)).toHaveText('Build a footpath from the entrance');
    await expect(page.getByTestId('tutorial-hint')).toHaveText(/^Tap Paths, then Footpath/);

    // 4: the ring is on the Paths deck chip until the deck opens, then on the Footpath card; the bubble moved away
    // from it. Tap three path tiles.
    await expect(page.getByTestId('deck-paths')).toHaveAttribute('data-tutorial-target', 'footpath');
    await expect(page.locator('.tc-ring')).toBeVisible();
    await expectBubbleClearOfRing(page);
    await page.getByTestId('deck-paths').tap();
    const footpathTool = await toolControl(page, 'footpath', { tap: true });
    await expect(footpathTool).toHaveAttribute('data-tutorial-target', 'footpath');
    await expectBubbleClearOfRing(page);
    await footpathTool.tap();
    await centerOn(page, 24, 42);
    for (const y of [43, 42, 41]) {
      const p = await tilePoint(page, 24, y);
      await page.touchscreen.tap(p.x, p.y);
      await expect.poll(() => contentAt(page, 24, y)).toBe(FOOTPATH);
    }
    await expect(stepTitle(page)).toHaveText('Place a Carousel');

    // Skip tutorial (confirm): the bubble goes and the park plays on.
    await page.getByTestId('tutorial-skip-all').tap();
    await page.getByTestId('confirm-yes').tap();
    await expect(page.getByTestId('tutorial-bubble')).toBeHidden();
    expect(await tutorialState(page)).toMatchObject({ kind: 'tutorial', skipped: true, done: false });
    watch.expectNoErrors();
  });
});
