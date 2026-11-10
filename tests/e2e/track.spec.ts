import { expect, test, type Page } from '@playwright/test';
import { cardOf, openTool, pickCard, setSpeed } from './helpers';

/**
 * Track builder smoke (phase-2 §7, §9.4): build the reference circuit R1 (§9.2) through the builder UI on desktop
 * (mouse, Build button) and on a phone (taps, Confirm and Build buttons), place the gates, run the test, see the
 * ratings, and open the ride. Paths are laid with the debug hook first, like the R1 integration test, so the drop
 * skips its support over the footpath.
 */

interface TcGame {
  camera: { centerX: number; centerY: number; zoom: number };
  world: { state: { map: { width: number; heights: Uint8Array }; rides: Array<{ id: number; status: string; kind: string }>; track: { rides: Record<string, { pieces: unknown[]; circuitClosed: boolean; trains: Array<{ v: number; s: number; seats: number[]; state: string }> }> } } };
  dispatch(cmd: Record<string, unknown>): { ok: boolean; reason?: string; id?: number };
  step(n: number): void;
  setSpeed(n: number): void;
}
declare global {
  interface Window {
    __tc: TcGame;
  }
}

async function newPark(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('title-new').click();
  // The classic 64 × 64 Build 1 layout these tile coordinates use (New Park starts on 96 × 96).
  await page.getByTestId('title-size-64').click();
  await page.getByTestId('title-start').click();
  await expect(page.locator('.title-screen')).toBeHidden();
}

/** Footpaths to the park entrance and a queue to the entrance gate, laid before the track (§9.2 script). */
async function layPaths(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = window.__tc;
    const run = (c: Record<string, unknown>): void => {
      const r = g.dispatch(c);
      if (!r.ok) throw new Error(`${String(c.type)}: ${r.reason}`);
    };
    run({ type: 'buildPathLine', x0: 31, y0: 59, x1: 31, y1: 6, kind: 'footpath' });
    run({ type: 'buildPathLine', x0: 30, y0: 6, x1: 5, y1: 6, kind: 'footpath' });
    run({ type: 'buildPathLine', x0: 6, y0: 4, x1: 6, y1: 5, kind: 'footpath' });
    run({ type: 'buildPathLine', x0: 4, y0: 4, x1: 4, y1: 6, kind: 'queue' });
  });
}

/** Move the camera so tile (x, y) shows at a clear spot of the screen; returns that point (CSS px). */
async function showTile(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(([tx, ty]) => {
    const g = window.__tc;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Clear of the toolbar, HUD, and the builder (right side panel, or a bottom sheet on narrow screens).
    const fx = vw < 900 ? 0.5 : 0.42;
    const fy = vw < 900 ? 0.3 : 0.45;
    const map = g.world.state.map;
    const z = map.heights[ty * map.width + tx] ?? 8;
    const sx = (tx - ty) * 32;
    const sy = (tx + ty + 1) * 16 - z * 8;
    g.camera.centerX = sx - (fx * vw - vw / 2) / g.camera.zoom;
    g.camera.centerY = sy - (fy * vh - vh / 2) / g.camera.zoom;
    return { x: fx * vw, y: fy * vh };
  }, [x, y] as const);
}

/** Tap (phone) or click (desktop) a map tile. A touch tap only moves a ghost; a click places. */
async function hitTile(page: Page, phone: boolean, x: number, y: number): Promise<void> {
  const p = await showTile(page, x, y);
  // Let one frame run so the camera move is drawn before the pointer goes down.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  if (phone) await page.touchscreen.tap(p.x, p.y);
  else {
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y);
  }
}

async function press(page: Page, phone: boolean, testId: string): Promise<void> {
  const b = page.getByTestId(testId);
  if (phone) await b.tap();
  else await b.click();
}

type Step = { group: string; piece: string; chain?: boolean; brake?: number };

