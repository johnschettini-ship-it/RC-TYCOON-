import { expect, test, type Page } from '@playwright/test';
import { isPhone, newPark, setSpeed, touch, watchErrors } from './helpers';

/**
 * View rotation and land purchase (Phase 4 §9.5, W3-G), plus the opt-in 128 × 128 frame-rate measurement
 * (Phase 4 §4.10, master §10 Build 2 budget; `TC_PERF=1`).
 * The rotation keeps the map point under the screen centre; the tile there is read through the debug hook with the
 * inverse view table (Phase 4 §4.8). Land for sale is set up through the hook (a Build 1 New Park owns all its land).
 */

interface ViewGame {
  world: { state: Record<string, unknown> & { nextId: number; tick: number; guests: unknown[]; park: { cash: number }; map: ViewMap } };
  camera: { centerX: number; centerY: number; zoom: number; rotation: number };
  dispatch(cmd: Record<string, unknown>): { ok: boolean; reason?: string; id?: number };
  step(n: number): void;
  setSpeed(n: number): void;
  setWorld(w: { state: unknown; events: unknown[] }): void;
}

interface ViewMap {
  width: number;
  height: number;
  heights: Uint8Array;
  owned: Uint8Array;
  content: Uint8Array;
}

/** Map tile under the screen centre (flat ground), through the inverse view table. */
async function centreTile(page: Page): Promise<number> {
  return page.evaluate(() => {
    const g = (window as unknown as { __tc: ViewGame }).__tc;
    const map = g.world.state.map;
    const c = g.camera;
    const z = map.heights[0] ?? 0;
    const a = c.centerX / 32;
    const b = (c.centerY + z * 8) / 16;
    const u = (a + b) / 2;
    const v = (b - a) / 2;
    const W = map.width;
    const H = map.height;
    const r = c.rotation;
    const [fx, fy] = r === 1 ? [v, H - u] : r === 2 ? [W - u, H - v] : r === 3 ? [W - v, u] : [u, v];
    return Math.floor(fy) * W + Math.floor(fx);
  });
}

/** Page coordinates of the centre of map tile (x, y) in the current view rotation. */
async function tilePointR(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([tx, ty]) => {
      const g = (window as unknown as { __tc: ViewGame }).__tc;
      const map = g.world.state.map;
      const W = map.width;
      const H = map.height;
      const r = g.camera.rotation;
      const fx = tx + 0.5;
      const fy = ty + 0.5;
      const [u, v] = r === 1 ? [H - fy, fx] : r === 2 ? [W - fx, H - fy] : r === 3 ? [fy, W - fx] : [fx, fy];
      const h = map.heights[ty * W + tx] ?? 0;
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const wx = (u - v) * 32;
      const wy = (u + v) * 16 - h * 8;
      return { x: rect.left + (wx - g.camera.centerX) * g.camera.zoom + rect.width / 2, y: rect.top + (wy - g.camera.centerY) * g.camera.zoom + rect.height / 2 };
    },
    [x, y] as const,
  );
}

/** Make the block x0–x1 × y0–y1 land for sale (state 2) and centre the camera on it. */
async function landForSale(page: Page, x0: number, y0: number, x1: number, y1: number): Promise<void> {
  await page.evaluate(
    ([a, b, c, d]) => {
      const g = (window as unknown as { __tc: ViewGame }).__tc;
      const map = g.world.state.map;
      for (let y = b; y <= d; y++) for (let x = a; x <= c; x++) map.owned[y * map.width + x] = 2;
      const cx = (a + c + 1) / 2;
      const cy = (b + d + 1) / 2;
      g.camera.centerX = (cx - cy) * 32;
      g.camera.centerY = (cx + cy) * 16 - (map.heights[0] ?? 0) * 8;
    },
    [x0, y0, x1, y1] as const,
  );
}

