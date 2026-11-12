/** Phase 8b stage 0b test (never merged): the device bench (Test decision 18; active only with `VITE_BENCH=1`). */
import type { PredrawnStats } from './stats';

/** One bench run: the numbers of the perf procedure of `perf-build3.spec.ts` on the device. */
export interface BenchRun {
  frameP50: number;
  frameP95: number;
  frameMax: number;
  /** Main-thread work p95 (`perfProbe`); null without the probe. */
  workP95: number | null;
  /** Longest frame of the two view turns (Test decision 14). */
  turnMax: number;
  /** The frame step: 5th percentile of the measured frame intervals. */
  stepMs: number;
  budgetMbMax: number | null;
  incompleteAfterTurnMax: number | null;
  missingTotal: number | null;
  firstCompleteMs: number | null;
}

/** The medians of the runs, and the steps of the median frame p95 and turn by the median frame step. */
export interface BenchSummary extends BenchRun {
  runs: number;
  frameP95Steps: number;
  turnSteps: number;
}

/** Median of the values that are not null; null when none. */
function median(values: Array<number | null>): number | null {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = v.length >> 1;
  return v.length % 2 ? (v[m] as number) : ((v[m - 1] as number) + (v[m] as number)) / 2;
}

/** The frame step of a run: the 5th percentile (nearest rank) of its frame intervals. */
export function stepMsOf(intervals: readonly number[]): number {
  if (intervals.length === 0) return 0;
  const s = [...intervals].sort((a, b) => a - b);
  const rank = Math.min(s.length, Math.max(1, Math.ceil(0.05 * s.length)));
  return s[rank - 1] as number;
}

/** Steps of `ms` at the frame step (`round(ms / stepMs)`). */
const steps = (ms: number, stepMs: number): number => (stepMs > 0 ? Math.round(ms / stepMs) : 0);

/** Pure: medians over the runs and the steps by the measured frame step. */
export function benchSummary(runs: readonly BenchRun[]): BenchSummary {
  const m = (pick: (r: BenchRun) => number | null): number | null => median(runs.map(pick));
  const num = (pick: (r: BenchRun) => number): number => m(pick) ?? 0;
  const stepMs = num((r) => r.stepMs);
  const frameP95 = num((r) => r.frameP95);
  const turnMax = num((r) => r.turnMax);
  return {
    runs: runs.length,
    frameP50: num((r) => r.frameP50),
    frameP95,
    frameMax: num((r) => r.frameMax),
    workP95: m((r) => r.workP95),
    turnMax,
    stepMs,
    budgetMbMax: m((r) => r.budgetMbMax),
    incompleteAfterTurnMax: m((r) => r.incompleteAfterTurnMax),
    missingTotal: m((r) => r.missingTotal),
    firstCompleteMs: m((r) => r.firstCompleteMs),
    frameP95Steps: steps(frameP95, stepMs),
    turnSteps: steps(turnMax, stepMs),
  };
}

// ---- Browser part (not reached by Node tests) ----

type Scene = 'phone' | 'build2' | 'cases' | 'build1';
/** Camera focus per bench save (`tests/perf/sceneInfo.ts`, `casesScene.ts`). */
const FOCUS: Record<Scene, { x: number; y: number }> = {
  build1: { x: 40, y: 30 },
  build2: { x: 64, y: 64 },
  phone: { x: 40, y: 30 },
  cases: { x: 28, y: 28 },
};
const BUTTONS: ReadonlyArray<[Scene, 'pixel' | 'classic', string]> = [
  ['phone', 'pixel', 'phone · pixel'],
  ['phone', 'classic', 'phone · today'],
  ['build2', 'pixel', 'build2 · pixel'],
  ['build2', 'classic', 'build2 · today'],
  ['cases', 'pixel', 'cases · pixel'],
];
const RUNS = 3;
const WARMUP_MS = 10_000;
const MEASURE_MS = 30_000;
const TURN_MS = 1_000;
const RUNS_KEY = 'tc.bench.runs';

interface BenchGame {
  world: { state: { map: { width: number; heights: ArrayLike<number> } } };
  camera: { centerX: number; centerY: number; zoom: number; rotation: number };
  perf?: { enabled: boolean; reset(): void; snapshot(): { workP95: number } };
  setSpeed(n: number): void;
}

interface BenchQuery {
  scene: Scene;
  art: string;
  run: number;
}

function benchQuery(search: string): BenchQuery | null {
  const q = new URLSearchParams(search);
  const scene = q.get('bench');
  if (scene !== 'phone' && scene !== 'build2' && scene !== 'cases' && scene !== 'build1') return null;
  return { scene, art: q.get('art') ?? '', run: Math.max(1, Number(q.get('run') ?? 1) || 1) };
}

