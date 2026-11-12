/**
 * Phase 8b stage 0b test (never merged): the 0b browser checks on the app build (`TC_APP=1`, `VITE_ART=pixel`).
 * `b1 decode` (Task 14): every sheet of every pack decoded with the store's options, every entry hashed and format-checked.
 * `pictures` (Task 17), `cases` and `start` (Task 18): outputs under `TC_0B_OUT` (skipped when unset).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERF_SCENES } from '../perf/sceneInfo';
import { expect, test, type Page } from '@playwright/test';
import { K_GUEST, K_RAIL } from '../../src/render/artHook';
import { trimmedHash } from '../../src/render/pixel/app/format';
import { openTool, tilePoint } from './helpers';

/** Output folder of the 0b tests (`TC_0B_OUT`); the tests that write there skip when it is unset. */
export const OUT = process.env.TC_0B_OUT;
/** Timeout of each 0b test. */
const TEST_MS = 900_000;

/** Load save text through the title's Continue (slot 1), at `/` plus `query` (for example `?art=classic`). */
export async function loadSave(page: Page, text: string, query = ''): Promise<void> {
  await page.goto('/' + query);
  await page.evaluate((j) => {
    localStorage.clear();
    localStorage.setItem('tc.save.1', j);
  }, text);
  await page.reload();
  await page.getByTestId('title-continue').click();
  await expect(page.locator('.title-screen')).toBeHidden();
}

/**
 * Review Focus 1: the page is the app build (`window.__tcBuild === 'app'`, set only by the app runtime chunk); Pixel
 * has `#game[data-art="pixel"]` and `window.__predrawnStats`, Classic has no `data-art`.
 */
export async function assertAppBuild(page: Page, style: 'pixel' | 'classic'): Promise<void> {
  expect(await page.evaluate(() => (window as unknown as { __tcBuild?: string }).__tcBuild)).toBe('app');
  if (style === 'pixel') {
    await expect(page.locator('#game')).toHaveAttribute('data-art', 'pixel');
    expect(await page.evaluate(() => typeof (window as unknown as { __predrawnStats?: unknown }).__predrawnStats === 'object')).toBe(true);
  } else {
    expect(await page.locator('#game').getAttribute('data-art')).toBeNull();
  }
}

/**
 * Pixel: waits for `data-art-complete="1"` and then for a complete frame (no missing picture, no placeholder ground;
 * `__predrawnStats.frameComplete`); both styles then wait `frames` animation frames.
 */
export async function waitComplete(page: Page, frames: number): Promise<void> {
  if ((await page.locator('#game').getAttribute('data-art')) === 'pixel') {
    await expect(page.locator('#game')).toHaveAttribute('data-art-complete', '1', { timeout: 120_000 });
    await page.waitForFunction(() => (window as unknown as { __predrawnStats?: { frameComplete: boolean } }).__predrawnStats?.frameComplete === true, null, { timeout: 120_000, polling: 'raf' });
  }
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let left = n;
        const step = (): void => {
          if (left-- <= 0) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    frames,
  );
}

const PERF_DIR = fileURLToPath(new URL('../perf/', import.meta.url));
const DAY = 1200;
const HOUR = 50;

interface PicGame {
  world: {
    state: {
      tick: number;
      map: { width: number; heights: ArrayLike<number> };
      rides: Array<{ status: string }>;
      management: { weather: { current: string } };
      track: { rides: Record<string, { pieces: Array<{ defId: string; x: number; y: number }> }> };
    };
  };
  camera: { centerX: number; centerY: number; zoom: number; rotation: number };
  tool: { tool: string; hoverTile: number | null; selectedTile: number | null; overlay: string; selectedEntity: unknown; defId: string | null; ghost: unknown; drag: unknown; brush: unknown };
  dispatch(cmd: Record<string, unknown>): { ok: boolean; reason?: string };
  step(n: number): void;
  setSpeed(n: number): void;
}

/** The 0b picture scenes: save file and camera focus (cases: the coaster's corkscrew, found in the page). */
const PIC_SCENES: Array<{ id: 'phone' | 'build2' | 'cases'; file: string; focus: { x: number; y: number } | null }> = [
  { id: 'phone', file: (PERF_SCENES.find((s) => s.id === 'phone') as { file: string }).file, focus: (PERF_SCENES.find((s) => s.id === 'phone') as { focus: { x: number; y: number } }).focus },
  { id: 'build2', file: (PERF_SCENES.find((s) => s.id === 'build2') as { file: string }).file, focus: (PERF_SCENES.find((s) => s.id === 'build2') as { focus: { x: number; y: number } }).focus },
  { id: 'cases', file: 'cases-0b.tcsave.json', focus: null },
];

