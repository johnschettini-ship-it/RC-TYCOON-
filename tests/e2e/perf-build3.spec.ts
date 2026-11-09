import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { newPark, watchErrors } from './helpers';
import { PERF_SCENES, type PerfSceneInfo } from '../perf/sceneInfo';

/**
 * Phase 6 §4.6 performance (W4-E).
 *
 * Always on: the overlay is hidden by default and shows with F3 and with the Performance overlay setting; the
 * three benchmark scenes (`tests/perf/`) load in the browser.
 *
 * `TC_PERF=1`: the perf run. Each scene is loaded from its save, warmed up for 2 s, then run for 30 s at 1× with the
 * real game loop (`TC_PERF_SECONDS` to change). The phone project runs the phone and Build 2 scenes with the CPU
 * throttled 4×; the desktop project runs the Build 1 and Build 2 scenes. Reported per run: fps and frame time
 * p50 / p95 / max (requestAnimationFrame timestamps), tick time p50 / p95 and main-thread work p95 (`perfProbe`),
 * long tasks (PerformanceObserver), JS heap (CDP), draw calls, sprite cache MB, and the longest frame of a view
 * turn. `TC_PERF_RUNS=3` repeats each run (the PixiJS rule counts runs). Timings on a shared machine are noise, so
 * this is a measurement tool, not a gate; numbers go in `docs/adr/0001-renderer.md`.
 *
 * The run also works on a build without the probe (frame times, long tasks, and heap only), for before/after.
 */

interface PerfHook {
  enabled: boolean;
  reset(): void;
  snapshot(last?: number): {
    tickP50: number;
    tickP95: number;
    workP95: number;
    workMax: number;
    renderP95: number;
    drawCalls: number;
    spriteCacheMb: number;
    spriteCacheByKind: Record<string, number>;
    canvasesMade: number;
    longFrames: number;
  };
}

interface TcPerfGame {
  world: { state: { guests: unknown[]; map: { width: number; height: number; heights: ArrayLike<number> } } };
  camera: { centerX: number; centerY: number; zoom: number; rotation: number };
  settings?: { get(k: string): unknown; set(k: string, v: unknown): boolean };
  perf?: PerfHook;
  setSpeed(n: number): void;
}

interface RunResult {
  fps: number;
  p50: number;
  p95: number;
  max: number;
  tickP50: number | null;
  tickP95: number | null;
  workP95: number | null;
  workMax: number | null;
  renderP95: number | null;
  drawCalls: number | null;
  spriteMb: number | null;
  spriteByKind: Record<string, number> | null;
  canvasesMade: number | null;
  longTasks: number;
  seconds: number;
  guestsStart: number;
  guestsEnd: number;
}

const SCENE_DIR = fileURLToPath(new URL('../perf/', import.meta.url));

/** Load a scene save through the title screen's Continue (slot 1). */
async function loadScene(page: Page, scene: PerfSceneInfo): Promise<void> {
  const json = readFileSync(SCENE_DIR + scene.file, 'utf8');
  await page.goto('/');
  await page.evaluate((j) => {
    localStorage.clear();
    localStorage.setItem('tc.save.1', j);
  }, json);
  await page.reload();
  await page.getByTestId('title-continue').click();
  await expect(page.locator('.title-screen')).toBeHidden();
  const size = await page.evaluate(() => (window as unknown as { __tc: TcPerfGame }).__tc.world.state.map.width);
  expect(size).toBe(scene.mapSize);
}

/** Camera on map tile (x, y) at `zoom` in view rotation `rot` (the view rotation table of `src/render/view.ts`). */
interface Aim {
  x: number;
  y: number;
  zoom: number;
  rot: number;
}

/**
 * Run the real loop at 1× for `ms`. With `aim`, the camera moves there in the first sampled frame, so a view turn
 * (or a jump) is inside the measured window.
 */
