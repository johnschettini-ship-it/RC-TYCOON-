/**
 * One compact top row on the phone (Phase 7 §4.1–4.3, Task 21): after the owner's test play the upright phone's top
 * region is one row (a slim status pill with cash and guests, the mood circle, the date chip, Menu). Base (before Task
 * 21, new park at 100%, 390 × 844): `--hud-bottom` 162 px. Task 24 put Pause or the Speed toggle and ONE turn-view
 * button into that row too (Messages moved into the Menu): `tests/e2e/single-top-row.spec.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { TICKS_PER_HOUR } from '../../src/data/tuning/core';
import { isPhone, newPark, scan, setSpeed, watchErrors } from './helpers';

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/** The `--hud-bottom` limit at 390 × 844 and 100% text (the base is 162 px). */
const HUD_BOTTOM_MAX = 120;

async function boxOf(page: Page, sel: string): Promise<Box> {
  return page.evaluate((s) => {
    const r = (document.querySelector(s) as HTMLElement).getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, sel);
}

/** Guests on the first path tile with these temperaments (Chill under 36, Family 36–64, Thrill from 65). */
async function addGuests(page: Page, temperaments: number[]): Promise<void> {
  await page.evaluate((list) => {
    const s = (window as unknown as { __tc: { world: { state: { map: { content: ArrayLike<number> }; guests: unknown[]; nextId: number } } } }).__tc.world.state;
    let tile = 0;
    for (let i = 0; i < s.map.content.length; i++) if (s.map.content[i] === 1) { tile = i; break; }
    for (const temperament of list) {
      const id = s.nextId++;
      s.guests.push({
        id, tile, z: 8, wetUntilTick: -1, nextTile: -1, progress: 0, dir: 0, lane: id % 4, state: 'walking', stateTicks: 0, target: null,
        cash: 8000, needs: { hunger: 40, thirst: 40, bladder: 20, energy: 230, happiness: 180, nausea: 0 },
        temperament, thoughts: [], thoughtCooldowns: {}, ridden: {}, spent: 0,
        items: { map: false, umbrella: false, balloon: false }, nextDecisionTick: 1e9, lostSinceTick: -1,
        noRideStreak: 0, seat: null, activityId: -1, trashTimer: 0, withdrawals: 0, lostSteps: 0, bestDistance: -1, lostTarget: null,
      });
    }
  }, temperaments);
}

async function park(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await newPark(page, 'Row Park');
  await expect(page.locator('#ui')).toHaveAttribute('data-layout', 'bottom');
  await expect(page.locator('#ui')).not.toHaveAttribute('data-low', /./);
}

/** Two boxes are on one row when each one's vertical middle lies inside the other. */
function oneRow(a: Box, b: Box): boolean {
  const am = (a.top + a.bottom) / 2;
  const bm = (b.top + b.bottom) / 2;
  return am > b.top && am < b.bottom && bm > a.top && bm < a.bottom;
}

test.describe('compact top row on the upright phone (Task 21)', () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(!isPhone(info), 'the upright phone layout');
  });

  test('390 × 844: the status pill, mood circle, date chip and Menu are one row with a plate of at most 52 px', async ({ page }) => {
    const watch = watchErrors(page);
    await park(page);
    const parts = ['[data-testid="status-pill"]', '[data-testid="hud-balance"]', '[data-testid="day-pill"]', '[data-testid="tool-menu"]'];
    const boxes = await Promise.all(parts.map((s) => boxOf(page, s)));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(oneRow(boxes[i]!, boxes[j]!), `${parts[i]} and ${parts[j]} on one row`).toBe(true);
    // Left to right, 8 px apart, inside the window.
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.left - boxes[i - 1]!.right, `gap before ${parts[i]}`).toBeGreaterThanOrEqual(7.9);
    expect(boxes[0]!.left).toBeGreaterThanOrEqual(0);
    expect(boxes[3]!.right).toBeLessThanOrEqual(390);
    expect(boxes[0]!.height, 'the plate of the row').toBeLessThanOrEqual(52);
    // Every control of the row is a 44 × 44 target (the chip's press area is its weather button).
    for (const s of ['[data-testid="status-pill"]', '[data-testid="hud-balance"]', '[data-testid="hud-weather"]', '[data-testid="tool-menu"]']) {
      const b = await boxOf(page, s);
      expect(b.width, s).toBeGreaterThanOrEqual(43.5);
      expect(b.height, s).toBeGreaterThanOrEqual(43.5);
    }
    // The pill shows cash and guests, no rating.
    await expect(page.getByTestId('hud-cash')).toBeVisible();
    await expect(page.getByTestId('hud-guests')).toBeVisible();
    await expect(page.getByTestId('hud-rating')).toBeHidden();
    // Whole dollars in the pill; the full value in its accessible name and title.
    await setSpeed(page, 'Pause', { tap: true });
    await page.evaluate(() => {
      (window as unknown as { __tc: { world: { state: { park: { cash: number } } } } }).__tc.world.state.park.cash = 1_499_445;
    });
    await expect(page.getByTestId('hud-cash')).toHaveText('$14,994');
    await expect(page.getByTestId('status-pill')).toHaveAccessibleName(/\$14,994\.45/);
    await expect(page.getByTestId('status-pill')).toHaveAttribute('title', /\$14,994\.45/);
    watch.expectNoErrors();
  });

  test('390 × 844: the top region ends lower on the screen than at the base (--hud-bottom at most 120 px, base 162)', async ({ page }) => {
    await park(page);
    await expect
      .poll(() => page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('ui') as HTMLElement).getPropertyValue('--hud-bottom'))))
      .toBeLessThanOrEqual(HUD_BOTTOM_MAX);
    // `--hud-bottom` is the bottom of the row (Task 24: one row): the legend strip and panels start below it.
    const hb = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('ui') as HTMLElement).getPropertyValue('--hud-bottom')));
    const menu = await boxOf(page, '[data-testid="tool-menu"]');
    expect(Math.abs(hb - Math.ceil(menu.bottom))).toBeLessThanOrEqual(1);
  });

  test('the mood circle is a 44 × 44 round button in the leading colour with its share as text (no face since Task 23)', async ({ page }) => {
    await park(page);
    // 4 Chill, 3 Family, 3 Thrill: Chill leads with 40%.
    await addGuests(page, [20, 20, 20, 20, 50, 50, 50, 80, 80, 80]);
    const circle = page.getByTestId('hud-balance');
    await expect(circle).toHaveAttribute('aria-label', /40% Chill/);
    const b = await boxOf(page, '[data-testid="hud-balance"]');
    expect(Math.abs(b.width - 44), `width ${b.width}`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(b.height - 44), `height ${b.height}`).toBeLessThanOrEqual(0.5);
    const look = await circle.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { radius: parseFloat(cs.borderTopLeftRadius), canvases: el.querySelectorAll('canvas').length };
    });
    expect(look.radius, 'round').toBeGreaterThanOrEqual(22);
    expect(look.canvases, 'no face').toBe(0);
    await expect(circle).toHaveAttribute('data-group', 'chill');
    await expect(page.getByTestId('mood-count')).toHaveText('40%');
    await expect(page.getByTestId('mood-count')).toBeVisible();
    // The bar's track is not shown on the phone.
    await expect(page.locator('.mood-track')).toBeHidden();
    // 2 more Thrill (5 of 12): Thrill leads with 42%.
    await addGuests(page, [80, 80]);
    await expect(page.getByTestId('mood-count')).toHaveText('42%');
    await expect(circle).toHaveAttribute('data-group', 'thrill');
  });

  test('a press on the mood circle toggles the Temperament overlay; its name holds the three percents, the lean and the rating', async ({ page }) => {
    await park(page);
    await addGuests(page, [20, 20, 20, 20, 50, 50, 50, 80, 80, 80]);
    const circle = page.getByTestId('hud-balance');
    const rating = await page.evaluate(() => (window as unknown as { __tc: { world: { state: { park: { rating: number } } } } }).__tc.world.state.park.rating);
    const name = new RegExp(`40% Chill, 30% Family, 30% Thrill.*The park leans to Chill.*Park rating ${rating}`);
    await expect(circle).toHaveAttribute('aria-label', name);
    await expect(circle).toHaveAttribute('title', name);
    const overlay = () => page.evaluate(() => (window as unknown as { __tc: { tool: { overlay: string } } }).__tc.tool.overlay);
    await circle.tap();
    await expect(circle).toHaveAttribute('aria-pressed', 'true');
    expect(await overlay()).toBe('temperament');
    // The legend strip sits under the region (below the row).
    const strip = await boxOf(page, '[data-testid="overlay-legend"]');
    const menu = await boxOf(page, '[data-testid="tool-menu"]');
    expect(strip.top).toBeGreaterThanOrEqual(menu.bottom);
    await circle.tap();
    await expect(circle).toHaveAttribute('aria-pressed', 'false');
    expect(await overlay()).toBe('none');
  });

  test('the date chip shows the hour without the month and year (Task 24); its name holds them; the weather press shows the forecast', async ({ page }) => {
    await park(page);
    await setSpeed(page, 'Pause', { tap: true });
    await page.evaluate((tick) => {
      (window as unknown as { __tc: { world: { state: { tick: number } } } }).__tc.world.state.tick = tick;
    }, 9 * TICKS_PER_HOUR + 4);
    await expect(page.getByTestId('hud-date')).toHaveText('09:00');
    await expect(page.getByTestId('day-pill')).not.toContainText('Year');
    await expect(page.getByTestId('day-pill')).not.toContainText('Mar');
    await expect(page.getByTestId('day-pill')).toHaveAttribute('aria-label', 'Mar · Year 1 · 09:00');
    await expect(page.getByTestId('day-pill')).toHaveAttribute('title', 'Mar · Year 1 · 09:00');
    const weather = page.getByTestId('hud-weather');
    await weather.tap();
    await expect(page.getByTestId('toast')).toHaveText((await weather.getAttribute('title')) ?? 'missing');
  });

  test('Pause, the turn-view button and Menu are at the right end of the row (Task 24), 44 × 44 and 8 px apart; a press between them reaches the map', async ({ page }) => {
    await park(page);
    const row = await boxOf(page, '[data-testid="status-pill"]');
    const ids = ['speed-toggle', 'view-turn', 'tool-menu'];
    const boxes = await Promise.all(ids.map((id) => boxOf(page, `[data-testid="${id}"]`)));
    boxes.forEach((b, i) => {
      expect(Math.abs(b.height - 44), ids[i]).toBeLessThanOrEqual(0.5);
      expect(b.width, ids[i]).toBeGreaterThanOrEqual(43.5);
      if (i > 0) expect(Math.abs(b.width - 44), ids[i]).toBeLessThanOrEqual(0.5);
      expect(oneRow(b, row), `${ids[i]} on the row`).toBe(true);
      if (i > 0) {
        const gap = b.left - boxes[i - 1]!.right;
        expect(gap, `gap before ${ids[i]}`).toBeGreaterThanOrEqual(7.9);
        expect(gap, `gap before ${ids[i]}`).toBeLessThanOrEqual(8.5);
      }
    });
    // At the right edge (8 px side gutter).
    expect(Math.abs(boxes[2]!.right - (390 - 8))).toBeLessThanOrEqual(1);
    // No plate: a press in each gap between them, and left of them (after the chip), reaches the canvas.
    const chip = await boxOf(page, '[data-testid="day-pill"]');
    const points = boxes.slice(1).map((b, i) => ({ x: (boxes[i]!.right + b.left) / 2, y: (b.top + b.bottom) / 2 }));
    points.push({ x: (chip.right + boxes[0]!.left) / 2, y: (boxes[0]!.top + boxes[0]!.bottom) / 2 });
    for (const p of points) {
      expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, p), `${p.x},${p.y}`).toBe('game');
    }
    // Messages (a Menu item since Task 24) opens its panel.
    await page.getByTestId('tool-menu').tap();
    await page.getByTestId('menu-messages').tap();
    await expect(page.locator('.panel[data-kind=messages]')).toBeVisible();
  });

  test('390 × 844 at 175% with en-XA: nothing in the top region is clipped and every control can be reached', async ({ page }) => {
    await park(page);
    await addGuests(page, [20, 20, 50, 80]);
    await page.evaluate(() => {
      const s = (window as unknown as { __tc: { settings: { set(k: string, v: unknown): void } } }).__tc.settings;
      s.set('textScale', 175);
      s.set('locale', 'en-XA');
    });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-XA');
    await expect(page.locator('#ui')).toHaveAttribute('data-text-scale', '175');
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
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
      // Every control: a press at its centre reaches it, and no two controls overlap.
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
    for (const id of ['status-pill', 'hud-balance', 'hud-weather', 'tool-menu', 'speed-toggle', 'view-turn']) {
      await expect(page.getByTestId(id), id).toBeInViewport();
    }
  });

  test('axe: the compact top row has no serious or critical issue', async ({ page }) => {
    await park(page);
    await addGuests(page, [20, 50, 80]);
    await scan(page, 'compact top row');
    await page.getByTestId('hud-balance').tap();
    await scan(page, 'compact top row, Temperament on');
  });
});
