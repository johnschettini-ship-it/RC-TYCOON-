import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { buildPathingBench, changeAndQueryAll } from './benchNetwork';

describe('distance fields on path nodes (Phase 4 §4.10 worst case)', () => {
  it('100 destinations × 5,000 nodes after a network change', () => {
    const b = buildPathingBench();
    expect(b.nodes).toBeGreaterThanOrEqual(5_000);
    const toggle = { on: false };
    // Every destination is reachable from the elevated deck (over the ramps).
    expect(changeAndQueryAll(b, toggle)).toBe(100);
    for (let k = 0; k < 5; k++) changeAndQueryAll(b, toggle);
    const times: number[] = [];
    for (let k = 0; k < 11; k++) {
      const t0 = performance.now();
      changeAndQueryAll(b, toggle);
      times.push(performance.now() - t0);
    }
    times.sort((a, c) => a - c);
    const median = times[Math.floor(times.length / 2)] as number;
    console.log(`[W3-B] network change + 100 fields over ${b.nodes} nodes (96 × 96): median ${median.toFixed(2)} ms`);
    // Generous bound so a busy CI runner does not flake; the bench file reports the precise number.
    expect(median).toBeLessThan(100);
  }, 60_000);
});