const benchUrl = (scene: Scene, art: string, run: number): string => `./index.html?bench=${scene}&art=${art}&run=${run}`;

function readRuns(): BenchRun[] {
  try {
    return JSON.parse(sessionStorage.getItem(RUNS_KEY) ?? '[]') as BenchRun[];
  } catch {
    return [];
  }
}

function writeRuns(runs: BenchRun[]): void {
  try {
    sessionStorage.setItem(RUNS_KEY, JSON.stringify(runs));
  } catch {
    // No session storage: the panel then shows only the runs of this page.
  }
}

/**
 * Before the game boots: with `?bench=<scene>`, put the bench save in slot 1 (the other saves are cleared, as the perf
 * spec does, so Continue opens it). Returns false when the save cannot be fetched.
 */
export async function prepareBench(search: string): Promise<boolean> {
  if (import.meta.env.VITE_BENCH !== '1') return false;
  const q = benchQuery(search);
  if (!q) return false;
  try {
    const res = await fetch(`./bench/${q.scene}.json`);
    if (!res.ok) throw new Error(`bench save ${q.scene}: ${res.status}`);
    const json = await res.text();
    localStorage.clear();
    localStorage.setItem('tc.save.1', json);
    if (q.run === 1) writeRuns([]);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

/** After the game boots: the bench buttons on the title, or the bench run of `?bench=`. */
export function startBench(doc: Document): void {
  if (import.meta.env.VITE_BENCH !== '1') return;
  const q = benchQuery(location.search);
  if (!q) {
    addButtons(doc);
    return;
  }
  void runBench(doc, q).catch((e: unknown) => showPanel(doc, `bench failed: ${String(e)}`));
}

function addButtons(doc: Document): void {
  const group = doc.createElement('div');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Bench');
  group.dataset.testid = 'bench-group';
  group.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px';
  const label = doc.createElement('strong');
  label.textContent = 'Bench';
  group.appendChild(label);
  for (const [scene, art, text] of BUTTONS) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = text;
    b.style.cssText = 'min-width:44px;min-height:44px';
    b.addEventListener('click', () => {
      writeRuns([]);
      location.href = benchUrl(scene, art, 1);
    });
    group.appendChild(b);
  }
  const menu = doc.querySelector('.title-menu');
  if (menu) menu.appendChild(group);
  else {
    group.style.cssText += ';position:fixed;left:8px;bottom:8px;z-index:100;background:#fff;padding:8px';
    doc.body.appendChild(group);
  }
}

const frame = (): Promise<number> => new Promise((r) => requestAnimationFrame(r));

/** Run the real loop at 1× for `ms`; the camera moves to `aim` before the first sampled frame. Frame intervals out. */
async function runFor(g: BenchGame, ms: number, aim: { x: number; y: number; zoom: number; rot: number } | null): Promise<number[]> {
  const stamps: number[] = [];
  g.setSpeed(1);
  let t = await frame();
  if (aim) {
    const N = g.world.state.map.width;
    const h = g.world.state.map.heights[aim.y * N + aim.x] ?? 8;
    const r = aim.rot;
    const [u, v] = r === 1 ? [N - 1 - aim.y, aim.x] : r === 2 ? [N - 1 - aim.x, N - 1 - aim.y] : r === 3 ? [aim.y, N - 1 - aim.x] : [aim.x, aim.y];
    g.camera.zoom = aim.zoom;
    g.camera.rotation = r;
    g.camera.centerX = (u - v) * 32;
    g.camera.centerY = (u + v + 1) * 16 - h * 8;
  }
  const t0 = t;
  stamps.push(t);
  while (t - t0 < ms) {
    t = await frame();
    stamps.push(t);
  }
  const d: number[] = [];
  for (let k = 1; k < stamps.length; k++) d.push((stamps[k] as number) - (stamps[k - 1] as number));
  return d;
}

function pct(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] ?? 0;
}

