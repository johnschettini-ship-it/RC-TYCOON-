/**
 * The title screen, design E (the skyline): the pixel scene and the pixel name on whole-number scales at their places
 * (PORTING §3), the menu on the lawn, the two states (with and without a save), the New game plate or sheet, small,
 * low and very wide windows, large text, and the axe scan. Rules: `docs/superpowers/specs/thrills-and-chills/
 * phase-7-title-screen.md`.
 */
import { expect, test, type Page } from '@playwright/test';
import { defaultSettings, serializeSettings } from '../../src/settings/schema';
import { isPhone, newPark, openTool, scan, watchErrors } from './helpers';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Pic extends Box {
  pw: number;
  ph: number;
  rendering: string;
}
interface Screen {
  vw: number;
  vh: number;
  kind: string | null;
  scene: Pic;
  name: Pic;
  lawn: Box | null;
  buttons: Array<Box & { id: string; primary: boolean }>;
  plate: Box | null;
  menuVisible: boolean;
}

/** Everything the checks read, in CSS px. */
async function screen(page: Page): Promise<Screen> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // The layout runs again from a ResizeObserver: wait two frames for it.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.evaluate(() => {
    const box = (el: Element): { x: number; y: number; w: number; h: number } => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };
    const pic = (el: HTMLCanvasElement): Pic => ({ ...box(el), pw: el.width, ph: el.height, rendering: getComputedStyle(el).imageRendering });
    const root = document.querySelector('.title-screen') as HTMLElement;
    const menu = root.querySelector('.title-menu') as HTMLElement;
    const lawn = root.querySelector('.title-lawn') as HTMLElement | null;
    const plate = root.querySelector('.title-plate') as HTMLElement;
    const visible = (el: HTMLElement): boolean => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      kind: root.getAttribute('data-kind'),
      scene: pic(root.querySelector('canvas.title-scene') as HTMLCanvasElement),
      name: pic(root.querySelector('.title-logo canvas') as HTMLCanvasElement),
      lawn: lawn && visible(lawn) ? box(lawn) : null,
      buttons: [...menu.querySelectorAll<HTMLElement>('button')].filter(visible).map((b) => ({ ...box(b), id: b.dataset.testid ?? '', primary: b.classList.contains('primary') })),
      plate: visible(plate) ? box(plate) : null,
      menuVisible: visible(menu),
    };
  });
}

const meets = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: Box, vw: number, vh: number): boolean => a.x >= -0.5 && a.y >= -0.5 && a.x + a.w <= vw + 0.5 && a.y + a.h <= vh + 0.5;

/** A whole-number scale of its own pixel size, on whole CSS px, with hard pixels. */
function expectHardPixels(p: Pic, what: string): number {
  const s = p.w / p.pw;
  expect(Number.isInteger(s) && s >= 1, `${what}: scale ${s}`).toBe(true);
  expect(p.h / p.ph, `${what}: the same scale both ways`).toBe(s);
  expect(Number.isInteger(p.x) && Number.isInteger(p.y), `${what}: whole px at ${p.x}, ${p.y}`).toBe(true);
  expect(p.rendering, what).toBe('pixelated');
  return s;
}

/** Menu checks of the brief (test 2): sizes, gaps, inside the window, the name clear of every button. */
function expectMenu(g: Screen, phoneKind: boolean): void {
  expect(g.buttons.length).toBeGreaterThanOrEqual(5);
  for (const b of g.buttons) {
    expect(b.h, `${b.id} height`).toBeGreaterThanOrEqual(b.primary ? 56 : 44);
    expect(b.w, `${b.id} width`).toBeGreaterThanOrEqual(44);
    expect(inside(b, g.vw, g.vh), `${b.id} inside ${g.vw} x ${g.vh}: ${JSON.stringify(b)}`).toBe(true);
    expect(meets(b, g.name), `the name meets ${b.id}`).toBe(false);
  }
  for (let i = 0; i < g.buttons.length; i++) {
    for (let j = i + 1; j < g.buttons.length; j++) {
      const a = g.buttons[i] as Box & { id: string };
      const b = g.buttons[j] as Box & { id: string };
      const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
      const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
      expect(Math.max(gapX, gapY), `${a.id} and ${b.id} are 8 px apart`).toBeGreaterThanOrEqual(7.5);
    }
  }
  if (phoneKind) expect(g.vh - Math.max(...g.buttons.map((b) => b.y + b.h)), 'free under the last button').toBeGreaterThanOrEqual(24);
}

