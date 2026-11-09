/**
 * Pathing benchmark (W3-B, Phase 4 §4.10): the worst case of on-demand distance fields — 100 destinations over
 * about 5,000 path nodes (ground grid, ramps, elevated deck) right after a network change.
 * Run with `npm run bench`. The CI check with a generous bound is `tests/unit/paths/perf.test.ts`.
 */
import { test } from 'vitest';
import { buildPathingBench, changeAndQueryAll } from '../unit/paths/benchNetwork';

test('distance fields: network change + 100 destinations × 5,000 nodes', async ({ bench }) => {
  const b = buildPathingBench();
  const toggle = { on: false };
  const r = await bench('change + 100 fields', () => {
    changeAndQueryAll(b, toggle);
  }).run({ time: 3_000, warmupTime: 500 });
  console.log(`[bench] ${b.nodes} nodes, 100 fields after a change: mean ${r.latency.mean.toFixed(3)} ms, p99 ${(r.latency.p99 ?? r.latency.max).toFixed(3)} ms`);
}, 60_000);
