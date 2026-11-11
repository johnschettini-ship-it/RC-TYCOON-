/**
 * Final review repairs (Task 16a): the title holds the keyboard focus and stops the hidden world's autosave, Put back on
 * Staff during patrol, the phone Speed menu keeps the focus, tips stay off pickers and reach screen readers, toasts over
 * the title, the localized Continue date, visible focus rings, readable track piece icons, focus kept by the hand, the
 * card details hints, whole px on the title, reduced motion in the hand, and the 175% phone bars.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { TICKS_PER_MONTH } from '../../src/data/tuning/core';
import { pseudoLocalize } from '../../src/data/strings/en-XA';
import { SAVE_FORMAT } from '../../src/save/codec';
import { defaultSettings, serializeSettings } from '../../src/settings/schema';
import { isPhone, newPark, openTool, pickCard, setSpeed, showTile, toolControl, watchErrors } from './helpers';

const tc = <T>(page: Page, f: string): Promise<T> => page.evaluate(`(() => { const g = window.__tc; return ${f}; })()`) as Promise<T>;
const toolNow = (page: Page): Promise<string> => tc<string>(page, 'g.tool.tool');

/** Waits `n` animation frames, so the frame loop has applied the last change. */
async function frames(page: Page, n = 2): Promise<void> {
  await page.evaluate((k) => new Promise<void>((done) => {
    let left = k;
    const step = (): void => {
      left -= 1;
      if (left <= 0) done();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), n);
}

async function tabTo(page: Page, target: Locator, max = 160): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Tab never reached the target');
}

/** A test id or tag and classes of the focused element, for messages. */
const focusedName = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return a ? a.dataset.testid ?? `${a.tagName}.${a.className}` : 'none';
  });

/** The relative luminance contrast of two sRGB colours (WCAG 2). */
function contrast(a: number[], b: number[]): number {
  const lum = (c: number[]): number => {
    const [r, g, bl] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
const rgb = (css: string): number[] => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);

/** A save whose envelope reads (park line on the title) but whose state does not load. */
const damagedSave = (park: string, tick = 0): string => JSON.stringify({ format: SAVE_FORMAT, savedAt: new Date().toISOString(), state: { park: { name: park }, tick } });

const autosaveName = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const raw = localStorage.getItem('tc.save.auto');
    return raw === null ? null : ((JSON.parse(raw) as { state: { park: { name: string } } }).state.park.name ?? null);
  });

/** Runs the world to its next month end (the month-end events reach the UI on the next frame). */
const toMonthEnd = (page: Page): Promise<void> =>
  page.evaluate((m) => {
    const g = (window as unknown as { __tc: { step(n: number): void; world: { state: { tick: number } } } }).__tc;
    g.step(m - (g.world.state.tick % m));
  }, TICKS_PER_MONTH);