async function runBench(doc: Document, q: BenchQuery): Promise<void> {
  const w = window as unknown as { __tc?: BenchGame; __predrawnStats?: PredrawnStats };
  const cont = doc.querySelector<HTMLButtonElement>('[data-testid="title-continue"]');
  if (!cont) throw new Error('no Continue button');
  cont.click();
  for (let i = 0; i < 600 && doc.querySelector('.title-screen:not([hidden])')?.getClientRects().length; i++) await frame();
  const g = w.__tc;
  if (!g) throw new Error('no game');
  await frame();
  await frame();
  const canvas = doc.getElementById('game') as HTMLCanvasElement | null;
  const home = Number(canvas?.dataset.homeZoom ?? '1') || 1;
  const focus = FOCUS[q.scene];
  showPanel(doc, `bench ${q.scene} · ${q.art || 'build style'}: run ${q.run}/${RUNS} (warm-up ${WARMUP_MS / 1000} s, measure ${MEASURE_MS / 1000} s)…`);
  await runFor(g, WARMUP_MS, { ...focus, zoom: home, rot: 0 });
  const st = w.__predrawnStats;
  st?.reset();
  const probe = g.perf;
  if (probe) {
    probe.enabled = true;
    probe.reset();
  }
  const main = await runFor(g, MEASURE_MS, null);
  const work = probe ? probe.snapshot().workP95 : null;
  if (probe) probe.enabled = false;
  let turnMax = 0;
  for (const rot of [1, 2]) turnMax = Math.max(turnMax, ...(await runFor(g, TURN_MS, { ...focus, zoom: home, rot })));
  g.setSpeed(0);
  const sorted = [...main].sort((a, b) => a - b);
  const run: BenchRun = {
    frameP50: pct(sorted, 0.5),
    frameP95: pct(sorted, 0.95),
    frameMax: sorted[sorted.length - 1] ?? 0,
    workP95: work,
    turnMax,
    stepMs: stepMsOf(main),
    budgetMbMax: st ? st.budgetMbMax : null,
    incompleteAfterTurnMax: st ? st.incompleteAfterTurnMax : null,
    missingTotal: st ? st.missingTotal : null,
    firstCompleteMs: st && st.firstCompleteMs >= 0 ? st.firstCompleteMs : null,
  };
  const runs = [...readRuns(), run];
  writeRuns(runs);
  if (q.run < RUNS && runs.length === q.run) {
    location.href = benchUrl(q.scene, q.art, q.run + 1);
    return;
  }
  showPanel(doc, resultText(doc, q, runs, canvas));
}

const f1 = (v: number | null): string => (v === null ? 'n/a' : v.toFixed(1));

function resultText(doc: Document, q: BenchQuery, runs: BenchRun[], canvas: HTMLCanvasElement | null): string {
  const el = doc.documentElement;
  const k = canvas?.dataset.stretch ?? 'classic';
  const lines = [
    `bench ${q.scene} · ${canvas?.dataset.art === 'pixel' ? 'pixel' : 'today'}`,
    `device: ${navigator.userAgent}; dpr ${window.devicePixelRatio}; css ${el.clientWidth} × ${el.clientHeight}; k ${k}`,
  ];
  const line = (name: string, r: BenchRun): string =>
    `${name}: frame p50 ${f1(r.frameP50)} / p95 ${f1(r.frameP95)} (${steps(r.frameP95, r.stepMs)} steps) / max ${f1(r.frameMax)} ms; ` +
    `work p95 ${f1(r.workP95)} ms; turn max ${f1(r.turnMax)} ms (${steps(r.turnMax, r.stepMs)} steps); step ${f1(r.stepMs)} ms; ` +
    `budget max ${f1(r.budgetMbMax)} MB; incomplete after turn ${r.incompleteAfterTurnMax ?? 'n/a'}; missing ${r.missingTotal ?? 'n/a'}; ` +
    `first complete ${f1(r.firstCompleteMs)} ms`;
  runs.forEach((r, i) => lines.push(line(`run ${i + 1}`, r)));
  lines.push(line(`median of ${runs.length}`, benchSummary(runs)));
  return lines.join('\n');
}

function showPanel(doc: Document, text: string): void {
  let panel = doc.getElementById('tc-bench-panel');
  if (!panel) {
    panel = doc.createElement('div');
    panel.id = 'tc-bench-panel';
    panel.setAttribute('role', 'status');
    panel.style.cssText =
      'position:fixed;left:8px;right:8px;top:8px;z-index:1000;background:#fff;color:#000;padding:8px;max-height:80vh;overflow:auto;font:12px monospace';
    const pre = doc.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;user-select:text;-webkit-user-select:text;margin:0 0 8px';
    const copy = doc.createElement('button');
    copy.type = 'button';
    copy.className = 'btn';
    copy.textContent = 'Copy';
    copy.style.cssText = 'min-width:44px;min-height:44px';
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(pre.textContent ?? '').catch(() => undefined);
    });
    panel.append(pre, copy);
    doc.body.appendChild(panel);
  }
  (panel.firstChild as HTMLElement).textContent = text;
}
