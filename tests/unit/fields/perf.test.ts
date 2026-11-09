/**
 * Field update budget (Phase 4 §9.4): one scenery change updates Calm and Buzz in < 0.2 ms on a 128 × 128 park with
 * about 2,000 items. CI bound is 5× the budget so a busy runner does not flake; the precise number comes from
 * `npm run bench` (`tests/bench/fields.bench.ts`). Prints a warning when the mean is over the real budget.
 */
import { describe, expect, it } from 'vitest';
import { allocId } from '../../../src/sim/ids';
import { calmAt, markFieldsDirty } from '../../../src/sim/fields/api';
import { fieldsRaw, rebuildFieldsRaw } from '../../../src/sim/fields/store';
import { buildFieldsPark } from './helpers';

const BUDGET_MS = 0.2;
const CI_BOUND_MS = 5 * BUDGET_MS;

describe('field update budget (Phase 4 §9.4)', () => {
  it(`one scenery change: mean under ${CI_BOUND_MS} ms (budget ${BUDGET_MS} ms)`, () => {
    const world = buildFieldsPark();
    const s = world.state;
    const tile = 64 * 128 + 64;
    expect(s.scenery.length).toBe(2_000);
    calmAt(world, tile);
    const times: number[] = [];
    for (let k = 0; k < 400; k++) {
      const t0 = performance.now();
      if (k % 2 === 0) s.scenery.push({ id: allocId(s), defId: 'fountain_carved', x: 63, y: 63, z: 8, rotation: 0, edge: -1, waterLevel: 255 });
      else s.scenery.pop();
      markFieldsDirty(world, tile);
      calmAt(world, tile);
      times.push(performance.now() - t0);
    }
    const steady = times.slice(100);
    const mean = steady.reduce((a, b) => a + b, 0) / steady.length;
    console.log(`[perf] fields: one scenery change mean ${mean.toFixed(4)} ms (budget ${BUDGET_MS} ms)`);
    if (mean > BUDGET_MS) console.warn(`[perf] fields: scenery change mean ${mean.toFixed(4)} ms is over the ${BUDGET_MS} ms budget`);
    expect(mean).toBeLessThan(CI_BOUND_MS);
    // And the result is still exact.
    const full = rebuildFieldsRaw(world);
    expect(Array.from(fieldsRaw(world).calm)).toEqual(Array.from(full.calm));
  });
});
