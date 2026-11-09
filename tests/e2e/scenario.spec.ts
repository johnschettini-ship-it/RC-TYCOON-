/**
 * Title flow and scenario front end (Phase 5 §4.4, §4.10, §4.12, §4.13, §9 Playwright): title → New game →
 * Scenarios → Meadow Start → Standard → Start → objectives → save → reload (when the scenarios are present); sandbox
 * setup; free-play map sizes; corrupt progress; award toasts and the end screen; the detail bottom sheet on phones.
 * Every test fails on any console error.
 */
import { expect, test, type Page } from '@playwright/test';
import { isPhone, watchErrors } from './helpers';

type Debug = {
  world: { events: unknown[]; state: { scenario: { kind: string } & Record<string, unknown>; map: { width: number }; park: { afterDark: boolean } } };
  speed: number;
};

const state = (page: Page) => page.evaluate(() => {
  const g = (window as unknown as { __tc: Debug }).__tc;
  return { scenario: g.world.state.scenario, width: g.world.state.map.width, afterDark: g.world.state.park.afterDark, speed: g.speed };
});

async function openScenarios(page: Page, tap = false): Promise<number> {
  await page.goto('/');
  const press = (id: string) => (tap ? page.getByTestId(id).tap() : page.getByTestId(id).click());
  await press('title-new');
  await expect(page.getByTestId('title-newgame')).toBeVisible();
  await press('title-scenarios');
  await expect(page.getByTestId('scenario-select')).toBeVisible();
  return page.locator('.tc-card').count();
}

