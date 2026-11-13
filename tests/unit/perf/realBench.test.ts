/**
 * Stage 1 bench runner (`?art=real&bench=1`): the sequence and the result shape, with a fake game whose frames a
 * fake clock drives (16 ms a frame; `build2` draws 40 ms frames; `coaster` holds 200 MB and turns slowly).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAME_VERSION, serialize } from '../../../src/save';
import { createWorld } from '../../../src/sim/world';
import { executeCommand, type Command, type CommandResult } from '../../../src/sim/commands';
import type { World } from '../../../src/sim/types';
import type { Camera } from '../../../src/render/types';
import type { Speed } from '../../../src/loop';
import {
  BENCH_LIMITS,
  BENCH_SCENERY,
  BENCH_TURNS,
  resultsText,
  runRealBench,
  type BenchGame,
  type RealBenchResult,
} from '../../../src/perf/realBench';
import { createPerfProbe } from '../../../src/perf/stats';

const MB = 1024 * 1024;
const IDS = ['build1', 'build2', 'phone', 'coaster'];

/** A small park with a footpath across it, as a save. */
function sceneJson(name: string): string {
  const world = createWorld({ seed: 7, parkName: name, mapSize: 64 });
  const r = executeCommand(world, { type: 'buildPathLine', x0: 20, y0: 30, x1: 44, y1: 30, kind: 'footpath' }, { setup: true });
  if (!r.ok) throw new Error(String(r.reason));
  return serialize(world, GAME_VERSION, '2026-11-13T00:00:00.000Z');
}

interface Fake extends BenchGame {
  now: number;
  zooms: number[];
  commands: Command[];
  speeds: Speed[];
  sceneIndex: number;
  pump(until: () => boolean): Promise<void>;
  look: { incomplete(): number; fallbacksUsed(): string[] };
  sets: { capEvents(): unknown[]; peakBytes(): number; residentBytes(): number };
}

function fakeGame(): Fake {
  const listeners: Array<() => void> = [];
  let lastRot = 0;
  let skip = 0;
  let resident = 10 * MB;
  let peak = resident;
  const caps: unknown[] = [];
  const g: Fake = {
    now: 0,
    zooms: [],
    commands: [],
    speeds: [],
    sceneIndex: -1,
    camera: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 } as Camera,
    world: createWorld({ seed: 1, parkName: 'Boot' }),
    setWorld(w: World) {
      g.world = w;
      g.sceneIndex++;
      // coaster: 200 MB resident (S2 fail) and one cap event.
      resident = g.sceneIndex === 3 ? 200 * MB : 10 * MB;
      peak = Math.max(peak, resident);
      if (g.sceneIndex === 3) caps.push({ frame: 1, capped: true, pressureBytes: 200 * MB });
      skip = 3; // the first frames of a park are incomplete
    },
    setSpeed(s: Speed) {
      g.speeds.push(s);
    },
    dispatch(cmd: Command): CommandResult {
      g.commands.push(cmd);
      return { ok: true, cost: 0, events: [] } as unknown as CommandResult;
    },
    onFrame(cb) {
      listeners.push(cb);
    },
    look: {
      incomplete: () => skip,
      fallbacksUsed: () => (g.sceneIndex >= 1 ? ['carousel', 'ground:sand'] : ['carousel']),
    },
    sets: { capEvents: () => caps.slice(), peakBytes: () => peak, residentBytes: () => resident },
    async pump(until) {
      while (!until()) {
        g.now += g.sceneIndex === 1 ? 40 : 16;
        // The "renderer": a turn makes the next frames incomplete while the new rotation's sets decode.
        if (g.camera.rotation !== lastRot) {
          lastRot = g.camera.rotation;
          skip = g.sceneIndex === 3 ? 20 : 5;
        } else if (skip > 0) skip--;
        if (g.zooms[g.zooms.length - 1] !== g.camera.zoom) g.zooms.push(g.camera.zoom);
        for (const l of listeners) l();
        await new Promise<void>((r) => setImmediate(r));
      }
    },
  };
  return g;
}

