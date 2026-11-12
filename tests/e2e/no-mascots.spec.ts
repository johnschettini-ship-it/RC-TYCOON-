/**
 * No mascots (Task 23, owner decision 2026-11-12): the owner scrapped Frost and Spark. The interface shows no mascot
 * face: the top region (phone, low layout, desktop), the tip bubble, the tutorial, the scenario intro, award toasts and
 * the end screen hold no mascot canvas and name no speaker. The phone's mood circle is a plain round button in the
 * leading group's colour with its share as large text.
 */
import { expect, test, type Page } from '@playwright/test';
import { isPhone, newPark, scan } from './helpers';

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

/** The number of canvases inside the element(s) a selector finds (a mascot face was a canvas). */
function canvasesIn(page: Page, sel: string): Promise<number> {
  return page.evaluate((s) => [...document.querySelectorAll(s)].reduce((n, el) => n + el.querySelectorAll('canvas').length, 0), sel);
}

async function frames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

test('the top region holds no mascot face (phone, low layout, desktop) and no speaker', async ({ page }, info) => {
  if (isPhone(info)) await page.setViewportSize({ width: 390, height: 844 });
  await newPark(page, 'Plain Park');
  await addGuests(page, [20, 20, 20, 20, 50, 50, 50, 80, 80, 80]);
  await expect(page.getByTestId('hud-balance')).toHaveAttribute('aria-label', /40% Chill/);
  await page.waitForTimeout(600);
  expect(await canvasesIn(page, '#ui .hud'), 'top region').toBe(0);
  await expect(page.locator('.mood-face, .mood-lead')).toHaveCount(0);
  if (isPhone(info)) {
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#ui')).toHaveAttribute('data-low', '1');
    await page.waitForTimeout(600);
    expect(await canvasesIn(page, '#ui .hud'), 'low layout top region').toBe(0);
    await expect(page.locator('.mood-track')).toBeVisible();
  }
});

test('the desktop and low layout mood bar: the track takes the width the faces had', async ({ page }, info) => {
  if (isPhone(info)) {
    await page.setViewportSize({ width: 844, height: 390 });
  }
  await newPark(page, 'Plain Park');
  if (isPhone(info)) await expect(page.locator('#ui')).toHaveAttribute('data-low', '1');
  const m = await page.evaluate(() => {
    const bar = (document.querySelector('[data-testid="hud-balance"]') as HTMLElement).getBoundingClientRect();
    const track = (document.querySelector('.mood-track') as HTMLElement).getBoundingClientRect();
    return { bar: bar.width, track: track.width, left: track.left - bar.left, right: bar.right - track.right };
  });
  // Only the plate's padding and outline remain on each side of the track.
  expect(m.left, 'room left of the track').toBeLessThanOrEqual(14);
  expect(m.right, 'room right of the track').toBeLessThanOrEqual(14);
});

test.describe('the phone mood circle (Task 23)', () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(!isPhone(info), 'the upright phone layout');
  });

  test('a plain 44 × 44 round button in the leading colour with its share as large text; it toggles the overlay; its name holds the mix', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await newPark(page, 'Plain Park');
    await addGuests(page, [20, 20, 20, 20, 50, 50, 50, 80, 80, 80]);
    const circle = page.getByTestId('hud-balance');
    const rating = await page.evaluate(() => (window as unknown as { __tc: { world: { state: { park: { rating: number } } } } }).__tc.world.state.park.rating);
    await expect(circle).toHaveAttribute('aria-label', new RegExp(`40% Chill, 30% Family, 30% Thrill.*The park leans to Chill.*Park rating ${rating}`));
    const count = page.getByTestId('mood-count');
    await expect(count).toHaveText('40%');
    await expect(count).toBeVisible();
    const look = await circle.evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const c = el.querySelector('[data-testid="mood-count"]') as HTMLElement;
      const cr = c.getBoundingClientRect();
      const probe = document.createElement('i');
      probe.style.color = 'var(--accent-chill)';
      el.append(probe);
      const chill = getComputedStyle(probe).color;
      probe.remove();
      return {
        w: r.width, h: r.height, radius: parseFloat(cs.borderTopLeftRadius), bg: cs.backgroundColor, chill,
        font: parseFloat(getComputedStyle(c).fontSize), inside: cr.left >= r.left && cr.right <= r.right && cr.top >= r.top && cr.bottom <= r.bottom,
      };
    });
    expect(Math.abs(look.w - 44), `width ${look.w}`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(look.h - 44), `height ${look.h}`).toBeLessThanOrEqual(0.5);
    expect(look.radius, 'round').toBeGreaterThanOrEqual(22);
    expect(look.bg, 'the leading group colour').toBe(look.chill);
    expect(look.font, 'large text').toBeGreaterThanOrEqual(14);
    expect(look.inside, 'the share is inside the circle (no badge)').toBe(true);
    // Thrill leads: the circle takes the Thrill colour.
    await addGuests(page, [80, 80]);
    await expect(count).toHaveText('42%');
    await expect(circle).toHaveAttribute('data-group', 'thrill');
    await circle.tap();
    await expect(circle).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => (window as unknown as { __tc: { tool: { overlay: string } } }).__tc.tool.overlay)).toBe('temperament');
    await circle.tap();
    await expect(circle).toHaveAttribute('aria-pressed', 'false');
  });

  test('with no guests the circle shows the Temperament icon, no share', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await newPark(page, 'Plain Park');
    const circle = page.getByTestId('hud-balance');
    await expect(circle).toHaveAttribute('aria-label', /No guests yet/);
    await expect(page.getByTestId('mood-count')).toBeHidden();
    await expect(circle.locator('svg.icon')).toBeVisible();
    expect(await canvasesIn(page, '[data-testid="hud-balance"]')).toBe(0);
  });
});

