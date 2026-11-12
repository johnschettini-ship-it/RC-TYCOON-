/** Phase 8b stage 0b test (never merged): the device bench summary (medians of 3 runs, steps by the frame step). */
import { describe, expect, it } from 'vitest';
import { benchSummary, stepMsOf, type BenchRun } from '../../../../src/render/pixel/app/bench';

function run(p95: number, turnMax: number, stepMs: number, extra: Partial<BenchRun> = {}): BenchRun {
  return {
    frameP50: p95 / 2,
    frameP95: p95,
    frameMax: p95 * 2,
    workP95: p95 / 4,
    turnMax,
    stepMs,
    budgetMbMax: 20,
    incompleteAfterTurnMax: 1,
    missingTotal: 0,
    firstCompleteMs: 900,
    ...extra,
  };
}

describe('bench summary (Test decision 18)', () => {
  it('takes the median of each value over 3 runs', () => {
    const s = benchSummary([
      run(30, 120, 16.7, { budgetMbMax: 22, missingTotal: 4, firstCompleteMs: 1200 }),
      run(20, 80, 16.6, { budgetMbMax: 18, missingTotal: 0, firstCompleteMs: 800 }),
      run(25, 100, 16.7, { budgetMbMax: 20, missingTotal: 1, firstCompleteMs: 1000, workP95: null }),
    ]);
    expect(s.runs).toBe(3);
    expect(s.frameP50).toBe(12.5);
    expect(s.frameP95).toBe(25);
    expect(s.frameMax).toBe(50);
    expect(s.turnMax).toBe(100);
    expect(s.stepMs).toBeCloseTo(16.7, 5);
    expect(s.budgetMbMax).toBe(20);
    expect(s.missingTotal).toBe(1);
    expect(s.firstCompleteMs).toBe(1000);
    // A run without the probe is left out of the work median.
    expect(s.workP95).toBe(6.25);
  });

  it('counts steps by the measured frame step', () => {
    const s = benchSummary([run(25, 100, 16.7), run(25, 100, 16.7), run(25, 100, 16.7)]);
    expect(s.frameP95Steps).toBe(1);
    expect(s.turnSteps).toBe(6);
    // At 120 Hz the same milliseconds are twice the steps.
    const fast = benchSummary([run(25, 100, 8.33), run(25, 100, 8.33), run(25, 100, 8.33)]);
    expect(fast.frameP95Steps).toBe(3);
    expect(fast.turnSteps).toBe(12);
  });

  it('a missing value stays null', () => {
    const s = benchSummary([run(25, 100, 16.7, { budgetMbMax: null }), run(25, 100, 16.7, { budgetMbMax: null })]);
    expect(s.budgetMbMax).toBeNull();
    expect(s.runs).toBe(2);
  });
});

describe('frame step', () => {
  it('is the 5th percentile of the frame intervals: 120 Hz gives 8.3', () => {
    const iv: number[] = [];
    for (let i = 0; i < 200; i++) iv.push(1000 / 120 + (i % 10 === 0 ? 8.33 : 0));
    expect(stepMsOf(iv)).toBeCloseTo(8.3, 1);
  });

  it('a few short intervals do not set the step', () => {
    const iv = Array.from({ length: 100 }, (_, i) => (i < 3 ? 2 : 16.67));
    expect(stepMsOf(iv)).toBeCloseTo(16.67, 2);
  });
});
