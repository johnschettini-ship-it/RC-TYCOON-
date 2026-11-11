/**
 * Day chip (Phase 7 §4.1, §4.2, Task 17): weather and date in one small chip; the two view rotate buttons in their own
 * group at the right of the chip row; the objectives flag directly right of the chip. The chip row lets a press
 * between its controls reach the map.
 */
import { expect, test, type Page } from '@playwright/test';
import { TICKS_PER_HOUR } from '../../src/data/tuning/core';
import { isPhone, newPark, setSpeed, watchErrors } from './helpers';

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/** The boxes of the chip, its weather button, and the two view rotate buttons; whether a rotate button is in the chip. */
async function chipBoxes(page: Page): Promise<{ chip: Box; weather: Box; left: Box; right: Box; inChip: boolean; inGroup: boolean }> {
  return page.evaluate(() => {
    const box = (sel: string): Box => {
      const r = (document.querySelector(sel) as HTMLElement).getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const chip = document.querySelector('[data-testid="day-pill"]') as HTMLElement;
    const rotate = [...document.querySelectorAll('[data-testid^="view-rotate-"]')];
    return {
      chip: box('[data-testid="day-pill"]'),
      weather: box('[data-testid="hud-weather"]'),
      left: box('[data-testid="view-rotate-left"]'),
      right: box('[data-testid="view-rotate-right"]'),
      inChip: rotate.some((b) => chip.contains(b)),
      inGroup: rotate.every((b) => b.closest('.hud .view-controls') !== null),
    };
  });
}

/** A new park at 100%, paused, at 17:00 on the first day (the longest clock text of the day: two-digit hours). */
async function parkAtFive(page: Page): Promise<void> {
  await newPark(page, 'Chip Park');
  await setSpeed(page, 'Pause');
  await page.evaluate((tick) => {
    (window as unknown as { __tc: { world: { state: { tick: number } } } }).__tc.world.state.tick = tick;
  }, 17 * TICKS_PER_HOUR);
  await expect(page.getByTestId('hud-date')).toHaveText('Mar · Year 1 · 17:00');
}

test('the day chip is small, its weather button is a 44 px target, and the view rotate buttons sit outside it', async ({ page }, info) => {
  if (isPhone(info)) await page.setViewportSize({ width: 390, height: 844 });
  await parkAtFive(page);
  const b = await chipBoxes(page);
  expect(b.chip.height, 'chip plate height').toBeLessThanOrEqual(36);
  expect(b.chip.width, 'chip plate width').toBeLessThanOrEqual(200);
  expect(b.weather.width).toBeGreaterThanOrEqual(44);
  expect(b.weather.height).toBeGreaterThanOrEqual(44);
  for (const r of [b.left, b.right]) {
    expect(Math.abs(r.width - 44)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(r.height - 44)).toBeLessThanOrEqual(0.5);
  }
  expect(b.right.left - b.left.right, 'gap between the rotate buttons').toBeGreaterThanOrEqual(8);
  expect(b.inChip, 'a rotate button inside the chip').toBe(false);
  expect(b.inGroup, 'the rotate buttons in the view controls of the top region').toBe(true);
  // The view controls are at the right of the chip.
  expect(b.left.left).toBeGreaterThanOrEqual(b.chip.right + 8);
});

test('the date stays readable text and the weather button keeps its name without the date', async ({ page }) => {
  await parkAtFive(page);
  const weather = page.getByTestId('hud-weather');
  await expect(weather).toHaveAccessibleName(/^Weather: \S/);
  expect(await weather.getAttribute('aria-label')).not.toContain('17:00');
  await expect(page.getByRole('region', { name: 'Park status' }).getByText('Mar · Year 1 · 17:00')).toBeVisible();
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
  const right = controls.getByTestId('view-rotate-right');
  const left = controls.getByTestId('view-rotate-left');
  if (tap) await right.tap();
  else await right.click();
  await expect(canvas).toHaveAttribute('data-rotation', '1');
  if (tap) await left.tap();
  else await left.click();
  await expect(canvas).toHaveAttribute('data-rotation', '0');
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

  test('a press between the chip and the view controls reaches the map', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await newPark(page, 'Chip Park');
    await setSpeed(page, 'Pause');
    const hit = await page.evaluate(() => {
      const chip = (document.querySelector('[data-testid="day-pill"]') as HTMLElement).getBoundingClientRect();
      const left = (document.querySelector('[data-testid="view-rotate-left"]') as HTMLElement).getBoundingClientRect();
      const x = (chip.right + left.left) / 2;
      const y = (left.top + left.bottom) / 2;
      return { space: left.left - chip.right, id: document.elementFromPoint(x, y)?.id ?? '' };
    });
    expect(hit.space).toBeGreaterThan(20);
    expect(hit.id).toBe('game');
  });
});

test('scenario: the objectives flag sits directly right of the chip and nothing covers it', async ({ page }, info) => {
  const watch = watchErrors(page);
  if (isPhone(info)) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('title-new').click();
  await page.getByTestId('title-scenarios').click();
  await page.getByTestId('scenario-card-meadow_start').click();
  await page.getByTestId('preset-standard').click();
  await page.getByTestId('scenario-start').click();
  await expect(page.locator('.title-screen')).toBeHidden();
  const flag = page.getByTestId('hud-objectives');
  await expect(flag).toBeVisible();
  const m = await page.evaluate(() => {
    const chip = (document.querySelector('[data-testid="day-pill"]') as HTMLElement).getBoundingClientRect();
    const flagEl = document.querySelector('[data-testid="hud-objectives"]') as HTMLElement;
    const f = flagEl.getBoundingClientRect();
    const view = (document.querySelector('.hud .view-controls') as HTMLElement).getBoundingClientRect();
    const top = document.elementFromPoint(f.left + f.width / 2, f.top + f.height / 2);
    return { gap: f.left - chip.right, beforeView: f.right <= view.left - 8, middle: Math.abs((f.top + f.bottom) / 2 - (chip.top + chip.bottom) / 2), onTop: top !== null && flagEl.contains(top) };
  });
  expect(m.gap).toBeGreaterThanOrEqual(8);
  expect(m.gap).toBeLessThanOrEqual(12);
  expect(m.beforeView).toBe(true);
  expect(m.middle).toBeLessThanOrEqual(1);
  expect(m.onTop, 'the flag is not covered').toBe(true);
  await flag.click();
  await expect(page.getByTestId('objectives-panel')).toBeVisible();
  watch.expectNoErrors();
});