const R1_STEPS: Step[] = [
  { group: 'slopes', piece: 'flat_to_gentle_up', chain: true },
  { group: 'slopes', piece: 'gentle_to_steep_up', chain: true },
  { group: 'slopes', piece: 'steep_up', chain: true },
  { group: 'slopes', piece: 'steep_to_gentle_up', chain: true },
  { group: 'slopes', piece: 'gentle_up_to_flat', chain: true },
  { group: 'straight', piece: 'straight' },
  { group: 'straight', piece: 'straight' },
  { group: 'turns', piece: 'turn_medium_right' },
  { group: 'slopes', piece: 'flat_to_gentle_down' },
  { group: 'slopes', piece: 'gentle_to_steep_down' },
  { group: 'slopes', piece: 'steep_down' },
  { group: 'slopes', piece: 'steep_to_gentle_down' },
  { group: 'slopes', piece: 'gentle_down_to_flat' },
  { group: 'special', piece: 'brakes', brake: 8 },
  { group: 'turns', piece: 'turn_medium_right' },
  ...Array.from({ length: 10 }, (): Step => ({ group: 'straight', piece: 'straight' })),
  { group: 'turns', piece: 'turn_medium_right' },
  ...Array.from({ length: 6 }, (): Step => ({ group: 'straight', piece: 'straight' })),
  { group: 'turns', piece: 'turn_medium_right' },
];

async function pieceCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const r = window.__tc.world.state.rides.find((x) => x.kind === 'track');
    return r ? (window.__tc.world.state.track.rides[String(r.id)]?.pieces.length ?? 0) : 0;
  });
}

/** Two synthetic touch pointers spread apart on the canvas: a pinch. */
async function pinch(page: Page): Promise<void> {
  await page.evaluate(() => {
    const c = document.getElementById('game') as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    const cx = r.width / 2;
    const cy = r.height * 0.3;
    const fire = (type: string, id: number, x: number): void => {
      c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: cy, bubbles: true, cancelable: true, isPrimary: id === 11 }));
    };
    fire('pointerdown', 11, cx - 30);
    fire('pointerdown', 12, cx + 30);
    for (let k = 1; k <= 5; k++) {
      fire('pointermove', 11, cx - 30 - k * 15);
      fire('pointermove', 12, cx + 30 + k * 15);
    }
    fire('pointerup', 11, cx - 105);
    fire('pointerup', 12, cx + 105);
  });
}