/** A saved park in slot 1, then the title again (reload). */
async function withSave(page: Page, park: string): Promise<void> {
  await newPark(page, park);
  await openTool(page, 'menu');
  await page.getByTestId('menu-save').click();
  await page.getByTestId('slot-1').click();
  await expect(page.getByTestId('toast')).toHaveText(/saved to slot 1/i);
  await page.reload();
  await expect(page.getByTestId('title-continue')).toBeVisible();
}

test.describe('title screen: the skyline (design E)', () => {
  test('the scene and the name are hard pixels at the places of PORTING §3; the menu fits (with a save)', async ({ page }, info) => {
    test.setTimeout(90_000);
    const watch = watchErrors(page);
    await withSave(page, 'Maple Hollow');
    const phone = isPhone(info);
    if (phone) await page.setViewportSize({ width: 412, height: 915 });
    const g = await screen(page);
    const s = expectHardPixels(g.scene, 'scene');
    const ns = expectHardPixels(g.name, 'name');
    if (phone) {
      // 412 x 915: phone, 2x, stack at 30, 70, scene at -244, -5 (column menu, 252 px).
      expect({ kind: g.kind, s, ns, pw: g.name.pw }).toEqual({ kind: 'phone', s: 2, ns: 2, pw: 176 });
      expect([g.name.x, g.name.y, g.scene.x, g.scene.y]).toEqual([30, 70, -244, -5]);
    } else {
      // 1280 x 800: desktop, 2x, line at 144, 72, scene at 0, 0.
      expect({ kind: g.kind, s, ns, pw: g.name.pw }).toEqual({ kind: 'desktop', s: 2, ns: 2, pw: 496 });
      expect([g.name.x, g.name.y, g.scene.x, g.scene.y]).toEqual([144, 72, 0, 0]);
    }
    expectMenu(g, phone);
    // The Continue line shows the park.
    await expect(page.getByTestId('title-continue')).toContainText('Maple Hollow');
    watch.expectNoErrors();
  });

  test('no save: no Continue; New game is the main button with the first-park line; the menu fits', async ({ page }, info) => {
    const watch = watchErrors(page);
    await page.goto('/');
    await expect(page.getByTestId('title-new')).toBeVisible();
    await expect(page.getByTestId('title-continue')).toBeHidden();
    await expect(page.getByTestId('title-new')).toContainText('Start your first park');
    const g = await screen(page);
    expectHardPixels(g.scene, 'scene');
    expectHardPixels(g.name, 'name');
    expect(g.buttons.find((b) => b.id === 'title-new')?.primary).toBe(true);
    expectMenu(g, isPhone(info));
    watch.expectNoErrors();
  });

  test('New game: the plate or sheet holds the view, the scene and the name stay; Back returns to the menu', async ({ page }) => {
    const watch = watchErrors(page);
    await page.goto('/');
    await expect(page.getByTestId('title-new')).toBeVisible();
    const before = await screen(page);
    await page.getByTestId('title-new').click();
    await expect(page.getByTestId('title-newgame')).toBeVisible();
    await expect(page.locator('.title-menu')).toBeHidden();
    const open = await screen(page);
    expect(open.plate).not.toBeNull();
    expect(meets(open.name, open.plate as Box), 'the name meets the plate').toBe(false);
    for (const k of ['x', 'y', 'w', 'h'] as const) {
      expect(open.scene[k], `scene ${k}`).toBe(before.scene[k]);
      expect(open.name[k], `name ${k}`).toBe(before.name[k]);
    }
    // Back: the menu again, the focus on its first button.
    await page.getByTestId('title-back').scrollIntoViewIfNeeded();
    await page.getByTestId('title-back').click();
    await expect(page.locator('.title-menu')).toBeVisible();
    await expect(page.locator('.title-menu button:visible').first()).toBeFocused();
    // Start can be scrolled into view and pressed.
    await page.getByTestId('title-new').click();
    await page.getByTestId('title-start').scrollIntoViewIfNeeded();
    await page.getByTestId('title-start').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    watch.expectNoErrors();
  });

  test('small, low and very wide windows: the scene covers the window, the name and the menu fit', async ({ page }, info) => {
    test.skip(isPhone(info), 'window sizes are set on the desktop project');
    const watch = watchErrors(page);
    const sizes: Array<[number, number, string]> = [
      [1280, 720, 'desktop'], [1366, 625, 'desktop'], [1280, 580, 'desktop'], [1024, 768, 'desktop'], [1920, 1080, 'desktop'],
      [2560, 950, 'desktop'], [844, 390, 'low'], [667, 375, 'low'], [360, 640, 'phone'], [320, 568, 'phone'], [768, 1024, 'phone'],
    ];
    await page.goto('/');
    await expect(page.getByTestId('title-new')).toBeVisible();
    for (const [width, height, kind] of sizes) {
      await page.setViewportSize({ width, height });
      const g = await screen(page);
      const at = `${width} x ${height}`;
      expect(g.kind, at).toBe(kind);
      expectHardPixels(g.scene, `${at} scene`);
      expectHardPixels(g.name, `${at} name`);
      expect(g.scene.x, `${at}: the scene reaches the left edge`).toBeLessThanOrEqual(0);
      expect(g.scene.x + g.scene.w, `${at}: the scene reaches the right edge`).toBeGreaterThanOrEqual(width);
      // The bottom edge: the scene, or the lawn below it (G7).
      const bottom = Math.max(g.scene.y + g.scene.h, g.lawn && g.lawn.y <= g.scene.y + g.scene.h + 0.5 ? g.lawn.y + g.lawn.h : 0);
      expect(bottom, `${at}: the scene reaches the bottom edge`).toBeGreaterThanOrEqual(height);
      expect(inside(g.name, width, height), `${at}: the name is inside the window`).toBe(true);
      for (const b of g.buttons) {
        expect(inside(b, width, height), `${at}: ${b.id} is inside the window`).toBe(true);
        expect(meets(b, g.name), `${at}: the name meets ${b.id}`).toBe(false);
      }
    }
    watch.expectNoErrors();
  });

  test('175% text with en-XA: no menu button clips its text; every button can be reached', async ({ page }) => {
    const watch = watchErrors(page);
    const doc = serializeSettings({ ...defaultSettings(), locale: 'en-XA', textScale: 175 });
    await page.addInitScript((d) => window.localStorage.setItem('tc.settings', d), doc);
    await page.goto('/');
    await expect(page.locator('#ui')).toHaveAttribute('data-text-scale', '175');
    await expect(page.getByTestId('title-new')).toContainText('Ñéŵ');
    const g = await screen(page);
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.title-menu button, .title-menu button *')]
        .filter((el) => el.getClientRects().length > 0 && el.scrollWidth > el.clientWidth + 1)
        .map((el) => `${el.tagName} "${el.textContent}" ${el.scrollWidth} > ${el.clientWidth}`),
    );
    expect(clipped).toEqual([]);
    for (const b of g.buttons) expect(inside(b, g.vw, g.vh), `${b.id} inside the window`).toBe(true);
    // The New game view: the three mode buttons hold their titles and lines inside their outlines.
    await page.getByTestId('title-new').click();
    await expect(page.getByTestId('title-tutorial')).toBeVisible();
    const spill = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.tc-modes > button')].flatMap((btn) => {
        const box = btn.getBoundingClientRect();
        const out = [...btn.querySelectorAll<HTMLElement>('*')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < box.left - 0.5 || r.right > box.right + 0.5;
        });
        const bad = btn.scrollWidth > btn.clientWidth + 1 || out.length > 0;
        return bad ? [`${btn.dataset.testid}: ${btn.scrollWidth} > ${btn.clientWidth}, ${out.length} part(s) outside`] : [];
      }),
    );
    expect(spill).toEqual([]);
    // Start can be reached.
    await page.getByTestId('title-start').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('title-start')).toBeInViewport();
    watch.expectNoErrors();
  });

  test('axe: the menu and the New game panel have no serious or critical issue', async ({ page }) => {
    const watch = watchErrors(page);
    await page.goto('/');
    await expect(page.getByTestId('title-new')).toBeVisible();
    await scan(page, 'title menu');
    await page.getByTestId('title-new').click();
    await expect(page.getByTestId('title-newgame')).toBeVisible();
    await scan(page, 'new game panel');
    watch.expectNoErrors();
  });
});