/**
 * Stage 0 `prepareView`: the clock at `hour` (12 by default; 22 with After Dark for the night picture), sunny, no
 * overlay, no tool, no selection, the pointer outside the canvas, the game paused; then steps of 100 ticks (at most 40)
 * until every ride is open.
 */
async function prepareView(page: Page, hour = 12, afterDark = false): Promise<void> {
  await page.evaluate(
    ([day, hr, h, dark]) => {
      const g = (window as unknown as { __tc: PicGame }).__tc;
      g.setSpeed(0);
      const st = g.world.state;
      let n = 0;
      while (n < 40 && !st.rides.every((r) => r.status === 'open')) {
        g.step(100);
        n++;
      }
      if (!st.rides.every((r) => r.status === 'open')) throw new Error(`rides not open: ${st.rides.map((r) => r.status).join(', ')}`);
      const now = st.tick;
      const target = Math.floor(now / day) * day + h * hr;
      g.step(target > now ? target - now : target + day - now);
      st.management.weather.current = 'sunny';
      const r = g.dispatch({ type: 'setAfterDark', on: dark });
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
    [DAY, HOUR, hour, afterDark] as const,
  );
  await page.mouse.move(0, 0);
  await page.dispatchEvent('#game', 'pointerleave', { pointerType: 'mouse' });
  expect(await page.evaluate(() => (window as unknown as { __tc: PicGame }).__tc.tool.hoverTile)).toBeNull();
}

/** The camera on tile `focus` (cases: the corkscrew piece of the coaster) in view rotation `rot` at `zoom`. */
async function aim(page: Page, focus: { x: number; y: number } | null, rot: number, zoom: number): Promise<void> {
  await page.evaluate(
    ([f, r, z]) => {
      const g = (window as unknown as { __tc: PicGame }).__tc;
      const st = g.world.state;
      let p = f;
      if (!p) {
        for (const ride of Object.values(st.track.rides)) {
          const c = ride.pieces.find((q) => q.defId.startsWith('corkscrew'));
          if (c) p = { x: c.x, y: c.y };
        }
      }
      if (!p) throw new Error('no corkscrew piece in the cases park');
      const N = st.map.width;
      const h = st.map.heights[p.y * N + p.x] ?? 8;
      const [u, v] = r === 1 ? [N - 1 - p.y, p.x] : r === 2 ? [N - 1 - p.x, N - 1 - p.y] : r === 3 ? [p.y, N - 1 - p.x] : [p.x, p.y];
      g.camera.zoom = z;
      g.camera.rotation = r;
      g.camera.centerX = (u - v) * 32;
      g.camera.centerY = (u + v + 1) * 16 - h * 8;
    },
    [focus, rot, zoom] as const,
  );
}

/** Stage 0 `settleUi`: no toast, the mood bar updated, then a complete frame and two more frames. */
async function settleUi(page: Page): Promise<void> {
  await expect(page.locator('.toast:visible')).toHaveCount(0, { timeout: 60_000 });
  await page.waitForTimeout(700);
  await expect(page.locator('[data-testid="hud-balance"].empty')).toHaveCount(0);
  await waitComplete(page, 2);
}

/** Review Focus 3: after a complete frame, no picture is missing over two more frames (the world is paused). */
async function expectNothingMissing(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __predrawnStats: { reset(): void } }).__predrawnStats.reset());
  await waitComplete(page, 2);
  expect(await page.evaluate(() => (window as unknown as { __predrawnStats: { missingTotal: number } }).__predrawnStats.missingTotal)).toBe(0);
}

/** RGB of slot `i1` (the guest shadow colour), skipped in guest hashes on both sides (Test decision 13). */
const SHADOW_RGB = 0x6e4470;

interface DecodedRow {
  entry: number;
  kind: number;
  /** The entry rectangle size and anchor (art px), for the exact rail anchor check in `b1Compare.test.ts`. */
  w: number;
  h: number;
  ox: number;
  oy: number;
  hash: number;
  formatOk: boolean;
  why: string;
}