test.describe('track builder', () => {
  let errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await newPark(page);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('build R1 through the builder, place the gates, test, and open', async ({ page }, info) => {
    test.setTimeout(180_000);
    const phone = info.project.name === 'phone';
    await layPaths(page);

    // 1. Rides → Track rides → Steel Coaster.
    await expect(await cardOf(page, 'track', 'steel_coaster', { tap: phone })).toBeVisible();
    await pickCard(page, 'track', 'steel_coaster', { tap: phone });
    const builder = page.getByTestId('track-builder');
    await expect(builder).toBeVisible();
    await expect(page.getByTestId('track-station-length')).toHaveText('3 tiles');

    // 2. Station at (4, 2) heading east (the default heading).
    await hitTile(page, phone, 4, 2);
    if (phone) {
      await expect(page.getByTestId('track-status')).toContainText('Steel Coaster station');
      expect(await pieceCount(page)).toBe(0);
      await press(page, phone, 'track-confirm');
    }
    await expect.poll(() => pieceCount(page)).toBe(3);
    await expect(builder).toHaveAttribute('data-phase', 'pieces');

    // 3. The palette shows only pieces that fit; build R1 piece by piece.
    for (const [i, s] of R1_STEPS.entries()) {
      await press(page, phone, `track-builder-group-${s.group}`);
      await press(page, phone, `track-piece-${s.piece}`);
      const chain = page.getByTestId('track-chain');
      if ((await chain.getAttribute('aria-pressed')) !== String(!!s.chain)) await press(page, phone, 'track-chain');
      await expect(chain).toHaveAttribute('aria-pressed', String(!!s.chain));
      if (s.brake) {
        for (let k = 6; k < s.brake; k++) await press(page, phone, 'track-brake-more');
        await expect(page.getByTestId('track-brake-value')).toHaveText(`${s.brake} m/s`);
      }
      await expect(page.getByTestId('track-status')).toContainText('✓');
      await press(page, phone, 'track-build');
      await expect.poll(() => pieceCount(page)).toBe(4 + i);
      if (phone && i === 2) {
        // A pinch while the builder is open zooms and adds no piece (§9.4).
        const zoom = await page.locator('#game').getAttribute('data-zoom');
        await pinch(page);
        await expect.poll(() => page.locator('#game').getAttribute('data-zoom')).not.toBe(zoom);
        expect(await pieceCount(page)).toBe(4 + i);
      }
    }

    // 4. The circuit closes and the builder asks for the gates.
    await expect(builder).toHaveAttribute('data-phase', 'entrance');
    await hitTile(page, phone, 4, 3);
    if (phone) {
      await expect(page.getByTestId('track-reason')).toHaveText('Fits here');
      await press(page, phone, 'track-confirm');
    }
    await expect(builder).toHaveAttribute('data-phase', 'exit');
    await hitTile(page, phone, 6, 3);
    if (phone) await press(page, phone, 'track-confirm');
    await expect(builder).toBeHidden();

    // 5. The ride panel opens on the Test tab: test at 4×, see the three ratings, open the ride.
    const testBtn = page.getByTestId('track-test');
    await expect(testBtn).toBeVisible();
    await expect(page.getByTestId('track-tab-test')).toHaveAttribute('aria-selected', 'true');
    await press(page, phone, 'track-test');
    await expect(page.getByTestId('track-test-status')).toContainText('Testing');
    await setSpeed(page, 'Speed 4×', { tap: phone });
    await expect(page.getByTestId('track-test-status')).toHaveText('Test passed', { timeout: 90_000 });
    for (const k of ['excitement', 'intensity', 'nausea']) {
      await expect(page.getByTestId(`track-rating-${k}`)).toBeVisible();
      await expect(page.getByTestId(`track-rating-${k}`).locator('.meter-value')).toHaveText(/^\d\.\d\d$/);
    }
    await expect(page.getByTestId('track-rating-excitement').locator('.meter-value')).toHaveText(/^(4\.9[5-9]|5\.0[0-5])$/);
    await expect(page.getByTestId('track-measure-vMax')).toContainText('m/s');
    await expect(page.getByTestId('track-chart')).toBeVisible();
    await press(page, phone, 'track-open');
    await expect(page.getByTestId('track-open')).toHaveText('Close ride');
    const status = await page.evaluate(() => window.__tc.world.state.rides.find((r) => r.kind === 'track')?.status);
    expect(status).toBe('open');

    // 6. Overview tab: the maintenance section (Phase 3 §7.1), the same as on a flat ride panel.
    await press(page, phone, 'track-tab-overview');
    const reliability = page.getByTestId('ride-reliability');
    await expect(reliability).toBeVisible();
    await expect(reliability.locator('.meter-value')).toHaveText(/^\d+%$/);
    const inspect = page.getByTestId('ride-inspection');
    await expect(inspect).toBeVisible();
    await inspect.selectOption('200');
    await expect
      .poll(() => page.evaluate(() => (window.__tc.world.state.rides.find((r) => r.kind === 'track') as unknown as { inspectionIntervalTicks: number }).inspectionIntervalTicks))
      .toBe(200);
  });

  test('undo refunds the last piece; Esc leaves the builder and the track stays', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'keyboard shortcuts are a desktop feature');
    await pickCard(page, 'track', 'junior_coaster');
    await page.getByTestId('track-confirm').click();
    await expect.poll(() => pieceCount(page)).toBeGreaterThan(0);
    const n0 = await pieceCount(page);
    // Pause so hourly running costs do not move the cash during the check.
    await page.evaluate(() => window.__tc.setSpeed(0));
    const cash = (): Promise<number> => page.evaluate(() => (window.__tc.world.state as unknown as { park: { cash: number } }).park.cash);
    await page.getByTestId('track-builder-group-straight').click();
    await page.getByTestId('track-piece-straight').click();
    // The status shows the cost with an icon: "Straight · ✓ $17.50" (Junior Coaster piece factor 0.7).
    await expect(page.getByTestId('track-status')).toHaveText(/✓ \$17\.50$/);
    const before = await cash();
    await page.keyboard.press('Enter');
    await expect.poll(() => pieceCount(page)).toBe(n0 + 1);
    expect(before - (await cash())).toBe(1750);
    await page.keyboard.press('Backspace');
    await expect.poll(() => pieceCount(page)).toBe(n0);
    expect(await cash()).toBe(before);
    await page.keyboard.press('3');
    await expect(page.getByTestId('track-builder-group-turns')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('track-builder')).toBeHidden();
    expect(await pieceCount(page)).toBe(n0);
    await expect(page.getByTestId('track-tab-track')).toHaveAttribute('aria-selected', 'true');
  });
});

