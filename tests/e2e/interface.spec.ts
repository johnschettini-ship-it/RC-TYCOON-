import { expect, test, type Page } from '@playwright/test';
import { newPark, pickCard } from './helpers';

test('the game loads the bundled font and asks no other host for anything', async ({ page, baseURL }) => {
  const foreign: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.origin !== new URL(baseURL as string).origin) foreign.push(r.url());
  });
  await newPark(page);
  const loaded = await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'Fredoka' && f.status === 'loaded'));
  expect(loaded).toBe(true);
  expect(foreign).toEqual([]);
});

test('the mood bar names the balance and toggles the Temperament overlay', async ({ page }, info) => {
  await newPark(page);
  const bar = page.getByTestId('hud-balance');
  if (info.project.name === 'phone') {
    // The upright phone's mood circle (Task 21): the name and the title also hold the park rating.
    const rating = await page.evaluate(() => (window as unknown as { __tc: { world: { state: { park: { rating: number } } } } }).__tc.world.state.park.rating);
    const name = `Thrill/Chill balance: no guests yet, No guests yet, Park rating ${rating}`;
    await expect(bar).toHaveAttribute('aria-label', name);
    await expect(bar).toHaveAttribute('title', name);
  } else {
    await expect(bar).toHaveAttribute('aria-label', 'Thrill/Chill balance: no guests yet, No guests yet');
    // The lean text is the title (Task 18: no lean line under the track).
    await expect(bar).toHaveAttribute('title', 'No guests yet');
  }
  const overlay = () => page.evaluate(() => (window as unknown as { __tc: { tool: { overlay: string } } }).__tc.tool.overlay);
  await bar.click();
  await expect(bar).toHaveAttribute('aria-pressed', 'true');
  expect(await overlay()).toBe('temperament');
  await bar.click();
  await expect(bar).toHaveAttribute('aria-pressed', 'false');
  expect(await overlay()).toBe('none');
});

test('with the hand open on the phone, the free map area is at least 45% of the screen height', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await page.setViewportSize({ width: 390, height: 844 });
  await newPark(page);
  await expect(page.getByTestId('hand')).toBeVisible();
  const free = await page.evaluate(() => {
    const css = getComputedStyle(document.getElementById('ui') as HTMLElement);
    return window.innerHeight - parseFloat(css.getPropertyValue('--hud-bottom')) - parseFloat(css.getPropertyValue('--toolbar-space'));
  });
  expect(free).toBeGreaterThanOrEqual(0.45 * 844);
});

test('the mood bar and the weather button have a name before the first frame', async ({ page }) => {
  // No frame runs: the names must come from the creation of the buttons, not from their first update.
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
  });
  await page.goto('/');
  await expect(page.getByTestId('title-new')).toBeVisible();
  await expect(page.getByTestId('hud-balance')).toHaveAttribute('aria-label', 'Thrill/Chill balance: no guests yet, No guests yet');
  await expect(page.getByTestId('hud-weather')).toHaveAttribute('aria-label', /^Weather: \S/);
});

test('at 30/40/30 the mood bar segments keep the guest mix in proportion while a percentage moves beside the knot', async ({ page }, info) => {
  await newPark(page);
  await page.evaluate(() => {
    const g = (window as unknown as { __tc: { paused: boolean; world: { state: { map: { content: ArrayLike<number> }; guests: unknown[]; nextId: number } } } }).__tc;
    const s = g.world.state;
    let tile = 0;
    for (let i = 0; i < s.map.content.length; i++) if (s.map.content[i] === 1) { tile = i; break; }
    // 3 Chill, 4 Family, 3 Thrill: 30/40/30, the knot at 50% lies on the Family percentage.
    for (const temperament of [20, 20, 20, 50, 50, 50, 50, 80, 80, 80]) {
      const id = s.nextId++;
      s.guests.push({
        id, tile, z: 8, wetUntilTick: -1, nextTile: -1, progress: 0, dir: 0, lane: id % 4, state: 'walking', stateTicks: 0, target: null,
        cash: 8000, needs: { hunger: 40, thirst: 40, bladder: 20, energy: 230, happiness: 180, nausea: 0 },
        temperament, thoughts: [], thoughtCooldowns: {}, ridden: {}, spent: 0,
        items: { map: false, umbrella: false, balloon: false }, nextDecisionTick: 1e9, lostSinceTick: -1,
        noRideStreak: 0, seat: null, activityId: -1, trashTimer: 0, withdrawals: 0, lostSteps: 0, bestDistance: -1, lostTarget: null,
      });
    }
  });
  const bar = page.getByTestId('hud-balance');
  await expect(bar).toHaveAttribute('aria-label', /30% Chill/);
  if (info.project.name === 'phone') {
    // The upright phone shows the mood circle (Task 21): Family leads with 40%; the track is not shown. The phone's bar
    // is in the low layout now: its segments are checked there.
    await expect(page.getByTestId('mood-count')).toHaveText('40');
    await expect(bar.locator('.mood-lead')).toHaveAttribute('data-face', /^(both|frost|spark)$/);
    await expect(page.locator('.mood-track')).toBeHidden();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#ui')).toHaveAttribute('data-low', '1');
    await expect.poll(() => page.evaluate(() => (document.querySelector('.seg-family') as HTMLElement).style.flexGrow)).toBe('40');
  }
  const m = await page.evaluate(() => {
    const track = document.querySelector('.mood-track') as HTMLElement;
    const inner = track.clientWidth;
    const segs = [...track.querySelectorAll<HTMLElement>('.seg')].map((s) => s.getBoundingClientRect());
    const knot = (track.querySelector('.mood-knot') as HTMLElement).getBoundingClientRect();
    const family = track.querySelector('.seg-family') as HTMLElement;
    const r = document.createRange();
    r.selectNodeContents(family);
    const text = r.getBoundingClientRect();
    return { inner, widths: segs.map((s) => s.width), familyEdge: segs[1]!.left, knotLeft: knot.left, knotRight: knot.right, text: { left: text.left, right: text.right }, label: family.textContent };
  });
  expect(Math.abs(m.widths[0]! - 0.3 * m.inner)).toBeLessThanOrEqual(1);
  expect(Math.abs(m.widths[1]! - 0.4 * m.inner)).toBeLessThanOrEqual(1);
  expect(Math.abs(m.widths[2]! - 0.3 * m.inner)).toBeLessThanOrEqual(1);
  // The phone shows no percentages in the segments (Task 18); the name keeps them.
  if (info.project.name === 'phone') {
    expect(m.label).toBe('');
    return;
  }
  expect(m.label).toBe('40%');
  // The knot sits at the middle (50%), and the Family percentage is clear of it.
  expect(m.text.right <= m.knotLeft || m.text.left >= m.knotRight).toBe(true);
});

