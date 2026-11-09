/**
 * Tick time budget (W2-D, master §10; Phase 1 §9 Benchmark; Phase 3 §9.5).
 * Budget: tick < 3 ms with 2,000 guests on desktop. The budget covers every tick, so the hour-start tick
 * (hourly charges, wages, research, park value, rating: master R13) is checked on its own as well.
 * This test uses a generous bound (3× the budget) so a slow or busy CI runner does not flake, and prints
 * a warning when a mean is over the real budget. The precise numbers come from `npm run bench`
 * (tests/bench/tick.bench.ts).
 */
import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/data/tuning/core';
import { stepTick } from '../../src/sim/tick';
import { isHourStart } from '../../src/sim/time';
import type { World } from '../../src/sim/types';
import { BUILD1_SCENE, PHASE3_SCENE, buildBenchPark, summarize, type BenchParkOptions } from '../bench/benchPark';

const BUDGET_MS = 3;
const CI_BOUND_MS = 3 * BUDGET_MS;
/** 20 hour starts. */
const MEASURE_TICKS = 20 * TICKS_PER_HOUR;

/** Tick times split into hour-start ticks and all ticks. */
function timeHourly(world: World, n: number): { all: number[]; hour: number[] } {
  const all: number[] = [];
  const hour: number[] = [];
  for (let k = 0; k < n; k++) {
    const hourStart = isHourStart(world.state.tick);
    const t0 = performance.now();
    stepTick(world);
    const ms = performance.now() - t0;
    all.push(ms);
    if (hourStart) hour.push(ms);
  }
  return { all, hour };
}

function report(label: string, all: number[], hour: number[]): void {
  const a = summarize(all);
  const h = summarize(hour);
  console.log(`[perf] ${label}: tick mean ${a.mean.toFixed(2)} ms (p95 ${a.p95.toFixed(2)}), hour-start tick mean ${h.mean.toFixed(2)} ms (p95 ${h.p95.toFixed(2)})`);
}

function warnIfOver(label: string, what: string, ms: number[]): void {
  const s = summarize(ms);
  if (s.mean > BUDGET_MS) {
    console.warn(`[perf] ${label}: ${what} mean ${s.mean.toFixed(2)} ms is over the ${BUDGET_MS} ms budget (p95 ${s.p95.toFixed(2)} ms)`);
  }
}

describe('tick time budget (master §10)', () => {
  const scenes: [string, BenchParkOptions][] = [
    ['2,000 guests, 10 rides, 8 staff', BUILD1_SCENE],
    ['2,000 guests, 10 rides, 40 staff, 1,000 litter', PHASE3_SCENE],
  ];
  for (const [label, scene] of scenes) {
    it(`${label}: mean tick and mean hour-start tick under ${CI_BOUND_MS} ms (budget ${BUDGET_MS} ms)`, () => {
      const world = buildBenchPark(scene);
      timeHourly(world, 200); // warm-up: JIT, distance fields, guests spread into queues and rides
      const { all, hour } = timeHourly(world, MEASURE_TICKS);
      report(label, all, hour);
      warnIfOver(label, 'tick', all);
      warnIfOver(label, 'hour-start tick', hour);
      // The crowd stays in the park during the measurement, so the number means what it says.
      expect(world.state.guests.length).toBeGreaterThan(1_800);
      expect(hour.length).toBe(MEASURE_TICKS / TICKS_PER_HOUR);
      expect(summarize(all).mean).toBeLessThan(CI_BOUND_MS);
      expect(summarize(hour).mean).toBeLessThan(CI_BOUND_MS);
    }, 60_000);
  }

  it('worst case: 2,000 guests placed on one tick walk in lockstep; mean tick still under the CI bound', () => {
    // Not a budget scene (see BenchParkOptions.lockstep): every 10th tick, and so every hour start,
    // carries most of the park's step and decision work. Reported for comparison with the budget scenes.
    const world = buildBenchPark({ ...BUILD1_SCENE, lockstep: true });
    timeHourly(world, 200);
    const { all, hour } = timeHourly(world, MEASURE_TICKS);
    report('lockstep crowd (worst case, not a budget scene)', all, hour);
    expect(summarize(all).mean).toBeLessThan(CI_BOUND_MS);
    expect(summarize(hour).mean).toBeLessThan(CI_BOUND_MS);
  }, 60_000);
});
