/**
 * Accessibility checks (Phase 6 §4.7, §9): the axe scan of the title, the HUD, and the panels (no serious or critical
 * issues), every button ≥ 44 × 44 px on a phone, and the 175% text scale layout with a pseudo-localized UI (accents,
 * 30% longer) on 1280 × 720 and 375 × 667. Owner: W4-F.
 *
 * The layout test boots in W4-G's pseudo-locale `en-XA` (Phase 6 §4.8) at 175% text scale.
 */
import { expect, test, type Page } from '@playwright/test';
import { cardOf, isPhone, newPark, openTool, pickCard, scan, watchErrors } from './helpers';
import { defaultSettings, serializeSettings } from '../../src/settings/schema';

type Tc = {
  dispatch(c: unknown): { ok: boolean };
  settings: { set(k: string, v: unknown): boolean };
  setSpeed(s: number): void;
  tool: { selectedEntity: { kind: string; id: number } | null; tool: string };
  world: { state: { rides: Array<{ id: number }>; stalls: Array<{ id: number }>; guests: Array<{ id: number }>; park: { cash: number } } };
};

/** Open a toolbar panel (the button toggles it). */
async function panel(page: Page, id: string): Promise<void> {
  await openTool(page, id);
  await expect(page.locator('.panel')).toBeVisible();
}

/** Open the Rides or Stalls deck: the hand shows its ride or stall cards. */
async function deck(page: Page, id: 'rides' | 'stalls'): Promise<void> {
  await openTool(page, id);
  await expect(page.getByTestId('hand').locator('.content-card').first()).toBeVisible();
}

/** A built carousel, snack stall, and a few guests (debug hook; commands only). */
async function furnish(page: Page): Promise<{ ride: number; stall: number }> {
  return page.evaluate(() => {
    const g = (window as unknown as { __tc: Tc }).__tc;
    g.dispatch({ type: 'placeRide', defId: 'carousel', x: 26, y: 40, rotation: 0 });
    g.dispatch({ type: 'placeStall', defId: 'snack_shack', x: 36, y: 40, rotation: 2 });
    const s = g.world.state;
    return { ride: s.rides[s.rides.length - 1]?.id ?? -1, stall: s.stalls[s.stalls.length - 1]?.id ?? -1 };
  });
}

/**
 * The Phase 7 states of the game screen (spec §10), each scanned: the hand open with a tip on the screen; a held
 * Carousel card with the card details panel (the phone opens it with Details); the phone Speed menu open. Starts and
 * ends with the Rides deck open and Inspect active.
 */
async function scanPhase7States(page: Page, where: string): Promise<void> {
  await deck(page, 'rides');
  // A new park shows the noRide tip about 2 s after the start.
  await expect(page.getByTestId('tip')).toBeVisible({ timeout: 6000 });
  await scan(page, `${where}hand open with a tip`);
  await pickCard(page, 'flat', 'carousel');
  // The phone layout (under 900 px) opens the panel with the Details button of the tool status bar.
  if ((page.viewportSize()?.width ?? 0) < 900) await page.getByTestId('status-details').click();
  await expect(page.locator('.panel .panel-title')).toHaveText('Carousel');
  await scan(page, `${where}held Carousel card with the card details panel`);
  await openTool(page, 'inspect');
  await expect(page.locator('.panel')).toBeHidden();
  const toggle = page.getByTestId('speed-toggle');
  // The phone layout (under 900 px) always has the Speed button: a missing one fails here, never skips the scan.
  if ((page.viewportSize()?.width ?? 0) < 900) {
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.getByRole('group', { name: 'Game speed' })).toBeVisible();
    await scan(page, `${where}Speed menu open`);
    await toggle.click();
    await expect(page.getByRole('group', { name: 'Game speed' })).toBeHidden();
  }
}

async function select(page: Page, kind: string, id: number): Promise<void> {
  await page.evaluate(([k, i]) => {
    (window as unknown as { __tc: Tc }).__tc.tool.selectedEntity = { kind: k as string, id: i as number };
  }, [kind, id] as const);
  await expect(page.locator('.panel')).toBeVisible();
}