/**
 * Controls of the top region, the deck list, and the hand that are smaller than 44 × 44 px or closer than 8 px to
 * another control, and text that its own box cuts off (spec §4.10, Phase 6 §4.7).
 */
async function regionProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const roots = [...document.querySelectorAll<HTMLElement>('#ui .hud, #ui .decks')];
    const shown = (el: Element): boolean => {
      if (el.closest('[hidden], .sr-only') || el.getAttribute('aria-hidden') === 'true') return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const name = (el: HTMLElement): string => el.dataset.testid ?? el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 24);
    // The part of a control that shows: a card that the hand has scrolled under its edge is cut there.
    const seen = (el: HTMLElement): { left: number; top: number; right: number; bottom: number } => {
      const r = el.getBoundingClientRect();
      const v = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      for (let a = el.parentElement; a && a.id !== 'ui'; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
        const c = a.getBoundingClientRect();
        v.left = Math.max(v.left, c.left);
        v.top = Math.max(v.top, c.top);
        v.right = Math.min(v.right, c.right);
        v.bottom = Math.min(v.bottom, c.bottom);
      }
      return v;
    };
    const controls = roots.flatMap((r) => [...r.querySelectorAll<HTMLElement>('button, [role="button"]')]).filter(shown);
    // Size is checked on the whole control (a scrolled card is whole); gaps on the parts that show.
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) out.push(`small: ${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    const boxes = controls.map((el) => ({ el, r: seen(el) })).filter((b) => b.r.right - b.r.left > 0.5 && b.r.bottom - b.r.top > 0.5);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        // Put back lies on its held card (spec §4.6): both put the card back, so a press on either does the same.
        if (a.el.parentElement === b.el.parentElement && a.el.parentElement?.classList.contains('card-wrap')) continue;
        const gx = Math.max(a.r.left - b.r.right, b.r.left - a.r.right);
        const gy = Math.max(a.r.top - b.r.bottom, b.r.top - a.r.bottom);
        if (Math.max(gx, gy) < 7.5) out.push(`gap: ${name(a.el)} and ${name(b.el)} ${Math.round(Math.max(gx, gy))} px`);
      }
    }
    for (const el of roots.flatMap((r) => [...r.querySelectorAll<HTMLElement>('*')]).filter(shown)) {
      if (el.children.length > 0 || (el.textContent ?? '').trim() === '') continue;
      const cs = getComputedStyle(el);
      const clips = (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll';
      if (clips && el.scrollWidth > el.clientWidth + 1) out.push(`clipped: ${name(el)} ${el.scrollWidth} > ${el.clientWidth}`);
      if (clips && el.scrollHeight > el.clientHeight + 1) out.push(`clipped: ${name(el)} ${el.scrollHeight} > ${el.clientHeight} high`);
    }
    return out;
  });
}

test('with the font files blocked, the top region and the hand hold their layout in the fallback font (spec §4.9)', async ({ page }) => {
  const blocked: string[] = [];
  await page.route(/\.woff2(\?.*)?$/, (route) => {
    blocked.push(route.request().url());
    return route.abort();
  });
  await newPark(page);
  await page.evaluate(() => (window as unknown as { __tc: { setSpeed(s: number): void } }).__tc.setSpeed(0));
  expect(blocked.length, 'the game asked for its font files').toBeGreaterThan(0);
  const fredoka = await page.evaluate(() => [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'Fredoka').map((f) => f.status));
  expect(fredoka.includes('loaded'), 'no Fredoka face loaded').toBe(false);
  await expect(page.locator('#ui')).toHaveAttribute('data-text-scale', '100');
  await expect(page.getByTestId('hand')).toBeVisible();
  expect(await regionProblems(page), 'hand open').toEqual([]);
  await pickCard(page, 'flat', 'carousel');
  await expect(page.getByTestId('card-carousel')).toHaveAttribute('aria-pressed', 'true');
  expect(await regionProblems(page), 'Carousel card held').toEqual([]);
});
