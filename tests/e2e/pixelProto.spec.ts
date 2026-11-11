/** Phase 8 stage 0 prototype (never merged): the stage 0 scene, its save, the pictures, the measures and the grid check. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { newParkAt, openTool } from './helpers';
import { makeGrid, planStretch, zoomLevels } from '../../src/render/pixel/grid';

/**
 * Spec §11.2, plan Task 19a. Skipped unless `TC_PROTO_OUT` is set. The test `pictures` builds the scene once at
 * `/?art=classic`, saves it to slot 1 through the menu and writes the save text to `e2e/save-<project>.txt`. The
 * "after" page (`/?art=pixel`) and the "before" page (`/?art=classic`) both load that text. With
 * `TC_PROTO_REUSE_SAVE=1` the build is skipped and the saved text is used, so a repeat keeps the same map.
 * Plan Task 19b: the test `measures and grid` loads the same save at `/?art=pixel`, reads `window.__pixelStats` after
 * four view turns (the phone at 4× CPU throttle) and checks the art grid at every crisp level (kill rules 2 and 4).
 */

export const OUT = process.env.TC_PROTO_OUT;

interface ProtoGame {
  world: {
    state: {
      tick: number;
      map: { width: number; heights: ArrayLike<number> };
      rides: Array<{ id: number; status: string; entrance: { outside: number } | null; exit: { outside: number } | null }>;
      management: { weather: { current: string } };
    };
  };
  camera: { centerX: number; centerY: number; zoom: number; rotation: number };
  tool: { tool: string; hoverTile: number | null; selectedTile: number | null; overlay: string; selectedEntity: unknown; defId: string | null; ghost: unknown; drag: unknown; brush: unknown };
  settings: { set(k: string, v: unknown): boolean };
  dispatch(cmd: Record<string, unknown>): { ok: boolean; reason?: string; id?: number };
  step(n: number): void;
  setSpeed(n: number): void;
}

const DAY = 1200;
const HOUR = 50;
const DRAFT = fileURLToPath(new URL('../../docs/screenshots/phase-7-draft-desktop.png', import.meta.url));

/** Waits `n` animation frames. */
async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((done) => {
        let left = count;
        const tick = (): void => {
          if (--left <= 0) done();
          else requestAnimationFrame(tick);
        };
        if (left <= 0) done();
        else requestAnimationFrame(tick);
      }),
    n,
  );
}

/** Items 1 to 7 of §11.2 with the coordinates of the plan (Prototype decision 14). Every dispatch must be ok. */
async function buildScene(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as unknown as { __tc: ProtoGame }).__tc;
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
    run({ type: 'borrow', amount: 1_000_000 });
    // The footpath cross from (31, 44): 12 tiles north, west and east; 15 south to the entrance road. The exit road.
    run({ type: 'buildPathLine', x0: 31, y0: 59, x1: 31, y1: 32, kind: 'footpath' });
    run({ type: 'buildPathLine', x0: 19, y0: 44, x1: 43, y1: 44, kind: 'footpath' });
    run({ type: 'buildPathLine', x0: 20, y0: 50, x1: 31, y1: 50, kind: 'footpath' });
    for (const [defId, x] of [['big_wheel', 21], ['carousel', 26]] as const) {
      const rideId = run({ type: 'placeRide', defId, x, y: 46, rotation: 2 }).id as number;
      const r = st.rides.find((q) => q.id === rideId);
      if (!r || !r.entrance || !r.exit) throw new Error(`${defId}: no entrance or exit`);
      pathAt(r.entrance.outside, 'queue');
      pathAt(r.exit.outside, 'footpath');
      run({ type: 'setRideOpen', rideId, open: true });
    }
    run({ type: 'placeStall', defId: 'snack_shack', x: 24, y: 43, rotation: 2 });
    for (const [defId, x, y] of [
      ['oak_round', 34, 46],
      ['pine_tall', 36, 46],
      ['birch_silver', 38, 46],
      ['shrub_round', 34, 48],
      ['bed_mixed', 36, 48],
      ['fountain_garden', 38, 48],
    ] as const) {
      run({ type: 'placeScenery', defId, x, y, rotation: 2, edge: -1 });
    }
    for (const [x, itemType] of [[29, 'bench'], [35, 'bench'], [33, 'lamp']] as const) run({ type: 'buildPathItem', x, y: 44, itemType });
    run({ type: 'setParkOpen', open: true });
    g.step(6000);
    g.setSpeed(0);
  });
}

