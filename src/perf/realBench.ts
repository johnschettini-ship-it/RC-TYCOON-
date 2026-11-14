/**
 * Stage 1 benchmark runner (spec §6, the in-game benchmark runner). Only the VITE_ART=real build loads it, and only
 * with `?bench=1` (`main.ts` → `./realBenchCard.ts`), so the website build holds none of it.
 *
 * Per scene: load the save (from the string given, never from storage), centre the camera on the scene's focus at
 * zoom 1, run at 1×, then
 *   5 s warm-up (not counted) → 10 s pan → zoom 2, 1, 0.5, 2 (1 s each) → 4 turns 1 s apart → 20 scenery
 *   placements beside a path, 100 ms apart, through `game.dispatch` → 5 s idle.
 * Frame times are the gaps between drawn frames (`Game.onFrame`, after the renderer drew), so a frame that took long
 * to draw shows. Every gap counts, a visible stall of seconds included; only a gap that spans a hidden page is left
 * out (and counted in `droppedHiddenGaps`). A turn's time runs from the Turn action (`rotateView`, as the Turn button calls it) to the first
 * complete frame at the new rotation: `look.incomplete() === 0` and the realistic ground laid (`ground.complete`), as
 * the renderer counts incomplete frames. At density 4 that frame may draw objects from their density-2 sets (the
 * ahead turn is wanted at density 2); `sharpenMs` runs on to the first frame with every object at its chosen density
 * (`look.soft() === 0`). S3 stays on the turn time.
 *
 * Art is local before anything is measured (spec §5.4 item 1, as in the app): the card reads every compressed file
 * into the set manager first and passes the time as `artDownload`, reported apart. S4 is the app's start to its
 * first drawn frame (`appReadyMs`, art not awaited) plus the first park's load, with all art local, to its first
 * complete frame.
 *
 * When a turn or the first frame times out, the row records the set manager's state at that moment (`stalls`).
 * Each row shows the density the look chose at each zoom step and the held memory split (sets, tinted sheets,
 * ground chunks) at the scene's peak.
 *
 * Headless numbers are not phone numbers. A phone draws at most 2 device pixels per CSS pixel (`PHONE_MAX_RENDER_SCALE`),
 * so it uses density 2 at zoom 1 and density 4 at zoom 2; a desktop with DPR above 2 uses density 4 at zoom 1.
 *
 * Every park starts from the same set manager state: right after its world loads the bench clears the density cap,
 * demotions and the room count (`resetPressure`), and records whether the cap was on before (`cappedAtStart`).
 *
 * Kill-rule bands (spec §6): S1 frame p95 33 ms (the rule is for `build2`; shown for every park), S2 peak decoded
 * memory 128 MB (the decode budget F2), S3 a turn 250 ms the Turn button's way (clockwise) and 500 ms the other way,
 * S4 app start to the first complete park frame 4 s (first row only), S5 app size: not measurable in the game
 * (the bake report gives it), always `n/a`. A missing instrument gives `n/a`, never a pass: S2 without the set
 * manager, S3 and S4 without the realistic look (their times are still recorded).
 *
 * Today's look runs the same sequence for comparison (`?art=classic&bench=1` in the VITE_ART=real build): no look, set
 * manager or ground, so S2, S3 and S4 read n/a and the frame times are measured as for the realistic look. The result
 * says which look ran (`look`).
 *
 * The bench never saves: autosave is off for the run (`game.settings`, put back after), and every perf save also
 * starts more than `BENCH_MAX_SCENE_MS` of 1× ticks before a month start (unit test).
 */
import { centerOnTile, panCamera, rotateView } from '../input/camera';
import type { Speed } from '../loop';
import type { Camera } from '../render/types';
import { deserialize } from '../save';
import { Content } from '../sim/map';
import type { Command, CommandResult } from '../sim/commands';
import type { World } from '../sim/types';
import { perfProbe, percentile, type PerfProbe } from './stats';

