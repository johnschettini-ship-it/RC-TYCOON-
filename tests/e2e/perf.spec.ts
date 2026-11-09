import { expect, test, type Page } from '@playwright/test';
import { newPark } from './helpers';

/**
 * Frame-rate check for the master §10 Build 1 budgets (W2-D gap, Build 1 polish). `TC_PERF=1` to run: timings on
 * a shared CI runner are noise, so this is a measurement tool, not a gate. Numbers go in
 * docs/superpowers/specs/thrills-and-chills/build-1-acceptance.md.
 *
 * Scene (desktop budget): 10 open track rides (Mini Railway loops, 2 trains each) in the west half, a footpath
 * grid in the east half, and 2,000 guests on it. Phone budget: the same park with 800 guests on a Pixel 7
 * profile with the CPU throttled 4× (Phase 6 §9 method). The guests and the "open" state of the track rides are
 * set through the debug hook, and so is the cash (a test harness, not a game): the rides run empty trains, which
 * draw the same.
 *
 * Measured per scene, at 1× speed with the real game loop: frames per second over 5 s, and the frame time
 * p50 / p95 from requestAnimationFrame timestamps (headless Chromium; software raster, so an upper bound).
 * Tick time is measured by tests/integration/perf-budget.test.ts and `npm run bench`.
 */

interface PerfGame {
  world: { state: Record<string, unknown> & { nextId: number; tick: number; guests: unknown[]; rides: Array<{ id: number; status: string }>; map: { width: number; content: Uint8Array } } };
  camera: { centerX: number; centerY: number; zoom: number };
  dispatch(cmd: Record<string, unknown>): { ok: boolean; reason?: string; id?: number };
  step(n: number): void;
  setSpeed(n: number): void;
  onFrame(cb: () => void): void;
}

async function buildScene(page: Page, guests: number): Promise<{ rides: number; guests: number }> {
  return page.evaluate((guestCount) => {
    const g = (window as unknown as { __tc: PerfGame }).__tc;
    g.setSpeed(0);
    const run = (c: Record<string, unknown>): { id?: number } => {
      const r = g.dispatch(c);
      if (!r.ok) throw new Error(`${String(c.type)}: ${r.reason} ${JSON.stringify(c)}`);
      return r;
    };
    // Harness cash: ten track rides and the path grid cost more than a new park has.
    (g.world.state as unknown as { park: { cash: number } }).park.cash = 100_000_000;
    // 10 track rides: a 2-tile station heading east and four medium turns (footprint x − 3 … x + 6, y … y + 8).
    const loop = ['station', 'straight', 'straight', 'turn_medium_right', 'straight', 'straight', 'straight', 'turn_medium_right',
      'straight', 'straight', 'straight', 'straight', 'turn_medium_right', 'straight', 'straight', 'straight', 'turn_medium_right'];
    const ids: number[] = [];
    for (const sx of [5, 16]) {
      for (const sy of [2, 13, 24, 35, 46]) {
        const id = run({ type: 'placeStation', typeId: 'mini_railway', x: sx, y: sy, dir: 1 }).id as number;
        for (const defId of loop) run({ type: 'addTrackPiece', rideId: id, defId });
        run({ type: 'setTrainConfig', rideId: id, trains: 2, carsPerTrain: 3 });
        ids.push(id);
      }
    }
    for (const r of g.world.state.rides) if (ids.includes(r.id)) r.status = 'open';
    // Footpath grid in the east half, joined to the park entrance (31, 63).
    const lines = [26, 32, 38, 44, 50, 56];
    for (const v of lines) {
      run({ type: 'buildPathLine', x0: 26, y0: v, x1: 56, y1: v, kind: 'footpath' });
      run({ type: 'buildPathLine', x0: v, y0: 2, x1: v, y1: 56, kind: 'footpath' });
    }
    for (const v of [2, 8, 14, 20]) run({ type: 'buildPathLine', x0: 26, y0: v, x1: 56, y1: v, kind: 'footpath' });
    run({ type: 'buildPathLine', x0: 31, y0: 57, x1: 31, y1: 59, kind: 'footpath' });
    // Guests on random footpath tiles (fixed generator). They never decide, so they wander the grid and stay in
    // the park for the whole measurement (the harness rides have no gates, so deciding guests would go home).
    const s = g.world.state;
    const w = s.map.width;
    const paths: number[] = [];
    for (let i = 0; i < s.map.content.length; i++) if (s.map.content[i] === 1 && i % w >= 26) paths.push(i);
    let x = 777;
    const rnd = (): number => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      return x / 4294967296;
    };
    for (let k = 0; k < guestCount; k++) {
      const id = s.nextId++;
      const tile = paths[Math.floor(rnd() * paths.length)] as number;
      s.guests.push({
        id, tile, nextTile: -1, progress: 0, dir: k % 4, lane: id % 4, state: 'walking', stateTicks: 0, target: null,
        cash: 8000, needs: { hunger: 40, thirst: 40, bladder: 20, energy: 230, happiness: 180, nausea: 0 },
        temperament: Math.round((rnd() + rnd()) * 50), thoughts: [], thoughtCooldowns: {}, ridden: {}, spent: 0,
        items: { map: false, umbrella: false, balloon: k % 7 === 0 }, nextDecisionTick: 1e9, lostSinceTick: -1,
        noRideStreak: 0, seat: null, activityId: -1, trashTimer: 0, withdrawals: 0, lostSteps: 0, bestDistance: -1, lostTarget: null,
      });
    }
    g.step(400);
    return { rides: ids.length, guests: s.guests.length };
  }, guests);
}