test.describe('axe scan: no serious or critical issues (Phase 6 §9)', () => {
  test('title screen, new game, scenarios, load, and settings', async ({ page }) => {
    const watch = watchErrors(page);
    await page.goto('/');
    await expect(page.getByTestId('title-new')).toBeVisible();
    await scan(page, 'title');
    await page.getByTestId('title-new').click();
    await scan(page, 'new game');
    await page.getByTestId('title-scenarios').click();
    await expect(page.locator('.tc-card').first()).toBeVisible();
    await scan(page, 'scenario select');
    await page.goto('/');
    await page.getByTestId('title-load').click();
    await scan(page, 'load');
    await page.goto('/');
    await page.getByTestId('title-settings').click();
    await expect(page.getByTestId('settings-screen')).toBeVisible();
    await scan(page, 'settings');
    // Unreadable settings: the notice.
    await page.evaluate(() => localStorage.setItem('tc.settings', 'nope'));
    await page.reload();
    await page.getByTestId('title-settings').click();
    await expect(page.getByTestId('settings-notice')).toBeVisible();
    await scan(page, 'settings notice');
    watch.expectNoErrors();
  });

  test('HUD, toolbar, tool status, panels, menu, and the shortcut list', async ({ page }) => {
    test.setTimeout(120_000);
    const watch = watchErrors(page);
    await newPark(page);
    await page.evaluate(() => (window as unknown as { __tc: Tc }).__tc.setSpeed(0));
    await scan(page, 'HUD and toolbar');
    await scanPhase7States(page, '');
    await openTool(page, 'footpath');
    await scan(page, 'footpath tool status');
    await page.keyboard.press('Escape');
    for (const id of ['park', 'finance', 'staff', 'research', 'marketing', 'messages']) {
      await panel(page, id);
      await scan(page, id);
      await openTool(page, id);
    }
    // The hand with the ride cards, then with the stall cards.
    for (const id of ['rides', 'stalls'] as const) {
      await deck(page, id);
      await scan(page, `${id} cards`);
    }
    const { ride, stall } = await furnish(page);
    await select(page, 'ride', ride);
    await scan(page, 'ride panel');
    await select(page, 'stall', stall);
    await scan(page, 'stall panel');
    await page.keyboard.press('Escape');
    await openTool(page, 'menu');
    await expect(page.getByTestId('menu-resume')).toBeVisible();
    await scan(page, 'menu');
    await page.getByTestId('menu-settings').click();
    await scan(page, 'settings from the menu');
    await page.keyboard.press('Escape');
    await page.getByTestId('menu-resume').click();
    await page.keyboard.press('c');
    await expect(page.getByTestId('cursor-line')).toBeVisible();
    await scan(page, 'map cursor line');
    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcut-list')).toBeVisible();
    await scan(page, 'shortcut list');
    watch.expectNoErrors();
  });

  test('Build 2 tool bars and sheets: land, water, scenery, overlays, buy land; guest and staff panels', async ({ page }) => {
    test.setTimeout(120_000);
    const watch = watchErrors(page);
    await newPark(page);
    await page.evaluate(() => (window as unknown as { __tc: Tc }).__tc.setSpeed(0));
    for (const id of ['land', 'water', 'scenery', 'overlays', 'buyLand']) {
      await openTool(page, id);
      await page.waitForTimeout(150);
      await scan(page, id);
      await page.keyboard.press('Escape');
      if (id === 'overlays') await openTool(page, id);
    }
    // A hired groundskeeper and a guest standing in the park.
    const ids = await page.evaluate(() => {
      const g = (window as unknown as { __tc: Tc & { world: { state: { staff: { members: Array<{ id: number }> } } } } }).__tc;
      g.dispatch({ type: 'hireStaff', staffType: 'groundskeeper' });
      g.dispatch({ type: 'setParkOpen', open: true });
      return { staff: g.world.state.staff.members[0]?.id ?? -1 };
    });
    await select(page, 'staff', ids.staff);
    await scan(page, 'staff member panel');
    await page.evaluate(() => (window as unknown as { __tc: Tc & { step(n: number): void } }).__tc.step(400));
    const guest = await page.evaluate(() => (window as unknown as { __tc: Tc }).__tc.world.state.guests[0]?.id ?? -1);
    if (guest >= 0) {
      await select(page, 'guest', guest);
      await scan(page, 'guest panel');
    }
    watch.expectNoErrors();
  });

  test('high contrast keeps the scan clean', async ({ page }) => {
    test.setTimeout(60_000);
    await newPark(page);
    await page.evaluate(() => (window as unknown as { __tc: Tc }).__tc.settings.set('highContrast', true));
    await scanPhase7States(page, 'high contrast: ');
    await panel(page, 'park');
    await scan(page, 'high contrast park panel');
  });
});

