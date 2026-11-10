/**
 * Shared Playwright helpers (W2-D). The page exposes the Game as `window.__tc` (debug hook for e2e tests).
 * Tile positions on screen follow `src/render/iso.ts` (64 × 32 px tiles, 8 px per height step) and
 * `src/render/camera.ts` (`worldToScreen`).
 */
import { expect, type CDPSession, type Page, type TestInfo } from '@playwright/test';

/** Collect console errors and page errors; call `expectNoErrors` at the end of the test. */
export function watchErrors(page: Page): { errors: string[]; expectNoErrors(): void } {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return {
    errors,
    expectNoErrors: () => expect(errors).toEqual([]),
  };
}

/** Start a new park from the title screen. The game starts at 1×. */
export async function newPark(page: Page, name = 'Smoke Park'): Promise<void> {
  await page.goto('/');
  await page.getByTestId('title-new').click();
  await page.getByTestId('title-name').fill(name);
  // The classic 64 × 64 Build 1 layout these tile coordinates use (New Park starts on 96 × 96).
  await page.getByTestId('title-size-64').click();
  await page.getByTestId('title-start').click();
  await expect(page.locator('.title-screen')).toBeHidden();
  // The bundled font arrives after first paint (font-display: swap); boxes are measured with it in place.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

export async function setSpeed(page: Page, label: 'Pause' | 'Speed 1×' | 'Speed 2×' | 'Speed 4×'): Promise<void> {
  const button = page.getByRole('group', { name: 'Game speed' }).getByRole('button', { name: label });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

export async function tool(page: Page, name: string): Promise<void> {
  await page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name, exact: true }).click();
}

/** Centre the camera on a tile (debug hook; the same as panning there). */
export async function centerOn(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([tx, ty]) => {
      const g = (window as unknown as { __tc: TcGame }).__tc;
      const map = g.world.state.map;
      const h = map.heights[ty * map.width + tx] ?? 0;
      g.camera.centerX = (tx - ty) * 32;
      g.camera.centerY = (tx + ty + 1) * 16 - h * 8;
    },
    [x, y] as const,
  );
}

/** Page coordinates of the centre of tile (x, y). */
export async function tilePoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([tx, ty]) => {
      const g = (window as unknown as { __tc: TcGame }).__tc;
      const map = g.world.state.map;
      const h = map.heights[ty * map.width + tx] ?? 0;
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const r = canvas.getBoundingClientRect();
      const wx = (tx - ty) * 32;
      const wy = (tx + ty + 1) * 16 - h * 8;
      return { x: r.left + (wx - g.camera.centerX) * g.camera.zoom + r.width / 2, y: r.top + (wy - g.camera.centerY) * g.camera.zoom + r.height / 2 };
    },
    [x, y] as const,
  );
}

/** Map content code at (x, y): 0 empty, 1 footpath, 2 queue, 3 building. */
export async function contentAt(page: Page, x: number, y: number): Promise<number> {
  return page.evaluate(([tx, ty]) => {
    const map = (window as unknown as { __tc: TcGame }).__tc.world.state.map;
    return map.content[ty * map.width + tx] ?? -1;
  }, [x, y] as const);
}

export async function guestCount(page: Page): Promise<number> {
  return Number(await page.getByTestId('hud-guests').textContent());
}

export function isPhone(info: TestInfo): boolean {
  return info.project.name === 'phone';
}

/** One CDP touch point. */
export interface Touch {
  x: number;
  y: number;
  id: number;
}

export async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: Touch[]): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })) });
}

/** The parts of `window.__tc` the helpers read. */
export interface TcGame {
  world: { state: { map: { width: number; heights: ArrayLike<number>; content: ArrayLike<number> } } };
  camera: { centerX: number; centerY: number; zoom: number };
}
