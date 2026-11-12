/**
 * One top row on the upright phone (Task 24, owner decision 2026-11-12: "have single row top card", "Merge turn
 * buttons"): the money and guests pill, the mood circle, the time chip (weather icon and the hour), the Speed control,
 * ONE turn-view button (a tap turns right, a hold turns left) and Menu, in one line. Messages and the objectives flag
 * move into the Menu; a dot on Menu shows unread messages. Base (before this task, new park at 100%, 390 × 844):
 * `--hud-bottom` 104 px (two lines).
 */
import { expect, test, type Page } from '@playwright/test';
import { TICKS_PER_HOUR } from '../../src/data/tuning/core';
import { isPhone, newPark, scan, setSpeed, touch, watchErrors } from './helpers';

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/** The six parts of the row, left to right. */
const ROW = ['status-pill', 'hud-balance', 'day-pill', 'speed-toggle', 'view-turn', 'tool-menu'] as const;

async function boxOf(page: Page, testId: string): Promise<Box> {
  return page.evaluate((id) => {
    const r = (document.querySelector(`[data-testid="${id}"]`) as HTMLElement).getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, testId);
}

async function hudBottom(page: Page): Promise<number> {
  return page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('ui') as HTMLElement).getPropertyValue('--hud-bottom')));
}

async function frames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

async function park(page: Page, cash = 1_998_345): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await newPark(page, 'Row Park');
  await expect(page.locator('#ui')).toHaveAttribute('data-layout', 'bottom');
  await expect(page.locator('#ui')).not.toHaveAttribute('data-low', /./);
  await setSpeed(page, 'Pause', { tap: true });
  // The owner's screenshot: $19,983 (and 9:00, the start of the day).
  await page.evaluate((c) => {
    (window as unknown as { __tc: { world: { state: { park: { cash: number } } } } }).__tc.world.state.park.cash = c;
  }, cash);
  await frames(page);
}

/** `n` unread research messages. */
async function unread(page: Page, n: number): Promise<void> {
  await page.evaluate((count) => {
    const g = (window as unknown as { __tc: { world: { state: { tick: number; management: { nextMessageId: number; messages: unknown[] } } } } }).__tc;
    const m = g.world.state.management;
    for (let i = 0; i < count; i++) {
      m.messages.push({ id: m.nextMessageId, tick: g.world.state.tick, category: 'research', textId: 'msg.research.newRide', params: { itemId: 'gyro_globe', name: 'Gyro Globe' }, tile: -1, entityId: -1 });
      m.nextMessageId++;
    }
  }, n);
  await frames(page);
}

/** Two boxes are on one row when each one's vertical middle lies inside the other. */
function oneRow(a: Box, b: Box): boolean {
  const am = (a.top + a.bottom) / 2;
  const bm = (b.top + b.bottom) / 2;
  return am > b.top && am < b.bottom && bm > a.top && bm < a.bottom;
}

const rotation = (page: Page): Promise<string | null> => page.locator('#game').getAttribute('data-rotation');