async function ownedCount(page: Page, x0: number, y0: number, x1: number, y1: number): Promise<number> {
  return page.evaluate(
    ([a, b, c, d]) => {
      const map = (window as unknown as { __tc: ViewGame }).__tc.world.state.map;
      let n = 0;
      for (let y = b; y <= d; y++) for (let x = a; x <= c; x++) if (map.owned[y * map.width + x] === 1) n++;
      return n;
    },
    [x0, y0, x1, y1] as const,
  );
}

async function cash(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __tc: ViewGame }).__tc.world.state.park.cash);
}

test.describe('desktop', () => {
  test.beforeEach(() => test.skip(isPhone(test.info()), 'desktop flow'));

  test('rotate the view with [ ] and the HUD buttons; the centre tile stays the same', async ({ page }) => {
    const watch = watchErrors(page);
    await newPark(page, 'Turn Park');
    await setSpeed(page, 'Pause');
    const canvas = page.locator('#game');
    const start = await centreTile(page);
    const seen: string[] = [];
    for (const key of [']', ']', '[']) {
      await page.keyboard.press(key);
      await expect.poll(async () => canvas.getAttribute('data-rotation')).not.toBe(seen.at(-1) ?? '0');
      seen.push((await canvas.getAttribute('data-rotation')) ?? '');
      expect(await centreTile(page)).toBe(start);
    }
    expect(seen).toEqual(['1', '2', '1']);
    await page.getByTestId('view-rotate-right').click();
    await expect(canvas).toHaveAttribute('data-rotation', '2');
    expect(await centreTile(page)).toBe(start);
    await page.getByTestId('view-rotate-left').click();
    await page.getByTestId('view-rotate-left').click();
    await expect(canvas).toHaveAttribute('data-rotation', '0');
    expect(await centreTile(page)).toBe(start);
    await expect(page.getByTestId('view-rotate-left')).toHaveAccessibleName('Rotate view counter-clockwise');
    watch.expectNoErrors();
  });

  test('buy land: the drag shows the total, release buys, cash drops (turned view)', async ({ page }) => {
    const watch = watchErrors(page);
    await newPark(page, 'Land Park');
    await setSpeed(page, 'Pause');
    await landForSale(page, 10, 20, 13, 22);
    await page.keyboard.press(']');
    await page.getByTestId('tool-buyLand').click();
    await expect(page.getByTestId('buy-land-bar')).toBeVisible();
    const before = await cash(page);
    const a = await tilePointR(page, 10, 20);
    const b = await tilePointR(page, 13, 22);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let k = 1; k <= 6; k++) await page.mouse.move(a.x + ((b.x - a.x) * k) / 6, a.y + ((b.y - a.y) * k) / 6);
    await expect(page.getByTestId('buy-total')).toHaveText('12 land, 0 rights: $1,800');
    expect(await ownedCount(page, 10, 20, 13, 22)).toBe(0);
    await page.mouse.up();
    await expect.poll(() => ownedCount(page, 10, 20, 13, 22)).toBe(12);
    expect(await cash(page)).toBe(before - 12 * 15_000);
    // A click on owned land says why nothing happens.
    const c = await tilePointR(page, 15, 24);
    await page.mouse.click(c.x, c.y);
    await expect(page.getByText('Nothing to buy here').first()).toBeVisible();
    watch.expectNoErrors();
  });
});

