/**
 * Calm and Buzz benchmarks (W3-E, Phase 4 §9.4): one scenery change updates the fields in < 0.2 ms on a 128 × 128
 * park with about 2,000 scenery items. Run with `npm run bench`. The CI check with a generous bound is
 * `tests/unit/fields/perf.test.ts`. Bench mode tracks module export getters (see `tick.bench.ts`), so these numbers
 * are an upper bound.
 */
import { test } from 'vitest';
import { allocId } from '../../src/sim/ids';
import { buzzAt, calmAt, markFieldsDirty } from '../../src/sim/fields/api';
import { rebuildFieldsRaw } from '../../src/sim/fields/store';
import type { Scenery } from '../../src/sim/scenery/types';
import { buildFieldsPark } from '../unit/fields/helpers';

function report(label: string, mean: number, tail: number, budget: number): void {
  const verdict = mean < budget ? 'within' : 'OVER';
  console.log(`[bench] ${label}: mean ${mean.toFixed(4)} ms, p99 ${tail.toFixed(4)} ms (${verdict} the ${budget} ms budget)`);
}

test('one scenery change updates the fields (budget 0.2 ms)', async ({ bench }) => {
  const world = buildFieldsPark();
  const s = world.state;
  const tile = 64 * 128 + 64;
  calmAt(world, tile);
  let item: Scenery | null = null;
  const r = await bench('place or remove a Carved Fountain, then read', () => {
    if (item === null) {
      item = { id: allocId(s), defId: 'fountain_carved', x: 63, y: 63, z: 8, rotation: 0, edge: -1, waterLevel: 255 };
      s.scenery.push(item);
    } else {
      s.scenery.pop();
      item = null;
    }
    markFieldsDirty(world, tile);
    calmAt(world, tile);
  }).run({ time: 2_000, warmupTime: 300 });
  report('scenery change', r.latency.mean, r.latency.p99 ?? r.latency.max, 0.2);
}, 60_000);

test('first read of a tick with no change (per-tick sync)', async ({ bench }) => {
  const world = buildFieldsPark();
  const tile = 64 * 128 + 64;
  buzzAt(world, tile);
  const r = await bench('tick + 1, then read', () => {
    world.state.tick += 1;
    buzzAt(world, tile);
  }).run({ time: 2_000, warmupTime: 300 });
  report('per-tick sync', r.latency.mean, r.latency.p99 ?? r.latency.max, 0.2);
}, 60_000);

test('full rebuild after a load (128 × 128, 2,000 items)', async ({ bench }) => {
  const world = buildFieldsPark();
  const r = await bench('rebuild', () => {
    rebuildFieldsRaw(world);
  }).run({ time: 2_000, warmupTime: 300 });
  report('full rebuild', r.latency.mean, r.latency.p99 ?? r.latency.max, 5);
}, 60_000);
