/**
 * R1 / R8 (owner 2026-11-12; plan ride-work-1 Task 8): Auto-finish in the track builder. A Junior Coaster station placed
 * through the UI and three pieces; Auto-finish looks for a way back to the station, shows the path with its piece count
 * and price, and Confirm builds it with one command (the circuit closes, the cash falls by the price). Undo then removes
 * one piece. Phone sizes: controls 44 × 44 with 8 px gaps, nothing clipped at 175 % text in en-XA, no serious axe issue.
 * Desktop: Enter confirms, Escape cancels.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { isPhone, newPark, pickCard, scan, showTile, watchErrors } from './helpers';
import { defaultSettings, serializeSettings } from '../../src/settings/schema';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const boxGap = (a: Box, b: Box): number => Math.hypot(Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width)), Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height)));

const SHOT = process.env.TC_AUTOFINISH_SHOT;
const FOUND = /^Adds (\d+) pieces? · (\$[\d,]+(?:\.\d\d)?)$/;

interface Tc {
  setSpeed(n: number): void;
  dispatch(cmd: Record<string, unknown>): { ok: boolean; reason?: string };
  world: { state: { park: { cash: number }; rides: Array<{ id: number; kind: string }>; track: { rides: Record<string, { pieces: unknown[]; circuitClosed: boolean }> } } };
}
const tc = <T>(page: Page, fn: (g: Tc) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__tc)`) as Promise<T>;

async function frames(page: Page, n = 2): Promise<void> {
  for (let i = 0; i < n; i++) await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOT) await page.screenshot({ path: `${SHOT}-${name}.png` });
}

async function press(page: Page, touch: boolean, id: string): Promise<void> {
  const el = page.getByTestId(id);
  if (touch) await el.tap();
  else await el.click();
}

/** A Junior Coaster station placed through the UI at (30, 30) and three pieces (a small lift) through `__tc.dispatch`. */
async function juniorWithThreePieces(page: Page, touch: boolean): Promise<void> {
  await tc(page, (g) => g.setSpeed(0));
  await pickCard(page, 'track', 'junior_coaster', { tap: touch });
  const builder = page.getByTestId('track-builder');
  await expect(builder).toHaveAttribute('data-phase', 'station');
  const p = await showTile(page, 30, 30);
  await frames(page);
  if (touch) {
    await page.touchscreen.tap(p.x, p.y);
    await frames(page);
    await page.getByTestId('track-confirm').tap();
  } else {
    await page.mouse.move(p.x, p.y);
    await frames(page);
    await page.mouse.click(p.x, p.y);
  }
  await expect(builder).toHaveAttribute('data-phase', 'pieces');
  const failed = await tc(page, (g) => {
    const r = g.world.state.rides.find((x) => x.kind === 'track')!;
    const out: string[] = [];
    // A short chained lift and the start of the drop: a Junior Coaster train on flat track alone slows to a stop.
    const specs: Array<[string, boolean]> = [['flat_to_gentle_up', true], ['gentle_up_to_flat', true], ['flat_to_gentle_down', false]];
    for (const [defId, chain] of specs) {
      const res = g.dispatch({ type: 'addTrackPiece', rideId: r.id, defId, chain });
      if (!res.ok) out.push(`${defId}: ${res.reason}`);
    }
    return out;
  });
  expect(failed).toEqual([]);
  await frames(page, 2);
}

async function pieceCount(page: Page): Promise<{ n: number; closed: boolean; cash: number }> {
  return tc(page, (g) => {
    const r = g.world.state.rides.find((x) => x.kind === 'track')!;
    const d = g.world.state.track.rides[String(r.id)]!;
    return { n: d.pieces.length, closed: d.circuitClosed, cash: g.world.state.park.cash };
  });
}

/**
 * Text clipped inside the builder's parts (scrolling or hidden overflow). The builder itself may scroll at 175 % text
 * (Task 22), and the tab and piece rows scroll sideways by design.
 */
async function clipped(el: Locator): Promise<string[]> {
  return el.evaluate((root) => {
    const out: string[] = [];
    for (const e of root.querySelectorAll<HTMLElement>('*')) {
      if (e.closest('.sr-only, [hidden]') || e.classList.contains('tb-palette') || e.classList.contains('tb-groups')) continue;
      if (e.closest('.tb-palette, .tb-groups')) continue;
      if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) out.push(`${e.className} ${e.scrollWidth}/${e.clientWidth}`);
    }
    return out;
  });
}

async function controlsOk(page: Page): Promise<void> {
  const boxes: Array<{ name: string; box: Box }> = [];
  for (const c of await page.getByTestId('track-builder').locator('button:visible').all()) {
    boxes.push({ name: (await c.getAttribute('data-testid')) ?? (await c.getAttribute('aria-label')) ?? '', box: (await c.boundingBox())! });
  }
  for (const a of boxes) {
    expect(a.box.width, a.name).toBeGreaterThanOrEqual(44);
    expect(a.box.height, a.name).toBeGreaterThanOrEqual(44);
    for (const b of boxes) if (a !== b) expect(boxGap(a.box, b.box), `${a.name} to ${b.name}`).toBeGreaterThanOrEqual(7.9);
  }
}

