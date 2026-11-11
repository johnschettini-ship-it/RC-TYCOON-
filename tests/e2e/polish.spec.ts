/**
 * Polish of player-visible faults found in review (Phase 7, Task 13b): the tip and the overlay legend, the zone name
 * of a held card, research messages, keyboard holds of tool cards, the build toast and the tool status bar, the show
 * picker, the station builder at large text, the path height bar, and the focus after the tip closes.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { centerOn, isPhone, newPark, openTool, pickCard, tilePoint } from './helpers';

const tc = <T>(page: Page, f: string): Promise<T> => page.evaluate(`(() => { const g = window.__tc; return ${f}; })()`) as Promise<T>;

/** Sets the text scale setting and waits until the UI has it. */
async function textScale(page: Page, scale: 100 | 175): Promise<void> {
  await tc(page, `g.settings.set('textScale', ${scale})`);
  await expect(page.locator('#ui')).toHaveAttribute('data-text-scale', String(scale));
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** The boxes share an area (edges that touch do not count). */
const intersects = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function boxOf(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}

/** Press Tab until the focused element is `target`. */
async function tabTo(page: Page, target: Locator, max = 120): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Tab never reached the target');
}

test.beforeEach(async ({ page }) => newPark(page, 'Polish Park'));

test('an overlay or the open overlay chip row hides the tip; the tip comes back after', async ({ page }) => {
  const tip = page.getByTestId('tip');
  await expect(tip).toHaveAttribute('data-tip', 'noRide', { timeout: 4000 });
  await expect(tip).toBeVisible();
  const mood = page.locator('[data-tool="temperament"]');
  await mood.click();
  await expect(page.getByTestId('overlay-legend')).toBeVisible();
  await expect(tip).toBeHidden();
  await mood.click();
  await expect(page.getByTestId('overlay-legend')).toBeHidden();
  await expect(tip).toBeVisible();
  // The chip row on its own (no overlay on yet).
  await openTool(page, 'overlays');
  await expect(page.getByTestId('overlay-chips')).toBeVisible();
  await expect(tip).toBeHidden();
  await page.getByTestId('overlay-close').click();
  await expect(page.getByTestId('overlay-chips')).toBeHidden();
  await expect(tip).toBeVisible();
});

for (const scale of [100, 175] as const) {
  test(`desktop, ${scale}% text: the zone name stays readable while the first card of its zone is held`, async ({ page }) => {
    test.skip(isPhone(test.info()), 'desktop layout');
    await textScale(page, scale);
    const first = await tc<string>(page, `document.querySelector('.hand-group[data-zone="family"] .content-card').dataset.def`);
    await pickCard(page, 'flat', first);
    const wrap = page.locator('.hand .card-wrap.held');
    const back = page.getByTestId('card-put-back');
    await expect(back).toBeVisible();
    // The rise is a 120 ms transition.
    await page.waitForTimeout(300);
    const label = await boxOf(page.locator('[data-testid="hand"] .hand-zone[data-zone="family"]'));
    expect(intersects(label, await boxOf(wrap)), 'zone name and held card').toBe(false);
    expect(intersects(label, await boxOf(back)), 'zone name and Put back').toBe(false);
  });
}

/** Unlocks a ride (debug hook) and waits for its card in the hand; the strip then scrolls back to its first card. */
async function unlockFar(page: Page, id: string): Promise<Locator> {
  await page.evaluate((r) => (window as unknown as { __tc: { world: { state: { management: { research: { unlocked: string[] } } } } } }).__tc.world.state.management.research.unlocked.push(r), id);
  const card = page.getByTestId(`card-${id}`);
  await expect(card).toHaveCount(1, { timeout: 4000 });
  await page.locator('[data-testid="hand"] .hand-scroll').evaluate((el) => {
    el.scrollLeft = 0;
  });
  return card;
}

/** The card lies inside the visible box of the hand's strip. */
const inHandView = (card: Locator): Promise<boolean> =>
  card.evaluate((el) => {
    const s = (el.closest('.hand-scroll') as HTMLElement).getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return r.left >= s.left - 0.5 && r.right <= s.right + 0.5;
  });

/** Posts the research message of a new ride and opens the Messages panel from another deck. */
async function researchMessage(page: Page, id: string, name: string): Promise<void> {
  await page.evaluate(([itemId, n]) => {
    const g = (window as unknown as { __tc: { world: { state: { tick: number; management: { nextMessageId: number; messages: unknown[] } } } } }).__tc;
    const m = g.world.state.management;
    m.messages.push({ id: m.nextMessageId, tick: g.world.state.tick, category: 'research', textId: 'msg.research.newRide', params: { itemId, name: n }, tile: -1, entityId: -1 });
    m.nextMessageId += 1;
  }, [id, name] as const);
  await page.getByTestId('deck-paths').click();
  await openTool(page, 'messages');
  await expect(page.locator('.panel-title')).toHaveText(/Messages/);
}

/** The focused element, as a test id or tag and classes. */
const focusedName = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return a ? a.dataset.testid ?? `${a.tagName}.${a.className}` : 'none';
  });