test('an open tip has no face and no speaker; its text and button stay', async ({ page }, info) => {
  if (isPhone(info)) await page.setViewportSize({ width: 390, height: 844 });
  await newPark(page, 'Plain Park');
  const tip = page.getByTestId('tip');
  await expect(tip).toHaveAttribute('data-tip', 'noRide', { timeout: 4000 });
  await expect(tip).toBeVisible();
  expect(await canvasesIn(page, '[data-testid="tip"]')).toBe(0);
  await expect(tip.locator('.tip-art')).toHaveCount(0);
  await expect(tip).not.toHaveAttribute('data-speaker', /./);
  await expect(tip).toHaveAttribute('aria-label', 'Tip');
  await expect(page.getByTestId('tip-text')).toHaveText('Build a ride and open it. Guests come for rides');
  await expect(page.getByTestId('tip-action')).toHaveText('Show rides');
  await scan(page, 'top region and a tip');
});

test('390 × 844 at 175% with en-XA: the tip and the mood circle are not clipped', async ({ page }, info) => {
  test.skip(!isPhone(info), 'the phone layout');
  await page.setViewportSize({ width: 390, height: 844 });
  await newPark(page, 'Plain Park');
  await addGuests(page, [20, 20, 20, 80]);
  await expect(page.getByTestId('tip')).toBeVisible({ timeout: 4000 });
  await page.evaluate(() => {
    const s = (window as unknown as { __tc: { settings: { set(k: string, v: unknown): void } } }).__tc.settings;
    s.set('textScale', 175);
    s.set('locale', 'en-XA');
  });
  await expect(page.locator('#ui')).toHaveAttribute('data-text-scale', '175');
  await page.waitForTimeout(600);
  await frames(page);
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    for (const root of document.querySelectorAll<HTMLElement>('[data-testid="tip"], [data-testid="hud-balance"]')) {
      const box = root.getBoundingClientRect();
      if (box.left < -1 || box.right > window.innerWidth + 1) out.push(`outside: ${root.dataset.testid}`);
      for (const el of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
        if (el.closest('[hidden]')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > box.right + 1 || r.left < box.left - 1 || r.bottom > box.bottom + 1 || r.top < box.top - 1) out.push(`sticks out: ${el.className}`);
        if (el.children.length === 0 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) out.push(`clipped: ${el.className} "${el.textContent}"`);
      }
    }
    return out;
  });
  expect(problems).toEqual([]);
});

test('the tutorial: no face and no speaker name in its first steps; every text and button stays', async ({ page }, info) => {
  await page.goto('/');
  const press = (id: string) => (isPhone(info) ? page.getByTestId(id).tap() : page.getByTestId(id).click());
  await press('title-new');
  await expect(page.getByTestId('title-tutorial')).toContainText('Learn the basics step by step');
  await press('title-tutorial');
  const bubble = page.getByTestId('tutorial-bubble');
  await expect(bubble).toBeVisible();
  await expect(page.getByTestId('tutorial-title')).toHaveText('Welcome to Thrills & Chills');
  await expect(page.getByTestId('tutorial-hint')).toHaveText('Let us build a park for Thrill and Chill guests together');
  await expect(page.getByTestId('tutorial-step')).toHaveText('Step 1 of 16');
  expect(await canvasesIn(page, '[data-testid="tutorial-bubble"]')).toBe(0);
  await expect(page.getByTestId('tutorial-guide')).toHaveCount(0);
  await expect(bubble).not.toHaveAttribute('data-guide', /./);
  await expect(page.getByTestId('tutorial-next')).toBeVisible();
  await expect(page.getByTestId('tutorial-skip-all')).toBeVisible();
  await press('tutorial-next');
  await expect(page.getByTestId('tutorial-title')).toHaveText('Move the view');
  expect(await canvasesIn(page, '[data-testid="tutorial-bubble"]')).toBe(0);
  await expect(page.getByTestId('tutorial-skip-step')).toBeVisible();
  await scan(page, 'tutorial step 2');
});

test('a scenario intro, an award toast and the end screen show no mascot', async ({ page }, info) => {
  test.skip(isPhone(info), 'desktop flow');
  await page.goto('/');
  await page.getByTestId('title-new').click();
  await page.getByTestId('title-scenarios').click();
  await page.getByTestId('scenario-card-meadow_start').click();
  await expect(page.getByTestId('scenario-detail')).toBeVisible();
  expect(await canvasesIn(page, '[data-testid="scenario-detail"]'), 'scenario intro').toBe(0);
  await page.getByTestId('scenario-start').click();
  await expect(page.locator('.title-screen')).toBeHidden();
  await page.evaluate(() => {
    const g = (window as unknown as { __tc: { world: { events: unknown[] } } }).__tc;
    g.world.events.push({ type: 'award', id: 'thrillSeekersChoice', positive: true, monthIndex: 0 });
  });
  const toast = page.getByTestId('award-toast');
  await expect(toast).toContainText("Award: Thrill Seekers' Choice!");
  expect(await canvasesIn(page, '[data-testid="award-toast"]'), 'award toast').toBe(0);
  await page.evaluate(() => {
    const g = (window as unknown as { __tc: { world: { state: { scenario: unknown }; events: unknown[] } } }).__tc;
    Object.assign(g.world.state.scenario as object, { status: 'lost', endReason: 'timeUp', endMonthIndex: 11 });
    g.world.events.push({ type: 'scenarioEnded', status: 'lost', reason: 'timeUp', monthIndex: 11 });
  });
  const end = page.getByTestId('end-screen');
  await expect(end).toBeVisible();
  expect(await canvasesIn(page, '[data-testid="end-screen"]'), 'end screen').toBe(0);
  await expect(page.getByTestId('end-facts')).toBeVisible();
});
