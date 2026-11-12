/** Phase 8b stage 0b test (never merged): the `[perf]` line parser of the 0b numbers. */
import { describe, expect, it } from 'vitest';
import { parsePerf } from './b0bKit';

const pixelPhone = (missing = 0): string =>
  '[perf] phone (CPU 4×) scene build2 run 2/3, canvas ratio 0.875: 30.0 fps, frame p50 20.0 / p95 41.5 / max 90 ms; ' +
  'tick p50 1.00 / p95 2.00 ms; work p95 9.0 ms; render p95 8.0 ms; draws 10; sprites 5.0 MB, 3 canvases made; ' +
  'long tasks 0 in 30 s; guests 1 → 1; heap 50 MB; turns: longest frame 80 ms (work 70.0 ms), 60 ms (work 50.0 ms); ' +
  'pan: frame p95 33.3 ms, work p95 12.5 ms; art n 3, k 3, budget max 21.40 MB, sheets 12.18 MB, swaps 0.00 MB, chunks 1.61 MB, ' +
  `static 1.01 MB, other 0.25 MB, incomplete after turn 4, missing ${missing}, chunk max 6.2 ms, turn and pan misses 7`;
const classicTablet =
  '[perf] tablet (CPU 4×) scene build1 run 1/3, canvas ratio 2: 50.0 fps, frame p50 10.0 / p95 22.0 / max 40 ms; ' +
  'tick p50 1.00 / p95 2.00 ms; work p95 7.0 ms; render p95 6.0 ms; draws 10; sprites 5.0 MB, 3 canvases made; ' +
  'long tasks 0 in 30 s; guests 1 → 1; heap 50 MB; turns: longest frame 30 ms (work 20.0 ms), 35 ms (work 22.0 ms); ' +
  'pan: frame p95 22.2 ms, work p95 n/a ms; art classic';

describe('parsePerf', () => {
  it('reads a Pixel phone line', () => {
    const [p] = parsePerf(`noise\n  ${pixelPhone()}\nmore`);
    expect(p).toEqual({
      project: 'phone',
      scene: 'build2',
      run: 2,
      frameP50: 20,
      frameP95: 41.5,
      workP95: 9,
      renderP95: 8,
      turns: [80, 60],
      art: 'pixel',
      budgetMax: 21.4,
      incompleteAfterTurn: 4,
      missing: 0,
      chunkMax: 6.2,
      parts: { sheets: 12.18, swaps: 0, chunks: 1.61, static: 1.01, other: 0.25 },
    });
  });

  it('reads a Classic tablet line; pan frame p95 and tick p95 are never taken', () => {
    const [c] = parsePerf(classicTablet);
    expect(c).toMatchObject({ project: 'tablet', scene: 'build1', run: 1, frameP95: 22, workP95: 7, renderP95: 6, turns: [30, 35], art: 'classic' });
    expect(c?.budgetMax).toBeNull();
    expect(c?.missing).toBeNull();
    expect(c?.parts).toBeNull();
    // Not the pan p95 (22.2 / 33.3), not the tick p95 (2.00), not the pan work p95 (12.5).
    const [p] = parsePerf(pixelPhone());
    expect(p?.frameP95).not.toBe(33.3);
    expect(p?.frameP95).not.toBe(2);
    expect(p?.workP95).not.toBe(12.5);
  });

  it('a line with missing 3 parses missing 3', () => {
    expect(parsePerf(pixelPhone(3))[0]?.missing).toBe(3);
  });

  it('only [perf] lines count; an unreadable [perf] line throws', () => {
    expect(parsePerf('[b1] objects: 532 entries\nhello')).toEqual([]);
    expect(() => parsePerf('[perf] phone scene x run 1/1: nothing')).toThrow();
  });
});
