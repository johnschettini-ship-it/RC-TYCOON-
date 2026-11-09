import { expect, test, type Page } from '@playwright/test';

/**
 * Elevated paths (Phase 4 §4.2, §7 Path height row; W3-B): the path height mini-bar with `Page Up` / `Page Down`
 * on desktop and + / − and the ramp toggle on a phone; an elevated line builds at the chosen height and draws.
 */

interface TcGame {
  camera: { centerX: number; centerY: number; zoom: number };
  world: { state: { park: { cash: number }; map: { width: number; heights: Uint8Array }; elevatedPaths: Array<{ x: number; y: number; z: number; rampDir: number; kind: string }> } };
  dispatch(cmd: Record<string, unknown>): { ok: boolean; reason?: string };
}
/** The debug hook, typed for this file (evaluated in the page). */
type TcWindow = Window & { __tc: TcGame };

async function newPark(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('title-new').click();
  // The classic 64 × 64 Build 1 layout these tile coordinates use (New Park starts on 96 × 96).
  await page.getByTestId('title-size-64').click();
  await page.getByTestId('title-start').click();
  await expect(page.locator('.title-screen')).toBeHidden();
  return errors;
}

/** Put tile (x, y) at height z at a clear spot of the screen; returns that point (CSS px). */
async function showTile(page: Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([tx, ty, tz]) => {
      const g = (window as unknown as TcWindow).__tc;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const fx = 0.5;
      const fy = vw < 900 ? 0.35 : 0.45;
      g.camera.centerX = (tx - ty) * 32 - (fx * vw - vw / 2) / g.camera.zoom;
      g.camera.centerY = (tx + ty + 1) * 16 - tz * 8 - (fy * vh - vh / 2) / g.camera.zoom;
      return { x: fx * vw, y: fy * vh };
    },
    [x, y, z] as const,
  );
}

/** Screen point (CSS px) of the centre of tile (x, y) at height z, for the current camera. */
async function pointOf(page: Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([tx, ty, tz]) => {
      const g = (window as unknown as TcWindow).__tc;
      const r = (document.getElementById('game') as HTMLCanvasElement).getBoundingClientRect();
      const wx = (tx - ty) * 32;
      const wy = (tx + ty + 1) * 16 - tz * 8;
      return { x: r.left + (wx - g.camera.centerX) * g.camera.zoom + r.width / 2, y: r.top + (wy - g.camera.centerY) * g.camera.zoom + r.height / 2 };
    },
    [x, y, z] as const,
  );
}

/** Canvas pixel (RGB) under a CSS point. */
async function pixelAt(page: Page, p: { x: number; y: number }): Promise<[number, number, number]> {
  return page.evaluate(([px, py]) => {
    const c = document.getElementById('game') as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    const sx = Math.round(((px - r.left) / r.width) * c.width);
    const sy = Math.round(((py - r.top) / r.height) * c.height);
    const d = (c.getContext('2d') as CanvasRenderingContext2D).getImageData(sx, sy, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0] as [number, number, number];
  }, [p.x, p.y] as const);
}

test('desktop: Page Up sets the path height, a drag builds an elevated line that draws', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'mouse and keyboard');
  const errors = await newPark(page);
  await page.getByTestId('tool-footpath').click();
  const bar = page.getByTestId('path-height-bar');
  await expect(bar).toBeVisible();
  await expect(page.getByTestId('path-height-value')).toHaveText('Ground');
  const start = await showTile(page, 24, 30, 8);
  await page.mouse.move(start.x, start.y);
  await page.keyboard.press('PageUp');
  await page.keyboard.press('PageUp');
  await page.keyboard.press('PageUp');
  await expect(bar).toHaveAttribute('data-height', '11');
  await expect(page.getByTestId('path-height-value')).toHaveText('11 m · +3 m');
  await page.keyboard.press('PageDown');
  await expect(bar).toHaveAttribute('data-height', '10');
  const cash = await page.evaluate(() => (window as unknown as TcWindow).__tc.world.state.park.cash);
  const end = await pointOf(page, 27, 30, 8);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
  const paths = await page.evaluate(() => (window as unknown as TcWindow).__tc.world.state.elevatedPaths.map((p) => [p.x, p.y, p.z, p.rampDir]));
  expect(paths).toEqual([
    [24, 30, 10, -1],
    [25, 30, 10, -1],
    [26, 30, 10, -1],
    [27, 30, 10, -1],
  ]);
  // $10 + 2 m of support at $2 each, per tile.
  expect(await page.evaluate(() => (window as unknown as TcWindow).__tc.world.state.park.cash)).toBe(cash - 4 * 1_400);
  // The deck draws in the footpath colour at its height.
  await page.mouse.move(10, 10);
  await page.waitForTimeout(150);
  const [r, g, b] = await pixelAt(page, await pointOf(page, 25, 30, 10));
  expect(Math.abs(r - 0xdc) + Math.abs(g - 0xc7) + Math.abs(b - 0x9c)).toBeLessThan(60);
  expect(errors).toEqual([]);
});

test('phone: + / − and the ramp toggle in the mini-bar; a tap builds at the height', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'touch');
  const errors = await newPark(page);
  await page.getByTestId('tool-footpath').tap();
  const bar = page.getByTestId('path-height-bar');
  await expect(bar).toBeVisible();
  await expect(page.getByTestId('path-ramp-up')).toBeDisabled();
  await page.getByTestId('path-height-up').tap();
  await page.getByTestId('path-height-up').tap();
  await expect(bar).toHaveAttribute('data-height', '10');
  await page.getByTestId('path-height-down').tap();
  await expect(bar).toHaveAttribute('data-height', '9');
  await page.getByTestId('path-ramp-up').tap();
  await expect(page.getByTestId('path-ramp-up')).toHaveAttribute('aria-pressed', 'true');
  const p = await showTile(page, 24, 30, 8);
  await page.touchscreen.tap(p.x, p.y);
  await expect.poll(() => page.evaluate(() => (window as unknown as TcWindow).__tc.world.state.elevatedPaths.length)).toBe(1);
  // A tap has no drag direction: the ramp toggle gives a flat path.
  expect(await page.evaluate(() => (window as unknown as TcWindow).__tc.world.state.elevatedPaths[0])).toMatchObject({ x: 24, y: 30, z: 9, rampDir: -1 });
  await page.getByTestId('path-height-down').tap();
  await expect(bar).toHaveAttribute('data-height', 'ground');
  expect(errors).toEqual([]);
});