/** Task 18: the cases park save, its camera focus (`tests/perf/casesScene.ts` `CASES_FOCUS`), loops and placements. */
const CASES_SAVE = 'cases-0b.tcsave.json';
const CASES_AT = { x: 28, y: 28 } as const;
/** Loops of `cases` and `start` (median of 3; `TC_0B_LOOPS` only for development checks). */
const LOOPS = Number(process.env.TC_0B_LOOPS ?? 3);
const PLACEMENTS = 20;

/** One `cases` loop (`cases-<project>.json`). */
interface CasesRun {
  incompleteAfterTurnMax: number;
  chunkMsMax: number;
  swapMainMsMax: number;
  placeFrameMaxMs: number;
  budgetMbMax: number;
  parts: { budgetMb: number; sheetMb: number; swapMb: number; chunkMb: number; staticMb: number; otherMb: number };
  decodeMsT1: number;
  decodeMsT4: number;
  decodeSheet: { file: string; w: number; h: number; bytes: number };
  decodeT1List: number[];
  decodeT4List: number[];
  decodeMsList: Array<{ file: string; w: number; h: number; ms: number }>;
  ghostTile: { x: number; y: number } | null;
  blockedTile: { x: number; y: number } | null;
}

interface StatsView {
  budgetMb: number;
  budgetMbMax: number;
  sheetMb: number;
  swapMb: number;
  chunkMb: number;
  staticMb: number;
  otherMb: number;
  missingTotal: number;
  incompleteAfterTurnMax: number;
  chunkMsMax: number;
  swapMainMsMax: number;
  decodeMs: Array<{ file: string; w: number; h: number; ms: number }>;
}

function median(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
}

/** `n` animation frames. */
async function rafFrames(page: Page, n: number): Promise<void> {
  await page.evaluate(
    (k) =>
      new Promise<void>((resolve) => {
        let left = k;
        const step = (): void => {
          if (left-- <= 0) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    n,
  );
}

/** A copy of `__predrawnStats` (one read, so the budget parts are of one frame). */
async function stats(page: Page): Promise<StatsView> {
  return page.evaluate(() => {
    const s = (window as unknown as { __predrawnStats: StatsView }).__predrawnStats;
    const { budgetMb, budgetMbMax, sheetMb, swapMb, chunkMb, staticMb, otherMb, missingTotal, incompleteAfterTurnMax, chunkMsMax, swapMainMsMax } = s;
    return { budgetMb, budgetMbMax, sheetMb, swapMb, chunkMb, staticMb, otherMb, missingTotal, incompleteAfterTurnMax, chunkMsMax, swapMainMsMax, decodeMs: s.decodeMs.map((d) => ({ ...d })) };
  });
}

async function statsReset(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __predrawnStats: { reset(): void } }).__predrawnStats.reset());
}

/** After a complete frame, the missing pictures summed over `n` more frames. */
async function missingOver(page: Page, n: number): Promise<number> {
  await waitComplete(page, 0);
  const m0 = (await stats(page)).missingTotal;
  await rafFrames(page, n);
  return (await stats(page)).missingTotal - m0;
}

/** Owned empty tiles and path or building tiles near `at`, nearest first. */
async function nearTiles(page: Page, at: { x: number; y: number }): Promise<{ free: Array<{ x: number; y: number }>; blocked: Array<{ x: number; y: number }> }> {
  return page.evaluate((c) => {
    const m = (window as unknown as { __tc: { world: { state: { map: { width: number; height: number; content: ArrayLike<number>; owned: ArrayLike<number> } } } } }).__tc.world.state.map;
    const free: Array<{ x: number; y: number; d: number }> = [];
    const blocked: Array<{ x: number; y: number; d: number }> = [];
    for (let y = 1; y < m.height - 1; y++) {
      for (let x = 1; x < m.width - 1; x++) {
        const i = y * m.width + x;
        const d = Math.abs(x - c.x) + Math.abs(y - c.y);
        if (d > 12 || m.owned[i] !== 1) continue;
        const k = m.content[i];
        if (k === 0) free.push({ x, y, d });
        else if (k === 1 || k === 3) blocked.push({ x, y, d });
      }
    }
    const order = (a: { x: number; y: number; d: number }, b: { x: number; y: number; d: number }): number => a.d - b.d || a.y - b.y || a.x - b.x;
    return { free: free.sort(order).map(({ x, y }) => ({ x, y })), blocked: blocked.sort(order).map(({ x, y }) => ({ x, y })) };
  }, at);
}