/** The part of `Game` the bench drives (a structural type, so tests can pass a fake). */
export interface BenchGame {
  camera: Camera;
  world: World;
  setWorld(world: World): void;
  setSpeed(speed: Speed): void;
  dispatch(cmd: Command): CommandResult;
  onFrame(cb: () => void): void;
  /** Player settings: the bench turns `autosave` off for the run and puts it back after. */
  settings: { get(key: 'autosave'): boolean; set(key: 'autosave', value: boolean): boolean };
}

export interface BenchScene {
  id: string;
  /** The save file's text. */
  json: string;
  /** Map tile at the screen centre (default: the map's middle). */
  focus?: { x: number; y: number };
}

export interface BenchDevice {
  devicePixelRatio: number;
  canvasPx: [number, number];
  viewportCss: [number, number];
  userAgent: string;
}

/** Resident picture memory by owner, bytes (MB in a bench row). */
export interface MemorySplit { sets: number; tints: number; ground: number }

export interface BenchOptions {
  /** The realistic look (absent with today's look: every frame counts as complete). */
  look?: { incomplete(): number; fallbacksUsed(): string[]; currentDensity?(): number; soft?(): number } | null;
  /** The realistic ground: a frame with it not laid is incomplete. */
  ground?: { complete: boolean } | null;
  sets?: { capEvents(): readonly unknown[]; peakBytes(): number; residentBytes(): number; split?(): MemorySplit; snapshot?(): unknown; densityCap?(): number; resetPressure?(): void } | null;
  /** Reading every compressed art file before the run (the card does it), reported apart from S4. */
  artDownload?: { ms: number; bytes: number; files: number };
  /** Navigation start to the boot's first complete frame, network included (shown for information). */
  bootCompleteMs?: number;
  probe?: Pick<PerfProbe, 'enabled' | 'reset' | 'snapshot'>;
  /**
   * Navigation start to the app's first drawn frame, ms (its art not awaited: in the app the art is local, here it
   * downloads). With it, S4 = this + the first park's load to its first complete frame, so the wait before Run is
   * tapped is left out. Without it, S4 is the clock at that first complete frame (`performance.now()` counts from
   * navigation start).
   */
  appReadyMs?: number;
  device?: () => BenchDevice;
  /** Told when a scene starts (the card's progress line). */
  onScene?: (id: string, index: number, total: number) => void;
  /**
   * Multiplies every step's length (warm-up, pan, zoom holds, turn spacing, placement spacing, idle). 1 for a real
   * run; the e2e smoke (`?bench=quick`) uses 0.1. Turn times and their limits are not scaled.
   */
  timeScale?: number;
  /**
   * Calls `onHide` whenever the page is hidden; returns the unsubscribe. A frame gap that spans a hidden page is not a
   * frame (the browser stops drawing) and is counted in `droppedHiddenGaps` instead. Default: `visibilitychange`.
   */
  watchHidden?: (onHide: () => void) => () => void;
}

export type BandResult = 'pass' | 'fail' | 'n/a';

export interface Band {
  value: number | null;
  limit: number | null;
  unit: string;
  band: BandResult;
}

export interface TurnTime {
  /** 1: clockwise, the Turn button's way; −1: the other way. */
  dir: 1 | -1;
  ms: number;
  limitMs: number;
  band: BandResult;
  /** No complete frame within `TURN_TIMEOUT_MS`: `ms` is the time waited. */
  timedOut: boolean;
  /**
   * Turn action → first frame with every object at its chosen density (complete, and nothing drawn from a density-2
   * set in place of density 4: `look.soft() === 0`), ms. null without the realistic look's count, or when the view
   * was not sharp within `TURN_TIMEOUT_MS` (`sharpenTimedOut`). S3 stays on `ms`.
   */
  sharpenMs: number | null;
  sharpenTimedOut: boolean;
}

