/**
 * Render-side benchmarks (Phase 6 §4.6, W4-E). Run with `npm run bench`.
 *
 * - Terrain change check on 128 × 128: the Build 2 diff (9 layers, byte by byte; kept here as the reference) against
 *   the W4-E tracker (7 layers, 32-bit words).
 * - One tick of the Build 2 perf scene (`tests/perf/`, 3,000 guests on 128 × 128) for the worker rule
 *   (`docs/adr/0002-worker.md`): a plain timed loop over a game day, p50 / p95. Bench mode slows every call into
 *   `src/sim` (see `tick.bench.ts`), so this is an upper bound; the rule uses the browser perf run.
 *
 * Console lines need `--silent=false` (`npm run bench -- --silent=false`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { TerrainTracker } from '../../src/render/terrainTracker';
import { deserialize } from '../../src/save';
import { stepTick } from '../../src/sim/tick';
import type { MapState } from '../../src/sim/map';
import type { World } from '../../src/sim/types';
import { percentile } from '../../src/perf/stats';
import { PERF_SCENES } from '../perf/sceneInfo';

const RUN = { time: 2_000, warmupTime: 300 };

function loadScene(id: 'build1' | 'build2' | 'phone'): World {
  const info = PERF_SCENES.find((s) => s.id === id);
  if (!info) throw new Error(id);
  const r = deserialize(readFileSync(join(__dirname, '../perf', info.file), 'utf8'));
  if (!r.ok) throw new Error(r.error);
  return r.world;
}

/** The Build 2 terrain diff: 9 layers compared byte by byte every frame. */
const OLD_LAYERS = ['terrain', 'heights', 'slope', 'water', 'content', 'contentRef', 'owned', 'pathItem', 'pathItemFlags'] as const;
function oldDiff(map: MapState, snaps: Array<Uint8Array | Int32Array>): boolean {
  let changed = false;
  for (let l = 0; l < OLD_LAYERS.length; l++) {
    const cur = map[OLD_LAYERS[l] as (typeof OLD_LAYERS)[number]];
    const snap = snaps[l] as Uint8Array | Int32Array;
    for (let i = 0; i < cur.length; i++) {
      if (cur[i] !== snap[i]) {
        snap[i] = cur[i] as number;
        changed = true;
      }
    }
  }
  return changed;
}

test('terrain change check, 128 × 128 (Phase 6 §4.6 finding)', async ({ bench }) => {
  const map = loadScene('build2').state.map;
  const snaps = OLD_LAYERS.map((k) => map[k].slice());
  const tracker = new TerrainTracker();
  tracker.sync(map);
  const before = await bench('Build 2 diff (9 layers, bytes)', () => oldDiff(map, snaps)).run(RUN);
  const after = await bench('W4-E diff (7 layers, words)', () => tracker.sync(map)).run(RUN);
  console.log(`[bench] terrain change check 128 × 128: ${before.latency.mean.toFixed(4)} ms → ${after.latency.mean.toFixed(4)} ms per frame`);
}, 60_000);

test('tick of the Build 2 perf scene (3,000 guests, 128 × 128; budget p95 4 ms, bench-mode upper bound)', () => {
  const world = loadScene('build2');
  for (let k = 0; k < 100; k++) stepTick(world);
  const times: number[] = [];
  // 1,200 ticks = one game day, so every hour start (and the evening) is in the sample.
  for (let k = 0; k < 1_200; k++) {
    const t0 = performance.now();
    stepTick(world);
    times.push(performance.now() - t0);
  }
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(
    `[bench] Build 2 scene tick: mean ${mean.toFixed(2)} ms, p50 ${percentile(times, 0.5).toFixed(2)} ms, ` +
      `p95 ${percentile(times, 0.95).toFixed(2)} ms, max ${Math.max(...times).toFixed(2)} ms (budget p95 4 ms)`,
  );
}, 120_000);