test.describe('the title screen holds the keyboard and the clock (F5)', () => {
  test('30 presses of Tab never leave the title; the speed stays 0', async ({ page }, info) => {
    test.skip(isPhone(info), 'keyboard check');
    await page.goto('/');
    await expect(page.getByTestId('title-new')).toBeFocused();
    for (let i = 1; i <= 30; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => document.activeElement?.closest('.title-screen') !== null && document.activeElement?.closest('.title-screen') !== undefined);
      expect(inside, `Tab ${i}: ${await focusedName(page)}`).toBe(true);
    }
    expect(await tc<number>(page, 'g.speed')).toBe(0);
  });

  test('the Settings screen opened from the title works with the keyboard', async ({ page }, info) => {
    test.skip(isPhone(info), 'keyboard check');
    await page.goto('/');
    await tabTo(page, page.getByTestId('title-settings'));
    await page.keyboard.press('Enter');
    const screen = page.getByTestId('settings-screen');
    await expect(screen).toBeVisible();
    const toggle = page.getByTestId('setting-highContrast');
    await tabTo(page, toggle);
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('.settings-screen') != null), `Tab ${i}: ${await focusedName(page)}`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(screen).toHaveCount(0);
    await expect(page.getByTestId('title-settings')).toBeFocused();
  });

  test('desktop: the title menu shows the keyboard focus ring over its hard shadow (F8)', async ({ page }, info) => {
    test.skip(isPhone(info), 'keyboard check');
    await page.goto('/');
    await tabTo(page, page.getByTestId('title-load'));
    await tabTo(page, page.getByTestId('title-new'));
    const shadow = await page.evaluate(() => getComputedStyle(document.activeElement as Element).boxShadow);
    expect(shadow).toMatch(/rgb\(31, 35, 64\) 0px 0px 0px 5px/);
    expect(shadow, 'the hard shadow stays').toMatch(/rgb\(31, 35, 64\) 0px 4px 0px 0px/);
  });

  test('the hidden world behind the title does not overwrite the autosave', async ({ page }, info) => {
    test.skip(isPhone(info), 'one project is enough');
    await newPark(page, 'Maple Hollow');
    await toMonthEnd(page);
    await expect.poll(() => autosaveName(page)).toBe('Maple Hollow');
    await page.reload();
    await expect(page.getByTestId('title-continue')).toBeVisible();
    expect(await tc<number>(page, 'g.speed')).toBe(0);
    await tc(page, 'g.setSpeed(4)');
    await toMonthEnd(page);
    await frames(page, 6);
    await page.waitForTimeout(500);
    expect(await tc<number>(page, `g.world.state.tick % ${TICKS_PER_MONTH}`)).toBeLessThan(TICKS_PER_MONTH / 2);
    expect(await autosaveName(page)).toBe('Maple Hollow');
  });

  test('a failed Continue shows its toast over the title', async ({ page }) => {
    await page.addInitScript((s) => localStorage.setItem('tc.save.1', s), damagedSave('Broken'));
    await page.goto('/');
    const cont = page.getByTestId('title-continue');
    await expect(cont).toBeVisible();
    await cont.click();
    const toast = page.locator('.toast-host:not(.msg-toast-host) .toast');
    await expect(toast).toBeVisible();
    await expect(page.locator('.title-screen')).toBeVisible();
    const top = await toast.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && el.contains(hit);
    });
    expect(top, 'the toast is the top element at its centre').toBe(true);
  });

  test('the Continue line names the month in the language of the game (en-XA)', async ({ page }, info) => {
    test.skip(isPhone(info), 'one project is enough');
    const settings = serializeSettings({ ...defaultSettings(), locale: 'en-XA' });
    await page.addInitScript(([s, save]) => {
      localStorage.setItem('tc.settings', s as string);
      localStorage.setItem('tc.save.1', save as string);
    }, [settings, damagedSave('Pseudo Park', 0)]);
    await page.goto('/');
    const line = page.locator('[data-testid="title-continue"] .title-park-line');
    await expect(line).toBeVisible();
    await expect(line).toContainText(pseudoLocalize('Mar'));
    await expect(line).not.toContainText('Year');
  });
});

