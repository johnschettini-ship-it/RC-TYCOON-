import { expect, test, type Page } from '@playwright/test';
import { cardOf, newPark, openTool, pickCard, tilePoint, watchErrors } from './helpers';

/**
 * `TC_SCREENSHOT=1`: the owner screenshots of Build 4 (Phase 7 §11), at device scale 1:
 * - `docs/screenshots/phase-7-desktop.png` (1280 × 800) and `phase-7-phone.png` (390 × 844): a park with 4 open rides
 *   and guests, the Rides deck open, the Carousel card held (desktop: with the card details panel);
 * - `docs/screenshots/phase-7-title-desktop.png` and `phase-7-title-phone.png`: the title screen with that park saved.
 * The park is built with commands through the debug hook (a picture, not a playthrough).
 */

interface OverviewTc {
  world: {
    state: {
      rides: Array<{ id: number; status: string; entrance: { outside: number } | null; exit: { outside: number } | null }>;
      map: { width: number };
      guests: unknown[];
    };
  };
  camera: { centerX: number; centerY: number; zoom: number };
  dispatch(cmd: Record<string, unknown>): { ok: boolean; reason?: string; id?: number };
  step(n: number): void;
  setSpeed(n: number): void;
}

/** Four open flat rides along a road from the entrance, three stalls, staff, and a few hundred ticks of guests. */
async function buildPark(page: Page, phone: boolean): Promise<{ open: number; guests: number }> {
  return page.evaluate((onPhone) => {
    const g = (window as unknown as { __tc: OverviewTc }).__tc;
    g.setSpeed(0);
    const st = g.world.state;
    const run = (c: Record<string, unknown>): { id?: number } => {
      const r = g.dispatch(c);
      if (!r.ok) throw new Error(`${String(c.type)}: ${r.reason} ${JSON.stringify(c)}`);
      return r;
    };
    const w = st.map.width;
    const pathAt = (tile: number, kind: string): void => {
      run({ type: 'buildPath', x: tile % w, y: Math.floor(tile / w), kind });
    };
    // The spine from the entrance and two roads across it: the ride entrances face the north road, the exits the south one.
    run({ type: 'buildPathLine', x0: 31, y0: 59, x1: 31, y1: 44, kind: 'footpath' });
    run({ type: 'buildPathLine', x0: 20, y0: 44, x1: 42, y1: 44, kind: 'footpath' });
    run({ type: 'buildPathLine', x0: 20, y0: 50, x1: 42, y1: 50, kind: 'footpath' });
    // Four rides between the roads, one per zone and the Carousel.
    for (const [defId, x] of [['big_wheel', 21], ['carousel', 26], ['teacup_twirl', 33], ['swing_tower', 38]] as const) {
      const rideId = run({ type: 'placeRide', defId, x, y: 46, rotation: 2 }).id as number;
      const r = st.rides.find((q) => q.id === rideId)!;
      if (r.entrance) pathAt(r.entrance.outside, 'queue');
      if (r.exit) pathAt(r.exit.outside, 'footpath');
      run({ type: 'setRideOpen', rideId, open: true });
    }
    // Stalls north of the road, facing it.
    for (const [defId, x] of [['snack_shack', 24], ['fizz_stand', 29], ['restrooms', 35]] as const) run({ type: 'placeStall', defId, x, y: 43, rotation: 2 });
    for (const staffType of ['mechanic', 'groundskeeper']) run({ type: 'hireStaff', staffType });
    run({ type: 'setParkOpen', open: true });
    // Guests arrive; the picture is taken at a moment when all 4 rides are open (none broken down).
    for (let t = 0; t < 40 && !(t >= 16 && st.guests.length >= 60 && st.rides.every((r) => r.status === 'open')); t++) g.step(100);
    // The rides in the middle of the free map area: between the top region and the hand, left of the desktop panel.
    const zoom = onPhone ? 0.5 : 1;
    g.camera.zoom = zoom;
    g.camera.centerX = (31 - 47) * 32 + (onPhone ? 0 : 110) / zoom;
    g.camera.centerY = (31 + 47 + 1) * 16 - 8 * 8 + (onPhone ? 20 : 60) / zoom;
    return { open: st.rides.filter((r) => r.status === 'open').length, guests: st.guests.length };
  }, phone);
}

