/**
 * Phase 1 §9 smoke flows (W2-D) and the Phase 0 §9 pinch check, on the desktop and phone projects.
 * Every test fails on any console error.
 */
import { expect, test, type Page } from '@playwright/test';
import { centerOn, contentAt, guestCount, isPhone, newPark, openTool, pickCard, setSpeed, tilePoint, touch, watchErrors } from './helpers';

const FOOTPATH = 1;
const QUEUE = 2;

interface RideInfo {
  id: number;
  defId: string;
  x: number;
  y: number;
  status: string;
}

async function rides(page: Page): Promise<RideInfo[]> {
  return page.evaluate(() => {
    const g = (window as unknown as { __tc: { world: { state: { rides: RideInfo[] } } } }).__tc;
    return g.world.state.rides.map((r) => ({ id: r.id, defId: r.defId, x: r.x, y: r.y, status: r.status }));
  });
}

test.describe('Phase 1 smoke: desktop', () => {
  test.beforeEach(() => test.skip(isPhone(test.info()), 'desktop flow'));

  test('build a path, a Carousel with a queue, open the park, run at 4×, save, reload, load', async ({ page }) => {
    test.setTimeout(120_000);
    const watch = watchErrors(page);
    await newPark(page, 'Desktop Smoke');
    await setSpeed(page, 'Pause');
    await centerOn(page, 31, 57);

    // Drag-build a 5-tile footpath along the row north of the entrance stub.
    await openTool(page, 'footpath');
    const a = await tilePoint(page, 29, 59);
    const b = await tilePoint(page, 33, 59);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 12 });
    await expect(page.getByTestId('tool-status-detail')).toHaveText(/^5 tiles · \$50/);
    await page.mouse.up();
    for (let x = 29; x <= 33; x++) expect(await contentAt(page, x, 59), `footpath at (${x}, 59)`).toBe(FOOTPATH);

    // Place a Carousel north of the path: its footprint centre is the tile under the pointer.
    await pickCard(page, 'flat', 'carousel');
    const anchor = await tilePoint(page, 31, 56);
    await page.mouse.move(anchor.x, anchor.y);
    await expect(page.getByTestId('tool-status')).toHaveText(/Carousel/);
    await page.mouse.click(anchor.x, anchor.y);
    await expect.poll(async () => (await rides(page)).map((r) => `${r.defId}@${r.x},${r.y}`)).toEqual(['carousel@30,55']);

    // A queue tile from the entrance gate to the path.
    await openTool(page, 'queue');
    const q = await tilePoint(page, 31, 58);
    await page.mouse.click(q.x, q.y);
    expect(await contentAt(page, 31, 58)).toBe(QUEUE);

    // Open the ride from its panel, then the park from the Park panel.
    await openTool(page, 'inspect');
    const rideTile = await tilePoint(page, 31, 55);
    await page.mouse.click(rideTile.x, rideTile.y);
    await page.getByRole('button', { name: 'Open ride' }).click();
    await expect(page.getByTestId('ride-status')).toBeVisible();
    await expect.poll(async () => (await rides(page))[0]?.status).toBe('open');
    await openTool(page, 'park');
    await page.getByRole('button', { name: 'Open park' }).click();
    await expect(page.getByRole('button', { name: 'Close park' })).toBeVisible();

    // Run at 4× for 20 s: guests arrive.
    await setSpeed(page, 'Speed 4×');
    await page.waitForTimeout(20_000);
    await setSpeed(page, 'Pause');
    const before = await guestCount(page);
    expect(before).toBeGreaterThan(0);

    // Save to slot 1, reload the page, load slot 1: the guest count matches.
    await openTool(page, 'menu');
    await page.getByTestId('menu-save').click();
    await page.getByTestId('slot-1').click();
    await expect(page.getByTestId('toast')).toHaveText(/saved to slot 1/i);
    await expect(page.getByTestId('hud-guests')).toHaveText(String(before));
    await page.reload();
    await page.getByTestId('title-load').click();
    await page.getByRole('button', { name: /Slot 1/ }).first().click();
    await expect(page.locator('.title-screen')).toBeHidden();
    await expect(page.getByTestId('hud-guests')).toHaveText(String(before));
    expect(await contentAt(page, 31, 58)).toBe(QUEUE);
    expect((await rides(page)).map((r) => r.defId)).toEqual(['carousel']);
    watch.expectNoErrors();
  });
});

