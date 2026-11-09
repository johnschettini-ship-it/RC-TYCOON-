import { expect, test, type Page } from '@playwright/test';
import { newPark, watchErrors } from './helpers';

/**
 * Build 3 extra content (phase-6-polish.md §4.5, W4-D) in the real game on desktop and phone: once researched, the 4 flat
 * rides, 3 stalls, and 3 track types appear in the pickers; an Inverted Coaster's corkscrew and helix go in through the
 * builder palette. `TC_SCREENSHOT=1` also saves docs/screenshots/wave4-content.png (desktop, device scale 2): an
 * Inverted Coaster with a loaded train in its corkscrew, the 4 flat rides, the 3 stalls, and a Monorail, built with
 * commands through the debug hook.
 */

interface ContentTc {
  world: {
    state: {
      map: { width: number; heights: ArrayLike<number> };
      management: { research: { unlocked: string[] } };
      rides: Array<{ id: number; kind: string; defId: string; status: string; entrance: { gate: number; outside: number } | null; exit: { gate: number; outside: number } | null; totals: { riders: number } }>;
      track: { rides: Record<string, { pieces: unknown[]; test: { passed: boolean } | null; trains: Array<{ state: string; s: number; v: number; seats: number[] }> }> };
      guests: unknown[];
    };
  };
  camera: { centerX: number; centerY: number; zoom: number };
  dispatch(cmd: Record<string, unknown>): { ok: boolean; reason?: string; id?: number };
  step(n: number): void;
  setSpeed(n: number): void;
}

const BUILD3 = ['kiddie_cars', 'smoothie_bar', 'magic_carpet', 'lightshow_tower', 'photo_booth', 'merry_mill', 'bobsled_run', 'noodle_bar', 'gyro_globe', 'fireworks_launcher', 'monorail', 'inverted_coaster'];

async function unlockBuild3(page: Page): Promise<void> {
  await page.evaluate((ids) => {
    const g = (window as unknown as { __tc: ContentTc }).__tc;
    g.setSpeed(0);
    g.world.state.management.research.unlocked.push(...ids);
  }, BUILD3);
}

async function press(page: Page, phone: boolean, testId: string): Promise<void> {
  const b = page.getByTestId(testId);
  if (phone) await b.tap();
  else await b.click();
}

async function openTool(page: Page, phone: boolean, name: string): Promise<void> {
  const b = page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name, exact: true });
  if (phone) await b.tap();
  else await b.click();
}

/** Move the camera so tile (x, y) shows at a clear spot of the screen; returns that point (CSS px). */
async function showTile(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(([tx, ty]) => {
    const g = (window as unknown as { __tc: ContentTc }).__tc;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fx = vw < 900 ? 0.5 : 0.42;
    const fy = vw < 900 ? 0.3 : 0.45;
    const map = g.world.state.map;
    const z = map.heights[ty * map.width + tx] ?? 8;
    g.camera.centerX = (tx - ty) * 32 - (fx * vw - vw / 2) / g.camera.zoom;
    g.camera.centerY = (tx + ty + 1) * 16 - z * 8 - (fy * vh - vh / 2) / g.camera.zoom;
    return { x: fx * vw, y: fy * vh };
  }, [x, y] as const);
}

async function pieceCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const st = (window as unknown as { __tc: ContentTc }).__tc.world.state;
    const r = st.rides.find((x) => x.kind === 'track');
    return r ? (st.track.rides[String(r.id)]?.pieces.length ?? 0) : 0;
  });
}

