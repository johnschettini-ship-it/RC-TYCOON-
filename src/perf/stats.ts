/**
 * Performance probes (Phase 6 §4.6). Owner: W4-E. `Game.frame` calls the frame and tick probes; the renderer calls
 * `renderStart` / `renderEnd` and counts `drawImage` calls through `countDraw`.
 *
 * Off by default: every call returns at once and nothing reads the clock. The overlay (F3 or Settings → Performance
 * overlay) and the Playwright perf run (`window.__tc.perf`) turn it on. Then ring buffers keep the newest frame
 * intervals (from the `requestAnimationFrame` timestamps), frame work times, tick times, and render times;
 * `snapshot()` gives p50 / p95 over them (nearest rank).
 */
import { spriteMemory } from '../render/spriteCache';
import { canvasStats } from '../render/canvas';

export interface PerfSnapshot {
  fps: number;
  /** Time between frames (ms): what the player sees. */
  frameP50: number;
  frameP95: number;
  tickP50: number;
  tickP95: number;
  /** `drawImage` calls in the last finished frame. */
  drawCalls: number;
  /** Bytes held by every sprite and terrain chunk cache (`width × height × 4`), in MiB. */
  spriteCacheMb: number;
  /** `spriteCacheMb` by cache (`chunks`, `sprites`, `static`, `other`), MiB. */
  spriteCacheByKind: Record<string, number>;
  // ---- W4-E additions ----
  /** Longest frame interval in the window (ms). */
  frameMax: number;
  /** Main-thread work per frame (`Game.frame` start to end, ms): ticks, events, render, UI. */
  workP50: number;
  workP95: number;
  /** Longest frame work in the window (ms). */
  workMax: number;
  /** `Renderer.draw` time (ms, JavaScript and canvas calls). */
  renderP50: number;
  renderP95: number;
  /** Frames whose work took more than 50 ms (main-thread long tasks; the worker rule). */
  longFrames: number;
  /** Canvases made (sprite and chunk builds) since the last `reset`: high while caches thrash. */
  canvasesMade: number;
  /** Samples in the window. */
  frames: number;
  ticks: number;
}

export interface PerfProbe {
  enabled: boolean;
  frameStart(nowMs: number): void;
  frameEnd(): void;
  tickStart(): void;
  tickEnd(): void;
  /** One `drawImage` (or other draw call) this frame. */
  countDraw(n?: number): void;
  renderStart(): void;
  renderEnd(): void;
  /** Statistics over the newest `last` samples of each buffer (default: all kept). */
  snapshot(last?: number): PerfSnapshot;
  /** Forget every sample (the perf run starts its window here). */
  reset(): void;
}

/** Nearest-rank percentile (`q` in (0, 1]) of `values`; 0 when empty. Does not change `values`. */
export function percentile(values: ArrayLike<number>, q: number): number {
  const n = values.length;
  if (n === 0) return 0;
  const sorted = Float64Array.from(values as ArrayLike<number>).sort();
  const rank = Math.min(n, Math.max(1, Math.ceil(q * n)));
  return sorted[rank - 1] as number;
}

/** Fixed-capacity buffer of the newest numbers. */
export class RingBuffer {
  private readonly data: Float64Array;
  private head = 0;
  count = 0;

  constructor(readonly capacity: number) {
    this.data = new Float64Array(capacity);
  }