test.describe('Scenario flow: desktop', () => {
  test.beforeEach(() => test.skip(isPhone(test.info()), 'desktop flow'));

  test('title → Scenarios → Meadow Start → Standard → objectives → save → reload keeps progress', async ({ page }) => {
    test.setTimeout(90_000);
    const watch = watchErrors(page);
    // The 8 scenarios (W3-H) are always present: this flow never skips.
    expect(await openScenarios(page)).toBe(8);
    // Scenarios 1–3 are open at start; 4–8 are locked.
    const all = page.locator('.tc-card');
    await expect(all.nth(0)).toHaveAttribute('aria-disabled', 'false');
    await expect(all.nth(2)).toHaveAttribute('aria-disabled', 'false');
    await expect(all.nth(3)).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('scenario-card-meadow_start').click();
    const sheet = page.getByTestId('scenario-detail');
    await expect(sheet).toBeVisible();
    // Desktop: a side panel on the right.
    const box = await sheet.boundingBox();
    const vw = page.viewportSize()?.width ?? 0;
    expect(box && Math.round(box.x + box.width)).toBe(vw);
    await page.getByTestId('preset-standard').click();
    await expect(page.getByTestId('preset-standard')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('scenario-start').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    const s = await state(page);
    expect(s.scenario).toMatchObject({ kind: 'scenario', id: 'meadow_start', difficulty: 'standard', status: 'active' });

    await page.getByTestId('hud-objectives').click();
    const panel = page.getByTestId('objectives-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('objective').first()).toContainText('guests in the park');
    await expect(page.getByTestId('objectives-deadline')).toHaveText(/months? left/);
    const before = await panel.innerText();

    await page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByTestId('menu-save').click();
    await page.getByTestId('slot-1').click();
    await expect(page.getByTestId('toast')).toHaveText(/saved to slot 1/i);
    await page.reload();
    await page.getByTestId('title-load').click();
    await page.getByRole('button', { name: /Slot 1/ }).first().click();
    await expect(page.locator('.title-screen')).toBeHidden();
    expect((await state(page)).scenario).toMatchObject({ kind: 'scenario', id: 'meadow_start', difficulty: 'standard' });
    await page.getByTestId('hud-objectives').click();
    await expect(panel).toBeVisible();
    expect(await panel.innerText()).toBe(before);
    watch.expectNoErrors();
  });

  test('sandbox setup: options, the large-map warning, and Start', async ({ page }) => {
    const watch = watchErrors(page);
    await page.goto('/');
    await page.getByTestId('title-new').click();
    await page.getByTestId('title-sandbox').click();
    await expect(page.getByTestId('sandbox-setup')).toBeVisible();
    await page.getByTestId('sandbox-size-192').click();
    await expect(page.getByTestId('sandbox-size-warning')).toHaveText('Large maps can run slowly on phones');
    await page.getByTestId('sandbox-size-64').click();
    await expect(page.getByTestId('sandbox-size-warning')).toHaveText('');
    await page.getByTestId('sandbox-afterDark-off').click();
    await page.getByTestId('sandbox-seed').fill('12.5');
    await page.getByTestId('sandbox-start').click();
    await expect(page.getByText('The seed must be a whole number from 0 to 4294967295')).toBeVisible();
    await page.getByTestId('sandbox-seed').fill('424242');
    await page.getByTestId('sandbox-start').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    const s = await state(page);
    expect(s.scenario).toMatchObject({ kind: 'sandbox', options: { mapSize: 64, seed: 424242, afterDark: false, unlimitedMoney: true } });
    expect(s.width).toBe(64);
    expect(s.afterDark).toBe(false);
    expect(s.speed).toBe(1);
    // No objectives flag outside a scenario.
    await expect(page.getByTestId('hud-objectives')).toBeHidden();
    watch.expectNoErrors();
  });

  test('free play offers 5 map sizes; 128 starts a 128 × 128 park', async ({ page }) => {
    const watch = watchErrors(page);
    await page.goto('/');
    await page.getByTestId('title-new').click();
    for (const n of [64, 96, 128, 192, 256]) await expect(page.getByTestId(`title-size-${n}`)).toBeVisible();
    await expect(page.getByTestId('title-size-64')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('title-size-256').click();
    await expect(page.getByTestId('title-size-warning')).toHaveText('Large maps can run slowly on phones');
    await page.getByTestId('title-size-128').click();
    await page.getByTestId('title-name').fill('Big Park');
    await page.getByTestId('title-start').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    const s = await state(page);
    expect(s.width).toBe(128);
    expect(s.scenario.kind).toBe('freePlay');
    watch.expectNoErrors();
  });

  test('settings and credits', async ({ page }) => {
    const watch = watchErrors(page);
    await page.goto('/');
    await page.getByTestId('title-settings').click();
    const unlock = page.getByTestId('title-unlock-all');
    await expect(unlock).toHaveAttribute('aria-pressed', 'false');
    await unlock.click();
    await expect(unlock).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByTestId('title-credits').click();
    await expect(page.getByText('Thrills & Chills is an original game')).toBeVisible();
    watch.expectNoErrors();
  });

  test('corrupt progress shows the error, writes nothing, and resets only after the player confirms', async ({ page }) => {
    const watch = watchErrors(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('tc.progress', '{"format":"thrills-and-chills-progress","version":1,"scenarios":'));
    await openScenarios(page);
    const notice = page.getByTestId('progress-error');
    await expect(notice).toContainText('Your scenario progress could not be read');
    await expect(page.getByTestId('progress-export')).toBeVisible();
    // A finished tutorial step 16 would write progress: nothing is written while the data is unreadable.
    await page.getByTestId('flow-back').click();
    await page.getByTestId('title-tutorial').click();
    await page.evaluate(() => {
      const g = (window as unknown as { __tc: { world: { state: { scenario: { stepIndex: number } } } } }).__tc;
      g.world.state.scenario.stepIndex = 15;
    });
    await page.getByTestId('tutorial-skip-step').click();
    await expect(page.getByTestId('tutorial-title')).toHaveText('Tutorial complete!');
    expect(await page.evaluate(() => localStorage.getItem('tc.progress'))).toBe('{"format":"thrills-and-chills-progress","version":1,"scenarios":');
    // Reset asks first; Keep leaves the data alone.
    await page.reload();
    await openScenarios(page);
    await page.getByTestId('progress-reset').click();
    await page.getByTestId('confirm-no').click();
    expect(await page.evaluate(() => localStorage.getItem('tc.progress'))).toBe('{"format":"thrills-and-chills-progress","version":1,"scenarios":');
    await page.getByTestId('progress-reset').click();
    await page.getByTestId('confirm-yes').click();
    await expect(page.getByTestId('progress-error')).toHaveCount(0);
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('tc.progress'))) ?? 'null')).toEqual({ format: 'thrills-and-chills-progress', version: 1, scenarios: {}, tutorialDone: false });
    watch.expectNoErrors();
  });

  test('a newer progress version shows its own error', async ({ page }) => {
    const watch = watchErrors(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('tc.progress', JSON.stringify({ format: 'thrills-and-chills-progress', version: 9, scenarios: {}, tutorialDone: true })));
    await openScenarios(page);
    await expect(page.getByTestId('progress-error')).toContainText('Your progress comes from a newer version of the game');
    watch.expectNoErrors();
  });

  test('award toasts with a mascot and the end screen pause the game', async ({ page }) => {
    const watch = watchErrors(page);
    await page.goto('/');
    await page.getByTestId('title-new').click();
    await page.getByTestId('title-start').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    await page.evaluate(() => {
      const g = (window as unknown as { __tc: Debug }).__tc;
      g.world.events.push({ type: 'award', id: 'chillHaven', positive: true, monthIndex: 0 }, { type: 'award', id: 'queueNightmare', positive: false, monthIndex: 0 });
    });
    const toast = page.getByTestId('award-toast');
    await expect(toast).toContainText('Award: Chill Haven!');
    await expect(toast.locator('canvas[role=img]')).toHaveAttribute('aria-label', 'Frost');
    await toast.click();
    await expect(toast).toContainText('Bad award: Queue Nightmare');
    await expect(toast.locator('canvas[role=img]')).toHaveAttribute('aria-label', 'Spark');

    // A scenario run that ends (state written through the debug hook; the sim sends the same event).
    await page.evaluate(() => {
      const g = (window as unknown as { __tc: Debug }).__tc;
      g.world.state.scenario = {
        kind: 'scenario', id: 'meadow_start', defVersion: 1, difficulty: 'standard', status: 'lost', endReason: 'timeUp', endMonthIndex: 11,
        continued: false, progressRecorded: false, deadlineMonthIndex: 11, objectives: [], loseCounters: { bankruptMonths: 0, lowRatingDays: 0 }, awards: { active: [], history: [] },
      };
      g.world.events.push({ type: 'scenarioEnded', status: 'lost', reason: 'timeUp', monthIndex: 11 });
    });
    const end = page.getByTestId('end-screen');
    await expect(end).toBeVisible();
    await expect(end.locator('.dialog-title')).toHaveText('Scenario failed');
    await expect(end).toContainText('The deadline passed');
    await expect(page.getByTestId('end-facts')).toContainText('Best coaster excitement');
    await expect(page.getByTestId('end-try-again')).toBeVisible();
    expect((await state(page)).speed).toBe(0);
    await page.getByTestId('end-main-menu').click();
    await expect(page.locator('.title-screen')).toBeVisible();
    watch.expectNoErrors();
  });

  test('a won run: the end screen shows the sim result, progress records it once, a reloaded save does not again', async ({ page }) => {
    test.setTimeout(90_000);
    const watch = watchErrors(page);
    expect(await openScenarios(page)).toBe(8);
    await page.getByTestId('scenario-card-meadow_start').click();
    await page.getByTestId('preset-standard').click();
    await page.getByTestId('scenario-start').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    // The run as the sim leaves it at the end tick of a month-5 win (Phase 5 §4.4: marked progressRecorded).
    await page.evaluate(() => {
      const g = (window as unknown as { __tc: Debug }).__tc;
      Object.assign(g.world.state.scenario, { status: 'won', endReason: null, endMonthIndex: 5, progressRecorded: true });
      g.world.events.push({ type: 'scenarioEnded', status: 'won', reason: null, monthIndex: 5 });
    });
    const end = page.getByTestId('end-screen');
    await expect(end).toBeVisible();
    await expect(end.locator('.dialog-title')).toHaveText('Scenario complete!');
    // Stars come from the sim's scenarioResult: 6 of 12 months left → 3 stars.
    await expect(page.getByTestId('end-facts')).toContainText('3 of 3');
    expect((await state(page)).speed).toBe(0);
    const progress = async () => JSON.parse((await page.evaluate(() => localStorage.getItem('tc.progress'))) ?? 'null');
    const first = await progress();
    expect(first.scenarios.meadow_start.best.standard).toMatchObject({ stars: 3, endMonthIndex: 5 });

    await page.getByTestId('end-keep-playing').click();
    await expect(end).toBeHidden();
    expect((await state(page)).scenario).toMatchObject({ status: 'won', continued: true, progressRecorded: true });
    await page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByTestId('menu-save').click();
    await page.getByTestId('slot-1').click();
    await expect(page.getByTestId('toast')).toHaveText(/saved to slot 1/i);
    await page.reload();
    await page.getByTestId('title-load').click();
    await page.getByRole('button', { name: /Slot 1/ }).first().click();
    await expect(page.locator('.title-screen')).toBeHidden();
    expect((await state(page)).scenario).toMatchObject({ kind: 'scenario', status: 'won', progressRecorded: true });
    await page.waitForTimeout(500);
    await expect(page.getByTestId('end-screen')).toHaveCount(0);
    expect(await progress()).toEqual(first);
    watch.expectNoErrors();
  });
});