test.describe('in the park', () => {
  test.beforeEach(async ({ page }) => newPark(page, 'Repair Park'));

  test('Put back on the Staff card while the patrol tool runs selects Inspect (F1)', async ({ page }) => {
    await openTool(page, 'staff');
    await page.getByTestId('hire-mechanic').click();
    await page.getByTestId('staff-edit-patrol').click();
    await expect.poll(() => toolNow(page)).toBe('patrol');
    const card = await toolControl(page, 'staff');
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.card-wrap:has([data-testid="tool-staff"]) [data-testid="card-put-back"]').click();
    await frames(page, 4);
    expect(await toolNow(page)).toBe('inspect');
    await expect(page.locator('.panel')).toBeHidden();
    await expect(page.getByTestId('tool-staff')).toHaveAttribute('aria-pressed', 'false');
    await frames(page, 4);
    await expect(page.locator('.panel')).toBeHidden();
  });

  test('phone: a speed chosen with the keyboard gives the focus back to the Speed button (F2)', async ({ page }, info) => {
    test.skip(!isPhone(info), 'the phone Speed menu');
    const toggle = page.getByTestId('speed-toggle');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('group', { name: 'Game speed' })).toBeVisible();
    const two = page.locator('.speed-btn[aria-label="Speed 2×"]');
    await tabTo(page, two, 8);
    await page.keyboard.press('Enter');
    await expect(toggle).toBeFocused();
    expect(await tc<number>(page, 'g.speed')).toBe(2);
  });

  test('phone: the tip hides while the Shows or the Scenery picker is open (F3)', async ({ page }, info) => {
    test.skip(!isPhone(info), 'the phone rule');
    const tip = page.getByTestId('tip');
    await expect(tip).toHaveAttribute('data-tip', 'noRide', { timeout: 4000 });
    await expect(tip).toBeVisible();
    await openTool(page, 'shows');
    await expect(page.getByTestId('show-picker')).toBeVisible();
    await expect(tip).toBeHidden();
    await page.getByTestId('show-picker-close').click();
    await expect(page.getByTestId('show-picker')).toBeHidden();
    await expect(tip).toBeVisible();
    await openTool(page, 'scenery');
    await expect(page.locator('.scn-picker')).toBeVisible();
    await expect(tip).toBeHidden();
    await openTool(page, 'inspect');
    await expect(tip).toBeVisible();
  });

  test('screen readers hear a tip: a lasting status region gets its sentence (F4)', async ({ page }) => {
    const live = page.getByTestId('tip-live');
    await expect(live).toHaveCount(1);
    await expect(live).toHaveAttribute('role', 'status');
    await expect(page.getByTestId('tip')).not.toHaveAttribute('aria-live', /.*/);
    await page.waitForTimeout(2000);
    await expect(live).toHaveText('Build a ride and open it. Guests come for rides');
    await page.getByTestId('tip-close').click();
    await expect(live).toHaveText('');
  });

  test('desktop: the keyboard focus ring shows on the controls with a hard shadow (F8)', async ({ page }, info) => {
    test.skip(isPhone(info), 'keyboard check');
    const ring = async (target: Locator, what: string): Promise<void> => {
      await tabTo(page, target);
      const shadow = await page.evaluate(() => getComputedStyle(document.activeElement as Element).boxShadow);
      expect(shadow, what).toMatch(/rgb\(31, 35, 64\) 0px 0px 0px 5px|rgb\(31, 35, 64\) 0px 0px 0px 3px inset/);
      expect(shadow, what).toContain('rgb(255, 255, 255)');
    };
    await ring(page.getByTestId('status-pill'), 'status pill');
    await ring(page.getByTestId('hud-balance'), 'mood bar');
    await ring(page.locator('.speed-btn[aria-label="Speed 2×"]'), 'speed button');
    await ring(page.getByTestId('tool-messages'), 'Messages');
    await ring(page.getByTestId('tool-menu'), 'Menu');
    await ring(page.getByTestId('deck-paths'), 'deck button');
    await ring(page.getByTestId('card-carousel'), 'ride card');
    await ring(page.getByTestId('tool-shows'), 'tool card');
    await page.getByTestId('card-carousel').click();
    await expect(page.getByTestId('card-carousel')).toHaveAttribute('aria-pressed', 'true');
    await ring(page.getByTestId('card-carousel'), 'held ride card');
    await openTool(page, 'inspect');
    // High contrast keeps the ring.
    await tc(page, "g.settings.set('highContrast', true)");
    await ring(page.getByTestId('status-pill'), 'status pill, high contrast');
  });

  test('desktop: the hand keeps the focus when its cards are built again (M1)', async ({ page }, info) => {
    test.skip(isPhone(info), 'keyboard check');
    const shows = page.getByTestId('tool-shows');
    await tabTo(page, shows);
    await page.evaluate(() => (window as unknown as { __tc: { world: { state: { management: { research: { unlocked: string[] } } } } } }).__tc.world.state.management.research.unlocked.push('drop_tower'));
    await expect(page.getByTestId('card-drop_tower')).toHaveCount(1, { timeout: 4000 });
    await expect(shows).toBeFocused();
    // Put back of a held card keeps the focus too.
    await page.getByTestId('card-carousel').click();
    const back = page.locator('.card-wrap:has([data-testid="card-carousel"]) [data-testid="card-put-back"]');
    await expect(back).toBeVisible();
    await tabTo(page, back);
    await page.evaluate(() => (window as unknown as { __tc: { world: { state: { management: { research: { unlocked: string[] } } } } } }).__tc.world.state.management.research.unlocked.push('pendulum_ship'));
    await expect(page.getByTestId('card-pendulum_ship')).toHaveCount(1, { timeout: 4000 });
    await expect(page.locator('.card-wrap:has([data-testid="card-carousel"]) [data-testid="card-put-back"]')).toBeFocused();
  });

  test('phone: Enter on the Overlays card gives the focus to its deck chip when the hand tucks (M2)', async ({ page }, info) => {
    test.skip(!isPhone(info), 'the phone tuck');
    const card = await toolControl(page, 'overlays');
    await card.focus();
    await page.keyboard.press('Enter');
    await frames(page, 4);
    await expect(page.getByTestId('hand')).toBeHidden();
    await expect(page.getByTestId('deck-manage')).toBeFocused();
  });

  test('phone: the Speed button is named after the speed, also when paused (M4)', async ({ page }, info) => {
    test.skip(!isPhone(info), 'the phone Speed button');
    await setSpeed(page, 'Pause');
    await expect(page.getByTestId('speed-toggle')).toHaveAttribute('aria-label', 'Pause');
    await setSpeed(page, 'Speed 2×');
    await expect(page.getByTestId('speed-toggle')).toHaveAttribute('aria-label', 'Speed 2×');
  });

  test('desktop: a research message shown with the keyboard focuses the new card in view (ruling 19)', async ({ page }, info) => {
    test.skip(isPhone(info), 'keyboard check');
    await page.evaluate(() => (window as unknown as { __tc: { world: { state: { management: { research: { unlocked: string[] } } } } } }).__tc.world.state.management.research.unlocked.push('gyro_globe'));
    const card = page.getByTestId('card-gyro_globe');
    await expect(card).toHaveCount(1, { timeout: 4000 });
    await page.locator('[data-testid="hand"] .hand-scroll').evaluate((el) => {
      el.scrollLeft = 0;
    });
    const inView = (): Promise<boolean> =>
      card.evaluate((el) => {
        const s = (el.closest('.hand-scroll') as HTMLElement).getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return r.left >= s.left - 0.5 && r.right <= s.right + 0.5;
      });
    expect(await inView(), 'the card starts out of view').toBe(false);
    await page.evaluate(() => {
      const g = (window as unknown as { __tc: { world: { state: { tick: number; management: { nextMessageId: number; messages: unknown[] } } } } }).__tc;
      const m = g.world.state.management;
      m.messages.push({ id: m.nextMessageId, tick: g.world.state.tick, category: 'research', textId: 'msg.research.newRide', params: { itemId: 'gyro_globe', name: 'Gyro Globe' }, tile: -1, entityId: -1 });
      m.nextMessageId += 1;
    });
    await page.getByTestId('deck-paths').click();
    await openTool(page, 'messages');
    const row = page.getByTestId('message-row').first();
    await tabTo(page, row);
    await page.keyboard.press('Enter');
    await expect(page.locator('.panel')).toBeHidden();
    await expect(card).toBeFocused();
    expect(await inView(), 'the card is in the hand\'s visible box').toBe(true);
  });

  test('desktop: the hand arrows jump with Reduced motion on (M9)', async ({ page }, info) => {
    test.skip(isPhone(info), 'the arrows are a desktop control');
    await page.setViewportSize({ width: 1000, height: 800 });
    await tc(page, "g.settings.set('reducedMotion', 'on')");
    await frames(page, 4);
    const moved = await page.evaluate(() => {
      const s = document.querySelector('[data-testid="hand"] .hand-scroll') as HTMLElement;
      if (s.scrollWidth <= s.clientWidth) return -1;
      s.scrollLeft = 0;
      (document.querySelector('[data-testid="hand-next"]') as HTMLButtonElement).click();
      return s.scrollLeft;
    });
    expect(moved, 'the strip scrolls at once').toBeGreaterThan(0);
  });
});