/** Run the real loop at 1× for `ms` with the camera at (zoom, tile); frames per second and frame time p50 / p95. */
async function measure(page: Page, zoom: number, tx: number, ty: number, ms: number): Promise<{ fps: number; p50: number; p95: number }> {
  return page.evaluate(
    ([z, x, y, dur]) =>
      new Promise((resolve) => {
        const g = (window as unknown as { __tc: PerfGame }).__tc;
        g.camera.zoom = z;
        g.camera.centerX = (x - y) * 32;
        g.camera.centerY = (x + y + 1) * 16 - 64;
        const stamps: number[] = [];
        const t0 = performance.now();
        const sample = (t: number): void => {
          stamps.push(t);
          if (t - t0 < dur) requestAnimationFrame(sample);
          else {
            const d: number[] = [];
            for (let k = 1; k < stamps.length; k++) d.push((stamps[k] as number) - (stamps[k - 1] as number));
            d.sort((a, b) => a - b);
            const at = (q: number): number => d[Math.min(d.length - 1, Math.floor(q * d.length))] ?? 0;
            g.setSpeed(0);
            resolve({ fps: (stamps.length - 1) / (((stamps[stamps.length - 1] as number) - (stamps[0] as number)) / 1000), p50: at(0.5), p95: at(0.95) });
          }
        };
        g.setSpeed(1);
        requestAnimationFrame(sample);
      }),
    [zoom, tx, ty, ms] as const,
  ) as Promise<{ fps: number; p50: number; p95: number }>;
}

function fmt(r: { fps: number; p50: number; p95: number }): string {
  return `${r.fps.toFixed(1)} fps (frame p50 ${r.p50.toFixed(1)} ms, p95 ${r.p95.toFixed(1)} ms)`;
}

test.describe('frame rate (master §10)', () => {
  test.skip(!process.env.TC_PERF, 'set TC_PERF=1 to measure the frame rate');

  test('desktop: 2,000 guests and 10 track rides', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop budget');
    test.setTimeout(180_000);
    await newPark(page, 'Perf Park');
    const scene = await buildScene(page, 2_000);
    expect(scene.rides).toBe(10);
    const crowd = await measure(page, 1, 40, 30, 5_000);
    const rides = await measure(page, 1, 12, 28, 5_000);
    const wide = await measure(page, 0.5, 30, 30, 5_000);
    const n = await page.evaluate(() => (window as unknown as { __tc: PerfGame }).__tc.world.state.guests.length);
    console.log(
      `[perf] desktop ${n} guests + 10 track rides: crowd view ${fmt(crowd)}; track view ${fmt(rides)}; whole map (zoom 0.5) ${fmt(wide)}`,
    );
  });

  test('phone: 800 guests and 10 track rides, CPU 4× slower', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phone budget');
    test.setTimeout(180_000);
    await newPark(page, 'Perf Park');
    await buildScene(page, 800);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const crowd = await measure(page, 1, 40, 30, 5_000);
    const rides = await measure(page, 1, 12, 28, 5_000);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const n = await page.evaluate(() => (window as unknown as { __tc: PerfGame }).__tc.world.state.guests.length);
    console.log(`[perf] phone ${n} guests + 10 track rides (CPU 4×): crowd view ${fmt(crowd)}; track view ${fmt(rides)}`);
  });
});