test.describe('Build 3 extra content', () => {
  test('researched Phase 6 rides and stalls show in the pickers; corkscrew and helix build from the palette', async ({ page }, info) => {
    test.setTimeout(120_000);
    const phone = info.project.name === 'phone';
    const errors = watchErrors(page);
    await newPark(page, 'Content Park');
    await unlockBuild3(page);

    await openTool(page, phone, 'Rides');
    for (const id of ['magic_carpet', 'kiddie_cars', 'merry_mill', 'gyro_globe']) await expect(page.locator(`.panel [data-def="${id}"]`)).toHaveCount(1);
    await press(page, phone, 'picker-tab-track');
    for (const id of ['inverted_coaster', 'bobsled_run', 'monorail']) await expect(page.getByTestId(`track-card-${id}`)).toBeVisible();
    await press(page, phone, 'track-card-inverted_coaster');
    const builder = page.getByTestId('track-builder');
    await expect(builder).toBeVisible();
    await expect(page.getByTestId('track-station-length')).toHaveText('3 tiles');

    // Station at (10, 12) heading east, then a corkscrew and a helix from the palette.
    const p = await showTile(page, 10, 12);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    if (phone) {
      await page.touchscreen.tap(p.x, p.y);
      await press(page, phone, 'track-confirm');
    } else {
      await page.mouse.move(p.x, p.y);
      await page.mouse.click(p.x, p.y);
    }
    await expect.poll(() => pieceCount(page)).toBe(3);
    await expect(builder).toHaveAttribute('data-phase', 'pieces');
    for (const [i, [group, piece]] of [['special', 'corkscrew_right'], ['turns', 'helix_right_up']].entries()) {
      await press(page, phone, `track-builder-group-${group}`);
      await press(page, phone, `track-piece-${piece}`);
      await expect(page.getByTestId('track-status')).toContainText('✓');
      await press(page, phone, 'track-build');
      await expect.poll(() => pieceCount(page)).toBe(4 + i);
    }
    await press(page, phone, 'track-done');
    await expect(builder).toBeHidden();

    await openTool(page, phone, 'Stalls');
    for (const id of ['noodle_bar', 'smoothie_bar', 'photo_booth']) await expect(page.locator(`.panel [data-def="${id}"]`)).toHaveCount(1);
    // A few frames with the new art on screen.
    await page.evaluate(() => (window as unknown as { __tc: ContentTc }).__tc.step(60));
    await page.waitForTimeout(300);
    errors.expectNoErrors();
  });
});