/** Put the held card's ghost on the first free tile whose centre shows inside `box` (CSS px); false when none is free. */
async function freeGhost(page: Page, box: { x0: number; y0: number; x1: number; y1: number }): Promise<boolean> {
  for (let y = 36; y <= 56; y++) {
    for (let x = 20; x <= 42; x++) {
      const p = await tilePoint(page, x, y);
      if (p.x < box.x0 || p.x > box.x1 || p.y < box.y0 || p.y > box.y1) continue;
      await page.evaluate((tile) => {
        (window as unknown as { __tc: { tool: { hoverTile: number | null } } }).__tc.tool.hoverTile = tile;
      }, y * 64 + x);
      await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
      const valid = await page.evaluate(() => (window as unknown as { __tc: { tool: { ghost: { valid: boolean } | null } } }).__tc.tool.ghost?.valid ?? false);
      if (valid) return true;
    }
  }
  return false;
}

/**
 * Close the toasts, so the picture shows the interface at rest: the build warnings of the debug commands (a ride
 * placed before its paths), message toasts, and award toasts.
 */
async function quiet(page: Page): Promise<void> {
  await page.waitForTimeout(400);
  const toast = page.getByTestId('toast');
  if (await toast.isVisible()) await toast.click();
  await expect(toast).toBeHidden();
  const dismiss = page.locator('.msg-toast:not([hidden]) .icon-btn');
  for (let k = 0; k < 10 && (await dismiss.count()) > 0; k++) await dismiss.first().click();
  const award = page.locator('[data-testid="award-toast"]:not([hidden])');
  for (let k = 0; k < 10 && (await award.count()) > 0; k++) {
    await award.click();
    await page.waitForTimeout(250);
  }
}

test.describe('Build 4 owner screenshots', () => {
  test.use({ deviceScaleFactor: 1 });
  test('a park with 4 open rides and guests, the Rides deck open, the Carousel card held; the title with that park saved', async ({ page }, info) => {
    test.skip(!process.env.TC_SCREENSHOT, 'set TC_SCREENSHOT=1 to refresh the screenshots');
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    const phone = info.project.name === 'phone';
    await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1280, height: 800 });
    await newPark(page, 'Frost & Spark Park');
    const park = await buildPark(page, phone);
    expect(park.open).toBe(4);
    expect(park.guests).toBeGreaterThan(20);
    await quiet(page);
    await openTool(page, 'rides');
    await pickCard(page, 'flat', 'carousel');
    // The phone tucks the hand while a card is held; the Rides chip shows it again.
    if (phone) await cardOf(page, 'flat', 'carousel');
    await expect(page.getByTestId('card-carousel')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('hand')).toBeVisible();
    if (!phone) await expect(page.locator('.panel .panel-title')).toHaveText('Carousel');
    // The ghost of the held card on a free tile in the clear part of the map, as the pointer (or the screen centre on
    // touch) would put it.
    if (!phone) await page.getByTestId('hand').hover();
    expect(await freeGhost(page, phone ? { x0: 60, y0: 290, x1: 330, y1: 420 } : { x0: 300, y0: 260, x1: 860, y1: 400 }), 'a free tile for the ghost').toBe(true);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `docs/screenshots/phase-7-${phone ? 'phone' : 'desktop'}.png` });

    // The title screen with this park saved in slot 1.
    await openTool(page, 'inspect');
    await openTool(page, 'menu');
    await page.getByTestId('menu-save').click();
    await page.getByTestId('slot-1').click();
    await expect(page.getByTestId('toast')).toHaveText(/saved to slot 1/i);
    await page.reload();
    await expect(page.getByTestId('title-continue')).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `docs/screenshots/phase-7-title-${phone ? 'phone' : 'desktop'}.png` });
    errors.expectNoErrors();
  });
});