async function run(opts: { appReadyMs?: number } = {}): Promise<{ g: Fake; result: RealBenchResult }> {
  const g = fakeGame();
  const scenes = IDS.map((id) => ({ id, json: sceneJson(id) }));
  const probe = createPerfProbe(() => g.now, () => 0, () => ({}));
  let done = false;
  const p = runRealBench(g, scenes, () => g.now, {
    look: g.look,
    sets: g.sets,
    probe,
    appReadyMs: opts.appReadyMs,
    device: () => ({ devicePixelRatio: 2.75, canvasPx: [1080, 2400], viewportCss: [393, 873], userAgent: 'fake' }),
  }).finally(() => {
    done = true;
  });
  await g.pump(() => done);
  return { g, result: await p };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runRealBench (stage 1 bench)', () => {
  it('one row per scene, in order, with 4 turns each (Turn button way twice, then the other way twice)', { timeout: 60_000 }, async () => {
    const { result } = await run();
    expect(result.scenes.map((s) => s.id)).toEqual(IDS);
    for (const s of result.scenes) {
      expect(s.turns).toHaveLength(4);
      expect(s.turns.map((t) => t.dir)).toEqual([...BENCH_TURNS]);
      expect(s.turns.map((t) => t.limitMs)).toEqual([250, 250, 500, 500]);
    }
    expect(BENCH_TURNS).toEqual([1, 1, -1, -1]);
  });

  it('turn time: from the Turn action to the first frame at the new rotation with nothing incomplete', { timeout: 60_000 }, async () => {
    const { result } = await run();
    // 5 incomplete frames after the turn, the 6th is complete: 6 × 16 ms.
    expect(result.scenes[0]?.turns.map((t) => t.ms)).toEqual([96, 96, 96, 96]);
    expect(result.scenes[0]?.bands.S3.band).toBe('pass');
    // coaster: 21 frames × 16 ms = 336 ms: over 250 (Turn button way), under 500 (the other way).
    const slow = result.scenes[3]?.turns ?? [];
    expect(slow.map((t) => t.ms)).toEqual([336, 336, 336, 336]);
    expect(slow.map((t) => t.band)).toEqual(['fail', 'fail', 'pass', 'pass']);
    expect(result.scenes[3]?.bands.S3).toMatchObject({ band: 'fail', value: 336 });
  });

  it('bands from the spec limits: S1 33 ms, S2 128 MB, S3 250/500 ms, S4 4 s, S5 not measured here', { timeout: 60_000 }, async () => {
    expect(BENCH_LIMITS).toEqual({ frameP95Ms: 33, peakMB: 128, turnMs: 250, turnOtherMs: 500, startMs: 4000 });
    const { result } = await run({ appReadyMs: 1000 });
    const [b1, b2, , co] = result.scenes;
    expect(b1?.frameP95).toBe(16);
    expect(b1?.framesOver33).toBe(0);
    expect(b1?.bands.S1).toMatchObject({ band: 'pass', value: 16, limit: 33 });
    expect(b2?.frameP95).toBe(40);
    expect(b2?.framesOver33).toBe(b2?.frames);
    expect(b2?.bands.S1).toMatchObject({ band: 'fail', value: 40 });
    expect(b1?.bands.S2).toMatchObject({ band: 'pass', value: 10, limit: 128 });
    expect(co?.peakMB).toBe(200);
    expect(co?.endMB).toBe(200);
    expect(co?.bands.S2).toMatchObject({ band: 'fail', value: 200 });
    for (const s of result.scenes) expect(s.bands.S5.band).toBe('n/a');
    // S4: the app's own start (1 s) plus the first park's load to its first complete frame (the 3rd frame).
    expect(result.startMs).toBe(1000 + 3 * 16);
    expect(b1?.bands.S4).toMatchObject({ band: 'pass', value: 1048, limit: 4000 });
    expect(b2?.bands.S4.band).toBe('n/a');
    expect(result.verdict).toBe('fail');
  });

  it('records frames, work, incomplete frames, cap events and fallbacks per scene, and the device', { timeout: 60_000 }, async () => {
    const { result } = await run();
    const [b1, , , co] = result.scenes;
    // Measured window: 10 s pan + 4 s zoom + 4 turns 1 s apart + 20 placements 100 ms apart + 5 s idle ≈ 25 s.
    expect(b1?.frames).toBeGreaterThan(Math.floor(24_000 / 16));
    expect(b1?.frames).toBeLessThan(Math.ceil(27_000 / 16));
    expect(b1?.frameP50).toBe(16);
    expect(b1?.frameP99).toBe(16);
    expect(b1?.incompleteFrames).toBe(4 * 5);
    expect(typeof b1?.workP95).toBe('number');
    expect(b1?.capEvents).toBe(0);
    expect(co?.capEvents).toBe(1);
    expect(b1?.fallbacksUsed).toEqual(['carousel']);
    expect(co?.fallbacksUsed).toEqual(['carousel', 'ground:sand']);
    expect(result.fallbacksUsed).toEqual(['carousel', 'ground:sand']);
    expect(result.device).toEqual({ devicePixelRatio: 2.75, canvasPx: [1080, 2400], viewportCss: [393, 873], userAgent: 'fake' });
    expect(b1?.placements).toBe(20);
    expect(b1?.placementLongestFrameMs).toBe(16);
  });

  it('runs the sequence: speed 1, pan, zoom 2 → 1 → 0.5 → 2, 20 scenery placements beside a path, then pauses', { timeout: 60_000 }, async () => {
    const { g } = await run();
    expect(g.speeds[0]).toBe(1);
    expect(g.speeds[g.speeds.length - 1]).toBe(0);
    // Each scene starts at zoom 1 and runs the zoom steps.
    expect(g.zooms.join(' ')).toContain('1 2 1 0.5 2 1 2 1 0.5 2');
    const placed = g.commands.filter((c) => c.type === 'placeScenery');
    expect(placed).toHaveLength(80);
    const map = g.world.state.map;
    for (const c of placed.slice(-20)) {
      if (c.type !== 'placeScenery') continue;
      expect(BENCH_SCENERY).toContain(c.defId);
      // Beside a footpath tile (4-neighbour).
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => map.content[(c.y + (dy as number)) * map.width + c.x + (dx as number)] === 1);
      expect(near).toBe(true);
    }
  });

  it('never touches localStorage', { timeout: 60_000 }, async () => {
    const spy = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(), key: vi.fn(), length: 0 };
    vi.stubGlobal('localStorage', spy);
    await run();
    expect(spy.setItem).not.toHaveBeenCalled();
    expect(spy.getItem).not.toHaveBeenCalled();
    expect(spy.removeItem).not.toHaveBeenCalled();
  });

  it('a save that does not load gives an error row, and the other scenes still run', { timeout: 60_000 }, async () => {
    const g = fakeGame();
    let done = false;
    const p = runRealBench(g, [{ id: 'bad', json: '{' }, { id: 'phone', json: sceneJson('p') }], () => g.now, { look: g.look, sets: g.sets }).finally(() => {
      done = true;
    });
    await g.pump(() => done);
    const r = await p;
    expect(r.scenes.map((s) => s.id)).toEqual(['bad', 'phone']);
    expect(r.scenes[0]?.error).toBeTruthy();
    expect(r.scenes[0]?.bands.S1.band).toBe('n/a');
    expect(r.scenes[1]?.error).toBeUndefined();
    expect(r.scenes[1]?.turns).toHaveLength(4);
  });

  it('resultsText: summary lines then the result as JSON', { timeout: 60_000 }, async () => {
    const { result } = await run({ appReadyMs: 500 });
    const text = resultsText(result);
    const lines = text.split('\n');
    expect(lines[0]).toContain('fail');
    expect(text).toContain('build2');
    expect(text).toContain('S1 fail');
    const json = text.slice(text.indexOf('{'));
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(result)));
  });
});