  push(v: number): void {
    this.data[this.head] = v;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /** The newest `n` values, oldest first. */
  last(n: number): number[] {
    const k = Math.min(n, this.count);
    const out = new Array<number>(k);
    for (let i = 0; i < k; i++) out[i] = this.data[(this.head - k + i + this.capacity) % this.capacity] as number;
    return out;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}

/** Samples kept per buffer: 34 s of frames at 60 fps, enough for the 30 s perf run. */
export const PROBE_CAPACITY = 2048;
/** A longer gap between frames is a paused or hidden tab, not a frame. */
const MAX_FRAME_GAP_MS = 1000;
/** Main-thread long task (Phase 6 §4.6 worker rule). */
const LONG_FRAME_MS = 50;

const defaultClock = (): number => (typeof performance !== 'undefined' ? performance.now() : 0);

export function createPerfProbe(
  clock: () => number = defaultClock,
  memoryBytes: () => number = () => spriteMemory.bytes,
  memoryByKind: () => Record<string, number> = () => spriteMemory.breakdown(),
): PerfProbe {
  const frames = new RingBuffer(PROBE_CAPACITY);
  const work = new RingBuffer(PROBE_CAPACITY);
  const ticks = new RingBuffer(PROBE_CAPACITY);
  const renders = new RingBuffer(PROBE_CAPACITY);
  let lastFrameAt = -1;
  let frameT0 = 0;
  let tickT0 = 0;
  let renderT0 = 0;
  let draws = 0;
  let lastDraws = 0;
  let longFrames = 0;
  let inFrame = false;
  let madeAtReset = canvasStats.made;

  const probe: PerfProbe = {
    enabled: false,
    frameStart(nowMs) {
      if (!probe.enabled) return;
      if (lastFrameAt >= 0) {
        const dt = nowMs - lastFrameAt;
        if (dt >= 0 && dt <= MAX_FRAME_GAP_MS) frames.push(dt);
      }
      lastFrameAt = nowMs;
      draws = 0;
      inFrame = true;
      frameT0 = clock();
    },
    frameEnd() {
      if (!probe.enabled || !inFrame) return;
      inFrame = false;
      const w = clock() - frameT0;
      work.push(w);
      if (w > LONG_FRAME_MS) longFrames++;
      lastDraws = draws;
    },
    tickStart() {
      if (probe.enabled) tickT0 = clock();
    },
    tickEnd() {
      if (probe.enabled) ticks.push(clock() - tickT0);
    },
    countDraw(n = 1) {
      if (probe.enabled) draws += n;
    },
    renderStart() {
      if (probe.enabled) renderT0 = clock();
    },
    renderEnd() {
      if (probe.enabled) renders.push(clock() - renderT0);
    },
    snapshot(last = PROBE_CAPACITY) {
      const f = frames.last(last);
      let total = 0;
      let max = 0;
      for (const v of f) {
        total += v;
        if (v > max) max = v;
      }
      const w = work.last(last);
      const t = ticks.last(last);
      const r = renders.last(last);
      return {
        fps: total > 0 ? (f.length * 1000) / total : 0,
        frameP50: percentile(f, 0.5),
        frameP95: percentile(f, 0.95),
        tickP50: percentile(t, 0.5),
        tickP95: percentile(t, 0.95),
        drawCalls: lastDraws,
        spriteCacheMb: memoryBytes() / (1024 * 1024),
        spriteCacheByKind: Object.fromEntries(Object.entries(memoryByKind()).map(([k, v]) => [k, v / (1024 * 1024)])),
        frameMax: max,
        workP50: percentile(w, 0.5),
        workP95: percentile(w, 0.95),
        workMax: w.length > 0 ? Math.max(...w) : 0,
        renderP50: percentile(r, 0.5),
        renderP95: percentile(r, 0.95),
        longFrames,
        canvasesMade: canvasStats.made - madeAtReset,
        frames: f.length,
        ticks: t.length,
      };
    },
    reset() {
      frames.clear();
      work.clear();
      ticks.clear();
      renders.clear();
      lastFrameAt = -1;
      longFrames = 0;
      draws = 0;
      lastDraws = 0;
      inFrame = false;
      madeAtReset = canvasStats.made;
    },
  };
  return probe;
}

/** The game's probe (`Game.frame`, the renderer, the overlay, and `window.__tc.perf`). */
export const perfProbe: PerfProbe = createPerfProbe();