/** `TC_SCREENSHOT=1`: save docs/screenshots/wave2-coaster.png (desktop, device scale 2). */
test.describe('wave 2 screenshot', () => {
  test.use({ deviceScaleFactor: 2 });
  test('a finished steel coaster with a running train and guests', async ({ page }, info) => {
    test.skip(!process.env.TC_SCREENSHOT || info.project.name !== 'desktop', 'set TC_SCREENSHOT=1 to refresh the screenshot');
    test.setTimeout(240_000);
    await newPark(page);
    await layPaths(page);
    await page.evaluate(() => {
      const g = window.__tc;
      g.setSpeed(0);
      const run = (c: Record<string, unknown>): { id?: number } => {
        const r = g.dispatch(c);
        if (!r.ok) throw new Error(`${String(c.type)}: ${r.reason}`);
        return r;
      };
      const id = run({ type: 'placeStation', typeId: 'steel_coaster', x: 4, y: 2, dir: 1 }).id as number;
      const ch = (d: string): [string, boolean, number?] => [d, true];
      const pieces: Array<[string, boolean, number?]> = [
        ['station', false], ['station', false],
        ch('flat_to_gentle_up'), ch('gentle_to_steep_up'), ch('steep_up'), ch('steep_to_gentle_up'), ch('gentle_up_to_flat'),
        ['straight', false], ['straight', false], ['turn_medium_right', false],
        ['flat_to_gentle_down', false], ['gentle_to_steep_down', false], ['steep_down', false], ['steep_to_gentle_down', false], ['gentle_down_to_flat', false],
        ['brakes', false, 8], ['turn_medium_right', false],
        ...Array.from({ length: 10 }, (): [string, boolean] => ['straight', false]), ['turn_medium_right', false],
        ...Array.from({ length: 6 }, (): [string, boolean] => ['straight', false]), ['turn_medium_right', false],
      ];
      for (const [defId, chain, brakeSpeed] of pieces) run({ type: 'addTrackPiece', rideId: id, defId, chain, ...(brakeSpeed ? { brakeSpeed } : {}) });
      run({ type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 4, y: 3 });
      run({ type: 'placeTrackGate', rideId: id, kind: 'exit', x: 6, y: 3 });
      run({ type: 'setTrainConfig', rideId: id, trains: 1, carsPerTrain: 4 });
      run({ type: 'startTestRun', rideId: id });
      g.step(1100);
      run({ type: 'setRideOpen', rideId: id, open: true });
      run({ type: 'setEntranceFee', fee: 500 });
      run({ type: 'setParkOpen', open: true });
      // Let guests arrive, queue, and ride; stop with a loaded train on the big drop.
      const data = g.world.state.track.rides[String(id)]!;
      let rides = 0;
      for (let t = 0; t < 60_000; t++) {
        g.step(1);
        const tr = data.trains[0];
        if (tr && tr.state === 'running' && tr.seats.some((s) => s >= 0) && tr.s > 72_000 && tr.s < 84_000) {
          rides++;
          if (rides > 2 && tr.seats.filter((s) => s >= 0).length >= 6) break;
        }
      }
      g.camera.zoom = 1.35;
      g.camera.centerX = (9.6 - 6.4) * 32 - 40;
      g.camera.centerY = (9.6 + 6.4) * 16 - 64 - 30;
    });
    // Let the build toasts (3 s) fade before the picture.
    await page.waitForTimeout(3500);
    await page.screenshot({ path: 'docs/screenshots/wave2-coaster.png' });
  });
});