test('a research message opens its deck, closes the Messages panel, and shows the new card (Ruling P)', async ({ page }) => {
  // The Gyro Globe card lies at the far end of the strip, out of view while the strip shows its first card.
  const card = await unlockFar(page, 'gyro_globe');
  expect(await inHandView(card), 'the card starts out of view').toBe(false);
  await researchMessage(page, 'gyro_globe', 'Gyro Globe');
  const before = await focusedName(page);
  await page.getByTestId('message-row').first().click();
  await expect(page.locator('.panel')).toBeHidden();
  await expect(page.getByTestId('hand')).toHaveAttribute('data-deck', 'rides');
  await expect(page.getByTestId('hand')).toBeVisible();
  await expect.poll(() => inHandView(card), 'the card is in the hand\'s visible box').toBe(true);
  // With a pointer the focus does not move (and never goes to the card).
  await expect(card).not.toBeFocused();
  expect(await focusedName(page)).toBe(before);
  if (isPhone(test.info())) return;
  // With the keyboard (desktop) the focus moves to the new card.
  const next = await unlockFar(page, 'drop_tower');
  expect(await inHandView(next), 'the second card starts out of view').toBe(false);
  await researchMessage(page, 'drop_tower', 'Drop Tower');
  await tabTo(page, page.getByTestId('message-row').first());
  await page.keyboard.press('Enter');
  await expect(page.locator('.panel')).toBeHidden();
  await expect(next).toBeFocused();
  expect(await inHandView(next), 'the second card is in the hand\'s visible box').toBe(true);
});

test('desktop, keyboard only: a tool card held with Enter gives up focus, so the map cursor builds with Enter', async ({ page }) => {
  test.skip(isPhone(test.info()), 'keyboard play is a desktop check');
  const deck = page.getByTestId('deck-paths');
  await tabTo(page, deck);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('hand')).toHaveAttribute('data-deck', 'paths');
  await tabTo(page, page.getByTestId('tool-footpath'));
  await page.keyboard.press('Enter');
  await expect.poll(() => tc<string>(page, 'g.tool.tool')).toBe('footpath');
  await page.keyboard.press('c');
  const line = page.getByTestId('cursor-line');
  await expect(line).toHaveText(/^Tile \d+, \d+: grass$/);
  const m = /(\d+), (\d+)/.exec((await line.textContent()) ?? '');
  const tile = Number(m?.[2]) * 64 + Number(m?.[1]);
  await page.keyboard.press('Enter');
  await expect.poll(() => tc<number>(page, `g.world.state.map.content[${tile}]`)).toBe(1);
  expect(await tc<string>(page, 'g.tool.tool')).toBe('footpath');
});

test('desktop, 175% text: the build toast does not cover the tool status bar', async ({ page }) => {
  test.skip(isPhone(test.info()), 'desktop layout');
  await textScale(page, 175);
  await pickCard(page, 'flat', 'carousel');
  await centerOn(page, 31, 56);
  // At 175% text the tool status bar lies over the middle of the screen: the tile goes to the free map above it.
  await page.evaluate(() => {
    const g = (window as unknown as { __tc: { camera: { centerY: number; zoom: number } } }).__tc;
    g.camera.centerY += 180 / g.camera.zoom;
  });
  const p = await tilePoint(page, 31, 56);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => tc<number>(page, 'g.world.state.rides.length')).toBe(1);
  const toast = page.locator('button.toast');
  await expect(toast).toBeVisible();
  const status = page.locator('div.tool-status:has([data-testid="tool-status"])');
  await expect(status).toBeVisible();
  expect(intersects(await boxOf(toast), await boxOf(status))).toBe(false);
});

test('phone, 175% text: no part of a show card leaves the card', async ({ page }) => {
  test.skip(!isPhone(test.info()), 'phone layout');
  await textScale(page, 175);
  await openTool(page, 'shows');
  const cards = page.locator('.shw-card');
  await expect(cards.first()).toBeVisible();
  const out = await cards.evaluateAll((els) =>
    els.flatMap((card) => {
      const c = card.getBoundingClientRect();
      return [...card.children].flatMap((child) => {
        const r = child.getBoundingClientRect();
        const inside = r.left >= c.left - 0.5 && r.right <= c.right + 0.5 && r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5;
        return inside ? [] : [`${(card as HTMLElement).dataset.def}: ${child.className || child.tagName}`];
      });
    }),
  );
  expect(out).toEqual([]);
});

test('175% text: every control of the station builder can be scrolled into view', async ({ page }) => {
  await textScale(page, 175);
  await pickCard(page, 'track', 'junior_coaster');
  await expect(page.getByTestId('track-builder')).toBeVisible();
  const confirm = page.getByTestId('track-confirm');
  await confirm.scrollIntoViewIfNeeded();
  const b = await boxOf(confirm);
  const view = page.viewportSize()!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(view.width);
  expect(b.y + b.height).toBeLessThanOrEqual(view.height);
  // Nothing of the interface lies over it: a press reaches it.
  const hit = await confirm.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top !== null && el.contains(top);
  });
  expect(hit).toBe(true);
});

test('phone, 175% text: the path height bar sits above the tool status bar', async ({ page }) => {
  test.skip(!isPhone(test.info()), 'phone layout');
  await textScale(page, 175);
  await openTool(page, 'footpath');
  const bar = page.getByTestId('path-height-bar');
  const status = page.locator('div.tool-status:has([data-testid="tool-status"])');
  await expect(bar).toBeVisible();
  await expect(status).toBeVisible();
  expect(intersects(await boxOf(bar), await boxOf(status))).toBe(false);
});

test('desktop, keyboard only: Close of the tip keeps the focus on the page', async ({ page }) => {
  test.skip(isPhone(test.info()), 'keyboard check');
  const tip = page.getByTestId('tip');
  await expect(tip).toBeVisible({ timeout: 4000 });
  await tabTo(page, page.getByTestId('tip-close'));
  await page.keyboard.press('Enter');
  await expect(tip).toBeHidden();
  const where = await page.evaluate(() => {
    const a = document.activeElement;
    return { body: a === null || a === document.body, inTip: a !== null && (document.querySelector('[data-testid="tip"]')?.contains(a) ?? false) };
  });
  expect(where).toEqual({ body: false, inTip: false });
});
