/**
 * Touch controls spec 2026-11-18, the real taps for each flow on the phone: one finger moves the map in every tool
 * (§1), the Paint toggle (§2), turning the view and a ride (§4), and the queue builder at a placed ride's entrance (§6).
 */
import { expect, test, type Page } from '@playwright/test';
import { centerOn, contentAt, isPhone, newPark, openTool, pickCard, scan, showTile, tilePoint, touch, watchErrors } from './helpers';

interface TcTouch {
  tool: { tool: string; rotation: number };
  camera: { centerX: number; centerY: number; rotation: number };
  world: { state: { park: { cash: number }; map: { width: number; heights: ArrayLike<number>; content: ArrayLike<number> }; rides: Array<{ id: number; entrance: { gate: number; outside: number } | null }>; staff: { members: unknown[] } } };
  setSpeed(n: number): void;
}
const tc = <T>(page: Page, fn: (g: TcTouch) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__tc)`) as Promise<T>;

async function frames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

/** The map's state: cash, heights and content, as one string (a change anywhere shows). */
const mapState = (page: Page): Promise<string> =>
  tc(page, (g) => {
    const m = g.world.state.map;
    let h = 0;
    for (let i = 0; i < m.content.length; i++) h = (h * 31 + (m.content[i] as number) * 7 + (m.heights[i] as number)) | 0;
    return `${g.world.state.park.cash}|${h}`;
  });

/** A one-finger drag of 120 px across the middle of the map (real touch events through CDP). */
async function fingerDrag(page: Page): Promise<void> {
  // A point where the map itself takes the press (a tool's panel may cover the middle), with room for the drag.
  const { x, y } = await page.evaluate(() => {
    const canvas = document.getElementById('game');
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const fy of [0.45, 0.35, 0.25, 0.55]) {
      const px = w / 2 - 60;
      const py = h * fy;
      if ([0, 60, 120].every((dx) => document.elementFromPoint(px + dx, py + dx / 4) === canvas)) return { x: px, y: py };
    }
    throw new Error('no free map');
  });
  const cdp = await page.context().newCDPSession(page);
  await touch(cdp, 'touchStart', [{ x, y, id: 1 }]);
  for (let k = 1; k <= 8; k++) await touch(cdp, 'touchMove', [{ x: x + 15 * k, y: y + 4 * k, id: 1 }]);
  await touch(cdp, 'touchEnd', []);
  await frames(page);
}

test.describe('touch controls on the phone', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(!isPhone(info), 'touch flows');
    await newPark(page);
    await tc(page, (g) => g.setSpeed(0));
    await centerOn(page, 30, 40);
  });

  test('one finger moves the map in every tool and builds nothing (§1)', async ({ page }) => {
    const watch = watchErrors(page);
    for (const tool of ['inspect', 'footpath', 'queue', 'demolish', 'pathItems', 'scenery', 'land', 'water', 'buyLand', 'patrol']) {
      if (tool === 'patrol') {
        await openTool(page, 'staff', { tap: true });
        await page.getByTestId('hire-mechanic').tap();
        await page.getByTestId('staff-edit-patrol').tap();
        await expect(page.getByTestId('patrol-title')).toBeVisible();
      } else {
        await openTool(page, 'inspect', { tap: true });
        if (tool !== 'inspect') await openTool(page, tool, { tap: true });
      }
      const before = await mapState(page);
      const cam = await tc(page, (g) => g.camera.centerX);
      await fingerDrag(page);
      expect(await tc(page, (g) => g.camera.centerX), `${tool}: the map moved`).not.toBe(cam);
      expect(await mapState(page), `${tool}: nothing changed`).toBe(before);
    }
    watch.expectNoErrors();
  });

  test('land: Drag to paint off pans; on, the same drag raises the land; it resets when the tool closes (§2)', async ({ page }) => {
    const watch = watchErrors(page);
    await openTool(page, 'land', { tap: true });
    const toggle = page.getByTestId('land-paint-drag');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const b = (await toggle.boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    const before = await mapState(page);
    await fingerDrag(page);
    expect(await mapState(page)).toBe(before);
    // Chrome's touch emulation drops a tap inside the double-tap window of the last lift (a thumb is never that quick).
    await page.waitForTimeout(400);
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const cam = await tc(page, (g) => g.camera.centerX);
    await fingerDrag(page);
    expect(await tc(page, (g) => g.camera.centerX), 'the map stays').toBe(cam);
    expect(await mapState(page), 'the land changed').not.toBe(before);
    await scan(page, 'land bar with the toggle');
    await page.waitForTimeout(400);
    await page.getByTestId('land-done').tap();
    await openTool(page, 'land', { tap: true });
    await expect(page.getByTestId('land-paint-drag')).toHaveAttribute('aria-pressed', 'false');
    watch.expectNoErrors();
  });

  test('buy land: Drag to select on, a drag keeps a rectangle for Confirm (§2)', async ({ page }) => {
    await openTool(page, 'buyLand', { tap: true });
    const toggle = page.getByTestId('buy-paint-drag');
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await fingerDrag(page);
    await expect(page.getByTestId('buy-land-bar')).toBeVisible();
  });

  test('the view turns with either button; a held ride turns with Rotate and with a tap on its ghost (§4)', async ({ page }) => {
    const watch = watchErrors(page);
    const canvas = page.locator('#game');
    for (const id of ['view-rotate-left', 'view-rotate-right']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.width, id).toBeGreaterThanOrEqual(44);
      expect(b.height, id).toBeGreaterThanOrEqual(44);
      await expect(page.getByTestId(id)).toBeInViewport();
    }
    await page.getByTestId('view-rotate-right').tap();
    await expect(canvas).toHaveAttribute('data-rotation', '1');
    await page.getByTestId('view-rotate-left').tap();
    await expect(canvas).toHaveAttribute('data-rotation', '0');

    await pickCard(page, 'flat', 'carousel', { tap: true });
    const p = await showTile(page, 30, 40);
    await frames(page);
    await page.touchscreen.tap(p.x, p.y);
    await frames(page);
    const rotate = page.getByTestId('status-rotate');
    await expect(rotate).toBeVisible();
    const rb = (await rotate.boundingBox())!;
    expect(rb.height, 'the large Rotate button').toBeGreaterThanOrEqual(56);
    const r0 = await tc(page, (g) => g.tool.rotation);
    await rotate.tap();
    await expect.poll(() => tc(page, (g) => g.tool.rotation)).toBe((r0 + 1) % 4);
    // A tap on the ghost turns it again.
    await page.waitForTimeout(400);
    const q = await tilePoint(page, 30, 40);
    await page.touchscreen.tap(q.x, q.y);
    await expect.poll(() => tc(page, (g) => g.tool.rotation)).toBe((r0 + 2) % 4);
    await scan(page, 'ride placement with Rotate');
    watch.expectNoErrors();
  });

  test('a placed ride opens the queue builder at its entrance; Forward builds the queue there (§6)', async ({ page }) => {
    const watch = watchErrors(page);
    await pickCard(page, 'flat', 'carousel', { tap: true });
    const p = await showTile(page, 30, 40);
    await frames(page);
    await page.touchscreen.tap(p.x, p.y);
    await page.getByRole('button', { name: 'Confirm', exact: true }).tap();
    await expect.poll(() => tc(page, (g) => g.tool.tool)).toBe('queue');
    const panel = page.getByTestId('path-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-started', '1');
    await expect(page.getByTestId('path-cost-tag')).toHaveText('$12');
    const outside = await tc(page, (g) => g.world.state.rides[0]?.entrance?.outside ?? -1);
    expect(outside).toBeGreaterThanOrEqual(0);
    await page.getByTestId('path-forward').tap();
    const w = await tc(page, (g) => g.world.state.map.width);
    await expect.poll(() => contentAt(page, outside % w, Math.floor(outside / w))).toBe(2);
    watch.expectNoErrors();
  });
});
