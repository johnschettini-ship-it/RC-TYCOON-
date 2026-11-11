/**
 * Shared Playwright helpers (W2-D). The page exposes the Game as `window.__tc` (debug hook for e2e tests).
 * Tile positions on screen follow `src/render/iso.ts` (64 × 32 px tiles, 8 px per height step) and
 * `src/render/camera.ts` (`worldToScreen`).
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, type CDPSession, type Locator, type Page, type TestInfo } from '@playwright/test';

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

export async function setSpeed(page: Page, label: 'Pause' | 'Speed 1×' | 'Speed 2×' | 'Speed 4×', opts: PressOptions = {}): Promise<void> {
  const group = page.getByRole('group', { name: 'Game speed' });
  const button = group.getByRole('button', { name: label });
  // The phone keeps the speed buttons in a menu that its Speed button opens.
  const toggle = page.getByTestId('speed-toggle');
  if ((await toggle.isVisible()) && !(await group.isVisible())) await press(toggle, opts);
  await press(button, opts);
  // The phone's menu closes on a choice, so the pressed state is read by label, not by role (a hidden button has none).
  await expect(page.locator(`.speed-btn[aria-label="${label}"]`)).toHaveAttribute('aria-pressed', 'true');
}

/** How a control is pressed: a click by default, a tap when `tap` is set (touch tests pass it, as they tapped before). */
export interface PressOptions {
  tap?: boolean;
}

async function press(control: Locator, opts: PressOptions): Promise<void> {
  if (opts.tap) await control.tap();
  else await control.click();
}

/** The deck of each old toolbar id that became a tool card (Phase 7 §4.4); the other ids keep a control on the screen. */
const DECK_OF: Readonly<Record<string, string>> = {
  shows: 'rides',
  footpath: 'paths',
  queue: 'paths',
  pathItems: 'paths',
  scenery: 'scenery',
  land: 'scenery',
  water: 'scenery',
  buyLand: 'scenery',
  staff: 'manage',
  research: 'manage',
  marketing: 'manage',
  finance: 'manage',
  park: 'manage',
  overlays: 'manage',
};

/**
 * The control of an old toolbar id (`footpath`, `demolish`, `menu`, ...): a tool card, with its deck opened first (with
 * the same input kind) when the card is not on the screen, or the deck list, mood bar, or controls element. It is
 * brought into view (the chip row and the hand scroll sideways).
 */
export async function toolControl(page: Page, id: string, opts: PressOptions = {}): Promise<Locator> {
  // The UI applies a press on its next frame (the phone hand tucks away while a card is pressed).
  await nextFrames(page);
  const control = page.locator(`[data-tool="${id}"]`);
  const deck = DECK_OF[id];
  if (deck && !(await control.isVisible())) {
    const button = page.getByTestId(`deck-${deck}`);
    await button.scrollIntoViewIfNeeded();
    await press(button, opts);
    await expect(page.getByTestId('hand')).toHaveAttribute('data-deck', deck);
  }
  await control.scrollIntoViewIfNeeded();
  return control;
}

/** Waits two animation frames, so the frame loop has applied the last press. */
async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

/**
 * Press the control of an old toolbar id. `inspect` has no control: Put back (or Esc) selects it. `rides` and `stalls`
 * open their deck when the hand does not show it (they never close an open deck).
 */
export async function openTool(page: Page, id: string, opts: PressOptions = {}): Promise<void> {
  if (id === 'rides' || id === 'stalls') {
    await nextFrames(page);
    const hand = page.getByTestId('hand');
    if ((await hand.isVisible()) && (await hand.getAttribute('data-deck')) === id) return;
    const button = page.getByTestId(`deck-${id}`);
    await button.scrollIntoViewIfNeeded();
    await press(button, opts);
    await expect(hand).toBeVisible();
    await expect(hand).toHaveAttribute('data-deck', id);
    return;
  }
  if (id === 'inspect') {
    const tool = await page.evaluate(() => (window as unknown as { __tc: { tool: { tool: string } } }).__tc.tool.tool);
    if (tool === 'inspect') return;
    const back = page.getByTestId('card-put-back');
    if ((await back.count()) === 1 && (await back.isVisible())) await press(back, opts);
    else await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __tc: { tool: { tool: string } } }).__tc.tool.tool)).toBe('inspect');
    return;
  }
  await press(await toolControl(page, id, opts), opts);
  await nextFrames(page);
}

export type CardKind = 'flat' | 'track' | 'stall';

/**
 * A ride or stall card in the hand, made visible first: its deck (Rides for `flat` and `track`, Stalls for `stall`) is
 * opened with the same input kind when the hand does not show it, and the card is scrolled into view. It does not press
 * the card.
 */
export async function cardOf(page: Page, kind: CardKind, defId: string, opts: PressOptions = {}): Promise<Locator> {
  await openTool(page, kind === 'stall' ? 'stalls' : 'rides', opts);
  const card = page.getByTestId(`card-${defId}`);
  await card.scrollIntoViewIfNeeded();
  return card;
}

/** Hold a ride or stall card (the next click or tap on the map places it). */
export async function pickCard(page: Page, kind: CardKind, defId: string, opts: PressOptions = {}): Promise<void> {
  await press(await cardOf(page, kind, defId, opts), opts);
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

/**
 * Move the camera so tile (x, y) shows at a clear spot of the screen, and return that point (CSS px): clear of the
 * hand, the top region (and the toast under it), and the builder (right side panel, or a bottom sheet on the phone).
 */
export async function showTile(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([tx, ty]) => {
      const g = (window as unknown as { __tc: TcGame }).__tc;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const fx = vw < 900 ? 0.5 : 0.42;
      const fy = vw < 900 ? 0.36 : 0.45;
      const map = g.world.state.map;
      const z = map.heights[ty * map.width + tx] ?? 8;
      g.camera.centerX = (tx - ty) * 32 - (fx * vw - vw / 2) / g.camera.zoom;
      g.camera.centerY = (tx + ty + 1) * 16 - z * 8 - (fy * vh - vh / 2) / g.camera.zoom;
      return { x: fx * vw, y: fy * vh };
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

/** Serious and critical axe violations on the page as it is now. */
async function seriousIssues(page: Page): Promise<string[]> {
  // A toast fades in for 160 ms. The scan waits for the end of such an animation, or it reads the text at part opacity.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity).map((a) => a.finished.catch(() => undefined))).then(() => undefined),
  );
  const r = await new AxeBuilder({ page }).exclude('#loading').analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`);
}

export async function scan(page: Page, where: string): Promise<void> {
  expect(await seriousIssues(page), where).toEqual([]);
}