test.describe('Scenario flow: phone', () => {
  test.beforeEach(() => test.skip(!isPhone(test.info()), 'phone flow'));

  test('New game, sandbox setup, and Start fit the phone', async ({ page }) => {
    const watch = watchErrors(page);
    await page.goto('/');
    await page.getByTestId('title-new').tap();
    await page.getByTestId('title-sandbox').tap();
    await expect(page.getByTestId('sandbox-setup')).toBeVisible();
    const start = page.getByTestId('sandbox-start');
    await start.scrollIntoViewIfNeeded();
    const b = await start.boundingBox();
    expect(b && b.height).toBeGreaterThanOrEqual(44);
    await start.tap();
    await expect(page.locator('.title-screen')).toBeHidden();
    expect((await state(page)).scenario.kind).toBe('sandbox');
    watch.expectNoErrors();
  });

  test('scenario detail opens as a bottom sheet', async ({ page }) => {
    const watch = watchErrors(page);
    expect(await openScenarios(page, true)).toBe(8);
    await page.locator('.tc-card').first().tap();
    const sheet = page.getByTestId('scenario-detail');
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    const vp = page.viewportSize();
    expect(box && vp && Math.round(box.y + box.height)).toBe(vp?.height);
    expect(box && vp && Math.round(box.width)).toBe(vp?.width);
    const start = page.getByTestId('scenario-start');
    await start.scrollIntoViewIfNeeded();
    expect((await start.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await start.tap();
    await expect(page.locator('.title-screen')).toBeHidden();
    expect((await state(page)).scenario.kind).toBe('scenario');
    watch.expectNoErrors();
  });
});