test.describe('Build 3 content screenshot', () => {
  test.use({ deviceScaleFactor: 2 });
  test('an Inverted Coaster in its corkscrew, the new flat rides, stalls, and a Monorail', async ({ page }, info) => {
    test.skip(!process.env.TC_SCREENSHOT || info.project.name !== 'desktop', 'set TC_SCREENSHOT=1 to refresh the screenshot');
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await newPark(page, 'Frost & Spark Park');
    await unlockBuild3(page);
    const summary = await page.evaluate(() => {
      const g = (window as unknown as { __tc: ContentTc }).__tc;
      const st = g.world.state;
      const run = (c: Record<string, unknown>): { id?: number } => {
        const r = g.dispatch(c);
        if (!r.ok) throw new Error(`${String(c.type)}: ${r.reason} ${JSON.stringify(c)}`);
        return r;
      };
      const line = (x0: number, y0: number, x1: number, y1: number, kind = 'footpath'): void => {
        run({ type: 'buildPathLine', x0, y0, x1, y1, kind });
      };
      const w = st.map.width;
      const pathAt = (tile: number, kind: string): void => {
        run({ type: 'buildPath', x: tile % w, y: Math.floor(tile / w), kind });
      };
      // A picture, not a playthrough: enough cash for everything (the debug hook writes it straight in).
      (st as unknown as { park: { cash: number } }).park.cash = 10_000_000;
      // Paths first: the coaster drop skips its support over the main path.
      line(31, 59, 31, 6);
      line(30, 6, 5, 6);
      line(32, 6, 41, 6);
      line(4, 4, 4, 6, 'queue');
      line(6, 4, 6, 5);
      line(19, 11, 41, 11);

      // Inverted Coaster (tests/unit/track/phase6Rides.test.ts INVERTED): helix, 12 m drop, corkscrew.
      const id = run({ type: 'placeStation', typeId: 'inverted_coaster', x: 4, y: 2, dir: 1 }).id as number;
      const ch = (d: string): [string, boolean, number?] => [d, true];
      const s = (d: string): [string, boolean, number?] => [d, false];
      const times = (n: number, d: string): Array<[string, boolean, number?]> => Array.from({ length: n }, () => s(d));
      const pieces: Array<[string, boolean, number?]> = [
        s('station'), s('station'),
        ch('flat_to_gentle_up'), ch('gentle_to_steep_up'), ch('steep_up'), ch('steep_to_gentle_up'), ch('gentle_up_to_flat'),
        s('helix_right_down'), s('turn_medium_right'),
        s('flat_to_gentle_down'), s('gentle_down'), s('gentle_to_steep_down'), s('steep_to_gentle_down'), s('gentle_down_to_flat'),
        s('corkscrew_right'), ['brakes', false, 8], s('turn_medium_right'),
        ...times(11, 'straight'), s('turn_medium_right'), ...times(9, 'straight'), s('turn_medium_right'),
      ];
      for (const [defId, chain, brakeSpeed] of pieces) run({ type: 'addTrackPiece', rideId: id, defId, chain, ...(brakeSpeed ? { brakeSpeed } : {}) });
      run({ type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 4, y: 3 });
      run({ type: 'placeTrackGate', rideId: id, kind: 'exit', x: 6, y: 3 });
      run({ type: 'setTrackColours', rideId: id, track: 6, supports: 9, cars: 0 });
      run({ type: 'startTestRun', rideId: id });
      g.step(1100);
      run({ type: 'setRideOpen', rideId: id, open: true });

      // The 4 flat rides south of the main path (front north), each with its queue and exit path.
      for (const [defId, x] of [['magic_carpet', 19], ['kiddie_cars', 24], ['merry_mill', 33], ['gyro_globe', 37]] as const) {
        const rideId = run({ type: 'placeRide', defId, x, y: 8, rotation: 2 }).id as number;
        const r = st.rides.find((q) => q.id === rideId)!;
        if (r.entrance) pathAt(r.entrance.outside, 'queue');
        if (r.exit) pathAt(r.exit.outside, 'footpath');
        run({ type: 'setRideOpen', rideId, open: true });
      }
      // The 3 stalls north of the main path.
      for (const [defId, x] of [['noodle_bar', 21], ['smoothie_bar', 23], ['photo_booth', 26]] as const) run({ type: 'placeStall', defId, x, y: 5, rotation: 2 });

      // Monorail (tests/unit/track/phase6Rides.test.ts MONORAIL) south-east, with a stop on each long side.
      const mono = run({ type: 'placeStation', typeId: 'monorail', x: 37, y: 14, dir: 1 }).id as number;
      const monoPieces = [
        'station', 'station', 'straight', 'straight', 'station', 'station', 'station', 'straight', 'turn_medium_right',
        'straight', 'straight', 'straight', 'straight', 'turn_medium_right', 'station', 'station', 'station',
        'straight', 'straight', 'straight', 'straight', 'straight', 'straight', 'turn_medium_right', 'straight', 'straight', 'straight', 'straight', 'turn_medium_right',
      ];
      for (const defId of monoPieces) run({ type: 'addTrackPiece', rideId: mono, defId });
      line(37, 12, 37, 12, 'queue');
      line(38, 12, 38, 12);
      run({ type: 'placeTrackGate', rideId: mono, kind: 'entrance', x: 37, y: 13 });
      run({ type: 'placeTrackGate', rideId: mono, kind: 'exit', x: 38, y: 13 });
      run({ type: 'setTrainConfig', rideId: mono, trains: 2, carsPerTrain: 3 });
      run({ type: 'startTestRun', rideId: mono });
      g.step(1000);
      run({ type: 'setRideOpen', rideId: mono, open: true });

      for (const staffType of ['mechanic', 'groundskeeper', 'groundskeeper', 'groundskeeper', 'performer']) run({ type: 'hireStaff', staffType });
      run({ type: 'setEntranceFee', fee: 500 });
      run({ type: 'setParkOpen', open: true });

      // Let the park fill, then stop with a loaded train rolling through the corkscrew. The corkscrew is piece 16:
      // it starts 120,897 mm along the circuit and is 15,919 mm long (the piece table lengths before it).
      const train = (): { state: string; s: number; v: number; seats: number[] } | undefined => st.track.rides[String(id)]?.trains[0];
      g.step(9_000);
      for (let t = 0; t < 30_000; t++) {
        g.step(1);
        const tr = train();
        if (tr && tr.state === 'running' && tr.s > 126_500 && tr.s < 131_000 && tr.seats.filter((q) => q >= 0).length >= 8) break;
      }
      g.camera.zoom = 0.9;
      g.camera.centerX = 470;
      g.camera.centerY = 430;
      const tr = train();
      return {
        guests: st.guests.length,
        trainS: tr?.s ?? 0,
        riders: tr ? tr.seats.filter((q) => q >= 0).length : 0,
        tested: st.track.rides[String(id)]?.test?.passed ?? false,
        monoTested: st.track.rides[String(mono)]?.test?.passed ?? false,
        // Open, or running through a breakdown (broken, inspecting): never closed, building, or testing.
        open: st.rides.filter((r) => r.status !== 'closed' && r.status !== 'building' && r.status !== 'testing').length,
      };
    });
    expect(summary.tested).toBe(true);
    expect(summary.monoTested).toBe(true);
    expect(summary.open).toBe(6);
    expect(summary.riders).toBeGreaterThan(0);
    expect(summary.trainS).toBeGreaterThan(126_500);
    await page.waitForTimeout(3500);
    const dismiss = page.locator('.msg-toast:not([hidden]) .icon-btn');
    while ((await dismiss.count()) > 0) await dismiss.first().click();
    const award = page.locator('[data-testid="award-toast"]:not([hidden])');
    for (let k = 0; k < 10 && (await award.count()) > 0; k++) {
      await award.click();
      await page.waitForTimeout(250);
    }
    await page.screenshot({ path: 'docs/screenshots/wave4-content.png' });
    errors.expectNoErrors();
  });
});