/** A wait that timed out, with the set manager's state at that moment (R1). */
export interface BenchStall {
  /** `first frame` or `turn <n>` (1-4). */
  at: string;
  incomplete: number;
  groundComplete: boolean | null;
  sets: unknown;
}

export interface BenchRow {
  id: string;
  /** Why the scene did not run (its save did not load). */
  error?: string;
  /** Frame gaps measured (after the warm-up). */
  frames: number;
  frameP50: number;
  frameP95: number;
  frameP99: number;
  framesOver33: number;
  /** Longest frame gap measured, ms (a visible stall of any length counts). */
  longestGapMs: number;
  /** Frame gaps that spanned a hidden page: left out of every frame statistic. */
  droppedHiddenGaps: number;
  /** Main-thread work per frame, p95 (perf probe). */
  workP95: number;
  /** Measured frames that skipped an object whose set was still decoding. */
  incompleteFrames: number;
  /** Decoded picture memory: the scene's peak and its value at the end, MiB. */
  peakMB: number;
  endMB: number;
  turns: TurnTime[];
  placements: number;
  placementFailures: number;
  /** Longest frame gap from the first placement to the end of the placement step, ms. */
  placementLongestFrameMs: number;
  /** Density-cap changes of the set manager during the scene. */
  capEvents: number;
  /** The density cap was on when the park loaded (left by the park before), before the bench cleared it. */
  cappedAtStart: boolean;
  /** The look's density at the end of each zoom step (2, 1, 0.5, 2), then after the turns; empty without the look. */
  densities: number[];
  /** Held memory by owner at the scene's peak and at its end, MiB (null without the set manager's split). */
  peakSplitMB: MemorySplit | null;
  endSplitMB: MemorySplit | null;
  /** Waits that timed out, with the set manager's state (R1). */
  stalls: BenchStall[];
  /** Ids first drawn with today's art during this scene (the run's full list is `RealBenchResult.fallbacksUsed`). */
  fallbacksUsed: string[];
  bands: { S1: Band; S2: Band; S3: Band; S4: Band; S5: Band };
}

export interface RealBenchResult {
  format: 'tc-real-bench/1';
  verdict: 'pass' | 'fail';
  /** Which look ran: 'real' with the realistic look, 'classic' with today's (no look: `?art=classic`, or no art). */
  look: 'real' | 'classic';
  /** S4: navigation start to the first complete park frame, ms (null when no scene loaded). */
  startMs: number | null;
  /** Reading every compressed art file before the run (null when the card did not). */
  artDownload: { ms: number; MB: number; files: number } | null;
  /** Navigation start to the boot's first complete frame, network included (information, not S4). */
  bootCompleteMs: number | null;
  device: BenchDevice;
  scenes: BenchRow[];
  fallbacksUsed: string[];
  capEvents: number;
}

/** Spec §6 kill-rule limits. */
export const BENCH_LIMITS = { frameP95Ms: 33, peakMB: 128, turnMs: 250, turnOtherMs: 500, startMs: 4000 } as const;
/** The four turns: the Turn button's way twice, then back the other way twice (the view ends where it started). */
export const BENCH_TURNS: readonly (1 | -1)[] = [1, 1, -1, -1];
/** Scenery the bench may place: baked stage 1 kinds placed on one tile without an edge. */
export const BENCH_SCENERY: readonly string[] = ['oak_round', 'pine_tall', 'birch_silver', 'willow', 'shrub_round', 'boulder'];

/** The kinds a scene places, in turn: baked kinds not in the park yet first (their sets decode during the step). */
export function benchScenery(world: World): string[] {
  const inPark = new Set(world.state.scenery.map((s) => s.defId));
  return [...BENCH_SCENERY.filter((id) => !inPark.has(id)), ...BENCH_SCENERY.filter((id) => inPark.has(id))];
}