test.describe('one top row on the upright phone (Task 24)', () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(!isPhone(info), 'the upright phone layout');
  });

  test('390 × 844: pill, mood circle, time chip, Speed, one turn button and Menu are one line; controls 44 × 44, 8 px apart; plate at most 52 px', async ({ page }) => {
    const watch = watchErrors(page);
    await park(page);
    const boxes = await Promise.all(ROW.map((id) => boxOf(page, id)));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(oneRow(boxes[i]!, boxes[j]!), `${ROW[i]} and ${ROW[j]} on one line`).toBe(true);
      expect(boxes[i]!.height, `${ROW[i]} plate`).toBeLessThanOrEqual(52);
      if (i > 0) expect(boxes[i]!.left - boxes[i - 1]!.right, `gap before ${ROW[i]}`).toBeGreaterThanOrEqual(7.9);
    }
    expect(boxes[0]!.left).toBeGreaterThanOrEqual(8 - 0.5);
    expect(boxes[5]!.right).toBeLessThanOrEqual(390 - 8 + 0.5);
    for (const id of ['hud-balance', 'speed-toggle', 'view-turn', 'tool-menu']) {
      const b = await boxOf(page, id);
      expect(Math.abs(b.height - 44), `${id} height`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(b.width - 44), `${id} width`).toBeLessThanOrEqual(0.5);
    }
    for (const id of ['status-pill', 'hud-weather']) {
      const b = await boxOf(page, id);
      expect(b.width, id).toBeGreaterThanOrEqual(43.5);
      expect(b.height, id).toBeGreaterThanOrEqual(43.5);
    }
    // The owner's numbers fit in full.
    await expect(page.getByTestId('hud-cash')).toHaveText('$19,983');
    await expect(page.getByTestId('hud-guests')).toBeVisible();
    // No second line: Messages, the two turn buttons and the chip row are not shown.
    for (const id of ['tool-messages', 'view-rotate-left', 'view-rotate-right']) await expect(page.getByTestId(id), id).toBeHidden();
    await expect(page.locator('.hud .hud-day')).toBeHidden();
    // `--hud-bottom` is the bottom of the row (base 104 px).
    const row = Math.max(...boxes.map((b) => b.bottom));
    await expect.poll(() => hudBottom(page)).toBeLessThanOrEqual(Math.ceil(row) + 1);
    expect(await hudBottom(page)).toBeLessThanOrEqual(64);
    watch.expectNoErrors();
  });

  test('the time chip shows the weather icon and the hour; the month and year are in its name and title', async ({ page }) => {
    await park(page);
    await page.evaluate((tick) => {
      (window as unknown as { __tc: { world: { state: { tick: number } } } }).__tc.world.state.tick = tick;
    }, 11 * TICKS_PER_HOUR + 4);
    await expect(page.getByTestId('hud-date')).toHaveText('11:00');
    const chip = page.getByTestId('day-pill');
    await expect(chip).not.toContainText('Mar');
    await expect(chip).toHaveAttribute('aria-label', 'Mar · Year 1 · 11:00');
    await expect(chip).toHaveAttribute('title', 'Mar · Year 1 · 11:00');
    // One weather icon (the forecast is in the weather button's name, title and press).
    await expect(page.locator('[data-testid="hud-weather"] .weather-now')).toBeVisible();
    await expect(page.locator('[data-testid="hud-weather"] .weather-next')).toBeHidden();
    await expect(page.getByTestId('hud-weather')).toHaveAccessibleName(/^Weather: \S/);
  });

  test('the turn-view button: a tap turns the view right, a hold turns it left; the keys still turn it', async ({ page }) => {
    const watch = watchErrors(page);
    await park(page);
    const turn = page.getByTestId('view-turn');
    await expect(turn).toHaveAccessibleName('Turn view; hold to turn the other way');
    await turn.tap();
    await expect.poll(() => rotation(page)).toBe('1');
    await turn.tap();
    await expect.poll(() => rotation(page)).toBe('2');
    // Hold about 700 ms: one turn to the left, and no turn to the right when the finger lifts.
    const b = await boxOf(page, 'view-turn');
    const cdp = await page.context().newCDPSession(page);
    const p = { x: b.left + b.width / 2, y: b.top + b.height / 2, id: 1 };
    await touch(cdp, 'touchStart', [p]);
    await page.waitForTimeout(700);
    await expect.poll(() => rotation(page)).toBe('1');
    await touch(cdp, 'touchEnd', []);
    await frames(page);
    await page.waitForTimeout(100);
    expect(await rotation(page)).toBe('1');
    // A tap after a hold turns right again.
    await turn.tap();
    await expect.poll(() => rotation(page)).toBe('2');
    await page.keyboard.press('[');
    await expect.poll(() => rotation(page)).toBe('1');
    await page.keyboard.press(']');
    await expect.poll(() => rotation(page)).toBe('2');
    watch.expectNoErrors();
  });

  test('Messages is in the Menu with the unread count; a dot on Menu while messages are unread; the item opens the messages panel', async ({ page }) => {
    const watch = watchErrors(page);
    await park(page);
    const menu = page.getByTestId('tool-menu');
    const dot = page.getByTestId('menu-dot');
    const read = await page.evaluate(() => {
      const m = (window as unknown as { __tc: { world: { state: { management: { messagesReadUpTo: number; nextMessageId: number } } } } }).__tc.world.state.management;
      m.messagesReadUpTo = m.nextMessageId - 1;
      return m.messagesReadUpTo;
    });
    expect(read).toBeGreaterThanOrEqual(0);
    await frames(page);
    await expect(dot).toBeHidden();
    await expect(menu).toHaveAccessibleName('Menu');
    await unread(page, 3);
    await expect(dot).toBeVisible();
    await expect(menu).toHaveAccessibleName('Menu, 3 unread messages');
    // The dot sits on the Menu button and is small.
    const d = await boxOf(page, 'menu-dot');
    const m = await boxOf(page, 'tool-menu');
    expect(d.width).toBeLessThanOrEqual(14);
    expect(d.left).toBeGreaterThanOrEqual(m.left - 4);
    expect(d.right).toBeLessThanOrEqual(m.right + 4);
    await menu.tap();
    const item = page.getByTestId('menu-messages');
    await expect(item).toBeVisible();
    await expect(item).toContainText('Messages');
    await expect(item).toContainText('3 unread');
    await item.tap();
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
    await expect(page.locator('.panel[data-kind=messages]')).toBeVisible();
    watch.expectNoErrors();
  });

  test('scenario: the objectives flag is in the Menu on the phone; the item opens the objectives', async ({ page }) => {
    const watch = watchErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByTestId('title-new').click();
    await page.getByTestId('title-scenarios').click();
    await page.getByTestId('scenario-card-meadow_start').click();
    await page.getByTestId('preset-standard').click();
    await page.getByTestId('scenario-start').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    await frames(page);
    await expect(page.getByTestId('hud-objectives')).toBeHidden();
    const boxes = await Promise.all(ROW.map((id) => boxOf(page, id)));
    for (let i = 1; i < boxes.length; i++) expect(oneRow(boxes[0]!, boxes[i]!), `${ROW[i]} on the line`).toBe(true);
    expect(await hudBottom(page)).toBeLessThanOrEqual(64);
    await page.getByTestId('tool-menu').tap();
    await page.getByTestId('menu-objectives').tap();
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
    await expect(page.getByTestId('objectives-panel')).toBeVisible();
    watch.expectNoErrors();
  });

  test('390 × 844 at 175% with en-XA: the row may wrap; nothing is clipped and every control can be reached', async ({ page }) => {
    await park(page);
    await unread(page, 2);
    await page.evaluate(() => {
      const s = (window as unknown as { __tc: { settings: { set(k: string, v: unknown): void } } }).__tc.settings;
      s.set('textScale', 175);
      s.set('locale', 'en-XA');
    });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-XA');
    await expect(page.locator('#ui')).toHaveAttribute('data-text-scale', '175');
    await frames(page);
    const problems = await page.evaluate(() => {
      const out: string[] = [];
      const hud = document.querySelector('#ui .hud') as HTMLElement;
      for (const el of hud.querySelectorAll<HTMLElement>('*')) {
        if (el.closest('[hidden], .sr-only')) continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (cs.display === 'none' || r.width === 0 || r.height === 0) continue;
        if (r.left < -1 || r.right > window.innerWidth + 1 || r.top < -1) out.push(`outside: ${el.className} ${Math.round(r.left)}..${Math.round(r.right)}`);
        if (el.children.length === 0 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && cs.overflowX !== 'visible') out.push(`clipped: ${el.className} "${el.textContent}"`);
      }
      const controls = [...hud.querySelectorAll<HTMLElement>('button')].filter((b) => !b.closest('[hidden]') && b.getBoundingClientRect().width > 0);
      for (const b of controls) {
        const r = b.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!top || !b.contains(top)) out.push(`not reachable: ${b.dataset.testid ?? b.getAttribute('aria-label')}`);
        if (r.width < 43.5 || r.height < 43.5) out.push(`small: ${b.dataset.testid ?? b.getAttribute('aria-label')}`);
      }
      return out;
    });
    expect(problems).toEqual([]);
    for (const id of ['status-pill', 'hud-balance', 'hud-weather', 'speed-toggle', 'view-turn', 'tool-menu', 'menu-dot']) {
      await expect(page.getByTestId(id), id).toBeInViewport();
    }
    // The Menu item and its count are not clipped either.
    await page.getByTestId('tool-menu').tap();
    const item = page.getByTestId('menu-messages');
    await expect(item).toBeInViewport();
    const cut = await item.evaluate((el) => [...el.querySelectorAll<HTMLElement>('*')].some((c) => c.scrollWidth > c.clientWidth + 1));
    expect(cut).toBe(false);
  });

  test('axe: the one-line top row and the Menu with Messages have no serious or critical issue', async ({ page }) => {
    await park(page);
    await unread(page, 3);
    await scan(page, 'one top row');
    await page.getByTestId('tool-menu').tap();
    await expect(page.getByTestId('menu-messages')).toBeVisible();
    await scan(page, 'menu with Messages');
  });
});
