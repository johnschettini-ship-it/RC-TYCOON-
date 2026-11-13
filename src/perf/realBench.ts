/**
 * Stage 1 benchmark runner (spec §6, the in-game benchmark runner). Only the VITE_ART=real build loads it, and only
 * with `?bench=1` (`main.ts` → `./realBenchCard.ts`), so the website build holds none of it.
 *
 * Per scene: load the save (from the string given, never from storage), centre the camera on the scene's focus at
 * zoom 1, run at 1×, then
 *   5 s warm-up (not counted) → 10 s pan → zoom 2, 1, 0.5, 2 (1 s each) → 4 turns 1 s apart → 20 scenery
 *   placements beside a path, 100 ms apart, through `game.dispatch` → 5 s idle.
 * Frame times are the gaps between drawn frames (`Game.onFrame`, after the renderer drew), so a frame that took long
 * to draw shows. A turn's time runs from the Turn action (`rotateView`, as the Turn button calls it) to the first
 * frame drawn at the new rotation with `look.incomplete() === 0`.
 *
 * Kill-rule bands (spec §6): S1 frame p95 33 ms (the rule is for `build2`; shown for every park), S2 peak decoded
 * memory 128 MB (the decode budget F2), S3 a turn 250 ms the Turn button's way (clockwise) and 500 ms the other way,
 * S4 app start to the first complete park frame 4 s (first row only), S5 app size: not measurable in the game
 * (the bake report gives it), always `n/a`.
 *
 * The bench never saves: the parks start at least 1,700 ticks before a month's end and a scene runs about 30 s
 * (≤ 600 ticks at 1×), so the month-start autosave cannot fire; and the title screen stays open underneath.
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

export interface BenchOptions {
  /** The realistic look (absent with today's look: every frame counts as complete). */
  look?: { incomplete(): number; fallbacksUsed(): string[] } | null;
  sets?: { capEvents(): readonly unknown[]; peakBytes(): number; residentBytes(): number } | null;
  probe?: Pick<PerfProbe, 'enabled' | 'reset' | 'snapshot'>;
  /**
   * Navigation start to the first complete frame of the app's own start, ms. With it, S4 = this + the first park's
   * load to its first complete frame, so the wait before Run is tapped is left out. Without it, S4 is the clock at
   * that first complete frame (`performance.now()` counts from navigation start).
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
  /** Ids drawn with today's art so far (the look's list is for the whole run). */
  fallbacksUsed: string[];
  bands: { S1: Band; S2: Band; S3: Band; S4: Band; S5: Band };
}

export interface RealBenchResult {
  format: 'tc-real-bench/1';
  verdict: 'pass' | 'fail';
  /** S4: navigation start to the first complete park frame, ms (null when no scene loaded). */
  startMs: number | null;
  device: BenchDevice;
  scenes: BenchRow[];
  fallbacksUsed: string[];
  capEvents: number;
}

/** Spec §6 kill-rule limits. */
export const BENCH_LIMITS = { frameP95Ms: 33, peakMB: 128, turnMs: 250, turnOtherMs: 500, startMs: 4000 } as const;
/** The four turns: the Turn button's way twice, then back the other way twice (the view ends where it started). */
export const BENCH_TURNS: readonly (1 | -1)[] = [1, 1, -1, -1];
/** Scenery placed by the bench, in turn. */
export const BENCH_SCENERY: readonly string[] = ['oak_round', 'pine_tall', 'shrub_flowering', 'bed_tulip', 'boulder'];