/** The track builder in its pieces phase: Steel Coaster with its station at (4, 2). */
async function trackPieces(page: Page, phone: boolean): Promise<void> {
  await pickCard(page, 'track', 'steel_coaster');
  await expect(page.getByTestId('track-builder')).toBeVisible();
  const p = await showTile(page, 4, 2);
  await frames(page, 1);
  if (phone) {
    await page.touchscreen.tap(p.x, p.y);
    await page.getByTestId('track-confirm').click();
  } else {
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.getByTestId('track-builder')).toHaveAttribute('data-phase', 'pieces');
}

test.describe('the track builder', () => {
  test.beforeEach(async ({ page }) => newPark(page, 'Track Park'));

  test('desktop: a piece group button shows the focus ring (F8, D1)', async ({ page }, info) => {
    test.skip(isPhone(info), 'keyboard check');
    await trackPieces(page, false);
    await tabTo(page, page.getByTestId('track-builder-group-turns'));
    const shadow = await page.evaluate(() => getComputedStyle(document.activeElement as Element).boxShadow);
    expect(shadow).toMatch(/rgb\(31, 35, 64\) 0px 0px 0px 5px|rgb\(31, 35, 64\) 0px 0px 0px 3px inset/);
  });

  test('the piece icons have 3:1 against their button, normal and pressed (F9)', async ({ page }, info) => {
    test.skip(isPhone(info), 'one project is enough');
    await trackPieces(page, false);
    const piece = page.getByTestId('track-piece-straight');
    await page.getByTestId('track-builder-group-straight').click();
    await expect(piece).toBeVisible();
    const measure = (): Promise<{ icon: number[] | null; bg: string }> =>
      piece.evaluate((b) => {
        const c = b.querySelector('canvas') as HTMLCanvasElement;
        const d = (c.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height).data;
        const count = new Map<string, number>();
        for (let i = 0; i < d.length; i += 4) {
          if ((d[i + 3] as number) < 250) continue;
          const k = `${d[i]},${d[i + 1]},${d[i + 2]}`;
          count.set(k, (count.get(k) ?? 0) + 1);
        }
        const top = [...count.entries()].sort((x, y) => y[1] - x[1])[0];
        return { icon: top ? top[0].split(',').map(Number) : null, bg: getComputedStyle(b).backgroundColor };
      });
    await page.mouse.move(0, 0);
    if ((await piece.getAttribute('aria-pressed')) === 'true') await page.getByTestId('track-piece-straight').click();
    const normal = await measure();
    expect(normal.icon, 'the icon has opaque pixels').not.toBeNull();
    expect(contrast(normal.icon as number[], rgb(normal.bg)), `normal: ${normal.icon} on ${normal.bg}`).toBeGreaterThanOrEqual(3);
    await piece.click();
    await expect(piece).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(0, 0);
    const pressed = await measure();
    expect(contrast(pressed.icon as number[], rgb(pressed.bg)), `pressed: ${pressed.icon} on ${pressed.bg}`).toBeGreaterThanOrEqual(3);
  });
});

