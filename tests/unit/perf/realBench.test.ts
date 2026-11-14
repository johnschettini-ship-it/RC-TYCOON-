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
  benchScenery,
  resultsText,
  runRealBench,
  type BenchGame,
  type RealBenchResult,
} from '../../../src/perf/realBench';
import { createPerfProbe } from '../../../src/perf/stats';
import { realItem } from '../../../src/render/real/fallbacks';

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
  autosave: boolean;
  /** Autosave value seen at each dispatch (during the run). */
  autosaveAtDispatch: boolean[];
  /** Extra ms added to the next frame's gap (a stall), checked every frame. */
  extra: ((g: Fake) => number) | null;
  throwOnDispatch: boolean;
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
    autosave: true,
    autosaveAtDispatch: [],
    extra: null,
    throwOnDispatch: false,
    settings: {
      get: () => g.autosave,
      set: (_k, v) => {
        g.autosave = v;
        return true;
      },
    },
    camera: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 } as Camera,
    world: createWorld({ seed: 1, parkName: 'Boot' }),
    setWorld(w: World) {
      g.world = w;
      g.sceneIndex++;
      // coaster: 200 MB resident (S2 fail) and one cap event.
      resident = g.sceneIndex === 3 ? 200 * MB : 10 * MB;
      peak = Math.max(peak, resident);
      skip = 3; // the first frames of a park are incomplete
    },
    setSpeed(s: Speed) {
      g.speeds.push(s);
    },
    dispatch(cmd: Command): CommandResult {
      g.commands.push(cmd);
      g.autosaveAtDispatch.push(g.autosave);
      if (g.throwOnDispatch) throw new Error('boom');
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
        g.now += (g.sceneIndex === 1 ? 40 : 16) + (g.extra?.(g) ?? 0);
        // The "renderer": a turn makes the next frames incomplete while the new rotation's sets decode.
        // coaster: the set manager caps on the park's first frame (its endFrame).
        if (g.sceneIndex === 3 && caps.length === 0) caps.push({ frame: 1, capped: true, pressureBytes: 200 * MB });
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
    expect(BENCH_LIMITS).toEqual({ frameP95Ms: 33, peakMB: 128, turnMs: 250, turnOtherMs: 500, startMs: 4000, longestGapMs: 500 });
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
    // Per scene: the ids new since the scenes before it.
    expect(result.scenes.map((s) => s.fallbacksUsed)).toEqual([['carousel'], ['ground:sand'], [], []]);
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
  it('every perf save starts more than the longest scene (at 1×) before a month start', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { PERF_SCENES, SCALE_SCENE } = await import('../../perf/sceneInfo');
    const { TICKS_PER_MONTH, TICKS_PER_SECOND } = await import('../../../src/data/tuning/core');
    const { BENCH_MAX_SCENE_MS } = await import('../../../src/perf/realBench');
    // S4 wait 10 s + warm-up 5 + pan 10 + zoom 4 + 4 timed-out turns 20 + placements 2 + idle 5.
    expect(BENCH_MAX_SCENE_MS).toBe(56_000);
    for (const s of [...PERF_SCENES, SCALE_SCENE]) {
      const tick = (JSON.parse(readFileSync(join(__dirname, '../../perf', s.file), 'utf8')) as { state: { tick: number } }).state.tick;
      expect(TICKS_PER_MONTH - (tick % TICKS_PER_MONTH), s.id).toBeGreaterThan((BENCH_MAX_SCENE_MS / 1000) * TICKS_PER_SECOND);
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

/** One quick scene (time scale 0.1) with the fake's instruments, plus extra options. */
async function quick(setup: (g: Fake) => void, extra: Partial<Parameters<typeof runRealBench>[3]> = {}): Promise<{ g: Fake; result: RealBenchResult }> {
  const g = fakeGame();
  setup(g);
  let done = false;
  const p = runRealBench(g, [{ id: 'phone', json: sceneJson('p') }], () => g.now, { look: g.look, sets: g.sets, timeScale: 0.1, ...extra }).finally(() => {
    done = true;
  });
  await g.pump(() => done);
  return { g, result: await p };
}

describe('frame gaps (review fix 1)', () => {
  it('a 1.5 s stall while visible counts in p99, frames over 33 ms and the longest gap', { timeout: 60_000 }, async () => {
    let stalls = 0;
    const { result } = await quick((g) => {
      // Two 1.5 s stalls during the pan (after the 0.5 s warm-up), so p99 of ~150 gaps lands on one.
      g.extra = (x) => (x.now > 700 && stalls < 2 ? (stalls++, 1500 - 16) : 0);
    });
    const row = result.scenes[0];
    expect(row?.longestGapMs).toBe(1500);
    expect(row?.frameP99).toBe(1500);
    expect(row?.framesOver33).toBe(2);
    expect(row?.droppedHiddenGaps).toBe(0);
  });

  it('a gap across a hidden page is left out and counted as a hidden gap', { timeout: 60_000 }, async () => {
    let hide: (() => void) | null = null;
    let done = false;
    const { result } = await quick(
      (g) => {
        g.extra = (x) => {
          if (x.now > 700 && !done) {
            done = true;
            hide?.();
            return 3000;
          }
          return 0;
        };
      },
      {
        watchHidden: (onHide) => {
          hide = onHide;
          return () => {
            hide = null;
          };
        },
      },
    );
    const row = result.scenes[0];
    expect(row?.droppedHiddenGaps).toBe(1);
    expect(row?.longestGapMs).toBe(16);
    expect(row?.framesOver33).toBe(0);
    expect(hide).toBeNull();
  });
});

describe('autosave (review fix 2)', () => {
  it('is off for the whole run and put back after', { timeout: 60_000 }, async () => {
    const { g } = await quick(() => undefined);
    expect(g.autosaveAtDispatch).toHaveLength(20);
    expect(g.autosaveAtDispatch.every((v) => v === false)).toBe(true);
    expect(g.autosave).toBe(true);
  });

  it('stays off after the run when the player had it off', { timeout: 60_000 }, async () => {
    const { g } = await quick((x) => {
      x.autosave = false;
    });
    expect(g.autosave).toBe(false);
  });

  it('is put back when the run throws', { timeout: 60_000 }, async () => {
    const g = fakeGame();
    g.throwOnDispatch = true;
    let done = false;
    const p = runRealBench(g, [{ id: 'phone', json: sceneJson('p') }], () => g.now, { look: g.look, sets: g.sets, timeScale: 0.1 }).finally(() => {
      done = true;
    });
    const pumped = g.pump(() => done);
    await expect(p).rejects.toThrow('boom');
    await pumped;
    expect(g.autosave).toBe(true);
  });
});

describe('a missing instrument is never a pass', () => {
  it('no set manager: S2 n/a; no realistic look: S3 and S4 n/a (times still recorded)', { timeout: 60_000 }, async () => {
    const { result } = await quick(() => undefined, { look: null, sets: null, appReadyMs: 100 });
    const row = result.scenes[0];
    expect(row?.bands.S2.band).toBe('n/a');
    expect(row?.bands.S3.band).toBe('n/a');
    expect(row?.turns.every((t) => t.band === 'n/a' && t.ms > 0)).toBe(true);
    expect(row?.bands.S4.band).toBe('n/a');
    expect(row?.bands.S4.value).toBe(result.startMs);
    expect(row?.bands.S1.band).toBe('pass');
    expect(result.verdict).toBe('pass');
  });
});

describe("today's look in the same bench (round 2, change 1)", () => {
  it('a run without look, set manager or ground: rows with n/a S2/S3/S4, real frame numbers, and look today\'s', { timeout: 60_000 }, async () => {
    const { result } = await quick(() => undefined, { look: null, sets: null, ground: null, appReadyMs: 100 });
    expect(result.look).toBe('classic');
    const row = result.scenes[0]!;
    expect(row.error).toBeUndefined();
    expect(row.bands.S2.band).toBe('n/a');
    expect(row.bands.S3.band).toBe('n/a');
    expect(row.bands.S4.band).toBe('n/a');
    expect(row.frames).toBeGreaterThan(0);
    expect(row.frameP50).toBe(16);
    expect(row.frameP95).toBe(16);
    expect(row.longestGapMs).toBe(16);
    expect(row.bands.S1).toMatchObject({ band: 'pass', value: 16 });
    expect(row.densities).toEqual([]);
    expect(row.peakSplitMB).toBeNull();
    const text = resultsText(result);
    expect(text.split('\n')[1]).toBe("look: today's");
    expect(text.split('\n')[0]).toBe("Stage 1 bench (today's look): pass");
  });

  it('a run with the realistic look says so', { timeout: 60_000 }, async () => {
    const { result } = await quick(() => undefined);
    expect(result.look).toBe('real');
    expect(resultsText(result).split('\n')[1]).toBe('look: realistic');
    expect(resultsText(result).split('\n')[0]).toMatch(/^Stage 1 bench \(realistic look\): (pass|fail)$/);
  });
});

describe('sharpenMs (round 2, change 2)', () => {
  it('records the turn action to the first frame with every object at its density, next to the turn time', { timeout: 60_000 }, async () => {
    // After a turn the objects come back after 5 frames (fake) drawn soft for 10 more frames.
    let soft = 0;
    let lastRot = 0;
    const look = { incomplete: () => 0, fallbacksUsed: () => [] as string[], soft: () => soft };
    let inc = 0;
    look.incomplete = () => inc;
    const { result } = await quick((g) => {
      g.extra = (gg) => {
        if (gg.camera.rotation !== lastRot) {
          lastRot = gg.camera.rotation;
          inc = 5;
          soft = 15;
        } else {
          if (inc > 0) inc--;
          if (soft > 0) soft--;
        }
        return 0;
      };
    }, { look });
    const row = result.scenes[0]!;
    for (const t of row.turns) {
      expect(t.sharpenTimedOut).toBe(false);
      expect(t.sharpenMs).not.toBeNull();
      expect(t.sharpenMs!).toBeGreaterThan(t.ms);
      expect(t.sharpenMs! - t.ms).toBeGreaterThanOrEqual(9 * 16);
    }
    // S3 stays on the turn time.
    expect(row.bands.S3.value).toBe(Math.max(...row.turns.map((t) => t.ms)));
    expect(resultsText(result)).toMatch(/sharp after \+\d+(\.\d)?\/\+\d+(\.\d)?\/-\d+(\.\d)?\/-\d+(\.\d)? ms/);
  });

  it('is null without the look\'s soft count (today\'s look, or an older look)', { timeout: 60_000 }, async () => {
    const { result } = await quick(() => undefined);
    expect(result.scenes[0]!.turns.every((t) => t.sharpenMs === null && !t.sharpenTimedOut)).toBe(true);
    expect(resultsText(result)).toContain('sharp after +n/a/+n/a/-n/a/-n/a ms');
  });

  it('a view that never sharpens times out at the turn timeout and records null', { timeout: 60_000 }, async () => {
    const look = { incomplete: () => 0, fallbacksUsed: () => [] as string[], soft: () => 1 };
    const { result } = await quick(() => undefined, { look });
    const t = result.scenes[0]!.turns[0]!;
    expect(t.timedOut).toBe(false);
    expect(t.sharpenMs).toBeNull();
    expect(t.sharpenTimedOut).toBe(true);
  });
});

describe('final review fixes (I1, I2, M2, R1, R2)', () => {
  it('a frame with the realistic ground not laid is incomplete: turns wait for the ground too (I1)', { timeout: 60_000 }, async () => {
    const ground = { complete: true };
    let lastRot = 0;
    let groundWait = 0;
    const { result } = await quick((g) => {
      g.extra = (gg) => {
        if (gg.camera.rotation !== lastRot) {
          lastRot = gg.camera.rotation;
          groundWait = 12; // the ground stays unlaid well after the objects are ready
        } else if (groundWait > 0) groundWait--;
        ground.complete = groundWait === 0;
        return 0;
      };
    }, { ground });
    const row = result.scenes[0]!;
    // Objects come back after 5 frames, the ground after 12: every turn waits about 12 frames of 16 ms.
    for (const t of row.turns) expect(t.ms).toBeGreaterThanOrEqual(12 * 16);
    expect(row.incompleteFrames).toBeGreaterThanOrEqual(4 * 12);
  });

  it('a turn that times out records the set manager state in the row (R1)', { timeout: 60_000 }, async () => {
    const ground = { complete: true };
    let turned = false;
    const { result } = await quick((g) => {
      g.extra = (gg) => {
        if (gg.camera.rotation !== 0) turned = true;
        ground.complete = !turned; // never laid again after the first turn
        return 0;
      };
    }, { ground, sets: { capEvents: () => [], peakBytes: () => 0, residentBytes: () => 0, snapshot: () => ({ queueHead: { key: 'ride:x:d4:r1', estimate: 5 } }) } });
    const row = result.scenes[0]!;
    expect(row.turns.every((t) => t.timedOut)).toBe(true);
    expect(row.stalls.map((s) => s.at)).toEqual(['turn 1', 'turn 2', 'turn 3', 'turn 4']);
    expect(row.stalls[0]).toMatchObject({ groundComplete: false, sets: { queueHead: { key: 'ride:x:d4:r1', estimate: 5 } } });
    expect(resultsText(result)).toContain('timed-out waits turn 1, turn 2, turn 3, turn 4');
  });

  it('records the density at each zoom step and after the turns, and the held memory split at the peak and end (R2)', { timeout: 60_000 }, async () => {
    const look = { incomplete: () => 0, fallbacksUsed: () => [] as string[], currentDensity: () => 0 };
    let cam: Camera | null = null;
    look.currentDensity = () => ((cam?.zoom ?? 1) >= 1 ? 4 : 2);
    const split = { sets: 60 * MB, tints: 30 * MB, ground: 20 * MB };
    const { result } = await quick((g) => {
      cam = g.camera;
    }, { look, sets: { capEvents: () => [], peakBytes: () => 110 * MB, residentBytes: () => 110 * MB, split: () => split } });
    const row = result.scenes[0]!;
    expect(row.densities).toEqual([4, 4, 2, 4, 4]);
    expect(row.peakSplitMB).toEqual({ sets: 60, tints: 30, ground: 20 });
    expect(row.endSplitMB).toEqual({ sets: 60, tints: 30, ground: 20 });
    expect(resultsText(result)).toContain('density d4/d4/d2/d4/d4; held at peak sets 60 / tints 30 / ground 20 MB');
  });

  it('places baked kinds, those not in the park yet first (M2)', () => {
    const world = createWorld({ seed: 7, parkName: 'S', mapSize: 64 });
    expect(benchScenery(world)).toEqual([...BENCH_SCENERY]);
    world.state.scenery.push({ defId: 'oak_round' } as World['state']['scenery'][number], { defId: 'boulder' } as World['state']['scenery'][number]);
    const order = benchScenery(world);
    expect(order.slice(-2)).toEqual(['oak_round', 'boulder']);
    expect(order.slice(0, 4)).toEqual(['pine_tall', 'birch_silver', 'willow', 'shrub_round']);
    for (const id of BENCH_SCENERY) expect(realItem(id)).toBe(id);
  });

  it('reports the art download and the boot to first complete frame apart from S4 (I2)', { timeout: 60_000 }, async () => {
    const { result } = await quick(() => undefined, { artDownload: { ms: 812.34, bytes: 9.6 * MB, files: 273 }, bootCompleteMs: 2500, appReadyMs: 300 });
    expect(result.artDownload).toEqual({ ms: 812.3, MB: 9.6, files: 273 });
    expect(result.bootCompleteMs).toBe(2500);
    // S4 = the app's first drawn frame + the first park's load with all art local, not the download.
    expect(result.startMs).toBeLessThan(300 + 812);
    expect(resultsText(result)).toContain('art download 9.6 MB, 273 files in 812.3 ms (before the run, not in S4)');
  });
});

describe('every park from the same start (re-review 1)', () => {
  it('a park after one that capped starts uncapped and reports cappedAtStart', { timeout: 60_000 }, async () => {
    const g = fakeGame();
    let capped = false;
    let resets = 0;
    const events: unknown[] = [];
    const sets = {
      capEvents: () => events.slice(),
      peakBytes: () => 0,
      residentBytes: () => 0,
      densityCap: () => (capped ? 2 : 4),
      resetPressure: () => {
        resets++;
        capped = false;
      },
    };
    // The first park caps during its run.
    g.extra = (gg) => {
      if (gg.sceneIndex === 0 && !capped && gg.camera.zoom === 2) {
        capped = true;
        events.push({ capped: true });
      }
      return 0;
    };
    let done = false;
    const p = runRealBench(g, [{ id: 'a', json: sceneJson('a') }, { id: 'b', json: sceneJson('b') }], () => g.now, { look: g.look, sets, timeScale: 0.1 }).finally(() => {
      done = true;
    });
    await g.pump(() => done);
    const result = await p;
    expect(resets).toBe(2);
    expect(result.scenes.map((s) => s.cappedAtStart)).toEqual([false, true]);
    expect(result.scenes.map((s) => s.capEvents)).toEqual([1, 0]);
    expect(capped).toBe(false); // the second park ran uncapped
    expect(resultsText(result)).toContain('caps 0 (capped at start: yes)');
  });
});

describe('degraded objects (round 3 item 2)', () => {
  it('counts measured frames with an object drawn by the last ladder step, and the most in one frame', { timeout: 60_000 }, async () => {
    // The look degrades 3 objects on every 10th frame.
    let n = 0;
    const look = { incomplete: () => 0, fallbacksUsed: () => [] as string[], degraded: () => (n++ % 10 === 0 ? 3 : 0) };
    const { result } = await quick(() => undefined, { look });
    const row = result.scenes[0]!;
    expect(row.degradedFrames).toBeGreaterThan(0);
    expect(row.degradedFrames).toBeLessThan(row.frames);
    expect(row.degradedMax).toBe(3);
    expect(resultsText(result)).toMatch(/degraded \d+ frames \(most 3\)/);
  });

  it('is 0 without the look\'s count', { timeout: 60_000 }, async () => {
    const { result } = await quick(() => undefined);
    expect(result.scenes[0]).toMatchObject({ degradedFrames: 0, degradedMax: 0 });
  });
});

describe('bench honesty (round 3 item 6)', () => {
  it('S1 per phase: pan, zoom, turns, placements, idle, each with its p95 and share of frames over 33 ms', { timeout: 60_000 }, async () => {
    // Frames take 50 ms during the turns only (the fake's turn frames), 16 ms otherwise.
    const { result } = await quick((g) => {
      g.extra = (x) => (x.camera.rotation !== 0 ? 34 : 0);
    });
    const row = result.scenes[0]!;
    expect(Object.keys(row.phases)).toEqual(['pan', 'zoom', 'turns', 'placements', 'idle']);
    expect(row.phases.pan).toMatchObject({ p95: 16, over33Pct: 0 });
    expect(row.phases.pan.frames).toBeGreaterThan(30);
    expect(row.phases.zoom.p95).toBe(16);
    expect(row.phases.turns.p95).toBe(50);
    expect(row.phases.turns.over33Pct).toBeGreaterThan(50);
    expect(Object.values(row.phases).reduce((n, p) => n + p.frames, 0)).toBe(row.frames);
    expect(resultsText(result)).toMatch(/by phase pan p95 16 ms \(0% >33\), zoom p95 16 ms/);
  });

  it('S6g: a frame gap over 500 ms fails the row (and the verdict); 500 ms or less passes', { timeout: 60_000 }, async () => {
    let once = 0;
    const { result } = await quick((g) => {
      g.extra = (x) => (x.now > 700 && once++ === 0 ? 600 - 16 : 0);
    });
    const row = result.scenes[0]!;
    expect(row.bands.S6g).toMatchObject({ band: 'fail', value: 600, limit: 500 });
    expect(result.verdict).toBe('fail');
    expect(resultsText(result)).toMatch(/S6g fail/);
    const ok = await quick(() => undefined);
    expect(ok.result.scenes[0]!.bands.S6g).toMatchObject({ band: 'pass', value: 16 });
  });

  it('memory outside the budget: its peaks per owner and the peak of everything together, next to the managed MB', { timeout: 60_000 }, async () => {
    let n = 0;
    const otherMemory = () => ({ terrain: 20 * MB, staticLayer: 5 * MB, sprites: (n++ > 50 ? 12 : 8) * MB, blobs: 9 * MB });
    const { result } = await quick(() => undefined, { otherMemory });
    const row = result.scenes[0]!;
    expect(row.otherMB).toEqual({ terrain: 20, staticLayer: 5, sprites: 12, blobs: 9 });
    // The fake set manager holds 10 MB: 10 + 20 + 5 + 12 + 9.
    expect(row.allPeakMB).toBe(56);
    expect(row.bands.S2.value).toBe(10);
    expect(resultsText(result)).toMatch(/outside the budget today's terrain 20 \/ static layer 5 \/ today's sprites 12 \/ compressed art 9 MB, all together peak 56 MB/);
    const none = await quick(() => undefined);
    expect(none.result.scenes[0]).toMatchObject({ otherMB: null, allPeakMB: null });
  });
});

describe('the scale park\'s item map (round 3 item 7)', () => {
  it('sets a scene\'s item map before its park loads and clears it after the run', { timeout: 60_000 }, async () => {
    const calls: (Readonly<Record<string, string>> | null)[] = [];
    const g = fakeGame();
    let done = false;
    const map = { bumper_cars: 'carousel@bumper_cars' };
    const p = runRealBench(g, [{ id: 'phone', json: sceneJson('p') }, { id: 'scale', json: sceneJson('s'), itemMap: map }], () => g.now, {
      look: g.look, sets: g.sets, timeScale: 0.1, setItemMap: (m) => calls.push(m),
    }).finally(() => { done = true; });
    await g.pump(() => done);
    const result = await p;
    expect(result.scenes.map((s) => s.id)).toEqual(['phone', 'scale']);
    expect(calls).toEqual([null, map, null]);
  });
});

describe('information-only rows (round 3 fix 4)', () => {
  it('the scale park shows its bands but does not decide the verdict', { timeout: 60_000 }, async () => {
    const g = fakeGame();
    // Every frame 40 ms: S1 fails for both rows.
    g.extra = () => 24;
    let done = false;
    const p = runRealBench(g, [{ id: 'scale', json: sceneJson('s'), infoOnly: true }], () => g.now, { look: g.look, sets: g.sets, timeScale: 0.1 }).finally(() => { done = true; });
    await g.pump(() => done);
    const result = await p;
    expect(result.scenes[0]!.bands.S1.band).toBe('fail');
    expect(result.scenes[0]!.infoOnly).toBe(true);
    expect(result.verdict).toBe('pass');
    expect(resultsText(result)).toMatch(/scale \(information only, not in the verdict\)/);
  });
});