test.describe('touch targets (Phase 6 §4.7: ≥ 44 × 44 CSS px)', () => {
  /** Visible controls smaller than 44 × 44. */
  async function smallTargets(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const out: string[] = [];
      const sel = 'button, [role="button"], [role="radio"], [role="tab"], [role="switch"], input:not([type="file"]):not([type="radio"]):not([type="checkbox"]), select, a[href], label.choice';
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        if (el.closest('[hidden], .sr-only') || el.getAttribute('aria-hidden') === 'true') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (r.width < 43.5 || r.height < 43.5) out.push(`${el.tagName.toLowerCase()}[${el.dataset.testid ?? el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 24)}] ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
      return out;
    });
  }

  test('every button on the phone is at least 44 × 44 px', async ({ page }, info) => {
    test.skip(!isPhone(info), 'phone check');
    test.setTimeout(120_000);
    const watch = watchErrors(page);
    await page.goto('/');
    expect(await smallTargets(page), 'title').toEqual([]);
    await page.getByTestId('title-new').click();
    expect(await smallTargets(page), 'new game').toEqual([]);
    await page.getByTestId('title-back').click();
    await page.getByTestId('title-settings').click();
    expect(await smallTargets(page), 'settings').toEqual([]);
    await page.getByTestId('settings-back').click();
    await newPark(page);
    await page.evaluate(() => (window as unknown as { __tc: Tc }).__tc.setSpeed(0));
    expect(await smallTargets(page), 'HUD and toolbar').toEqual([]);
    // The hand open with a held card: the phone tucks the hand while a card is held; the deck chip shows it again.
    await pickCard(page, 'flat', 'carousel');
    expect(await smallTargets(page), 'Carousel card held').toEqual([]);
    await cardOf(page, 'flat', 'carousel');
    await expect(page.getByTestId('card-carousel')).toHaveAttribute('aria-pressed', 'true');
    expect(await smallTargets(page), 'hand open with the Carousel card held').toEqual([]);
    await openTool(page, 'inspect');
    for (const id of ['park', 'finance', 'staff', 'research', 'marketing', 'messages']) {
      await openTool(page, id);
      await expect(page.locator('.panel')).toBeVisible();
      expect(await smallTargets(page), id).toEqual([]);
      await openTool(page, id);
    }
    for (const id of ['rides', 'stalls'] as const) {
      await deck(page, id);
      expect(await smallTargets(page), `${id} cards`).toEqual([]);
    }
    const { ride, stall } = await furnish(page);
    await select(page, 'ride', ride);
    expect(await smallTargets(page), 'ride panel').toEqual([]);
    await select(page, 'stall', stall);
    expect(await smallTargets(page), 'stall panel').toEqual([]);
    await page.evaluate(() => {
      (window as unknown as { __tc: Tc }).__tc.tool.selectedEntity = null;
    });
    await openTool(page, 'menu');
    expect(await smallTargets(page), 'menu').toEqual([]);
    watch.expectNoErrors();
  });
});

/**
 * Boot with the pseudo-locale `en-XA` (W4-G: accents, ≥ 30% longer, `[ … ]`) and 175% text, stored in `tc.settings`
 * before the page loads (the language is picked before any UI is built).
 */
async function bootLargePseudo(page: Page): Promise<void> {
  const doc = serializeSettings({ ...defaultSettings(), locale: 'en-XA', textScale: 175 });
  await page.addInitScript((d) => window.localStorage.setItem('tc.settings', d), doc);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-XA');
}

/** Visible UI elements outside the viewport, and text clipped by its own box (outside scrolling areas). */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const out: string[] = [];
    const name = (el: Element): string => {
      const h = el as HTMLElement;
      return `${el.tagName.toLowerCase()}${h.dataset?.testid ? `[${h.dataset.testid}]` : ''}.${(h.className && typeof h.className === 'string' ? h.className : '').split(' ').join('.')} "${(el.textContent ?? '').trim().slice(0, 30)}"`;
    };
    for (const el of document.querySelectorAll('#ui *')) {
      if (el.closest('[hidden], .sr-only, style')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Inside a scrolling (or clipping) area the area itself is checked: long panels scroll.
      let a = el.parentElement;
      let inScroller = false;
      while (a && a.id !== 'ui') {
        const s = getComputedStyle(a);
        if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
          inScroller = true;
          break;
        }
        a = a.parentElement;
      }
      if (!inScroller && (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1)) {
        out.push(`outside: ${name(el)} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
      // Text cut off by an element that hides its overflow without scrolling.
      const clips = (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll';
      // (Text fields scroll their own value, as fields do.)
      const field = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
      if (clips && !field && el.children.length === 0 && el.scrollWidth > el.clientWidth + 1) out.push(`clipped: ${name(el)} ${el.scrollWidth} > ${el.clientWidth}`);
    }
    return out;
  });
}

/**
 * The 175% `en-XA` layout run: no element leaves the viewport and no text is clipped, on the title, the new game view,
 * the HUD, three panels, the hand with a held card, the ride panel, the map cursor line, the menu, the settings, and
 * the shortcut list. `blockFonts` (Ruling K, spec §4.9) aborts every `.woff2` request first, so the run uses the
 * fallback font, and checks that no Fredoka face loaded.
 */
async function largePseudoLayout(page: Page, phone: boolean, blockFonts: boolean): Promise<void> {
  const watch = watchErrors(page);
  const blocked: string[] = [];
  if (blockFonts) {
    await page.route(/\.woff2(\?.*)?$/, (route) => {
      blocked.push(route.request().url());
      return route.abort();
    });
  }
  await page.setViewportSize(phone ? { width: 375, height: 667 } : { width: 1280, height: 720 });
  await bootLargePseudo(page);
  await expect(page.locator('#ui')).toHaveAttribute('data-text-scale', '175');
  // The pseudo text is in place (accents and longer).
  await expect(page.getByTestId('title-new')).toContainText('Ñéŵ');
  const check = async (where: string): Promise<void> => {
    await page.waitForTimeout(150);
    expect(await layoutProblems(page), where).toEqual([]);
  };
  await check('title');
  await page.getByTestId('title-new').click();
  await check('new game');
  await page.getByTestId('title-size-64').click();
  await page.getByTestId('title-start').click();
  await expect(page.locator('.title-screen')).toBeHidden();
  await page.evaluate(() => (window as unknown as { __tc: Tc }).__tc.setSpeed(0));
  await check('HUD and toolbar');
  for (const id of ['park', 'finance', 'research']) {
    await openTool(page, id);
    await expect(page.locator('.panel')).toBeVisible();
    await check(id);
    await openTool(page, id);
  }
  await deck(page, 'rides');
  await check('ride cards');
  // The hand open with a held card (desktop: with the card details panel; the phone tucks the hand, the chip shows it).
  await pickCard(page, 'flat', 'carousel');
  await check('Carousel card held');
  await cardOf(page, 'flat', 'carousel');
  await expect(page.getByTestId('card-carousel')).toHaveAttribute('aria-pressed', 'true');
  await check('hand open with the Carousel card held');
  await openTool(page, 'inspect');
  const { ride } = await furnish(page);
  await select(page, 'ride', ride);
  await check('ride panel');
  await page.evaluate(() => {
    (window as unknown as { __tc: Tc }).__tc.tool.selectedEntity = null;
  });
  await page.keyboard.press('c');
  await expect(page.getByTestId('cursor-line')).toBeVisible();
  await check('map cursor line');
  await page.keyboard.press('c');
  await openTool(page, 'menu');
  await check('menu');
  await page.getByTestId('menu-settings').click();
  await check('settings');
  await page.keyboard.press('Escape');
  await page.getByTestId('menu-resume').click();
  await page.keyboard.press('?');
  await expect(page.getByTestId('shortcut-list')).toBeVisible();
  await check('shortcut list');
  if (blockFonts) {
    expect(blocked.length, 'the game asked for its font files').toBeGreaterThan(0);
    const fredoka = await page.evaluate(() => [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'Fredoka').map((f) => f.status));
    expect(fredoka.includes('loaded'), 'no Fredoka face loaded').toBe(false);
    // The aborted font requests are the only console errors allowed.
    watch.errors.splice(0, watch.errors.length, ...watch.errors.filter((e) => !/ERR_FAILED|Failed to load resource/.test(e)));
  }
  watch.expectNoErrors();
}

test.describe('175% text scale with a pseudo-localized UI (Phase 6 §4.7, §9)', () => {
  test('no element leaves the viewport at 1280 × 720 (desktop) and 375 × 667 (phone)', async ({ page }, info) => {
    test.setTimeout(120_000);
    await largePseudoLayout(page, isPhone(info), false);
  });

  test('with the font files blocked, no element leaves the viewport in the fallback font (Ruling K, spec §4.9)', async ({ page }, info) => {
    test.setTimeout(120_000);
    await largePseudoLayout(page, isPhone(info), true);
  });
});
