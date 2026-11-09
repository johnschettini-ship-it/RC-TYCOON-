/**
 * Tick benchmarks (W2-D). Master §10: Build 1 desktop budget is tick < 3 ms with 2,000 guests.
 * Run with `npm run bench` (Vitest 5 benchmark API: the `bench` fixture of a test).
 * The CI check with a generous bound is `tests/integration/perf-budget.test.ts`.
 *
 * Note: Vitest's bench mode tracks module export getters (it warns about them), which adds overhead to every
 * call into `src/sim`. The same plain timed loop measures about 2.6 ms per tick here and about 1.1 ms in the
 * normal test runner (`perf-budget.test.ts`), so these numbers are an upper bound.
 */
import { test } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/data/tuning/core';
import { executeCommand } from '../../src/sim/commands';
import { rebuildAllFields } from '../../src/sim/pathing';
import { stepTick } from '../../src/sim/tick';
import { isHourStart } from '../../src/sim/time';
import { BUILD1_SCENE, PHASE3_SCENE, buildBenchPark, summarize, type BenchParkOptions } from './benchPark';

const RUN = { time: 3_000, warmupTime: 500 };

function report(label: string, mean: number, p99: number, budget: number): void {
  const verdict = mean < budget ? 'within' : 'OVER';
  console.log(`[bench] ${label}: mean ${mean.toFixed(3)} ms, p99 ${p99.toFixed(3)} ms (${verdict} the ${budget} ms budget)`);
}

test('tick: 2,000 guests, 10 rides, 8 staff on a dense path grid (budget 3 ms)', async ({ bench }) => {
  const world = buildBenchPark(BUILD1_SCENE);
  for (let k = 0; k < 200; k++) stepTick(world);
  const r = await bench('stepTick (Build 1 scene)', () => stepTick(world)).run(RUN);
  report('Build 1 scene tick', r.latency.mean, r.latency.p99 ?? r.latency.max, 3);
}, 60_000);

test('tick: 2,000 guests, 10 rides, 40 staff, 1,000 litter (budget 3 ms)', async ({ bench }) => {
  const world = buildBenchPark(PHASE3_SCENE);
  for (let k = 0; k < 200; k++) stepTick(world);
  const r = await bench('stepTick (Phase 3 scene)', () => stepTick(world)).run(RUN);
  report('Phase 3 scene tick', r.latency.mean, r.latency.p99 ?? r.latency.max, 3);
}, 60_000);

test('distance fields: rebuild every guest field after a path change (budget 5 ms)', async ({ bench }) => {
  const world = buildBenchPark({ guests: 0, staff: {} });
  let built = false;
  const r = await bench('rebuild all fields', () => {
    // Toggle one path tile so the network is dirty, then rebuild every field (exit, 10 rides, 6 stalls).
    built = !built;
    if (built) executeCommand(world, { type: 'buildPath', x: 40, y: 61, kind: 'footpath' }, { setup: true });
    else executeCommand(world, { type: 'demolish', x: 40, y: 61 }, { setup: true });
    rebuildAllFields(world);
  }).run({ time: 2_000 });
  report('field rebuild', r.latency.mean, r.latency.p99 ?? r.latency.max, 5);
}, 60_000);

/**
 * Hour-start ticks (master R13 hour-start work: hourly charges, wages, research, park value, rating) are
 * timed one by one with a plain timer, because a bench function cannot pick them out of the tick stream.
 */
function hourStartTicks(scene: BenchParkOptions, hours: number): number[] {
  const world = buildBenchPark(scene);
  for (let k = 0; k < 200; k++) stepTick(world);
  const out: number[] = [];
  for (let k = 0; k < hours * TICKS_PER_HOUR; k++) {
    const hourStart = isHourStart(world.state.tick);
    const t0 = performance.now();
    stepTick(world);
    if (hourStart) out.push(performance.now() - t0);
  }
  return out;
}

test('hour-start tick: 2,000 guests (budget 3 ms)', () => {
  for (const [label, scene] of [
    ['Build 1 scene hour-start tick', BUILD1_SCENE],
    ['Phase 3 scene hour-start tick', PHASE3_SCENE],
    ['lockstep crowd hour-start tick (worst case, not a budget scene)', { ...BUILD1_SCENE, lockstep: true }],
  ] as const) {
    const s = summarize(hourStartTicks(scene, 40));
    report(label, s.mean, s.p95, 3);
  }
}, 120_000);
