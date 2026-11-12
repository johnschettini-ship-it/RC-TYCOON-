/**
 * Day chip (Phase 7 §4.1, §4.2, Task 17): weather and date in one small chip; the two view rotate buttons in their own
 * group at the right of the chip row; the objectives flag directly right of the chip. The chip row lets a press
 * between its controls reach the map. The upright phone (Task 24) has one top row: the chip shows the weather icon and
 * the hour, ONE turn-view button stands in the view controls, and the objectives flag is a Menu item.
 */
import { expect, test, type Page } from '@playwright/test';
import { TICKS_PER_HOUR } from '../../src/data/tuning/core';
import { isPhone, newPark, setSpeed, touch, watchErrors } from './helpers';

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/**
 * The boxes of the chip, its weather button, and the shown view turn buttons (the two rotate buttons; on the upright
 * phone, Task 24, the one turn button as both); whether a turn button is in the chip.
 */
async function chipBoxes(page: Page): Promise<{ chip: Box; weather: Box; left: Box; right: Box; inChip: boolean; inGroup: boolean }> {
  return page.evaluate(() => {
    const box = (sel: string): Box => {
      const r = (document.querySelector(sel) as HTMLElement).getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const chip = document.querySelector('[data-testid="day-pill"]') as HTMLElement;
    const rotate = [...document.querySelectorAll<HTMLElement>('[data-testid^="view-rotate-"], [data-testid="view-turn"]')].filter((b) => !b.hidden);
    const one = rotate.length === 1;
    return {
      chip: box('[data-testid="day-pill"]'),
      weather: box('[data-testid="hud-weather"]'),
      left: box(one ? '[data-testid="view-turn"]' : '[data-testid="view-rotate-left"]'),
      right: box(one ? '[data-testid="view-turn"]' : '[data-testid="view-rotate-right"]'),
      inChip: rotate.some((b) => chip.contains(b)),
      inGroup: rotate.every((b) => b.closest('.hud .view-controls') !== null),
    };
  });
}

/**
 * A new park at 100%, paused, at 17:00 on the first day (the longest clock text of the day: two-digit hours). The
 * upright phone's chip shows the hour; the whole date is its name (Task 21, Task 24).
 */
async function parkAtFive(page: Page, phone: boolean): Promise<void> {
  await newPark(page, 'Chip Park');
  await setSpeed(page, 'Pause');
  await page.evaluate((tick) => {
    (window as unknown as { __tc: { world: { state: { tick: number } } } }).__tc.world.state.tick = tick;
  }, 17 * TICKS_PER_HOUR);
  await expect(page.getByTestId('hud-date')).toHaveText(phone ? '17:00' : 'Mar · Year 1 · 17:00');
  if (phone) await expect(page.getByTestId('day-pill')).toHaveAttribute('aria-label', 'Mar · Year 1 · 17:00');
}

test('the day chip is small, its weather button is a 44 px target, and the view rotate buttons sit outside it', async ({ page }, info) => {
  if (isPhone(info)) await page.setViewportSize({ width: 390, height: 844 });
  await parkAtFive(page, isPhone(info));
  const b = await chipBoxes(page);
  expect(b.chip.height, 'chip plate height').toBeLessThanOrEqual(36);
  expect(b.chip.width, 'chip plate width').toBeLessThanOrEqual(200);
  expect(b.weather.width).toBeGreaterThanOrEqual(44);
  expect(b.weather.height).toBeGreaterThanOrEqual(44);
  for (const r of [b.left, b.right]) {
    expect(Math.abs(r.width - 44)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(r.height - 44)).toBeLessThanOrEqual(0.5);
  }
  if (!isPhone(info)) expect(b.right.left - b.left.right, 'gap between the rotate buttons').toBeGreaterThanOrEqual(8);
  expect(b.inChip, 'a rotate button inside the chip').toBe(false);
  expect(b.inGroup, 'the rotate buttons in the view controls of the top region').toBe(true);
  // The view controls are at the right of the chip; on the upright phone (Task 24) the one turn button is in the chip's
  // row, after the Speed button, with Menu at the right edge.
  if (isPhone(info)) {
    const speed = (await page.getByTestId('speed-toggle').boundingBox())!;
    const menu = (await page.getByTestId('tool-menu').boundingBox())!;
    expect(Math.abs((b.right.top + b.right.bottom) / 2 - (b.chip.top + b.chip.bottom) / 2)).toBeLessThanOrEqual(1);
    expect(b.right.left - (speed.x + speed.width)).toBeGreaterThanOrEqual(7.9);
    expect(menu.x - b.right.right).toBeGreaterThanOrEqual(7.9);
    expect(Math.abs(menu.x + menu.width - (390 - 8))).toBeLessThanOrEqual(1);
  } else {
    expect(b.left.left).toBeGreaterThanOrEqual(b.chip.right + 8);
  }
});

test('the date stays readable text and the weather button keeps its name without the date', async ({ page }, info) => {
  const phone = isPhone(info);
  await parkAtFive(page, phone);
  const weather = page.getByTestId('hud-weather');
  await expect(weather).toHaveAccessibleName(/^Weather: \S/);
  expect(await weather.getAttribute('aria-label')).not.toContain('17:00');
  const region = page.getByRole('region', { name: 'Park status' });
  if (phone) {
    // Task 21, 24: the upright phone's chip shows the hour; the chip is a group named with the whole date.
    await expect(region.getByText('17:00', { exact: true })).toBeVisible();
    await expect(region.getByRole('group', { name: 'Mar · Year 1 · 17:00' })).toBeVisible();
  } else {
    await expect(region.getByText('Mar · Year 1 · 17:00')).toBeVisible();
  }
});

test('a press on the chip weather button shows the forecast toast; the view rotate buttons in their new place turn the view', async ({ page }, info) => {
  const watch = watchErrors(page);
  const tap = isPhone(info);
  await newPark(page, 'Chip Park');
  await setSpeed(page, 'Pause', { tap });
  const weather = page.getByTestId('hud-weather');
  if (tap) await weather.tap();
  else await weather.click();
  await expect(page.getByTestId('toast')).toHaveText((await weather.getAttribute('title')) ?? 'missing');
  const canvas = page.locator('#game');
  const controls = page.locator('.hud .view-controls');
  if (tap) {
    // Task 24: the upright phone's one turn button: a tap turns right, a hold turns left.
    const one = controls.getByTestId('view-turn');
    await one.tap();
    await expect(canvas).toHaveAttribute('data-rotation', '1');
    const b = (await one.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const p = { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 };
    await touch(cdp, 'touchStart', [p]);
    await expect(canvas).toHaveAttribute('data-rotation', '0');
    await touch(cdp, 'touchEnd', []);
  } else {
    await controls.getByTestId('view-rotate-right').click();
    await expect(canvas).toHaveAttribute('data-rotation', '1');
    await controls.getByTestId('view-rotate-left').click();
    await expect(canvas).toHaveAttribute('data-rotation', '0');
  }
  watch.expectNoErrors();
});

test.describe('phone', () => {
  test.beforeEach(() => test.skip(!isPhone(test.info()), 'phone layout'));

  test('the top region is lower than before: --hud-bottom at most 180 px (Build 4: 194 px) on 390 × 844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await newPark(page, 'Chip Park');
    await setSpeed(page, 'Pause');
    const bottom = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('ui') as HTMLElement).getPropertyValue('--hud-bottom')));
    expect(bottom).toBeLessThanOrEqual(180);
  });

  test('a press in the row left of its buttons reaches the map', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await newPark(page, 'Chip Park');
    await setSpeed(page, 'Pause');
    // Task 24: one row; the space between the chip and the Speed button (the first button) has no plate.
    const hit = await page.evaluate(() => {
      const chip = (document.querySelector('[data-testid="day-pill"]') as HTMLElement).getBoundingClientRect();
      const first = (document.querySelector('[data-testid="speed-toggle"]') as HTMLElement).getBoundingClientRect();
      const x = (chip.right + first.left) / 2;
      const y = (first.top + first.bottom) / 2;
      return { space: first.left - chip.right, id: document.elementFromPoint(x, y)?.id ?? '' };
    });
    expect(hit.space).toBeGreaterThan(8);
    expect(hit.id).toBe('game');
  });
});

