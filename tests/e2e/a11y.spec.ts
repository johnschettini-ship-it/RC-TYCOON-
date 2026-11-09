/**
 * Accessibility checks (Phase 6 §4.7, §9): the axe scan of the title, the HUD, and the panels (no serious or critical
 * issues), every button ≥ 44 × 44 px on a phone, and the 175% text scale layout with a pseudo-localized UI (accents,
 * 30% longer) on 1280 × 720 and 375 × 667. Owner: W4-F.
 *
 * The pseudo-localization is test-local until W4-G ships `en-XA`: an init script rewrites every text node of the UI
 * as it appears. At the Wave 4 gate the integrator switches it to `setLocale('en-XA')`.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { isPhone, newPark, watchErrors } from './helpers';

type Tc = {
  dispatch(c: unknown): { ok: boolean };
  settings: { set(k: string, v: unknown): boolean };
  setSpeed(s: number): void;
  tool: { selectedEntity: { kind: string; id: number } | null; tool: string };
  world: { state: { rides: Array<{ id: number }>; stalls: Array<{ id: number }>; guests: Array<{ id: number }>; park: { cash: number } } };
};

/** Serious and critical axe violations on the page as it is now. */
async function seriousIssues(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).exclude('#loading').analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`);
}

async function scan(page: Page, where: string): Promise<void> {
  expect(await seriousIssues(page), where).toEqual([]);
}

/** Open a toolbar panel (the button toggles it). */
async function panel(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).click();
  await expect(page.locator('.panel')).toBeVisible();
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
    await page.getByTestId('tool-footpath').click();
    await scan(page, 'footpath tool status');
    await page.keyboard.press('Escape');
    for (const id of ['tool-park', 'tool-finance', 'tool-staff', 'tool-research', 'tool-marketing', 'tool-messages', 'tool-rides', 'tool-stalls']) {
      await panel(page, id);
      await scan(page, id);
      await page.getByTestId(id).click();
    }
    const { ride, stall } = await furnish(page);
    await select(page, 'ride', ride);
    await scan(page, 'ride panel');
    await select(page, 'stall', stall);
    await scan(page, 'stall panel');
    await page.keyboard.press('Escape');
    await page.getByTestId('tool-menu').click();
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
    for (const id of ['tool-land', 'tool-water', 'tool-scenery', 'tool-overlays', 'tool-buyLand']) {
      await page.getByTestId(id).scrollIntoViewIfNeeded();
      await page.getByTestId(id).click();
      await page.waitForTimeout(150);
      await scan(page, id);
      await page.keyboard.press('Escape');
      if (id === 'tool-overlays') await page.getByTestId(id).click();
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
    await newPark(page);
    await page.evaluate(() => (window as unknown as { __tc: Tc }).__tc.settings.set('highContrast', true));
    await panel(page, 'tool-park');
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
    for (const id of ['tool-park', 'tool-finance', 'tool-staff', 'tool-research', 'tool-marketing', 'tool-messages', 'tool-rides', 'tool-stalls']) {
      await page.getByTestId(id).scrollIntoViewIfNeeded();
      await page.getByTestId(id).click();
      await expect(page.locator('.panel')).toBeVisible();
      expect(await smallTargets(page), id).toEqual([]);
      await page.getByTestId(id).click();
    }
    const { ride, stall } = await furnish(page);
    await select(page, 'ride', ride);
    expect(await smallTargets(page), 'ride panel').toEqual([]);
    await select(page, 'stall', stall);
    expect(await smallTargets(page), 'stall panel').toEqual([]);
    await page.evaluate(() => {
      (window as unknown as { __tc: Tc }).__tc.tool.selectedEntity = null;
    });
    await page.getByTestId('tool-menu').scrollIntoViewIfNeeded();
    await page.getByTestId('tool-menu').click();
    expect(await smallTargets(page), 'menu').toEqual([]);
    watch.expectNoErrors();
  });
});

/**
 * Test-local pseudo-localization (accents, ≥ 30% longer): every text node under `#ui` is rewritten when it appears or
 * changes, so text built later (panels, dialogs) is covered too.
 */
const PSEUDO_SCRIPT = (): void => {
  const accents: Record<string, string> = {
    a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ', n: 'ñ', o: 'ö', p: 'þ', r: 'ŕ', s: 'š', t: 'ţ', u: 'û', w: 'ŵ', y: 'ý', z: 'ž',
    A: 'Å', C: 'Ç', D: 'Ð', E: 'É', G: 'Ĝ', H: 'Ĥ', I: 'Î', L: 'Ļ', N: 'Ñ', O: 'Ö', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Û', Y: 'Ý', Z: 'Ž',
  };
  const written = new WeakMap<Text, string>();
  const pseudo = (s: string): string => {
    if (!/[A-Za-z]/.test(s)) return s;
    const body = s.replace(/[A-Za-z]/g, (ch) => accents[ch] ?? ch);
    const extra = Math.ceil(s.trim().length * 0.3);
    let pad = '';
    while (pad.length < extra) pad += pad.length === 0 ? ' ẋẋ' : ' ẋẋẋ';
    return body.replace(/\s+$/, '') + pad.slice(0, extra + 1);
  };
  const fix = (n: Node): void => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n as Text;
      const p = t.parentElement;
      if (!p || !p.closest('#ui') || p.closest('style, script')) return;
      if (written.get(t) === t.data) return;
      const next = pseudo(t.data);
      written.set(t, next);
      if (next !== t.data) t.data = next;
      return;
    }
    n.childNodes.forEach(fix);
  };
  const start = (): void => {
    const root = document.getElementById('ui');
    if (!root) return;
    fix(root);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') fix(m.target);
        else m.addedNodes.forEach(fix);
      }
    }).observe(root, { subtree: true, childList: true, characterData: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
};

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

test.describe('175% text scale with a pseudo-localized UI (Phase 6 §4.7, §9)', () => {
  test('no element leaves the viewport at 1280 × 720 (desktop) and 375 × 667 (phone)', async ({ page }, info) => {
    test.setTimeout(120_000);
    const watch = watchErrors(page);
    await page.setViewportSize(isPhone(info) ? { width: 375, height: 667 } : { width: 1280, height: 720 });
    await page.addInitScript(PSEUDO_SCRIPT);
    await page.goto('/');
    await page.evaluate(() => (window as unknown as { __tc: Tc }).__tc.settings.set('textScale', 175));
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
    for (const id of ['tool-park', 'tool-finance', 'tool-research', 'tool-rides']) {
      await page.getByTestId(id).scrollIntoViewIfNeeded();
      await page.getByTestId(id).click();
      await expect(page.locator('.panel')).toBeVisible();
      await check(id);
      await page.getByTestId(id).click();
    }
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
    await page.getByTestId('tool-menu').scrollIntoViewIfNeeded();
    await page.getByTestId('tool-menu').click();
    await check('menu');
    await page.getByTestId('menu-settings').click();
    await check('settings');
    await page.keyboard.press('Escape');
    await page.getByTestId('menu-resume').click();
    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcut-list')).toBeVisible();
    await check('shortcut list');
    watch.expectNoErrors();
  });
});
