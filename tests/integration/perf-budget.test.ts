/**
 * Tick time budget (W2-D, master §10; Phase 1 §9 Benchmark; Phase 3 §9.5).
 * Budget: tick < 3 ms with 2,000 guests on desktop. This test uses a generous bound (3× the budget) so a
 * slow or busy CI runner does not flake, and prints a warning when the mean is over the real budget.
 * The precise numbers come from `npm run bench` (tests/bench/tick.bench.ts).
 */
import { describe, expect, it } from 'vitest';
import { BUILD1_SCENE, PHASE3_SCENE, buildBenchPark, summarize, timeTicks } from '../bench/benchPark';

const BUDGET_MS = 3;
const CI_BOUND_MS = 3 * BUDGET_MS;

describe('tick time budget (master §10)', () => {
  for (const [label, scene] of [
    ['2,000 guests, 10 rides, 8 staff', BUILD1_SCENE],
    ['2,000 guests, 10 rides, 40 staff, 1,000 litter', PHASE3_SCENE],
  ] as const) {
    it(`${label}: mean tick under ${CI_BOUND_MS} ms (budget ${BUDGET_MS} ms)`, () => {
      const world = buildBenchPark(scene);
      timeTicks(world, 200); // warm-up: JIT, distance fields, guests spread into queues and rides
      const ms = timeTicks(world, 600);
      const s = summarize(ms);
      if (s.mean > BUDGET_MS) {
        console.warn(`[perf] ${label}: mean ${s.mean.toFixed(2)} ms is over the ${BUDGET_MS} ms budget (p95 ${s.p95.toFixed(2)} ms)`);
      }
      // The crowd stays in the park during the measurement, so the number means what it says.
      expect(world.state.guests.length).toBeGreaterThan(1_800);
      expect(s.mean).toBeLessThan(CI_BOUND_MS);
    }, 60_000);
  }
});