test('scenario: the objectives flag sits directly right of the chip and nothing covers it (the upright phone: a Menu item, Task 24)', async ({ page }, info) => {
  const watch = watchErrors(page);
  const phone = isPhone(info);
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('title-new').click();
  await page.getByTestId('title-scenarios').click();
  await page.getByTestId('scenario-card-meadow_start').click();
  await page.getByTestId('preset-standard').click();
  await page.getByTestId('scenario-start').click();
  await expect(page.locator('.title-screen')).toBeHidden();
  const flag = page.getByTestId('hud-objectives');
  if (phone) {
    // Task 24: the one top row has no room for the flag; the Menu's Objectives item opens the objectives.
    await expect(flag).toBeHidden();
    await page.getByTestId('tool-menu').click();
    await page.getByTestId('menu-objectives').click();
    await expect(page.getByTestId('objectives-panel')).toBeVisible();
    watch.expectNoErrors();
    return;
  }
  await expect(flag).toBeVisible();
  const m = await page.evaluate(() => {
    const chip = (document.querySelector('[data-testid="day-pill"]') as HTMLElement).getBoundingClientRect();
    const flagEl = document.querySelector('[data-testid="hud-objectives"]') as HTMLElement;
    const f = flagEl.getBoundingClientRect();
    const view = (document.querySelector('.hud .view-controls') as HTMLElement).getBoundingClientRect();
    const top = document.elementFromPoint(f.left + f.width / 2, f.top + f.height / 2);
    return {
      gap: f.left - chip.right, beforeView: f.right <= view.left - 8, middle: Math.abs((f.top + f.bottom) / 2 - (chip.top + chip.bottom) / 2), onTop: top !== null && flagEl.contains(top),
    };
  });
  expect(m.gap).toBeGreaterThanOrEqual(8);
  expect(m.gap).toBeLessThanOrEqual(12);
  expect(m.middle).toBeLessThanOrEqual(1);
  expect(m.beforeView).toBe(true);
  expect(m.onTop, 'the flag is not covered').toBe(true);
  await flag.click();
  await expect(page.getByTestId('objectives-panel')).toBeVisible();
  watch.expectNoErrors();
});