/** The largest `ground` sheet decoded 5 times with the store's decode (fetch once, `createImageBitmap` with its options). */
async function decodeGround(page: Page): Promise<{ sheet: { file: string; w: number; h: number; bytes: number }; ms: number[] }> {
  return page.evaluate(async () => {
    const dbg = (window as unknown as {
      __predrawn: { packs: Array<{ name: string; url: string }>; entries(p: string): Promise<{ sheets: Array<{ file: string; w: number; h: number }> }> };
    }).__predrawn;
    const ref = dbg.packs.find((p) => p.name === 'ground');
    if (!ref) throw new Error('no ground pack');
    const ix = await dbg.entries('ground');
    let sh = ix.sheets[0];
    for (const s of ix.sheets) if (sh && s.w * s.h > sh.w * sh.h) sh = s;
    if (!sh) throw new Error('no ground sheet');
    const url = ref.url.slice(0, ref.url.lastIndexOf('/') + 1) + sh.file;
    const res = await fetch(url);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ms: number[] = [];
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      ms.push(performance.now() - t0);
      bmp.close();
    }
    return { sheet: { file: sh.file, w: sh.w, h: sh.h, bytes: bytes.length }, ms };
  });
}

test.describe('b1 decode', () => {
  const dir = process.env.TC_B1_DIR;
  test.skip(!dir, 'set TC_B1_DIR to run the B1 decode');

  test('b1 decode', async ({ page }) => {
    test.setTimeout(1_800_000);
    await page.goto('/');
    await page.waitForFunction(() => (window as unknown as { __predrawn?: unknown }).__predrawn !== undefined, null, { timeout: 120_000 });
    expect(await page.evaluate(() => (window as unknown as { __tcBuild?: string }).__tcBuild)).toBe('app');
    const packs = await page.evaluate(() => (window as unknown as { __predrawn: { packs: Array<{ name: string }> } }).__predrawn.packs.map((p) => p.name));
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) {
      const rows = await page.evaluate(
        async ([name, hashSrc, guestKind, skip, railKind]) => {
          // The Node `trimmedHash`, rebuilt in the page from its source.
          const hash = new Function(`return (${hashSrc});`)() as (rgba: Uint8Array, w: number, h: number, ox: number, oy: number, skip: number) => number;
          const dbg = (window as unknown as {
            __predrawn: {
              decodeAll(p: string): Promise<{
                index: { palette: Uint8Array; sheets: Array<{ w: number; h: number }>; kind: Uint8Array; sheet: Uint16Array; x: Uint16Array; y: Uint16Array; w: Uint16Array; h: Uint16Array; ox: Int16Array; oy: Int16Array };
                sheets: Array<{ file: string; w: number; h: number; image: CanvasImageSource & { close?: () => void } }>;
              }>;
            };
          }).__predrawn;
          const { index: ix, sheets } = await dbg.decodeAll(name);
          const pal = new Set<number>();
          for (let s = 0; s + 2 < ix.palette.length; s += 3) pal.add(((ix.palette[s] as number) << 16) | ((ix.palette[s + 1] as number) << 8) | (ix.palette[s + 2] as number));
          const bySheet = new Map<number, number[]>();
          for (let e = 0; e < ix.kind.length; e++) {
            const s = ix.sheet[e] as number;
            const list = bySheet.get(s) ?? [];
            list.push(e);
            bySheet.set(s, list);
          }
          const out: Array<{ entry: number; kind: number; w: number; h: number; ox: number; oy: number; hash: number; formatOk: boolean; why: string }> = [];
          for (let s = 0; s < sheets.length; s++) {
            const sh = sheets[s] as (typeof sheets)[number];
            const cv = new OffscreenCanvas(sh.w, sh.h);
            const ctx = cv.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
            ctx.drawImage(sh.image, 0, 0);
            const all = ctx.getImageData(0, 0, sh.w, sh.h).data;
            sh.image.close?.();
            for (const e of bySheet.get(s) ?? []) {
              const x = ix.x[e] as number;
              const y = ix.y[e] as number;
              const w = ix.w[e] as number;
              const h = ix.h[e] as number;
              const ox = ix.ox[e] as number;
              const oy = ix.oy[e] as number;
              const why: string[] = [];
              if (x + w > sh.w || y + h > sh.h || w <= 0 || h <= 0) why.push(`rect ${x},${y} ${w}×${h} outside ${sh.w}×${sh.h}`);
              // Rails: the exact bound from the slice geometry is checked in Node (`b1Compare.test.ts`; controller decision on B1).
              const kind = ix.kind[e] as number;
              if (kind !== railKind && (ox < -w || ox > 2 * w || oy < -h || oy > 2 * h)) why.push(`anchor ${ox},${oy} for ${w}×${h}`);
              const rgba = new Uint8Array(Math.max(0, w) * Math.max(0, h) * 4);
              let opaque = 0;
              let badAlpha = 0;
              let badRgb = 0;
              for (let j = 0; j < h && y + j < sh.h; j++) {
                for (let i = 0; i < w && x + i < sh.w; i++) {
                  const o = ((y + j) * sh.w + (x + i)) * 4;
                  const a = all[o + 3] as number;
                  const k = (j * w + i) * 4;
                  rgba[k] = all[o] as number;
                  rgba[k + 1] = all[o + 1] as number;
                  rgba[k + 2] = all[o + 2] as number;
                  rgba[k + 3] = a;
                  if (a !== 0 && a !== 255) badAlpha++;
                  if (a === 255) {
                    opaque++;
                    if (!pal.has(((all[o] as number) << 16) | ((all[o + 1] as number) << 8) | (all[o + 2] as number))) badRgb++;
                  }
                }
              }
              if (badAlpha) why.push(`${badAlpha} pixels with alpha not 0 or 255`);
              if (badRgb) why.push(`${badRgb} opaque pixels not in the palette`);
              if (opaque === 0) why.push('no opaque pixel');
              out.push({ entry: e, kind, w, h, ox, oy, hash: hash(rgba, w, h, ox, oy, kind === guestKind ? skip : -1), formatOk: why.length === 0, why: why.join('; ') });
            }
          }
          return out;
        },
        [pack, trimmedHash.toString(), K_GUEST, SHADOW_RGB, K_RAIL] as const,
      );
      writeFileSync(join(dir as string, `decoded-${pack}.json`), JSON.stringify(rows satisfies DecodedRow[]));
      console.log(`[b1] ${pack}: ${rows.length} entries, format ok ${rows.filter((r) => r.formatOk).length}`);
    }
  });
});