test.describe('phone', () => {
  test.beforeEach(() => test.skip(!isPhone(test.info()), 'phone flow'));

  test('tap both view rotate buttons; buy land by drag and Confirm', async ({ page }) => {
    const watch = watchErrors(page);
    await newPark(page, 'Thumb Park');
    await setSpeed(page, 'Pause');
    const canvas = page.locator('#game');
    // The canvas pixel ratio is capped on phone-sized screens (Pixel 7: 2.625 → 2).
    expect(Number(await canvas.getAttribute('data-pixel-ratio'))).toBeLessThanOrEqual(2);
    await landForSale(page, 20, 30, 22, 31);
    const start = await centreTile(page);
    await page.getByTestId('view-rotate-right').tap();
    await expect(canvas).toHaveAttribute('data-rotation', '1');
    expect(await centreTile(page)).toBe(start);
    await page.getByTestId('view-rotate-left').tap();
    await expect(canvas).toHaveAttribute('data-rotation', '0');
    expect(await centreTile(page)).toBe(start);

    await page.getByTestId('tool-buyLand').tap();
    await expect(page.getByTestId('buy-land-bar')).toBeVisible();
    const before = await cash(page);
    const a = await tilePointR(page, 20, 30);
    const b = await tilePointR(page, 22, 31);
    const cdp = await page.context().newCDPSession(page);
    await touch(cdp, 'touchStart', [{ x: a.x, y: a.y, id: 1 }]);
    for (let k = 1; k <= 6; k++) await touch(cdp, 'touchMove', [{ x: a.x + ((b.x - a.x) * k) / 6, y: a.y + ((b.y - a.y) * k) / 6, id: 1 }]);
    await touch(cdp, 'touchEnd', []);
    // Nothing is bought until Confirm; the total chip shows the price.
    await expect(page.getByTestId('buy-total')).toHaveText('6 land, 0 rights: $900');
    expect(await ownedCount(page, 20, 30, 22, 31)).toBe(0);
    await expect(page.getByTestId('buy-confirm')).toBeEnabled();
    // A tap within the double-tap window of the drag's lift gets no click in Chrome's touch emulation; a person's
    // thumb is never that quick.
    await page.waitForTimeout(400);
    await page.getByTestId('buy-confirm').tap();
    await expect.poll(() => ownedCount(page, 20, 30, 22, 31)).toBe(6);
    expect(await cash(page)).toBe(before - 6 * 15_000);
    await expect(page.getByTestId('buy-confirm')).toBeHidden();
    watch.expectNoErrors();
  });
});

// ------------------------------------------------------------------ frame rate (opt-in)

/**
 * 128 × 128 park with 3,000 guests (Phase 4 §4.10; master §10 Build 2: 60 fps desktop). The world is swapped in
 * through the debug hook (`setWorld` with a 128 × 128 map: paths every 8 tiles, 24 flat rides, 24 stalls, a few
 * hills), and 3,000 guests stand on random path tiles and wander (they never decide, so they stay in the park).
 * Measured at 1× with the real loop: frames per second over 5 s and the frame time p50 / p95 from
 * requestAnimationFrame timestamps (headless Chromium, software raster: an upper bound), in a crowd view at zoom 1,
 * the same view turned (r = 1), and a wide view at zoom 0.5 (guests drawn as rectangles). The first frames after a
 * rotation rebuild the visible terrain chunks: their longest frame is reported too.
 */