/** Pan speed in screen px per second; the pan goes right, down, left, up, a quarter of the time each. */
const PAN_PX_PER_S = 240;
const ZOOMS = [2, 1, 0.5, 2] as const;
const TURN_TIMEOUT_MS = 5000;
const PLACEMENTS = 20;
/** A longer gap is a hidden tab, not a frame (as the perf probe). */
const MAX_GAP_MS = 1000;
const SLOW_FRAME_MS = 33;
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
    id, error, frames: 0, frameP50: 0, frameP95: 0, frameP99: 0, framesOver33: 0, workP95: 0, incompleteFrames: 0, peakMB: 0, endMB: 0,
    turns: [], placements: 0, placementFailures: 0, placementLongestFrameMs: 0, capEvents: 0, fallbacksUsed: [],
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
  const incomplete = (): number => look?.incomplete() ?? 0;

  // ---- one frame listener for the whole run (Game has no unsubscribe; it goes quiet when the run ends)
  let live = true;
  let waiters: Array<() => void> = [];
  let lastT = -1;
  /** The scene's measurement, or null in the warm-up. */
  let rec: { gaps: number[]; incomplete: number; peak: number; placing: boolean; placeMax: number } | null = null;
  let sampleMem = false;
  let scenePeakBytes = 0;
  game.onFrame(() => {
    if (!live) return;
    const now = clock();
    if (rec) {
      if (lastT >= 0) {
        const dt = now - lastT;
        if (dt >= 0 && dt <= MAX_GAP_MS) {
          rec.gaps.push(dt);
          if (rec.placing && dt > rec.placeMax) rec.placeMax = dt;
        }
      }
      if (incomplete() > 0) rec.incomplete++;
    }
    if (sampleMem && sets) scenePeakBytes = Math.max(scenePeakBytes, sets.residentBytes());
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
      const capsAtStart = sets?.capEvents().length ?? 0;
      const peakAtStart = sets?.peakBytes() ?? 0;
      scenePeakBytes = sets?.residentBytes() ?? 0;
      sampleMem = true;
      game.setWorld(loaded.world);
      const map = loaded.world.state.map;
      const focus = scene.focus ? scene.focus.y * map.width + scene.focus.x : Math.floor(map.height / 2) * map.width + Math.floor(map.width / 2);
      const cam = game.camera;
      cam.rotation = 0;
      cam.zoom = 1;
      centerOnTile(cam, map, focus);
      game.setSpeed(1);
      const loadAt = clock();

      // S4: the first complete frame of the first park.
      if (startMs === null) {
        do await frame();
        while (incomplete() > 0 && clock() - loadAt < TURN_TIMEOUT_MS * 2);
        const firstComplete = clock();
        startMs = opts.appReadyMs !== undefined ? opts.appReadyMs + (firstComplete - runStart) : firstComplete;
      }

      // Warm-up (not counted).
      await waitUntil(loadAt + WARMUP_MS);
      probe.reset();
      const r = { gaps: [] as number[], incomplete: 0, peak: 0, placing: false, placeMax: 0 };
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
      }

      // Turns, as the Turn button does them.
      const turns: TurnTime[] = [];
      for (const dir of BENCH_TURNS) {
        const t0 = clock();
        rotateView(cam, game.world.state.map, dir);
        const target: Camera['rotation'] = cam.rotation;
        let timedOut = false;
        for (;;) {
          await frame();
          if (cam.rotation === target && incomplete() === 0) break;
          if (clock() - t0 >= TURN_TIMEOUT_MS) {
            timedOut = true;
            break;
          }
        }
        const ms = clock() - t0;
        const limitMs = dir === 1 ? BENCH_LIMITS.turnMs : BENCH_LIMITS.turnOtherMs;
        turns.push({ dir, ms: r1(ms), limitMs, band: ms <= limitMs && !timedOut ? 'pass' : 'fail', timedOut });
        await waitUntil(t0 + TURN_EVERY_MS);
      }

      // Placements beside a path.
      const spots = placementSpots(game.world, focus);
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
          const res = game.dispatch({ type: 'placeScenery', defId: BENCH_SCENERY[placed % BENCH_SCENERY.length] as string, x: tile % w, y: Math.floor(tile / w), rotation: 0, edge: -1 });
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
      rows.push({
        id: scene.id,
        frames: r.gaps.length,
        frameP50: r1(percentile(r.gaps, 0.5)),
        frameP95: r1(frameP95),
        frameP99: r1(percentile(r.gaps, 0.99)),
        framesOver33: r.gaps.filter((g) => g > SLOW_FRAME_MS).length,
        workP95: r1(snap.workP95),
        incompleteFrames: r.incomplete,
        peakMB: r1(peakBytes / MB),
        endMB: r1(endBytes / MB),
        turns,
        placements: placed,
        placementFailures: failures,
        placementLongestFrameMs: r1(r.placeMax),
        capEvents: (sets?.capEvents().length ?? 0) - capsAtStart,
        fallbacksUsed: look?.fallbacksUsed() ?? [],
        bands: {
          S1: band(r.gaps.length > 0 ? frameP95 : null, BENCH_LIMITS.frameP95Ms, 'ms'),
          S2: band(peakBytes / MB, BENCH_LIMITS.peakMB, 'MB'),
          S3: { value: r1(slowest), limit: BENCH_LIMITS.turnMs, unit: 'ms', band: turns.every((t) => t.band === 'pass') ? 'pass' : 'fail' },
          S4: first ? band(startMs, BENCH_LIMITS.startMs, 'ms') : NA('ms', BENCH_LIMITS.startMs),
          S5: NA('MB', 150),
        },
      });
    }
  } finally {
    live = false;
    rec = null;
    probe.enabled = wasEnabled;
    game.setSpeed(0);
  }

  const failed = rows.some((x) => Object.values(x.bands).some((b) => b.band === 'fail'));
  return {
    format: 'tc-real-bench/1',
    verdict: failed ? 'fail' : 'pass',
    startMs: startMs === null ? null : r1(startMs),
    device: (opts.device ?? defaultDevice)(),
    scenes: rows,
    fallbacksUsed: look?.fallbacksUsed() ?? [],
    capEvents: rows.reduce((n, x) => n + x.capEvents, 0),
  };
}

/** The copied results: a few summary lines, then the result as JSON (as the phone test). */
export function resultsText(r: RealBenchResult): string {
  const lines = [`Realistic look stage 1 bench: ${r.verdict}`];
  lines.push(`start (S4) ${r.startMs ?? 'n/a'} ms; DPR ${r.device.devicePixelRatio}; canvas ${r.device.canvasPx.join('x')}; ${r.device.userAgent}`);
  for (const s of r.scenes) {
    if (s.error !== undefined) {
      lines.push(`${s.id}: did not load (${s.error})`);
      continue;
    }
    const b = s.bands;
    lines.push(
      `${s.id}: frame p50/p95/p99 ${s.frameP50}/${s.frameP95}/${s.frameP99} ms, >33 ms ${s.framesOver33} of ${s.frames}; work p95 ${s.workP95} ms; ` +
        `peak ${s.peakMB} MB, end ${s.endMB} MB; turns ${s.turns.map((t) => `${t.dir === 1 ? '+' : '-'}${t.ms}`).join('/')} ms; ` +
        `placements ${s.placements} (longest frame ${s.placementLongestFrameMs} ms); incomplete ${s.incompleteFrames}; caps ${s.capEvents}; ` +
        `S1 ${b.S1.band} S2 ${b.S2.band} S3 ${b.S3.band} S4 ${b.S4.band} S5 ${b.S5.band}`,
    );
  }
  lines.push(`fallbacks: ${r.fallbacksUsed.join(', ') || 'none'}`, '');
  return lines.join('\n') + JSON.stringify(r, null, 2);
}