test.describe('0b outputs', () => {
  test.skip(!OUT, 'set TC_0B_OUT to write the 0b outputs');
  test.beforeAll(() => {
    mkdirSync(join(OUT as string, 'e2e'), { recursive: true });
  });

  test('pictures', async ({ page }, info) => {
    test.setTimeout(TEST_MS);
    const project = info.project.name;
    test.skip(project !== 'phone' && project !== 'tablet', 'phone and tablet only');
    const out = join(OUT as string, 'pictures');
    mkdirSync(out, { recursive: true });
    const shot = async (name: string): Promise<void> => {
      await page.screenshot({ path: join(out, name) });
    };
    let gpuDone = false;
    for (const sc of PIC_SCENES) {
      const text = readFileSync(PERF_DIR + sc.file, 'utf8');
      // Pixel first: the Classic page uses the same zoom number (the Pixel home zoom).
      await loadSave(page, text, '?art=pixel');
      await assertAppBuild(page, 'pixel');
      await prepareView(page);
      const home = Number(await page.locator('#game').getAttribute('data-home-zoom'));
      expect(home).toBeGreaterThan(0);
      await aim(page, sc.focus, 0, home);
      await settleUi(page);
      await expectNothingMissing(page);
      await shot(`${sc.id}-${project}-pixel.png`);
      if (!gpuDone) {
        gpuDone = true;
        // `SystemInfo` is a browser-target domain.
        const browser = page.context().browser();
        if (!browser) throw new Error('no browser for SystemInfo.getInfo');
        const cdp = await browser.newBrowserCDPSession();
        const sys = (await cdp.send('SystemInfo.getInfo')) as { gpu: { featureStatus: Record<string, string>; devices: unknown[] } };
        const canvas = await page.evaluate(() => {
          const c = document.getElementById('game') as HTMLCanvasElement;
          return { width: c.width, height: c.height, styleWidth: c.style.width, styleHeight: c.style.height, k: Number(c.dataset.stretch), artScale: Number(c.dataset.artScale), dpr: window.devicePixelRatio, cssW: document.documentElement.clientWidth, cssH: document.documentElement.clientHeight };
        });
        const gpu = { project, canvas2d: sys.gpu.featureStatus['2d_canvas'] ?? null, device: sys.gpu.devices[0] ?? null, canvas, homeZoom: home };
        writeFileSync(join(OUT as string, 'e2e', `gpu-${project}.json`), `${JSON.stringify(gpu, null, 2)}\n`);
      }
      if (sc.id === 'cases') {
        await aim(page, sc.focus, 1, home);
        await waitComplete(page, 2);
        await expectNothingMissing(page);
        await shot(`cases-${project}-pixel-r1.png`);
        if (project === 'phone') {
          // Night: After Dark on, 22:00; object shadows are gone (D8), guests keep theirs.
          await prepareView(page, 22, true);
          await aim(page, sc.focus, 0, home);
          await waitComplete(page, 2);
          await expectNothingMissing(page);
          await shot('cases-phone-pixel-night.png');
        }
      }
      // Today: the same build in Classic (`?art=classic`), the same view and zoom number.
      await loadSave(page, text, '?art=classic');
      await assertAppBuild(page, 'classic');
      await prepareView(page);
      await aim(page, sc.focus, 0, home);
      await settleUi(page);
      await shot(`${sc.id}-${project}-today.png`);
    }
    if (project === 'phone') {
      // The strip: today | pixel crops (960 × 600 device px each) of the cases park around the screen centre.
      const uri = (p: string): string => 'data:image/png;base64,' + readFileSync(p).toString('base64');
      const png = await page.evaluate(async (list) => {
        const c = document.createElement('canvas');
        c.width = 1920;
        c.height = 600;
        const ctx = c.getContext('2d') as CanvasRenderingContext2D;
        ctx.imageSmoothingEnabled = false;
        for (let i = 0; i < list.length; i++) {
          const img = new Image();
          img.src = list[i] as string;
          await img.decode();
          const sx = Math.max(0, Math.round((img.width - 960) / 2));
          const sy = Math.max(0, Math.round((img.height - 600) / 2));
          ctx.drawImage(img, sx, sy, 960, 600, i * 960, 0, 960, 600);
        }
        return c.toDataURL('image/png');
      }, [uri(join(out, 'cases-phone-today.png')), uri(join(out, 'cases-phone-pixel.png'))]);
      writeFileSync(join(out, 'strip-phone.png'), Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'));
    }
  });

  test('cases', async ({ page }, info) => {
    test.setTimeout(2 * TEST_MS);
    const project = info.project.name;
    test.skip(project !== 'phone' && project !== 'tablet', 'phone and tablet only');
    const loadavgBefore = readFileSync('/proc/loadavg', 'utf8').trim();
    const text = readFileSync(PERF_DIR + CASES_SAVE, 'utf8');
    // Controller decision (Batch 7): tablets run the coarse frame set (the full set's working set is above 64 MB).
    const query = project === 'tablet' ? '?frames=coarse' : '';
    const cdp = await page.context().newCDPSession(page);
    const runs: CasesRun[] = [];
    for (let loop = 0; loop < LOOPS; loop++) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await loadSave(page, text, query);
      await assertAppBuild(page, 'pixel');
      expect(await page.evaluate(() => (window as unknown as { __predrawnStats: { frameSet: string } }).__predrawnStats.frameSet)).toBe('coarse');
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.evaluate(() => (window as unknown as { __tc: PicGame }).__tc.setSpeed(1));
      await waitComplete(page, 2);
      const home = Number(await page.locator('#game').getAttribute('data-home-zoom'));
      expect(home).toBeGreaterThan(0);
      await aim(page, CASES_AT, 0, home);
      await waitComplete(page, 2);
      await statsReset(page);

      // (1) Four view turns, 60 frames after each: frames until complete, and the cold chunk assemblies.
      for (const rot of [1, 2, 3, 0]) {
        await aim(page, CASES_AT, rot, home);
        await rafFrames(page, 60);
      }
      const afterTurns = await stats(page);
      const incompleteAfterTurnMax = afterTurns.incompleteAfterTurnMax;
      const chunkMsMax = afterTurns.chunkMsMax;

      // (2) Colour swap of the coaster, 60 frames: the slowest main-thread palette swap.
      await page.evaluate(() => {
        const g = (window as unknown as { __tc: PicGame }).__tc;
        const id = Object.keys(g.world.state.track.rides)[0];
        if (id === undefined) throw new Error('no track ride in the cases park');
        const r = g.dispatch({ type: 'setTrackColours', rideId: Number(id), track: 2, supports: 10, cars: 7 });
        if (!r.ok) throw new Error(`setTrackColours: ${r.reason}`);
      });
      await rafFrames(page, 60);
      const swapMainMsMax = (await stats(page)).swapMainMsMax;

      // (3) Placement ghosts (game paused, so only the ghost pictures can be new): oak_round over a free tile, then
      // over a blocked tile; after each ghost's pictures decode, 30 frames without a missing picture.
      await page.evaluate(() => (window as unknown as { __tc: PicGame }).__tc.setSpeed(0));
      await openTool(page, 'scenery', { tap: true });
      await page.getByTestId('scenery-tab-base').tap();
      await page.getByTestId('scenery-item-oak_round').tap();
      if (await page.getByTestId('scenery-picker').isVisible()) await page.getByTestId('scenery-close').tap();
      const tiles = await nearTiles(page, CASES_AT);
      const ghostMissing: number[] = [];
      let freeTile: { x: number; y: number } | null = null;
      for (const t of tiles.free.slice(0, 12)) {
        const p = await tilePoint(page, t.x, t.y);
        await page.touchscreen.tap(p.x, p.y);
        await rafFrames(page, 2);
        if (((await page.getByTestId('scenery-status-detail').textContent()) ?? '').includes('Ready to place')) {
          freeTile = t;
          break;
        }
      }
      expect(freeTile, 'a free tile where the oak ghost is valid').not.toBeNull();
      ghostMissing.push(await missingOver(page, 30));
      const blocked = tiles.blocked[0];
      expect(blocked, 'a blocked tile near the focus').toBeDefined();
      const bp = await tilePoint(page, (blocked as { x: number }).x, (blocked as { y: number }).y);
      await page.touchscreen.tap(bp.x, bp.y);
      await rafFrames(page, 2);
      expect((await page.getByTestId('scenery-status-detail').textContent()) ?? '').not.toContain('Ready to place');
      ghostMissing.push(await missingOver(page, 30));
      expect(ghostMissing, 'valid and invalid ghost pictures drawn with nothing missing (Review Focus 3)').toEqual([0, 0]);
      await openTool(page, 'inspect');
      await page.evaluate(() => (window as unknown as { __tc: PicGame }).__tc.setSpeed(1));

      // (4) 20 scenery placements in a row, one `placeScenery` per animation frame: the longest frame interval.
      const placeFrameMaxMs = await page.evaluate(
        ([cands, n]) =>
          new Promise<number>((resolve, reject) => {
            const g = (window as unknown as { __tc: PicGame }).__tc;
            const stamps: number[] = [];
            let i = 0;
            let placed = 0;
            const step = (t: number): void => {
              stamps.push(t);
              if (placed >= n) {
                let max = 0;
                for (let k = 1; k < stamps.length; k++) max = Math.max(max, (stamps[k] as number) - (stamps[k - 1] as number));
                resolve(max);
                return;
              }
              while (i < cands.length) {
                const c = cands[i++] as { x: number; y: number };
                if (g.dispatch({ type: 'placeScenery', defId: 'oak_round', x: c.x, y: c.y, rotation: 0, edge: -1 }).ok) {
                  placed++;
                  break;
                }
              }
              if (placed < n && i >= cands.length) {
                reject(new Error(`only ${placed} placements`));
                return;
              }
              requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          }),
        [tiles.free, PLACEMENTS] as const,
      );

      // (5) The budget peak and its parts at the end (Review Focus 5: the sum of the five parts).
      const end = await stats(page);
      const parts = { budgetMb: end.budgetMb, sheetMb: end.sheetMb, swapMb: end.swapMb, chunkMb: end.chunkMb, staticMb: end.staticMb, otherMb: end.otherMb };
      expect(Math.abs(end.budgetMb - (end.sheetMb + end.swapMb + end.chunkMb + end.staticMb + end.otherMb))).toBeLessThanOrEqual(0.01);
      const decodeMsList = end.decodeMs;

      // Decode time of one ground sheet at throttle 4 and at throttle 1, 5 times each (the store's decode options).
      await page.evaluate(() => (window as unknown as { __tc: PicGame }).__tc.setSpeed(0));
      const t4 = await decodeGround(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const t1 = await decodeGround(page);
      runs.push({
        incompleteAfterTurnMax,
        chunkMsMax,
        swapMainMsMax,
        placeFrameMaxMs,
        budgetMbMax: end.budgetMbMax,
        parts,
        decodeMsT1: median(t1.ms),
        decodeMsT4: median(t4.ms),
        decodeSheet: t1.sheet,
        decodeT1List: t1.ms,
        decodeT4List: t4.ms,
        decodeMsList,
        ghostTile: freeTile,
        blockedTile: blocked ?? null,
      });
      console.log(
        `[cases] ${project} run ${loop + 1}/${LOOPS}: incomplete after turn ${incompleteAfterTurnMax}, chunk max ${chunkMsMax.toFixed(1)} ms, ` +
          `swap main max ${swapMainMsMax.toFixed(2)} ms, place frame max ${placeFrameMaxMs.toFixed(1)} ms, budget max ${end.budgetMbMax.toFixed(2)} MB, ` +
          `decode ${t1.sheet.file} T1 ${median(t1.ms).toFixed(1)} ms, T4 ${median(t4.ms).toFixed(1)} ms`,
      );
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const loadavgAfter = readFileSync('/proc/loadavg', 'utf8').trim();
    writeFileSync(join(OUT as string, 'e2e', `cases-${project}.json`), `${JSON.stringify({ project, frameSet: 'coarse', runs, loadavgBefore, loadavgAfter }, null, 2)}\n`);
  });

  test('start', async ({ page, context }, info) => {
    test.setTimeout(TEST_MS);
    test.skip(info.project.name !== 'phone', 'phone only');
    const build2 = readFileSync(PERF_DIR + (PERF_SCENES.find((s) => s.id === 'build2') as { file: string }).file, 'utf8');
    // The fixture page sets the storage (no throttle) and then leaves the game, so only the measured page runs; every
    // measured loop is a fresh page with the browser cache cleared.
    const setSave = async (save: string | null): Promise<void> => {
      await page.goto('/');
      await page.evaluate((j) => {
        localStorage.clear();
        if (j !== null) localStorage.setItem('tc.save.1', j);
      }, save);
      await page.goto('about:blank');
    };
    const measure = async (how: 'new' | 'continue'): Promise<number> => {
      const p = await context.newPage();
      const cdp = await context.newCDPSession(p);
      await cdp.send('Network.clearBrowserCache');
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await p.goto('/');
      if (how === 'new') {
        await p.getByTestId('title-new').click();
        await p.getByTestId('title-name').fill('Start Park');
        await p.getByTestId('title-size-64').click();
        await p.getByTestId('title-start').click();
      } else {
        await p.getByTestId('title-continue').click();
      }
      await expect(p.locator('.title-screen')).toBeHidden({ timeout: 120_000 });
      await assertAppBuild(p, 'pixel');
      // Two frames, so the renderer has seen the new world (a new world starts `firstCompleteMs` again).
      await rafFrames(p, 2);
      await p.waitForFunction(() => ((window as unknown as { __predrawnStats?: { firstCompleteMs: number } }).__predrawnStats?.firstCompleteMs ?? -1) >= 0, null, { timeout: 300_000 });
      const ms = await p.evaluate(() => (window as unknown as { __predrawnStats: { firstCompleteMs: number } }).__predrawnStats.firstCompleteMs);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await p.close();
      return ms;
    };
    const newPark: number[] = [];
    const continueBuild2: number[] = [];
    for (let loop = 0; loop < LOOPS; loop++) {
      await setSave(null);
      newPark.push(await measure('new'));
      console.log(`[start] new park run ${loop + 1}/${LOOPS}: ${newPark[loop]?.toFixed(0)} ms`);
    }
    for (let loop = 0; loop < LOOPS; loop++) {
      await setSave(build2);
      continueBuild2.push(await measure('continue'));
      console.log(`[start] continue build2 run ${loop + 1}/${LOOPS}: ${continueBuild2[loop]?.toFixed(0)} ms`);
    }
    writeFileSync(join(OUT as string, 'e2e', 'start-phone.json'), `${JSON.stringify({ newPark, continueBuild2 }, null, 2)}\n`);
  });
});