describe('the bench never reaches an autosave', () => {
  it('every perf save starts more than 30 s at 1× (600 ticks) before a month start', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { PERF_SCENES } = await import('../../perf/sceneInfo');
    const { TICKS_PER_MONTH, TICKS_PER_SECOND } = await import('../../../src/data/tuning/core');
    for (const s of PERF_SCENES) {
      const tick = (JSON.parse(readFileSync(join(__dirname, '../../perf', s.file), 'utf8')) as { state: { tick: number } }).state.tick;
      expect(TICKS_PER_MONTH - (tick % TICKS_PER_MONTH), s.id).toBeGreaterThan(30 * TICKS_PER_SECOND);
    }
  });
});

describe('timeScale (the e2e quick run)', () => {
  it('shortens every step but keeps turn times and limits', { timeout: 60_000 }, async () => {
    const g = fakeGame();
    let done = false;
    const p = runRealBench(g, [{ id: 'phone', json: sceneJson('p') }], () => g.now, { look: g.look, sets: g.sets, timeScale: 0.1 }).finally(() => {
      done = true;
    });
    await g.pump(() => done);
    const r = await p;
    const row = r.scenes[0];
    expect(row?.frames).toBeLessThan(Math.ceil(3000 / 16));
    expect(row?.turns.map((t) => [t.ms, t.limitMs])).toEqual([[96, 250], [96, 250], [96, 500], [96, 500]]);
    expect(row?.placements).toBe(20);
  });
});

describe('ui.realBench strings', () => {
  it('only the VITE_ART=real build carries them (the website string table is unchanged)', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_ART', '');
    const web = (await import('../../../src/data/strings/en')).en;
    expect(Object.keys(web).filter((k) => k.startsWith('ui.realBench.'))).toEqual([]);
    vi.resetModules();
    vi.stubEnv('VITE_ART', 'real');
    const real = (await import('../../../src/data/strings/en')).en;
    const { realBenchStrings } = await import('../../../src/data/strings/realBench');
    for (const [k, v] of Object.entries(realBenchStrings)) {
      expect(real[k]).toBe(v);
      expect(v.endsWith('.'), k).toBe(false);
    }
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
