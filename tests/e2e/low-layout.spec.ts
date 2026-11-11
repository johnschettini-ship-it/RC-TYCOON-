/**
 * Low layout (Task 19): a phone held sideways (a window lower than 500 px and wider than high) gets the phone layout with
 * its own rules (`data-low="1"` on the UI root): one slim top row, the hand closed until a deck chip is pressed and
 * shown above the chip row, panels at the right side. The free map shares are the reason for the layout.
 *
 * Base numbers (the layout before this task, phone project, 100% text; `freeMapShare`):
 * - 844 × 390: new park (Rides deck open) 0.25, hand closed 0.67, Rides deck 0.25, held Carousel 0.42, Finance 0.25,
 *   track builder after a station 0.00;
 * - 667 × 375: new park 0.09, hand closed 0.55, Rides deck 0.09, held Carousel 0.23, Finance 0.14, track builder 0.00.
 */
import { expect, test, type Page } from '@playwright/test';
import { freeMapShare, isPhone, newPark, openTool, pickCard, scan, showTile, watchErrors } from './helpers';
import { defaultSettings, serializeSettings } from '../../src/settings/schema';

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

async function boxOf(page: Page, sel: string): Promise<Box> {
  return page.evaluate((s) => {
    const r = (document.querySelector(s) as HTMLElement).getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, sel);
}

/** Waits two animation frames, so the frame loop has applied the last change. */
async function frames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

const overlaps = (a: Box, b: Box): boolean => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

/** The first row of the top region: the status pill, the mood bar, and the controls. */
async function firstRow(page: Page): Promise<Box> {
  return page.evaluate(() => {
    const rs = ['.status-pill', '.hud-mood', '.hud-controls'].map((s) => (document.querySelector(s) as HTMLElement).getBoundingClientRect());
    const left = Math.min(...rs.map((r) => r.left));
    const top = Math.min(...rs.map((r) => r.top));
    const right = Math.max(...rs.map((r) => r.right));
    const bottom = Math.max(...rs.map((r) => r.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  });
}

const tool = (page: Page): Promise<string> => page.evaluate(() => (window as unknown as { __tc: { tool: { tool: string } } }).__tc.tool.tool);

/** A new park in a window of this size; the game is paused, so the frame loop changes nothing between the checks. */
async function lowPark(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await newPark(page);
  await page.evaluate(() => (window as unknown as { __tc: { setSpeed(n: number): void } }).__tc.setSpeed(0));
  await frames(page);
}

/** Item 6 of the brief: the required free map shares. */
const SHARES = {
  '844x390': { closed: 0.6, rides: 0.2, held: 0.5, finance: 0.35, track: 0.3 },
  '667x375': { closed: 0.5, rides: 0.2, held: 0.4, finance: 0.35, track: 0.3 },
} as const;

test.describe('low layout (Task 19)', () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(!isPhone(info), 'a phone held sideways');
  });

  for (const [w, h, need] of [[844, 390, SHARES['844x390']], [667, 375, SHARES['667x375']]] as const) {

    test(`${w} × ${h}: data-low, the hand closed at the start, a chip opens and closes it, a held card tucks it; the free map shares`, async ({ page }) => {
      const watch = watchErrors(page);
      await lowPark(page, w, h);
      await expect(page.locator('#ui')).toHaveAttribute('data-low', '1');
      await expect(page.locator('#ui')).toHaveAttribute('data-layout', 'bottom');
      const hand = page.getByTestId('hand');
      await expect(hand).toBeHidden();
      expect(await freeMapShare(page), 'new park, the hand closed').toBeGreaterThanOrEqual(need.closed);
      if (w === 844) {
        // One top row: the region ends at most 64 px from the top.
        const hud = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('ui') as HTMLElement).getPropertyValue('--hud-bottom')));
        expect(hud).toBeLessThanOrEqual(64);
        const row = await firstRow(page);
        const day = await boxOf(page, '.hud-day');
        expect(day.top, 'the day chip row is on the first row').toBeLessThan(row.bottom);
      }

      // A press on a deck chip opens the hand above the chip row; a second press on the same chip closes it.
      await page.getByTestId('deck-rides').click();
      await expect(hand).toBeVisible();
      await expect(hand).toHaveAttribute('data-deck', 'rides');
      await frames(page);
      const handBox = await boxOf(page, '[data-testid="hand"]');
      const chips = await boxOf(page, '.deck-list');
      expect(handBox.bottom, 'the hand ends above the chip row').toBeLessThanOrEqual(chips.top + 0.5);
      expect(Math.abs(chips.bottom - h), 'the chip row is at the bottom').toBeLessThanOrEqual(1);
      expect(await freeMapShare(page), 'the Rides deck open').toBeGreaterThanOrEqual(need.rides);
      await page.getByTestId('deck-rides').click();
      await expect(hand).toBeHidden();

      // Picking a card tucks the hand; the tool status bar shows.
      await pickCard(page, 'flat', 'carousel');
      await frames(page);
      expect(await tool(page)).toBe('placeRide');
      await expect(hand).toBeHidden();
      await expect(page.locator('.tool-status').first()).toBeVisible();
      expect(await freeMapShare(page), 'a held Carousel card').toBeGreaterThanOrEqual(need.held);
      // The tool status bar is one row: its text and its buttons side by side.
      const line = await boxOf(page, '.tool-status:not(.path-height-bar) .status-line');
      const actions = await boxOf(page, '.tool-status:not(.path-height-bar) .status-actions');
      expect(actions.top, 'the buttons are on the row of the text').toBeLessThan(line.bottom);
      watch.expectNoErrors();
    });

    test(`${w} × ${h}: the free map shares with the Finance panel and with the track builder after a station`, async ({ page }) => {
      const watch = watchErrors(page);
      await lowPark(page, w, h);
      await openTool(page, 'finance');
      await expect(page.locator('.panel')).toBeVisible();
      await frames(page);
      expect(await freeMapShare(page), 'the Finance panel open').toBeGreaterThanOrEqual(need.finance);
      await page.keyboard.press('Escape');
      await expect(page.locator('.panel')).toBeHidden();
      await page.evaluate(() => {
        const g = (window as unknown as { __tc: { dispatch(c: unknown): { ok: boolean } } }).__tc;
        g.dispatch({ type: 'buildPathLine', x0: 31, y0: 59, x1: 31, y1: 6, kind: 'footpath' });
      });
      await pickCard(page, 'track', 'steel_coaster');
      const builder = page.getByTestId('track-builder');
      await expect(builder).toBeVisible();
      const p = await showTile(page, 20, 30);
      await frames(page);
      await page.mouse.move(p.x, p.y);
      await page.mouse.click(p.x, p.y);
      await expect(builder).toHaveAttribute('data-phase', 'pieces');
      await frames(page);
      expect(await freeMapShare(page), 'the track builder after a station').toBeGreaterThanOrEqual(need.track);
      // The builder is a right-side panel too.
      await expect(builder).toHaveAttribute('data-layout', 'side');
      const b = await boxOf(page, '[data-testid="track-builder"]');
      expect(Math.abs(b.right - (w - 10)), 'the builder at the right edge').toBeLessThanOrEqual(1);
      expect(b.width).toBeLessThanOrEqual(0.48 * w + 0.5);
      watch.expectNoErrors();
    });
  }

  test('932 × 430 (wider than 900): data-low, the chip row at the bottom, the free map share with the hand closed', async ({ page }) => {
    await lowPark(page, 932, 430);
    await expect(page.locator('#ui')).toHaveAttribute('data-low', '1');
    await expect(page.locator('#ui')).toHaveAttribute('data-layout', 'bottom');
    await expect(page.getByTestId('hand')).toBeHidden();
    const chips = await boxOf(page, '.deck-list');
    expect(Math.abs(chips.bottom - 430)).toBeLessThanOrEqual(1);
    expect(chips.height).toBeLessThanOrEqual(64);
    expect(await freeMapShare(page)).toBeGreaterThanOrEqual(0.6);
  });

  test('the upright phone and a tall window have no data-low', async ({ page }) => {
    await lowPark(page, 390, 844);
    await expect(page.locator('#ui')).not.toHaveAttribute('data-low', /.*/);
    await page.setViewportSize({ width: 1280, height: 800 });
    await frames(page);
    await expect(page.locator('#ui')).not.toHaveAttribute('data-low', /.*/);
    await expect(page.locator('#ui')).toHaveAttribute('data-layout', 'side');
  });

  test('844 × 390: the Finance panel is at the right, clear of the first top row and the chip row; its last control scrolls into view', async ({ page }) => {
    await lowPark(page, 844, 390);
    await openTool(page, 'finance');
    const panel = page.locator('.panel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-layout', 'side');
    await expect(panel.locator('.panel-handle')).toBeHidden();
    await frames(page);
    const p = await boxOf(page, '.panel');
    expect(Math.abs(p.right - (844 - 10)), 'right edge at the window edge less the margin').toBeLessThanOrEqual(1);
    expect(p.width).toBeLessThanOrEqual(0.48 * 844 + 0.5);
    expect(p.width).toBeGreaterThanOrEqual(300);
    const row = await firstRow(page);
    const chips = await boxOf(page, '.deck-list');
    expect(p.top, 'below the first top row').toBeGreaterThanOrEqual(row.bottom);
    expect(p.bottom, 'above the chip row').toBeLessThanOrEqual(chips.top);
    // The content scrolls inside: the last control can be scrolled into view, inside the panel.
    const last = panel.locator('.panel-body button, .panel-body input, .panel-body select').last();
    await last.scrollIntoViewIfNeeded();
    const l = await last.boundingBox();
    expect(l).not.toBeNull();
    expect((l?.y ?? 0) + (l?.height ?? 0)).toBeLessThanOrEqual(p.bottom + 0.5);
    expect(l?.y ?? 0).toBeGreaterThanOrEqual(p.top - 0.5);
  });

  test('844 × 390: a held Carousel card with the card details panel: the tool status bar and the panel do not overlap', async ({ page }) => {
    await lowPark(page, 844, 390);
    await pickCard(page, 'flat', 'carousel');
    await page.getByTestId('status-details').click();
    await expect(page.locator('.panel .panel-title')).toHaveText('Carousel');
    await expect(page.locator('.panel')).toHaveAttribute('data-layout', 'side');
    await frames(page);
    const status = await boxOf(page, '.tool-status:not(.path-height-bar)');
    const panel = await boxOf(page, '.panel');
    expect(overlaps(status, panel), `status ${JSON.stringify(status)} panel ${JSON.stringify(panel)}`).toBe(false);
    // Footpath held: the Height bar, the tool status bar and the open panel do not overlap each other.
    await openTool(page, 'inspect');
    await openTool(page, 'finance');
    await expect(page.locator('.panel')).toBeVisible();
    await openTool(page, 'footpath');
    await frames(page);
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.tool-status, .panel')].filter((e) => !e.hidden && e.getClientRects().length > 0).map((e) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      }),
    );
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!), `${i} / ${j}`).toBe(false);
  });

  test('turning the phone keeps a held card held', async ({ page }) => {
    await lowPark(page, 390, 844);
    await pickCard(page, 'flat', 'carousel');
    expect(await tool(page)).toBe('placeRide');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#ui')).toHaveAttribute('data-low', '1');
    await frames(page);
    expect(await tool(page)).toBe('placeRide');
    await expect(page.getByTestId('hand')).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#ui')).not.toHaveAttribute('data-low', /.*/);
    await frames(page);
    expect(await tool(page)).toBe('placeRide');
  });

  test('turning the phone keeps an open panel open in its new form, closes the hand and keeps the camera', async ({ page }) => {
    await lowPark(page, 390, 844);
    await openTool(page, 'finance');
    const panel = page.locator('.panel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-layout', 'bottom');
    const cam = () => page.evaluate(() => {
      const c = (window as unknown as { __tc: { camera: { centerX: number; centerY: number } } }).__tc.camera;
      return [c.centerX, c.centerY];
    });
    const before = await cam();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#ui')).toHaveAttribute('data-low', '1');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-layout', 'side');
    await expect(page.getByTestId('hand')).toBeHidden();
    const p = await boxOf(page, '.panel');
    expect(Math.abs(p.right - 834)).toBeLessThanOrEqual(1);
    expect(await cam()).toEqual(before);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-layout', 'bottom');
    const s = await boxOf(page, '.panel');
    expect(s.left).toBe(0);
    expect(s.width).toBe(390);
  });

  test('844 × 390: the controls of the top region, the chips and the open hand are 44 × 44 px with 8 px gaps; axe finds no serious issue', async ({ page }) => {
    await lowPark(page, 844, 390);
    await page.getByTestId('deck-rides').click();
    await expect(page.getByTestId('hand')).toBeVisible();
    await frames(page);
    const problems = await page.evaluate(() => {
      const out: string[] = [];
      const visible = (el: HTMLElement): boolean => !el.closest('[hidden], .sr-only') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const groups = ['.hud', '.deck-list', '.hand'].map((s) =>
        [...document.querySelectorAll<HTMLElement>(`${s} button, ${s} [role="button"]`)].filter(visible),
      );
      for (const g of groups) {
        const rs = g.map((el) => ({ el, r: el.getBoundingClientRect() }));
        for (const { el, r } of rs) {
          if (r.width < 43.5 || r.height < 43.5) out.push(`small: ${el.dataset.testid ?? el.getAttribute('aria-label') ?? el.textContent} ${r.width}×${r.height}`);
        }
        // Neighbours (in one row or one column) keep 8 px between them; a control inside another is not a neighbour.
        for (let i = 0; i < rs.length; i++) {
          for (let j = i + 1; j < rs.length; j++) {
            const a = rs[i]!;
            const b = rs[j]!;
            if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
            const dx = Math.max(b.r.left - a.r.right, a.r.left - b.r.right);
            const dy = Math.max(b.r.top - a.r.bottom, a.r.top - b.r.bottom);
            if (Math.max(dx, dy) < 7.5) out.push(`gap ${Math.max(dx, dy).toFixed(1)}: ${a.el.dataset.testid ?? a.el.getAttribute('aria-label')} / ${b.el.dataset.testid ?? b.el.getAttribute('aria-label')}`);
          }
        }
      }
      return out;
    });
    expect(problems).toEqual([]);
    await scan(page, 'low layout, the hand open');
  });

  test('844 × 390 at 175% text with en-XA: no control of the top region, the chips or the hand clips its text; each one can be reached', async ({ page }) => {
    const doc = serializeSettings({ ...defaultSettings(), locale: 'en-XA', textScale: 175 });
    await page.addInitScript((d) => window.localStorage.setItem('tc.settings', d), doc);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-XA');
    await page.getByTestId('title-new').click();
    await page.getByTestId('title-size-64').click();
    await page.getByTestId('title-start').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.evaluate(() => (window as unknown as { __tc: { setSpeed(n: number): void } }).__tc.setSpeed(0));
    await expect(page.locator('#ui')).toHaveAttribute('data-low', '1');
    for (const open of [false, true]) {
      if (open) {
        await page.getByTestId('deck-rides').click();
        await expect(page.getByTestId('hand')).toBeVisible();
        await frames(page);
        // A hand taller than the room scrolls inside: it never covers the top region.
        const hud = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('ui') as HTMLElement).getPropertyValue('--hud-bottom')));
        expect((await boxOf(page, '[data-testid="hand"]')).top, 'the hand ends below the top region').toBeGreaterThanOrEqual(hud);
      }
      await frames(page);
      const controls = page.locator('.hud button, .deck-list button, .hand button');
      const n = await controls.count();
      for (let i = 0; i < n; i++) {
        const c = controls.nth(i);
        if (!(await c.isVisible())) continue;
        const cut = await c.evaluate((el) => {
          const out: string[] = [];
          for (const e of [el, ...el.querySelectorAll<HTMLElement>('*')]) {
            // Labels kept for screen readers only are not on the screen.
            if (e.closest('.sr-only, [hidden]')) continue;
            const cs = getComputedStyle(e);
            const clips = cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.overflowY === 'hidden' || cs.overflowY === 'clip';
            if (clips && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) && (e.textContent ?? '').trim() !== '') out.push(`${e.className} ${e.scrollWidth}/${e.clientWidth} ${e.scrollHeight}/${e.clientHeight}`);
          }
          return out;
        });
        const name = (await c.getAttribute('data-testid')) ?? (await c.getAttribute('aria-label')) ?? '';
        expect(cut, `${name} clips its text (hand open: ${open})`).toEqual([]);
        // Scrolled fully into view where its row scrolls (the chips row and the hand scroll sideways).
        await c.evaluate((el) => el.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
        const b = await c.boundingBox();
        expect(b, name).not.toBeNull();
        expect(b!.x, `${name} left`).toBeGreaterThanOrEqual(-1);
        expect(b!.y, `${name} top`).toBeGreaterThanOrEqual(-1);
        expect(b!.x + b!.width, `${name} right`).toBeLessThanOrEqual(845);
        expect(b!.y + b!.height, `${name} bottom`).toBeLessThanOrEqual(391);
      }
    }
  });

  test('667 × 375: a right-side panel starts below the whole top region and leaves the view controls free', async ({ page }) => {
    await lowPark(page, 667, 375);
    const hudBottom = (): Promise<number> => page.evaluate(() => (document.querySelector('.hud') as HTMLElement).getBoundingClientRect().bottom);
    const rotate = ['[data-testid="view-rotate-left"]', '[data-testid="view-rotate-right"]'];
    const check = async (what: string): Promise<void> => {
      await frames(page);
      const p = await boxOf(page, '.panel');
      expect(p.top, `${what}: below the top region`).toBeGreaterThanOrEqual(await hudBottom());
      for (const r of rotate) expect(overlaps(await boxOf(page, r), p), `${what}: ${r} is free`).toBe(false);
      // The view controls take a press while the panel is open.
      for (const r of rotate) await expect(page.locator(r)).toBeVisible();
      const hit = await page.evaluate((sel) => sel.map((s) => {
        const b = (document.querySelector(s) as HTMLElement).getBoundingClientRect();
        const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return at !== null && (document.querySelector(s) as HTMLElement).contains(at);
      }), rotate);
      expect(hit, `${what}: the view controls are on top`).toEqual([true, true]);
    };
    await openTool(page, 'finance');
    await expect(page.locator('.panel')).toBeVisible();
    await check('Finance');
    await page.keyboard.press('Escape');
    await expect(page.locator('.panel')).toBeHidden();
    await pickCard(page, 'flat', 'carousel');
    await page.getByTestId('status-details').click();
    await expect(page.locator('.panel .panel-title')).toHaveText('Carousel');
    await check('card details');
  });

  test('667 × 375: the tip never covers the top region; it hides while the hand is open', async ({ page }) => {
    await lowPark(page, 667, 375);
    const tip = page.getByTestId('tip');
    await expect(tip).toBeVisible({ timeout: 10_000 });
    await frames(page);
    const hud = await boxOf(page, '.hud');
    expect((await boxOf(page, '[data-testid="tip"]')).top, 'the hand closed: under the top region').toBeGreaterThanOrEqual(hud.bottom);
    await page.getByTestId('deck-rides').click();
    await expect(page.getByTestId('hand')).toBeVisible();
    await expect(tip).toBeHidden();
    await page.getByTestId('deck-rides').click();
    await expect(page.getByTestId('hand')).toBeHidden();
    await expect(tip).toBeVisible();
    expect((await boxOf(page, '[data-testid="tip"]')).top).toBeGreaterThanOrEqual(hud.bottom);
  });

  test('844 × 390 in a scenario: the objectives panel is at the right with its content inset; the bars keep clear of it', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/');
    await page.getByTestId('title-new').click();
    await page.getByTestId('title-scenarios').click();
    await page.getByTestId('scenario-card-meadow_start').click();
    await page.getByTestId('preset-standard').click();
    await page.getByTestId('scenario-start').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    await page.evaluate(() => (window as unknown as { __tc: { setSpeed(n: number): void } }).__tc.setSpeed(0));
    await expect(page.locator('#ui')).toHaveAttribute('data-low', '1');
    await page.getByTestId('hud-objectives').click();
    const panel = page.getByTestId('objectives-panel');
    await expect(panel).toBeVisible();
    await frames(page);
    const p = await boxOf(page, '[data-testid="objectives-panel"]');
    expect(Math.abs(p.right - (844 - 10)), 'at the right edge less the margin').toBeLessThanOrEqual(1);
    expect(p.width).toBeLessThanOrEqual(0.48 * 844 + 0.5);
    // Its content keeps its own side padding: nothing touches the outline.
    const inset = await panel.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [...el.querySelectorAll<HTMLElement>('h2, [data-testid="objective"], [data-testid="objectives-close"]')]
        .filter((e) => e.getClientRects().length > 0)
        .map((e) => {
          const b = e.getBoundingClientRect();
          return Math.min(b.left - r.left, r.right - b.right);
        });
    });
    expect(inset.length).toBeGreaterThanOrEqual(3);
    for (const d of inset) expect(d, 'content inset from the panel edge').toBeGreaterThanOrEqual(12);
    // A held card: the objectives stay open; the tool status bar ends left of them.
    await pickCard(page, 'flat', 'carousel');
    await expect(panel).toBeVisible();
    await frames(page);
    const status = await boxOf(page, '.tool-status:not(.path-height-bar)');
    const o = await boxOf(page, '[data-testid="objectives-panel"]');
    expect(overlaps(status, o), `status ${JSON.stringify(status)} objectives ${JSON.stringify(o)}`).toBe(false);
    // Footpath held: the Height bar and the tool status bar keep clear of the objectives too.
    await openTool(page, 'inspect');
    await openTool(page, 'footpath');
    await expect(panel).toBeVisible();
    await frames(page);
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.tool-status, .tc-objectives')].filter((e) => !e.hidden && e.getClientRects().length > 0).map((e) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      }),
    );
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!), `${i} / ${j}`).toBe(false);
  });
});