test.describe('phone at text scale 175% (D4)', () => {
  test.beforeEach(async ({ page }) => {
    const doc = serializeSettings({ ...defaultSettings(), textScale: 175 });
    await page.addInitScript((d) => window.localStorage.setItem('tc.settings', d), doc);
    await newPark(page, 'Large Park');
  });

  test('the Height bar: 44 px buttons and chips; the selected chip is ink with white text, the others readable', async ({ page }, info) => {
    test.skip(!isPhone(info), 'the phone at 175%');
    await openTool(page, 'footpath');
    const bar = page.getByTestId('path-height-bar');
    await expect(bar).toBeVisible();
    for (const id of ['path-height-down', 'path-height-up', 'path-ramp-flat', 'path-ramp-up', 'path-ramp-down']) {
      const b = await page.getByTestId(id).boundingBox();
      expect(b, id).not.toBeNull();
      expect(b?.width ?? 0, `${id} width`).toBeGreaterThanOrEqual(44);
      expect(b?.height ?? 0, `${id} height`).toBeGreaterThanOrEqual(44);
    }
    const look = (id: string): Promise<{ bg: string; fg: string; opacity: string; pressed: string | null }> =>
      page.getByTestId(id).evaluate((el) => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, fg: s.color, opacity: s.opacity, pressed: el.getAttribute('aria-pressed') };
      });
    const flat = await look('path-ramp-flat');
    expect(flat.pressed).toBe('true');
    expect(flat.bg, 'the selected chip is ink').toBe('rgb(31, 35, 64)');
    expect(flat.fg, 'with white text').toBe('rgb(255, 255, 255)');
    expect(flat.opacity).toBe('1');
    for (const id of ['path-ramp-up', 'path-ramp-down']) {
      const c = await look(id);
      expect(c.opacity, id).toBe('1');
      expect(contrast(rgb(c.fg), rgb(c.bg)), `${id}: ${c.fg} on ${c.bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('the station builder: the Station length buttons are 44 px', async ({ page }, info) => {
    test.skip(!isPhone(info), 'the phone at 175%');
    await pickCard(page, 'track', 'steel_coaster');
    await expect(page.getByTestId('track-builder')).toBeVisible();
    const buttons = page.locator('.tb-station .stepper .btn.step');
    await expect(buttons).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      await buttons.nth(i).scrollIntoViewIfNeeded();
      const b = await buttons.nth(i).boundingBox();
      expect(b?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(b?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('the title on whole px (M8)', () => {
  for (const [w, h] of [[601, 900], [845, 390]] as const) {
    test(`${w} x ${h}: every menu button, the sheet and the plate start on a whole px`, async ({ page }, info) => {
      test.skip(isPhone(info), 'window sizes are set on the desktop project');
      const watch = watchErrors(page);
      await page.setViewportSize({ width: w, height: h });
      for (const save of [false, true]) {
        if (save) await page.evaluate((s) => localStorage.setItem('tc.save.1', s), damagedSave('Whole Park'));
        await page.goto('/');
        await expect(page.getByTestId('title-new')).toBeVisible();
        await frames(page, 3);
        const lefts = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('.title-menu .btn')].filter((b) => b.getClientRects().length > 0).map((b) => [b.dataset.testid ?? '', b.getBoundingClientRect().left] as const),
        );
        expect(lefts.length).toBeGreaterThanOrEqual(save ? 6 : 5);
        for (const [id, x] of lefts) expect(Math.abs(x - Math.round(x)), `${id} at ${x} (save: ${save})`).toBeLessThanOrEqual(0.01);
      }
      await page.getByTestId('title-new').click();
      const plate = await page.locator('.title-plate').boundingBox();
      expect(plate).not.toBeNull();
      expect(Math.abs((plate?.x ?? 0) - Math.round(plate?.x ?? 0)), `plate at ${plate?.x}`).toBeLessThanOrEqual(0.01);
      watch.expectNoErrors();
    });
  }
});