async function buildBigPark(page: Page, guests: number): Promise<{ guests: number; rides: number; stalls: number }> {
  return page.evaluate((guestCount) => {
    const g = (window as unknown as { __tc: ViewGame }).__tc;
    g.setSpeed(0);
    const old = g.world.state as unknown as Record<string, unknown> & { track: Record<string, unknown>; park: Record<string, unknown> };
    const N = 128;
    const n = N * N;
    const map = {
      width: N,
      height: N,
      terrain: new Uint8Array(n),
      heights: new Uint8Array(n).fill(8),
      slope: new Uint8Array(n),
      water: new Uint8Array(n),
      content: new Uint8Array(n),
      contentRef: new Int32Array(n).fill(-1),
      owned: new Uint8Array(n),
      pathItem: new Uint8Array(n),
      pathItemFlags: new Uint8Array(n),
      binFill: new Uint8Array(n),
      litter: new Uint8Array(n),
      mess: new Uint8Array(n),
      pathItemLevel: new Int32Array(n),
      entranceTile: -1,
    };
    for (let y = 4; y < N - 4; y++) for (let x = 4; x < N - 4; x++) map.owned[y * N + x] = 1;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (map.owned[y * N + x] === 0 && x > 0 && y > 0 && x < N - 1 && y < N - 1) map.owned[y * N + x] = 2;
    const e = (N - 5) * N + 63;
    map.entranceTile = e;
    map.content[e] = 5;
    map.owned[e] = 1;
    const park = { ...old.park, cash: 500_000_000 };
    const state = { ...old, map, park, guests: [], rides: [], stalls: [], nextId: 1, elevatedPaths: [], scenery: [], track: { ...old.track, rides: {} } };
    g.setWorld({ state, events: [] });
    g.setSpeed(0);
    const run = (c: Record<string, unknown>): { id?: number } => {
      const r = g.dispatch(c);
      if (!r.ok) throw new Error(`${String(c.type)}: ${r.reason} ${JSON.stringify(c)}`);
      return r;
    };
    // Path grid every 8 tiles, joined to the entrance.
    for (let v = 8; v <= 120; v += 8) {
      run({ type: 'buildPathLine', x0: 8, y0: v, x1: 120, y1: v, kind: 'footpath' });
      run({ type: 'buildPathLine', x0: v, y0: 8, x1: v, y1: 120, kind: 'footpath' });
    }
    run({ type: 'buildPathLine', x0: 63, y0: 121, x1: 63, y1: N - 6, kind: 'footpath' });
    // Flat rides and stalls in the blocks.
    const rideIds = ['carousel', 'teacup_twirl', 'big_wheel', 'swing_tower'];
    const stallIds = ['snack_shack', 'fizz_stand', 'restrooms'];
    let rides = 0;
    let stalls = 0;
    for (let by = 0; by < 6; by++) {
      for (let bx = 0; bx < 4; bx++) {
        const x = 10 + bx * 32;
        const y = 10 + by * 16;
        if (g.dispatch({ type: 'placeRide', defId: rideIds[(bx + by) % 4], x, y, rotation: (bx + by) % 4 }).ok) rides++;
        if (g.dispatch({ type: 'placeStall', defId: stallIds[(bx + by) % 3], x: x + 12, y: y + 3, rotation: 0 }).ok) stalls++;
      }
    }
    // A few hills (direct writes; terrain editing is another card's).
    const s = g.world.state as unknown as { map: typeof map; guests: unknown[]; nextId: number };
    for (const [hx, hy] of [
      [100, 100],
      [20, 100],
      [100, 20],
    ] as const) {
      for (let y = hy; y < hy + 6; y++) for (let x = hx; x < hx + 6; x++) if (s.map.content[y * N + x] === 0) s.map.heights[y * N + x] = 10;
    }
    const paths: number[] = [];
    for (let i = 0; i < n; i++) if (s.map.content[i] === 1) paths.push(i);
    let seed = 777;
    const rnd = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let k = 0; k < guestCount; k++) {
      const id = s.nextId++;
      const tile = paths[Math.floor(rnd() * paths.length)] as number;
      s.guests.push({
        id, tile, z: 8, wetUntilTick: -1, nextTile: -1, progress: 0, dir: k % 4, lane: id % 4, state: 'walking', stateTicks: 0, target: null,
        cash: 8000, needs: { hunger: 40, thirst: 40, bladder: 20, energy: 230, happiness: 180, nausea: 0 },
        temperament: Math.round((rnd() + rnd()) * 50), thoughts: [], thoughtCooldowns: {}, ridden: {}, spent: 0,
        items: { map: false, umbrella: false, balloon: k % 7 === 0 }, nextDecisionTick: 1e9, lostSinceTick: -1,
        noRideStreak: 0, seat: null, activityId: -1, trashTimer: 0, withdrawals: 0, lostSteps: 0, bestDistance: -1, lostTarget: null,
      });
    }
    g.step(200);
    return { guests: s.guests.length, rides, stalls };
  }, guests);
}

interface FrameStats {
  fps: number;
  p50: number;
  p95: number;
  max: number;
}