/** Pan speed in screen px per second; the pan goes right, down, left, up, a quarter of the time each. */
const PAN_PX_PER_S = 240;
const ZOOMS = [2, 1, 0.5, 2] as const;
const TURN_TIMEOUT_MS = 5000;
const PLACEMENTS = 20;
const SLOW_FRAME_MS = 33;
/** S4's wait for the first complete frame gives up after this long. */
const FIRST_FRAME_TIMEOUT_MS = 10_000;

/**
 * The longest a scene can run at time scale 1: S4's wait, warm-up, pan, zoom holds, four turns that all time out,
 * placements, idle. The month-start autosave guard (unit test) checks every save against it.
 */
export const BENCH_MAX_SCENE_MS = FIRST_FRAME_TIMEOUT_MS + 5000 + 10_000 + ZOOMS.length * 1000 + BENCH_TURNS.length * TURN_TIMEOUT_MS + PLACEMENTS * 100 + 5000;
const MB = 1024 * 1024;

const r1 = (v: number): number => Math.round(v * 10) / 10;

function band(value: number | null, limit: number, unit: string): Band {
  if (value === null) return { value: null, limit, unit, band: 'n/a' };
  return { value: r1(value), limit, unit, band: value <= limit ? 'pass' : 'fail' };
}

const NA = (unit: string, limit: number | null = null): Band => ({ value: null, limit, unit, band: 'n/a' });

function defaultDevice(): BenchDevice {
  const w = globalThis as { devicePixelRatio?: number; innerWidth?: number; innerHeight?: number; navigator?: { userAgent?: string }; document?: Document };
  const canvas = w.document?.getElementById('game') as HTMLCanvasElement | null | undefined;
  return {
    devicePixelRatio: w.devicePixelRatio ?? 1,
    canvasPx: [canvas?.width ?? 0, canvas?.height ?? 0],
    viewportCss: [w.innerWidth ?? 0, w.innerHeight ?? 0],
    userAgent: w.navigator?.userAgent ?? '',
  };
}

function defaultWatchHidden(onHide: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const h = (): void => {
    if (document.visibilityState === 'hidden') onHide();
  };
  document.addEventListener('visibilitychange', h);
  return () => document.removeEventListener('visibilitychange', h);
}