async function runFor(page: Page, ms: number, aimAt: Aim | null = null, panPx = 0): Promise<RunResult> {
  return page.evaluate(
    ([dur, a, pan]) =>
      new Promise<RunResult>((resolve) => {
        const g = (window as unknown as { __tc: TcPerfGame }).__tc;
        const point = (): void => {
          if (!a) return;
          const N = g.world.state.map.width;
          const h = g.world.state.map.heights[a.y * N + a.x] ?? 8;
          const r = a.rot;
          const [u, v] = r === 1 ? [N - 1 - a.y, a.x] : r === 2 ? [N - 1 - a.x, N - 1 - a.y] : r === 3 ? [a.y, N - 1 - a.x] : [a.x, a.y];
          g.camera.zoom = a.zoom;
          g.camera.rotation = r;
          g.camera.centerX = (u - v) * 32;
          g.camera.centerY = (u + v + 1) * 16 - h * 8;
        };
        const probe = g.perf;
        if (probe) {
          probe.enabled = true;
          probe.reset();
        }
        let longTasks = 0;
        let obs: PerformanceObserver | null = null;
        try {
          obs = new PerformanceObserver((list) => {
            longTasks += list.getEntries().length;
          });
          obs.observe({ type: 'longtask', buffered: false });
        } catch {
          obs = null;
        }
        const guestsStart = g.world.state.guests.length;
        const stamps: number[] = [];
        const t0 = performance.now();
        const sample = (t: number): void => {
          // The camera moves before the game's next frame draws.
          if (stamps.length === 0) point();
          // A pan: back and forth along the view x axis, `pan` world px per frame.
          else if (pan) g.camera.centerX += Math.floor(stamps.length / 60) % 2 ? -pan : pan;
          stamps.push(t);
          if (t - t0 < dur) {
            requestAnimationFrame(sample);
            return;
          }
          g.setSpeed(0);
          obs?.disconnect();
          const d: number[] = [];
          for (let k = 1; k < stamps.length; k++) d.push((stamps[k] as number) - (stamps[k - 1] as number));
          const max = Math.max(...d);
          d.sort((a, b) => a - b);
          const at = (q: number): number => d[Math.min(d.length - 1, Math.max(0, Math.ceil(q * d.length) - 1))] ?? 0;
          const span = ((stamps[stamps.length - 1] as number) - (stamps[0] as number)) / 1000;
          const s = probe?.snapshot();
          if (probe) probe.enabled = false;
          resolve({
            fps: (stamps.length - 1) / span,
            p50: at(0.5),
            p95: at(0.95),
            max,
            tickP50: s ? s.tickP50 : null,
            tickP95: s ? s.tickP95 : null,
            workP95: s ? s.workP95 : null,
            workMax: s ? s.workMax : null,
            renderP95: s ? s.renderP95 : null,
            drawCalls: s ? s.drawCalls : null,
            spriteMb: s ? s.spriteCacheMb : null,
            spriteByKind: s ? s.spriteCacheByKind : null,
            canvasesMade: s ? s.canvasesMade : null,
            longTasks,
            seconds: span,
            guestsStart,
            guestsEnd: g.world.state.guests.length,
          });
        };
        g.setSpeed(1);
        requestAnimationFrame(sample);
      }),
    [ms, aimAt, panPx] as const,
  );
}

async function heapMb(cdp: CDPSession): Promise<number> {
  await cdp.send('HeapProfiler.collectGarbage');
  const h = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number };
  return h.usedSize / (1024 * 1024);
}

const n1 = (v: number | null): string => (v === null ? 'n/a' : v.toFixed(1));
const n2 = (v: number | null): string => (v === null ? 'n/a' : v.toFixed(2));