/** Run the real loop at 1× for `ms` with the camera on map point (tx, ty) at `zoom` in rotation `rot`. */
async function measure(page: Page, zoom: number, tx: number, ty: number, rot: number, ms: number): Promise<FrameStats> {
  return page.evaluate(
    ([z, x, y, r, dur]) =>
      new Promise<FrameStats>((resolve) => {
        const g = (window as unknown as { __tc: ViewGame }).__tc;
        const N = g.world.state.map.width;
        const [u, v] = r === 1 ? [N - y, x] : r === 2 ? [N - x, N - y] : r === 3 ? [y, N - x] : [x, y];
        g.camera.zoom = z;
        g.camera.rotation = r;
        g.camera.centerX = (u - v) * 32;
        g.camera.centerY = (u + v) * 16 - 64;
        const stamps: number[] = [];
        const t0 = performance.now();
        const sample = (t: number): void => {
          stamps.push(t);
          if (t - t0 < dur) requestAnimationFrame(sample);
          else {
            const d: number[] = [];
            for (let k = 1; k < stamps.length; k++) d.push((stamps[k] as number) - (stamps[k - 1] as number));
            const max = Math.max(...d);
            d.sort((a, b) => a - b);
            const at = (q: number): number => d[Math.min(d.length - 1, Math.floor(q * d.length))] ?? 0;
            g.setSpeed(0);
            resolve({ fps: (stamps.length - 1) / (((stamps[stamps.length - 1] as number) - (stamps[0] as number)) / 1000), p50: at(0.5), p95: at(0.95), max });
          }
        };
        g.setSpeed(1);
        requestAnimationFrame(sample);
      }),
    [zoom, tx, ty, rot, ms] as const,
  );
}

function fmt(r: FrameStats): string {
  return `${r.fps.toFixed(1)} fps (frame p50 ${r.p50.toFixed(1)} ms, p95 ${r.p95.toFixed(1)} ms, max ${r.max.toFixed(0)} ms)`;
}

test.describe('frame rate, 128 × 128 with 3,000 guests (Phase 4 §4.10)', () => {
  test.skip(!process.env.TC_PERF, 'set TC_PERF=1 to measure the frame rate');

  test('measure', async ({ page }, info) => {
    test.setTimeout(240_000);
    await newPark(page, 'Big Park');
    const scene = await buildBigPark(page, 3_000);
    expect(scene.guests).toBe(3_000);
    const phone = isPhone(info);
    const cdp = phone ? await page.context().newCDPSession(page) : null;
    if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // Each view warms up first (chunk images and sprites of its rotation and zoom bucket), then 5 s are measured.
    // The turn itself (the first second after it) is reported by its longest frame.
    await measure(page, 1, 64, 64, 0, 1_000);
    const crowd = await measure(page, 1, 64, 64, 0, 5_000);
    const turn = await measure(page, 1, 64, 64, 1, 1_000);
    const turned = await measure(page, 1, 64, 64, 1, 5_000);
    await measure(page, 0.5, 64, 64, 0, 2_000);
    const wide = await measure(page, 0.5, 64, 64, 0, 5_000);
    await measure(page, 0.75, 64, 64, 0, 3_000);
    const mid = await measure(page, 0.75, 64, 64, 0, 5_000);
    if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const ratio = await page.locator('#game').getAttribute('data-pixel-ratio');
    console.log(
      `[perf] ${info.project.name}${phone ? ' (CPU 4×)' : ''} 128 × 128, ${scene.guests} guests, ${scene.rides} rides, ${scene.stalls} stalls, canvas ratio ${ratio}: ` +
        `crowd (zoom 1) ${fmt(crowd)}; turned (r = 1) ${fmt(turned)}, longest frame of the turn ${turn.max.toFixed(0)} ms; ` +
        `zoom 0.5 (guest rectangles) ${fmt(wide)}; zoom 0.75 (every guest a sprite) ${fmt(mid)}`,
    );
  });
});