/** Empty tiles beside a footpath, nearest to `focus` first. */
export function placementSpots(world: World, focus: number): number[] {
  const map = world.state.map;
  const w = map.width;
  const h = map.height;
  const fx = focus % w;
  const fy = Math.floor(focus / w);
  const seen = new Set<number>();
  const out: number[] = [];
  for (let i = 0; i < map.content.length; i++) {
    if (map.content[i] !== Content.Footpath) continue;
    const x = i % w;
    const y = Math.floor(i / w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
      const n = ny * w + nx;
      if (map.content[n] === Content.Empty && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  const d = (i: number): number => Math.abs((i % w) - fx) + Math.abs(Math.floor(i / w) - fy);
  return out.sort((a, b) => d(a) - d(b) || a - b);
}

function emptyRow(id: string, error: string): BenchRow {
  return {
    id, error, frames: 0, frameP50: 0, frameP95: 0, frameP99: 0, framesOver33: 0, longestGapMs: 0, droppedHiddenGaps: 0, workP95: 0, incompleteFrames: 0, peakMB: 0, endMB: 0,
    turns: [], placements: 0, placementFailures: 0, placementLongestFrameMs: 0, capEvents: 0, cappedAtStart: false, densities: [], peakSplitMB: null, endSplitMB: null, stalls: [], fallbacksUsed: [],
    bands: { S1: NA('ms', BENCH_LIMITS.frameP95Ms), S2: NA('MB', BENCH_LIMITS.peakMB), S3: NA('ms', BENCH_LIMITS.turnMs), S4: NA('ms', BENCH_LIMITS.startMs), S5: NA('MB', 150) },
  };
}

/** Run the stage 1 benchmark over `scenes`; `clock` is in ms (`performance.now()` in the browser). */
export async function runRealBench(game: BenchGame, scenes: readonly BenchScene[], clock: () => number, opts: BenchOptions = {}): Promise<RealBenchResult> {
  const look = opts.look ?? null;
  const sets = opts.sets ?? null;
  const probe = opts.probe ?? perfProbe;
  const runStart = clock();
  const k = opts.timeScale ?? 1;
  const WARMUP_MS = 5000 * k;
  const PAN_MS = 10_000 * k;
  const ZOOM_HOLD_MS = 1000 * k;
  const TURN_EVERY_MS = 1000 * k;
  const PLACE_EVERY_MS = 100 * k;
  const IDLE_MS = 5000 * k;
  const ground = opts.ground ?? null;
  // As the renderer counts an incomplete frame: an object skipped, or the realistic ground not laid.
  const incomplete = (): number => (look?.incomplete() ?? 0) + (ground && !ground.complete ? 1 : 0);
  const splitMB = (): MemorySplit | null => {
    const sp = sets?.split?.();
    return sp ? { sets: r1(sp.sets / MB), tints: r1(sp.tints / MB), ground: r1(sp.ground / MB) } : null;
  };
  const stall = (at: string): BenchStall => ({
    at,
    incomplete: look?.incomplete() ?? 0,
    groundComplete: ground ? ground.complete : null,
    sets: sets?.snapshot?.() ?? null,
  });

  // ---- one frame listener for the whole run (Game has no unsubscribe; it goes quiet when the run ends)
  let live = true;
  let waiters: Array<() => void> = [];
  let lastT = -1;
  /** The scene's measurement, or null in the warm-up. */
  let rec: { gaps: number[]; hidden: number; incomplete: number; placing: boolean; placeMax: number } | null = null;
  let sampleMem = false;
  let scenePeakBytes = 0;
  let scenePeakSplit: MemorySplit | null = null;
  /** The page was hidden since the last frame: the next gap is not a frame. */
  let hiddenSinceFrame = false;
  const unwatch = (opts.watchHidden ?? defaultWatchHidden)(() => {
    hiddenSinceFrame = true;
  });
  game.onFrame(() => {
    if (!live) return;
    const now = clock();
    if (rec && lastT >= 0) {
      const dt = now - lastT;
      if (hiddenSinceFrame) rec.hidden++;
      else if (dt >= 0) {
        rec.gaps.push(dt);
        if (rec.placing && dt > rec.placeMax) rec.placeMax = dt;
      }
    }
    if (rec && incomplete() > 0) rec.incomplete++;
    hiddenSinceFrame = false;
    if (sampleMem && sets) {
      const now = sets.residentBytes();
      if (now > scenePeakBytes || scenePeakSplit === null) {
        scenePeakBytes = Math.max(scenePeakBytes, now);
        scenePeakSplit = splitMB();
      }
    }
    lastT = now;
    const w = waiters;
    waiters = [];
    for (const f of w) f();
  });
  const frame = (): Promise<void> => new Promise<void>((r) => waiters.push(r));
  const waitUntil = async (t: number): Promise<void> => {
    while (clock() < t) await frame();
  };

  const wasEnabled = probe.enabled;
  probe.enabled = true;
  // No autosave during the run, whatever screen the tester left open (restored in `finally`).
  const autosaveWas = game.settings.get('autosave');
  if (autosaveWas) game.settings.set('autosave', false);
  const fallbacksSeen = new Set<string>();
  const rows: BenchRow[] = [];
  let startMs: number | null = null;
  try {
    for (let si = 0; si < scenes.length; si++) {
      const scene = scenes[si] as BenchScene;
      opts.onScene?.(scene.id, si, scenes.length);
      const loaded = deserialize(scene.json);
      if (!loaded.ok) {
        rows.push(emptyRow(scene.id, loaded.error));
        continue;
      }
      // Cap changes from the load on belong to this scene.
      game.setWorld(loaded.world);
      // Every park from the same start: no cap or demotion left over from the park before.
      const cappedAtStart = sets?.densityCap?.() === 2;
      sets?.resetPressure?.();
      const capsAtStart = sets?.capEvents().length ?? 0;
      const map = loaded.world.state.map;
      const focus = scene.focus ? scene.focus.y * map.width + scene.focus.x : Math.floor(map.height / 2) * map.width + Math.floor(map.width / 2);
      const cam = game.camera;
      cam.rotation = 0;
      cam.zoom = 1;
      centerOnTile(cam, map, focus);
      game.setSpeed(1);
      const loadAt = clock();
      // The first frame of the new park: its `endFrame` frees the previous park's sets (not wanted any more), so
      // the scene's memory is counted from here.
      await frame();
      const peakAtStart = sets?.peakBytes() ?? 0;
      scenePeakBytes = sets?.residentBytes() ?? 0;
      scenePeakSplit = splitMB();
      sampleMem = true;
      const stalls: BenchStall[] = [];
      const densities: number[] = [];

      // S4: the first complete frame of the first park.
      if (startMs === null) {
        while (incomplete() > 0 && clock() - loadAt < FIRST_FRAME_TIMEOUT_MS) await frame();
        if (incomplete() > 0) stalls.push(stall('first frame'));
        const firstComplete = clock();
        startMs = opts.appReadyMs !== undefined ? opts.appReadyMs + (firstComplete - runStart) : firstComplete;
      }

      // Warm-up (not counted).
      await waitUntil(loadAt + WARMUP_MS);
      probe.reset();
      const r = { gaps: [] as number[], hidden: 0, incomplete: 0, placing: false, placeMax: 0 };
      rec = r;

      // Pan: right, down, left, up.
      const panStart = clock();
      let prev = panStart;
      while (clock() - panStart < PAN_MS) {
        await frame();
        const now = clock();
        const dt = Math.min(now - prev, 100) / 1000;
        prev = now;
        const leg = Math.min(3, Math.floor(((now - panStart) / PAN_MS) * 4));
        const d = PAN_PX_PER_S * dt;
        const [dx, dy] = [[d, 0], [0, d], [-d, 0], [0, -d]][leg] as [number, number];
        panCamera(cam, dx, dy, game.world.state.map);
      }

      // Zoom steps.
      for (const z of ZOOMS) {
        cam.zoom = z;
        await waitUntil(clock() + ZOOM_HOLD_MS);
        if (look?.currentDensity) densities.push(look.currentDensity());
      }

      // Turns, as the Turn button does them.
      const turns: TurnTime[] = [];
      for (const [ti, dir] of BENCH_TURNS.entries()) {
        const t0 = clock();
        rotateView(cam, game.world.state.map, dir);
        const target: Camera['rotation'] = cam.rotation;
        let timedOut = false;
        for (;;) {
          await frame();
          if (cam.rotation === target && incomplete() === 0) break;
          if (clock() - t0 >= TURN_TIMEOUT_MS) {
            timedOut = true;
            stalls.push(stall(`turn ${ti + 1}`));
            break;
          }
        }
        const ms = clock() - t0;
        // Then on to the first frame with every object at its chosen density (often the same frame).
        let sharpenMs: number | null = null;
        let sharpenTimedOut = false;
        if (look?.soft && !timedOut) {
          for (;;) {
            if (cam.rotation === target && incomplete() === 0 && look.soft() === 0) {
              sharpenMs = r1(clock() - t0);
              break;
            }
            if (clock() - t0 >= TURN_TIMEOUT_MS) {
              sharpenTimedOut = true;
              break;
            }
            await frame();
          }
        }
        const limitMs = dir === 1 ? BENCH_LIMITS.turnMs : BENCH_LIMITS.turnOtherMs;
        // Without the realistic look there is nothing to wait for: the time is recorded, the band is n/a.
        const verdict: BandResult = look === null ? 'n/a' : ms <= limitMs && !timedOut ? 'pass' : 'fail';
        turns.push({ dir, ms: r1(ms), limitMs, band: verdict, timedOut, sharpenMs, sharpenTimedOut });
        await waitUntil(t0 + TURN_EVERY_MS);
      }
      if (look?.currentDensity) densities.push(look.currentDensity());

      // Placements beside a path.
      const spots = placementSpots(game.world, focus);
      const kinds = benchScenery(game.world);
      let placed = 0;
      let failures = 0;
      let next = 0;
      r.placing = true;
      const placeStart = clock();
      for (let n = 0; n < PLACEMENTS; n++) {
        await waitUntil(placeStart + n * PLACE_EVERY_MS);
        while (next < spots.length) {
          const tile = spots[next++] as number;
          const w = game.world.state.map.width;
          const res = game.dispatch({ type: 'placeScenery', defId: kinds[placed % kinds.length] as string, x: tile % w, y: Math.floor(tile / w), rotation: 0, edge: -1 });
          if (res.ok) {
            placed++;
            break;
          }
          failures++;
        }
      }
      await waitUntil(placeStart + PLACEMENTS * PLACE_EVERY_MS);
      r.placing = false;

      // Idle.
      await waitUntil(clock() + IDLE_MS);
      rec = null;
      sampleMem = false;

      const snap = probe.snapshot();
      const endBytes = sets?.residentBytes() ?? 0;
      const peakAtEnd = sets?.peakBytes() ?? 0;
      // The set manager's peak also sees memory between frames; it counts when it rose during this scene.
      const peakBytes = Math.max(scenePeakBytes, endBytes, peakAtEnd > peakAtStart ? peakAtEnd : 0);
      const slowest = turns.reduce((m, t) => Math.max(m, t.ms), 0);
      const first = rows.every((x) => x.error !== undefined);
      const frameP95 = percentile(r.gaps, 0.95);
      const fresh = (look?.fallbacksUsed() ?? []).filter((id) => !fallbacksSeen.has(id));
      for (const id of fresh) fallbacksSeen.add(id);
      rows.push({
        id: scene.id,
        frames: r.gaps.length,
        frameP50: r1(percentile(r.gaps, 0.5)),
        frameP95: r1(frameP95),
        frameP99: r1(percentile(r.gaps, 0.99)),
        framesOver33: r.gaps.filter((g) => g > SLOW_FRAME_MS).length,
        longestGapMs: r1(r.gaps.reduce((m, g) => Math.max(m, g), 0)),
        droppedHiddenGaps: r.hidden,
        workP95: r1(snap.workP95),
        incompleteFrames: r.incomplete,
        peakMB: r1(peakBytes / MB),
        endMB: r1(endBytes / MB),
        turns,
        placements: placed,
        placementFailures: failures,
        placementLongestFrameMs: r1(r.placeMax),
        capEvents: (sets?.capEvents().length ?? 0) - capsAtStart,
        cappedAtStart,
        densities,
        peakSplitMB: scenePeakSplit,
        endSplitMB: splitMB(),
        stalls,
        fallbacksUsed: fresh,
        // A missing instrument never reads as a pass: no set manager → S2 n/a; no realistic look → S3 and S4 n/a.
        bands: {
          S1: band(r.gaps.length > 0 ? frameP95 : null, BENCH_LIMITS.frameP95Ms, 'ms'),
          S2: sets ? band(peakBytes / MB, BENCH_LIMITS.peakMB, 'MB') : NA('MB', BENCH_LIMITS.peakMB),
          S3: {
            value: r1(slowest),
            limit: BENCH_LIMITS.turnMs,
            unit: 'ms',
            band: look === null ? 'n/a' : turns.every((t) => t.band === 'pass') ? 'pass' : 'fail',
          },
          S4: first && look !== null ? band(startMs, BENCH_LIMITS.startMs, 'ms') : { ...NA('ms', BENCH_LIMITS.startMs), value: first && startMs !== null ? r1(startMs) : null },
          S5: NA('MB', 150),
        },
      });
    }
  } finally {
    live = false;
    rec = null;
    unwatch();
    probe.enabled = wasEnabled;
    game.setSpeed(0);
    if (autosaveWas) game.settings.set('autosave', true);
  }

  const failed = rows.some((x) => Object.values(x.bands).some((b) => b.band === 'fail'));
  return {
    format: 'tc-real-bench/1',
    verdict: failed ? 'fail' : 'pass',
    look: look === null ? 'classic' : 'real',
    startMs: startMs === null ? null : r1(startMs),
    artDownload: opts.artDownload ? { ms: r1(opts.artDownload.ms), MB: r1(opts.artDownload.bytes / MB), files: opts.artDownload.files } : null,
    bootCompleteMs: opts.bootCompleteMs === undefined ? null : r1(opts.bootCompleteMs),
    device: (opts.device ?? defaultDevice)(),
    scenes: rows,
    fallbacksUsed: look?.fallbacksUsed() ?? [],
    capEvents: rows.reduce((n, x) => n + x.capEvents, 0),
  };
}

/** `sets / tints / ground MB`, or n/a. */
export function splitText(m: MemorySplit | null): string {
  return m ? `sets ${m.sets} / tints ${m.tints} / ground ${m.ground} MB` : 'n/a';
}

/** The copied results: a few summary lines, then the result as JSON (as the phone test). */
export function resultsText(r: RealBenchResult): string {
  const lines = [`Stage 1 bench (${r.look === 'real' ? 'realistic' : "today's"} look): ${r.verdict}`, `look: ${r.look === 'real' ? 'realistic' : "today's"}`];
  lines.push(`start (S4) ${r.startMs ?? 'n/a'} ms; DPR ${r.device.devicePixelRatio}; canvas ${r.device.canvasPx.join('x')}; ${r.device.userAgent}`);
  const dl = r.artDownload;
  lines.push(`art download ${dl ? `${dl.MB} MB, ${dl.files} files in ${dl.ms} ms` : 'n/a'} (before the run, not in S4); boot to first complete frame ${r.bootCompleteMs ?? 'n/a'} ms (network included)`);
  for (const s of r.scenes) {
    if (s.error !== undefined) {
      lines.push(`${s.id}: did not load (${s.error})`);
      continue;
    }
    const b = s.bands;
    lines.push(
      `${s.id}: frame p50/p95/p99 ${s.frameP50}/${s.frameP95}/${s.frameP99} ms, >33 ms ${s.framesOver33} of ${s.frames}, longest gap ${s.longestGapMs} ms, hidden gaps ${s.droppedHiddenGaps}; work p95 ${s.workP95} ms; ` +
        `peak ${s.peakMB} MB, end ${s.endMB} MB; turns ${s.turns.map((t) => `${t.dir === 1 ? '+' : '-'}${t.ms}`).join('/')} ms; ` +
        `sharp after ${s.turns.map((t) => `${t.dir === 1 ? '+' : '-'}${t.sharpenMs ?? 'n/a'}`).join('/')} ms; ` +
        `placements ${s.placements} (longest frame ${s.placementLongestFrameMs} ms); incomplete ${s.incompleteFrames}; caps ${s.capEvents} (capped at start: ${s.cappedAtStart ? 'yes' : 'no'}); ` +
        `density ${s.densities.map((d) => `d${d}`).join('/') || 'n/a'}; held at peak ${splitText(s.peakSplitMB)}, end ${splitText(s.endSplitMB)}; timed-out waits ${s.stalls.map((x) => x.at).join(', ') || 'none'}; ` +
        `S1 ${b.S1.band} S2 ${b.S2.band} S3 ${b.S3.band} S4 ${b.S4.band} S5 ${b.S5.band}`,
    );
  }
  lines.push(`fallbacks: ${r.fallbacksUsed.join(', ') || 'none'}`, '');
  return lines.join('\n') + JSON.stringify(r, null, 2);
}