function fmt(r: RunResult): string {
  return (
    `${r.fps.toFixed(1)} fps, frame p50 ${r.p50.toFixed(1)} / p95 ${r.p95.toFixed(1)} / max ${r.max.toFixed(0)} ms; ` +
    `tick p50 ${n2(r.tickP50)} / p95 ${n2(r.tickP95)} ms; work p95 ${n1(r.workP95)} ms; render p95 ${n1(r.renderP95)} ms; ` +
    `draws ${r.drawCalls ?? 'n/a'}; sprites ${n1(r.spriteMb)} MB${r.spriteByKind ? ` (${Object.entries(r.spriteByKind).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ')})` : ''}, ` +
    `${r.canvasesMade ?? 'n/a'} canvases made; long tasks ${r.longTasks} in ${r.seconds.toFixed(0)} s; ` +
    `guests ${r.guestsStart} → ${r.guestsEnd}`
  );
}

test.describe('performance overlay (Phase 6 §4.6, §7)', () => {
  test('hidden by default; F3 and the setting show it', async ({ page }) => {
    const watch = watchErrors(page);
    await newPark(page, 'Perf Overlay');
    const overlay = page.getByTestId('perf-overlay');
    await expect(overlay).toBeHidden();
    await page.locator('#game').focus();
    await page.keyboard.press('F3');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('fps');
    await expect(overlay).toContainText('Tick');
    await expect(overlay).toContainText('Draw calls');
    await expect(overlay).toContainText('Sprite cache');
    await page.keyboard.press('F3');
    await expect(overlay).toBeHidden();
    await page.evaluate(() => (window as unknown as { __tc: TcPerfGame }).__tc.settings?.set('perfOverlay', true));
    await expect(overlay).toBeVisible();
    // The setting persists: the overlay is back after a reload.
    await page.reload();
    await expect(page.getByTestId('perf-overlay')).toBeAttached();
    await page.evaluate(() => (window as unknown as { __tc: TcPerfGame }).__tc.settings?.set('perfOverlay', false));
    await expect(page.getByTestId('perf-overlay')).toBeHidden();
    watch.expectNoErrors();
  });
});

test.describe('benchmark scenes (Phase 6 §4.6)', () => {
  test('every scene loads from its save', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'loading is the same on both profiles');
    test.setTimeout(120_000);
    const watch = watchErrors(page);
    for (const scene of PERF_SCENES) {
      await loadScene(page, scene);
      const guests = await page.evaluate(() => (window as unknown as { __tc: TcPerfGame }).__tc.world.state.guests.length);
      expect(guests).toBeGreaterThanOrEqual(scene.guests * 0.95);
    }
    watch.expectNoErrors();
  });
});

test.describe('perf run (Phase 6 §4.6 method)', () => {
  test.skip(!process.env.TC_PERF, 'set TC_PERF=1 to run the 30 s perf runs');

  const seconds = Number(process.env.TC_PERF_SECONDS ?? 30);
  const runs = Number(process.env.TC_PERF_RUNS ?? 1);

  for (const id of ['build1', 'build2', 'phone'] as const) {
    test(`scene ${id}`, async ({ page }, info) => {
      const phone = info.project.name === 'phone';
      test.skip(phone ? id === 'build1' : id === 'phone', 'desktop runs build1 and build2; phone runs phone and build2');
      test.setTimeout((seconds * 1000 + 30_000) * runs * 2 + 120_000);
      const scene = PERF_SCENES.find((s) => s.id === id) as PerfSceneInfo;
      const cdp = await page.context().newCDPSession(page);
      const at = (rot: number): Aim => ({ x: scene.focus.x, y: scene.focus.y, zoom: 1, rot });
      for (let k = 0; k < runs; k++) {
        await loadScene(page, scene);
        if (phone) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await runFor(page, 2_000, at(0));
        const main = await runFor(page, seconds * 1000);
        const heap = await heapMb(cdp);
        // View turns: the longest frame (and its main-thread work) of the first second after each.
        const turns: RunResult[] = [];
        for (const rot of [1, 2]) turns.push(await runFor(page, 1_000, at(rot)));
        // A pan: the camera moves every frame, so no static layer can be reused.
        const pan = await runFor(page, 3_000, null, 6);
        if (phone) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        const ratio = await page.locator('#game').getAttribute('data-pixel-ratio');
        const turnText = turns.map((t) => `${t.max.toFixed(0)} ms (work ${n1(t.workMax)} ms)`).join(', ');
        console.log(
          `[perf] ${info.project.name}${phone ? ' (CPU 4×)' : ''} scene ${id} run ${k + 1}/${runs}, canvas ratio ${ratio}: ${fmt(main)}; ` +
            `heap ${heap.toFixed(0)} MB; turns: longest frame ${turnText}; pan: frame p95 ${pan.p95.toFixed(1)} ms, work p95 ${n1(pan.workP95)} ms`,
        );
      }
    });
  }
});