const SIZES = [
  { w: 390, h: 844, phone: true },
  { w: 844, h: 390, phone: true },
  { w: 1280, h: 800, phone: false },
] as const;

for (const size of SIZES) {
  test(`${size.w} × ${size.h}: Auto-finish finds a path, shows its pieces and price, and Confirm builds it`, async ({ page }, info) => {
    test.skip(isPhone(info) !== size.phone, size.phone ? 'phone sizes' : 'desktop');
    const watch = watchErrors(page);
    const touch = size.phone;
    await page.setViewportSize({ width: size.w, height: size.h });
    await newPark(page);
    await juniorWithThreePieces(page, touch);
    const auto = page.getByTestId('track-autofinish');
    await expect(auto).toBeVisible();
    await expect(auto).toHaveText('Auto-finish');
    const plateBefore = (await page.getByTestId('track-builder').boundingBox())!;
    await shot(page, `${size.w}x${size.h}-before`);
    await press(page, touch, 'track-autofinish');
    const status = page.getByTestId('track-status');
    await expect(status).toHaveText(FOUND, { timeout: 3_000 });
    const [, nText, price] = (await status.textContent())!.match(FOUND)!;
    const n = Number(nText);
    const confirm = page.getByTestId('track-autofinish-confirm');
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeEnabled();
    await expect(confirm).toHaveText(`Confirm · ${price}`);
    await expect(page.getByTestId('track-autofinish-cancel')).toBeVisible();
    await expect(page.getByTestId('track-build')).toBeHidden();
    await expect(auto).toBeHidden();
    await shot(page, `${size.w}x${size.h}-found`);
    expect(await clipped(page.getByTestId('track-builder'))).toEqual([]);
    if (touch) await controlsOk(page);
    const plate = (await page.getByTestId('track-builder').boundingBox())!;
    console.log(`${size.w}x${size.h} builder plate: before ${plateBefore.height} px, with the found path ${plate.height} px`);
    if (size.w === 390) {
      // The found path adds no row: the panel is no taller than before the search.
      expect(plate.height).toBeLessThanOrEqual(plateBefore.height + 0.5);
      await scan(page, 'track builder with an Auto-finish path');
    }

    const before = await pieceCount(page);
    await press(page, touch, 'track-autofinish-confirm');
    await expect(page.locator('.toast-host .toast', { hasText: 'Circuit complete!' }).first()).toBeVisible();
    const after = await pieceCount(page);
    expect(after.closed).toBe(true);
    expect(after.n).toBe(before.n + n);
    expect(before.cash - after.cash).toBe(Number(price!.replace(/[$,]/g, '')) * 100);
    // Undo removes one piece.
    await press(page, touch, 'track-undo');
    await frames(page, 2);
    const undone = await pieceCount(page);
    expect(undone.n).toBe(after.n - 1);
    expect(undone.closed).toBe(false);
    watch.expectNoErrors();
  });
}

test('desktop: Enter confirms a found path, Escape cancels it and stays in the builder', async ({ page }, info) => {
  test.skip(isPhone(info), 'desktop');
  await page.setViewportSize({ width: 1280, height: 800 });
  await newPark(page);
  await juniorWithThreePieces(page, false);
  await page.getByTestId('track-autofinish').click();
  await expect(page.getByTestId('track-status')).toHaveText(FOUND, { timeout: 3_000 });
  await page.keyboard.press('Escape');
  await frames(page, 2);
  await expect(page.getByTestId('track-builder')).toHaveAttribute('data-phase', 'pieces');
  await expect(page.getByTestId('track-autofinish-confirm')).toBeHidden();
  await expect(page.getByTestId('track-autofinish')).toBeVisible();
  expect((await pieceCount(page)).closed).toBe(false);
  await page.getByTestId('track-autofinish').click();
  await expect(page.getByTestId('track-status')).toHaveText(FOUND, { timeout: 3_000 });
  await page.keyboard.press('Enter');
  await frames(page, 3);
  expect((await pieceCount(page)).closed).toBe(true);
});

test('390 × 844 at 175% text in en-XA: the found path and its buttons are not clipped', async ({ page }, info) => {
  test.skip(!isPhone(info), 'phone');
  const doc = serializeSettings({ ...defaultSettings(), locale: 'en-XA', textScale: 175 });
  await page.addInitScript((d) => window.localStorage.setItem('tc.settings', d), doc);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-XA');
  await page.getByTestId('title-new').click();
  await page.getByTestId('title-size-64').click();
  await page.getByTestId('title-start').click();
  await expect(page.locator('.title-screen')).toBeHidden();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await juniorWithThreePieces(page, true);
  await page.getByTestId('track-autofinish').tap();
  const confirm = page.getByTestId('track-autofinish-confirm');
  await expect(confirm).toBeVisible({ timeout: 3_000 });
  // The texts come from the string table (accented in en-XA).
  await expect(page.getByTestId('track-status')).not.toContainText('Adds');
  await shot(page, '390x844-175-xa-found');
  expect(await clipped(page.getByTestId('track-builder'))).toEqual([]);
  for (const b of await page.getByTestId('track-builder').locator('button:visible').all()) {
    await b.scrollIntoViewIfNeeded();
    const box = (await b.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await scan(page, 'track builder with an Auto-finish path at 175 % in en-XA');
});