/** Load a save text through the title screen's Continue (slot 1), as `loadScene` of `perf-build3.spec.ts`. */
export async function loadSave(page: Page, art: 'pixel' | 'classic', save: string): Promise<void> {
  await page.goto(`/?art=${art}`);
  await page.evaluate((j) => {
    localStorage.clear();
    localStorage.setItem('tc.save.1', j);
  }, save);
  await page.reload();
  await page.getByTestId('title-continue').click();
  await expect(page.locator('.title-screen')).toBeHidden();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** The hover outline is off (it is a vector line that is not on the art grid). */
async function expectNoHover(page: Page): Promise<void> {
  expect(await page.evaluate(() => (window as unknown as { __tc: ProtoGame }).__tc.tool.hoverTile)).toBeNull();
}

/**
 * §11.2 item 8: the clock at 12:00 (as `clockTo` of `afterDark.spec.ts`), sunny, After Dark off, no overlay, no tool,
 * no selection, the pointer outside the canvas; then steps of 100 ticks (at most 40) until every ride is open.
 */
export async function prepareView(page: Page): Promise<void> {
  await page.evaluate(
    ([day, hr]) => {
      const g = (window as unknown as { __tc: ProtoGame }).__tc;
      g.setSpeed(0);
      const now = g.world.state.tick;
      const target = Math.floor(now / day) * day + 12 * hr;
      g.step(target > now ? target - now : target + day - now);
      g.world.state.management.weather.current = 'sunny';
      const r = g.dispatch({ type: 'setAfterDark', on: false });
      if (!r.ok) throw new Error(`setAfterDark: ${r.reason}`);
      const t = g.tool;
      t.overlay = 'none';
      t.tool = 'inspect';
      t.defId = null;
      t.ghost = null;
      t.drag = null;
      t.brush = null;
      t.selectedEntity = null;
      t.selectedTile = null;
    },
    [DAY, HOUR] as const,
  );
  await page.mouse.move(0, 0);
  await page.dispatchEvent('#game', 'pointerleave', { pointerType: 'mouse' });
  const steps = await page.evaluate(() => {
    const g = (window as unknown as { __tc: ProtoGame }).__tc;
    const st = g.world.state;
    let n = 0;
    while (n < 40 && !st.rides.every((r) => r.status === 'open')) {
      g.step(100);
      n++;
    }
    if (!st.rides.every((r) => r.status === 'open')) throw new Error(`rides not open: ${st.rides.map((r) => r.status).join(', ')}`);
    return n;
  });
  console.log(`[proto] prepareView: ${steps} steps of 100 ticks until every ride was open`);
  await expectNoHover(page);
}

/** The camera on the carousel centre (27.5, 47.5) in view rotation `rot` at `zoom` (a map point, not a tile). */
export async function centreOnCarousel(page: Page, rot: number, zoom: number): Promise<void> {
  await page.evaluate(
    ([r, z]) => {
      const g = (window as unknown as { __tc: ProtoGame }).__tc;
      const map = g.world.state.map;
      const N = map.width;
      const h = map.heights[47 * N + 27] ?? 0;
      const x = 27.5;
      const y = 47.5;
      const [u, v] = r === 1 ? [N - y, x] : r === 2 ? [N - x, N - y] : r === 3 ? [y, N - x] : [x, y];
      g.camera.rotation = r;
      g.camera.zoom = z;
      g.camera.centerX = (u - v) * 32;
      g.camera.centerY = (u + v) * 16 - h * 8;
    },
    [rot, zoom] as const,
  );
}

/** Waits for `data-complete="1"` (no terrain chunk pending, both styles), then `n` animation frames. */
export async function waitComplete(page: Page, n: number): Promise<void> {
  await frames(page, 2);
  await expect(page.locator('#game')).toHaveAttribute('data-complete', '1', { timeout: 120_000 });
  await frames(page, n);
}

/** The backing size of §7.1 item 3 against the viewport. */
async function canvasBox(page: Page): Promise<{ width: number; height: number; wantW: number; wantH: number }> {
  return page.evaluate(() => {
    const c = document.getElementById('game') as HTMLCanvasElement;
    const k = Number(c.dataset.stretch);
    const dpr = window.devicePixelRatio;
    const d = document.documentElement;
    return { width: c.width, height: c.height, wantW: Math.ceil((d.clientWidth * dpr) / k), wantH: Math.ceil((d.clientHeight * dpr) / k) };
  });
}

/**
 * Controller change after the first run of the pictures: an owner picture shows the park, not a capture moment. Wait
 * until no toast shows (the 'Park loaded' toast covered the scene) and until the mood bar has had an update (it
 * updates every 500 ms, so a picture just after a load showed it empty), then two more frames.
 */
async function settleUi(page: Page): Promise<void> {
  await expect(page.locator('.toast:visible')).toHaveCount(0, { timeout: 60_000 });
  await page.waitForTimeout(700);
  await expect(page.locator('[data-testid="hud-balance"].empty')).toHaveCount(0);
  await waitComplete(page, 2);
}

test.describe('Phase 8 stage 0 prototype', () => {
  test('pictures', async ({ page }, info) => {
    test.skip(!OUT, 'set TC_PROTO_OUT to take the stage 0 pictures');
    test.setTimeout(600_000);
    const out = OUT as string;
    const project = info.project.name;
    mkdirSync(join(out, 'e2e'), { recursive: true });
    const saveFile = join(out, 'e2e', `save-${project}.txt`);

    // 1. Build (skipped with TC_PROTO_REUSE_SAVE=1).
    let save: string;
    if (process.env.TC_PROTO_REUSE_SAVE === '1') {
      if (!existsSync(saveFile)) throw new Error(`TC_PROTO_REUSE_SAVE=1 but ${saveFile} is absent`);
      save = readFileSync(saveFile, 'utf8');
    } else {
      await newParkAt(page, '?art=classic', 'Proto Park');
      await buildScene(page);
      // The build's warning and message toasts hold the toast slot (one toast at a time, ToastArbiter), so the save
      // toast would not show: wait until no toast shows.
      await expect(page.locator('.toast:visible')).toHaveCount(0, { timeout: 60_000 });
      await openTool(page, 'menu');
      await page.getByTestId('menu-save').click();
      await page.getByTestId('slot-1').click();
      await expect(page.getByTestId('toast')).toHaveText('Park saved to slot 1');
      const text = await page.evaluate(() => localStorage.getItem('tc.save.1'));
      expect(text).not.toBeNull();
      save = text as string;
      writeFileSync(saveFile, save);
    }

    // 3. The "after" page first: the "before" page uses its home level.
    await loadSave(page, 'pixel', save);
    await expect(page.locator('#game[data-art="pixel"]')).toHaveCount(1);
    await page.evaluate(() => (window as unknown as { __tc: ProtoGame }).__tc.settings.set('renderQuality', 'high'));
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    const device = (await page.locator('#game').getAttribute('data-device')) as 'phone' | 'desktop';
    expect(['phone', 'desktop']).toContain(device);
    const stretch = planStretch(dpr, device, false);
    await expect(page.locator('#game')).toHaveAttribute('data-stretch', String(stretch));
    await prepareView(page);
    const home = Number(await page.locator('#game').getAttribute('data-home-zoom'));
    expect(home).toBeGreaterThan(0);
    await centreOnCarousel(page, 0, home);
    await waitComplete(page, 2);
    await settleUi(page);
    await expectNoHover(page);
    await page.screenshot({ path: join(out, `after-${project}.png`) });
    const box = await canvasBox(page);
    expect(box.width).toBe(box.wantW);
    expect(box.height).toBe(box.wantH);
    for (let i = 0; i < 10; i++) {
      await frames(page, 1);
      expect(await canvasBox(page)).toEqual(box);
    }
    console.log(`[proto] ${project}: dpr ${dpr}, device ${device}, stretch ${stretch}, home zoom ${home}, canvas ${box.width} x ${box.height}`);

    // 4. The "before" page: Classic, the same save, the same zoom number.
    await loadSave(page, 'classic', save);
    expect(await page.locator('#game').getAttribute('data-art')).not.toBe('pixel');
    await page.evaluate(() => (window as unknown as { __tc: ProtoGame }).__tc.settings.set('renderQuality', 'high'));
    await prepareView(page);
    await centreOnCarousel(page, 0, home);
    await waitComplete(page, 2);
    await settleUi(page);
    await expectNoHover(page);
    await page.screenshot({ path: join(out, `before-${project}.png`) });

    // 5. The strip (desktop only): before, after and the draft crop, 640 × 400 each.
    if (project === 'desktop') {
      const uri = (p: string): string => 'data:image/png;base64,' + readFileSync(p).toString('base64');
      const srcs = [uri(join(out, 'before-desktop.png')), uri(join(out, 'after-desktop.png')), uri(DRAFT)];
      const png = await page.evaluate(async (list) => {
        // Controller change after the first run: the before and after crops start at y 180 (as the draft crop), so that
        // the card hand (from y 580) is not in the strip. Prototype decision 14 said y 200.
        const crops: Array<[number, number]> = [[320, 180], [320, 180], [320, 180]];
        const c = document.createElement('canvas');
        c.width = 1920;
        c.height = 400;
        const ctx = c.getContext('2d') as CanvasRenderingContext2D;
        ctx.imageSmoothingEnabled = false;
        for (let i = 0; i < list.length; i++) {
          const img = new Image();
          img.src = list[i] as string;
          await img.decode();
          const [sx, sy] = crops[i] as [number, number];
          ctx.drawImage(img, sx, sy, 640, 400, i * 640, 0, 640, 400);
        }
        return c.toDataURL('image/png');
      }, srcs);
      writeFileSync(join(out, 'strip-desktop.png'), Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'));
    }
  });

  test('measures and grid', async ({ page }, info) => {
    test.skip(!OUT, 'set TC_PROTO_OUT to take the stage 0 measures');
    test.setTimeout(600_000);
    const out = OUT as string;
    const project = info.project.name;
    mkdirSync(join(out, 'e2e'), { recursive: true });
    const saveFile = join(out, 'e2e', `save-${project}.txt`);
    if (!existsSync(saveFile)) throw new Error(`${saveFile} is absent: run Task 19a first`);
    const save = readFileSync(saveFile, 'utf8');
    const loadavg = (): string => readFileSync('/proc/loadavg', 'utf8').trim();

    // 1. Load: the pixel page as the "after" page of the test `pictures`.
    const loadavgBefore = loadavg();
    await loadSave(page, 'pixel', save);
    await expect(page.locator('#game[data-art="pixel"]')).toHaveCount(1);
    await page.evaluate(() => (window as unknown as { __tc: ProtoGame }).__tc.settings.set('renderQuality', 'high'));
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    const device = (await page.locator('#game').getAttribute('data-device')) as 'phone' | 'desktop';
    expect(['phone', 'desktop']).toContain(device);
    const stretch = planStretch(dpr, device, false);
    await expect(page.locator('#game')).toHaveAttribute('data-stretch', String(stretch));
    await prepareView(page);
    const home = Number(await page.locator('#game').getAttribute('data-home-zoom'));
    expect(home).toBeGreaterThan(0);
    await centreOnCarousel(page, 0, home);
    await waitComplete(page, 2);

    // 2. Measures. The phone runs at 4× CPU throttle; with TC_PROTO_TRACE the 4 phone turns run in a CPU profile.
    type Stats = { spriteBuildMsMax: number; chunkBuildMsMax: number; turnFrameMsMax: number; rideBuildMsMax: number; spriteMb: number; chunkMb: number };
    const phone = project === 'phone';
    const cdp = phone ? await page.context().newCDPSession(page) : null;
    if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const chunkBuildMsMaxLoad = await page.evaluate(() => (window as unknown as { __pixelStats: Stats }).__pixelStats.chunkBuildMsMax);
    await page.evaluate(() => {
      const s = (window as unknown as { __pixelStats: Stats }).__pixelStats;
      s.spriteBuildMsMax = 0;
      s.chunkBuildMsMax = 0;
      s.turnFrameMsMax = 0;
      s.rideBuildMsMax = 0;
    });
    const trace = phone ? process.env.TC_PROTO_TRACE : undefined;
    if (cdp && trace) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.start');
    }
    for (const r of [1, 2, 3, 0]) {
      await centreOnCarousel(page, r, home);
      await waitComplete(page, 30);
    }
    if (cdp && trace) {
      const { profile } = await cdp.send('Profiler.stop');
      mkdirSync(trace, { recursive: true });
      writeFileSync(join(trace, 'turn-profile.cpuprofile'), JSON.stringify(profile));
    }
    const stats = await page.evaluate(() => ({ ...(window as unknown as { __pixelStats: Stats }).__pixelStats }));
    if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const loadavgAfter = loadavg();
    console.log(`[proto] ${project} measures: ${JSON.stringify(stats)}, chunkBuildMsMaxLoad ${chunkBuildMsMaxLoad}`);

    // 3. The grid check (kill rule 2) at every crisp level.
    interface BadRun { x: number; y: number; length: number; dir: 'h' | 'v' }
    const gridLevels: Array<{ zoom: number; n: number; ok: boolean; badRuns: BadRun[]; boxErrors?: string[] }> = [];
    for (const level of zoomLevels(makeGrid(dpr, device, false))) {
      if (level.soft) continue;
      await page.evaluate((z) => {
        (window as unknown as { __tc: ProtoGame }).__tc.camera.zoom = z;
      }, level.zoom);
      await expect(page.locator('#game')).toHaveAttribute('data-zoom', level.zoom.toFixed(3));
      await waitComplete(page, 2);
      await expectNoHover(page);
      const res = await page.evaluate((n) => {
        const c = document.getElementById('game') as HTMLCanvasElement;
        const w = c.width;
        const h = c.height;
        const px = new Uint32Array((c.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, w, h).data.buffer);
        const bad: Array<{ x: number; y: number; length: number; dir: 'h' | 'v' }> = [];
        let badCount = 0;
        const note = (x: number, y: number, length: number, dir: 'h' | 'v'): void => {
          badCount++;
          if (bad.length < 10) bad.push({ x, y, length, dir });
        };
        // Horizontal runs that touch neither the left nor the right edge.
        for (let y = 0; y < h; y++) {
          const row = y * w;
          let x0 = 0;
          for (let x = 1; x <= w; x++) {
            if (x < w && px[row + x] === px[row + x0]) continue;
            if (x0 > 0 && x < w && (x - x0) % n !== 0) note(x0, y, x - x0, 'h');
            x0 = x;
          }
        }
        // Vertical runs that touch neither the top nor the bottom edge.
        for (let x = 0; x < w; x++) {
          let y0 = 0;
          for (let y = 1; y <= h; y++) {
            if (y < h && px[y * w + x] === px[y0 * w + x]) continue;
            if (y0 > 0 && y < h && (y - y0) % n !== 0) note(x, y0, y - y0, 'v');
            y0 = y;
          }
        }
        const k = Number(c.dataset.stretch);
        const dpr = window.devicePixelRatio;
        const d = document.documentElement;
        const rect = c.getBoundingClientRect();
        return {
          bad,
          badCount,
          k,
          w,
          h,
          wantW: Math.ceil((d.clientWidth * dpr) / k),
          wantH: Math.ceil((d.clientHeight * dpr) / k),
          boxW: rect.width,
          boxH: rect.height,
          wantBoxW: (w * k) / dpr,
          wantBoxH: (h * k) / dpr,
          rendering: getComputedStyle(c).imageRendering,
        };
      }, level.n);
      const boxErrors: string[] = [];
      if (res.k !== stretch) boxErrors.push(`data-stretch ${res.k}, want ${stretch}`);
      if (res.w !== res.wantW) boxErrors.push(`canvas.width ${res.w}, want ${res.wantW}`);
      if (res.h !== res.wantH) boxErrors.push(`canvas.height ${res.h}, want ${res.wantH}`);
      if (Math.abs(res.boxW - res.wantBoxW) > 0.01) boxErrors.push(`box width ${res.boxW}, want ${res.wantBoxW}`);
      if (Math.abs(res.boxH - res.wantBoxH) > 0.01) boxErrors.push(`box height ${res.boxH}, want ${res.wantBoxH}`);
      if (res.rendering !== 'pixelated') boxErrors.push(`image-rendering ${res.rendering}`);
      const ok = res.badCount === 0 && boxErrors.length === 0;
      const entry: (typeof gridLevels)[number] = { zoom: level.zoom, n: level.n, ok, badRuns: res.bad };
      if (boxErrors.length) entry.boxErrors = boxErrors;
      gridLevels.push(entry);
      console.log(`[proto] ${project} grid: zoom ${level.zoom.toFixed(3)}, n ${level.n}, ${ok ? 'ok' : `${res.badCount} bad runs; ${boxErrors.join('; ')}`}`);
    }

    // 4. Write the numbers (also when a level fails), then fail on a bad level.
    const numbers = {
      spriteBuildMsMax: stats.spriteBuildMsMax,
      chunkBuildMsMax: stats.chunkBuildMsMax,
      chunkBuildMsMaxLoad,
      turnFrameMsMax: stats.turnFrameMsMax,
      rideBuildMsMax: stats.rideBuildMsMax,
      spriteMb: stats.spriteMb,
      chunkMb: stats.chunkMb,
      homeZoom: home,
      stretch,
      loadavgBefore,
      loadavgAfter,
      gridLevels,
    };
    writeFileSync(join(out, 'e2e', `numbers-${project}.json`), JSON.stringify(numbers, null, 2) + '\n');
    expect(gridLevels.length).toBeGreaterThan(0);
    expect(gridLevels.filter((l) => !l.ok)).toEqual([]);
  });
});