test.describe('Phase 1 smoke: phone', () => {
  test.beforeEach(() => test.skip(!isPhone(test.info()), 'phone flow'));

  test('tap-build a path, place a ride with tap + Confirm, long-press a guest to open its panel', async ({ page }) => {
    test.setTimeout(90_000);
    const watch = watchErrors(page);
    await newPark(page, 'Phone Smoke');
    await setSpeed(page, 'Pause');
    await centerOn(page, 31, 57);

    // Tap builds one footpath tile.
    await openTool(page, 'footpath');
    const p = await tilePoint(page, 30, 59);
    await page.touchscreen.tap(p.x, p.y);
    await expect.poll(() => contentAt(page, 30, 59)).toBe(FOOTPATH);

    // Ride picker in the bottom sheet; a tap moves the ghost; Confirm places the ride.
    await pickCard(page, 'flat', 'carousel', { tap: true });
    const anchor = await tilePoint(page, 34, 56);
    await page.touchscreen.tap(anchor.x, anchor.y);
    expect(await rides(page)).toEqual([]);
    await page.getByRole('button', { name: 'Confirm', exact: true }).tap();
    await expect.poll(async () => (await rides(page)).map((r) => `${r.defId}@${r.x},${r.y}`)).toEqual(['carousel@33,55']);
    await page.getByRole('button', { name: 'Cancel', exact: true }).tap();

    // Guests come in through the debug hook: open the ride and the park, then step the game while paused.
    const guest = await page.evaluate(() => {
      const g = (window as unknown as { __tc: TcDebug }).__tc;
      const ride = g.world.state.rides[0];
      if (ride) g.dispatch({ type: 'setRideOpen', rideId: ride.id, open: true });
      g.dispatch({ type: 'setParkOpen', open: true });
      for (let k = 0; k < 400 && g.world.state.guests.length === 0; k++) g.step(10);
      g.step(15);
      const first = g.world.state.guests.find((x) => x.state === 'walking' || x.state === 'arriving');
      return first ? { id: first.id, tile: first.tile, width: g.world.state.map.width } : null;
    });
    expect(guest).not.toBeNull();
    if (!guest) return;
    const gx = guest.tile % guest.width;
    const gy = Math.floor(guest.tile / guest.width);
    await centerOn(page, gx, gy);
    const at = await tilePoint(page, gx, gy);
    const cdp = await page.context().newCDPSession(page);
    await touch(cdp, 'touchStart', [{ x: at.x, y: at.y, id: 1 }]);
    await page.waitForTimeout(800);
    await touch(cdp, 'touchEnd', []);
    const panel = page.locator('aside.panel[data-kind="guest"]');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.panel-title')).toHaveText(`Guest ${guest.id}`);
    watch.expectNoErrors();
  });

  test('a two-finger pinch zooms (data-zoom changes)', async ({ page }) => {
    const watch = watchErrors(page);
    await newPark(page, 'Pinch Park');
    await setSpeed(page, 'Pause');
    const canvas = page.locator('#game');
    const zoomBefore = Number(await canvas.getAttribute('data-zoom'));
    const box = await canvas.boundingBox();
    if (!box) throw new Error('no canvas');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    await touch(cdp, 'touchStart', [{ x: cx - 40, y: cy, id: 1 }]);
    await touch(cdp, 'touchStart', [
      { x: cx - 40, y: cy, id: 1 },
      { x: cx + 40, y: cy, id: 2 },
    ]);
    for (let k = 1; k <= 10; k++) {
      await touch(cdp, 'touchMove', [
        { x: cx - 40 - 8 * k, y: cy, id: 1 },
        { x: cx + 40 + 8 * k, y: cy, id: 2 },
      ]);
    }
    await touch(cdp, 'touchEnd', []);
    await expect.poll(async () => Number(await canvas.getAttribute('data-zoom'))).toBeGreaterThan(zoomBefore);
    watch.expectNoErrors();
  });

  test('Review Focus 4: a second finger during a path drag cancels the build and pinches instead', async ({ page }) => {
    const watch = watchErrors(page);
    await newPark(page, 'Overlap Park');
    await setSpeed(page, 'Pause');
    await centerOn(page, 25, 50);
    await openTool(page, 'footpath');
    // The second finger spreads down to the bars above the hand: a press on the open deck closes the hand (Footpath stays held).
    await page.getByTestId('deck-paths').click();
    await expect(page.getByTestId('hand')).toBeHidden();
    const zoomBefore = Number(await page.locator('#game').getAttribute('data-zoom'));
    const countPaths = (): Promise<number> =>
      page.evaluate(() => {
        const c = (window as unknown as { __tc: TcDebug }).__tc.world.state.map.content;
        let n = 0;
        for (let i = 0; i < c.length; i++) if (c[i] === 1) n++;
        return n;
      });
    const pathsBefore = await countPaths();
    const a = await tilePoint(page, 22, 50);
    const b = await tilePoint(page, 26, 50);
    const cdp = await page.context().newCDPSession(page);
    await touch(cdp, 'touchStart', [{ x: a.x, y: a.y, id: 1 }]);
    for (let k = 1; k <= 6; k++) await touch(cdp, 'touchMove', [{ x: a.x + ((b.x - a.x) * k) / 6, y: a.y + ((b.y - a.y) * k) / 6, id: 1 }]);
    await expect(page.getByTestId('tool-status-detail')).toHaveText(/tiles/);
    // The second finger lands mid-drag; both fingers spread apart.
    await touch(cdp, 'touchStart', [
      { x: b.x, y: b.y, id: 1 },
      { x: b.x + 60, y: b.y + 60, id: 2 },
    ]);
    for (let k = 1; k <= 8; k++) {
      await touch(cdp, 'touchMove', [
        { x: b.x - 8 * k, y: b.y - 8 * k, id: 1 },
        { x: b.x + 60 + 8 * k, y: b.y + 60 + 8 * k, id: 2 },
      ]);
    }
    await touch(cdp, 'touchEnd', [{ x: b.x - 64, y: b.y - 64, id: 1 }]);
    await touch(cdp, 'touchEnd', []);
    await page.waitForTimeout(200);
    expect(await countPaths()).toBe(pathsBefore);
    await expect.poll(async () => Number(await page.locator('#game').getAttribute('data-zoom'))).toBeGreaterThan(zoomBefore);
    watch.expectNoErrors();
  });
});

interface TcDebug {
  world: {
    state: {
      rides: { id: number }[];
      guests: { id: number; tile: number; state: string }[];
      map: { width: number; content: ArrayLike<number> };
    };
  };
  dispatch(cmd: unknown): unknown;
  step(n: number): void;
}
