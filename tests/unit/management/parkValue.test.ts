import { describe, expect, it } from 'vitest';
import { assetValue, computeParkValue, updateParkValue } from '../../../src/sim/finance/value';
import { Content, PathItem, tileIndex } from '../../../src/sim/map';
import { DEP_FLOOR, DEP_MONTHS, PATH_VALUE_COST, QUEUE_VALUE_COST } from '../../../src/data/tuning/management';
import { TICKS_PER_MONTH } from '../../../src/data/tuning/core';
import { PATH_ITEMS } from '../../../src/data/catalog';
import { makeTestWorld, placeQueue, placeRideDirect, placeStallDirect } from '../../helpers/world';

/** Footpath tiles of the generated entrance stub. */
function stubPathValue(w: ReturnType<typeof makeTestWorld>): number {
  let n = 0;
  for (const c of w.state.map.content) if (c === Content.Footpath) n++;
  return n * PATH_VALUE_COST * 0.5;
}

describe('asset value (Phase 3 §4.12, master R14)', () => {
  it('depreciates linearly to the 0.30 floor at 120 months', () => {
    expect(DEP_FLOOR).toBe(0.3);
    expect(DEP_MONTHS).toBe(120);
    expect(assetValue(100_000, 0)).toBe(100_000);
    expect(assetValue(100_000, 60)).toBe(65_000);
    expect(assetValue(100_000, 120)).toBe(30_000);
    expect(assetValue(100_000, 200)).toBe(30_000);
  });

  it('floors to whole cents', () => {
    // 12,345 × (1 − 0.7 × 7 / 120) = 11,840.91…
    expect(assetValue(12_345, 7)).toBe(11_840);
    expect(Number.isInteger(assetValue(99_999, 13))).toBe(true);
  });
});

describe('park value', () => {
  it('sums ride and stall asset values by age in whole months, plus paths and path items at 50%', () => {
    const w = makeTestWorld();
    const s = w.state;
    const base = stubPathValue(w);
    expect(computeParkValue(w)).toBe(base);

    const ride = placeRideDirect(w, 'carousel', 10, 10); // $1,200
    const stall = placeStallDirect(w, 'snack_shack', 20, 20); // $400
    expect(computeParkValue(w)).toBe(base + 120_000 + 40_000);

    // 60 months later the ride is worth 65%; the stall was built 59.5 months ago → 59 whole months.
    stall.builtTick = ride.builtTick + TICKS_PER_MONTH / 2;
    s.tick = ride.builtTick + 60 * TICKS_PER_MONTH;
    expect(computeParkValue(w)).toBe(base + 78_000 + assetValue(40_000, 59));

    placeQueue(w, 5, 5);
    const benchTile = tileIndex(s.map, 6, 6);
    s.map.content[benchTile] = Content.Footpath;
    s.map.pathItem[benchTile] = PathItem.Bench;
    const bench = PATH_ITEMS.find((p) => p.id === 'bench')!.buildCost;
    expect(computeParkValue(w)).toBe(base + 78_000 + assetValue(40_000, 59) + QUEUE_VALUE_COST / 2 + PATH_VALUE_COST / 2 + bench / 2);
  });

  it('uses totalBuildCost for track rides', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10);
    ride.kind = 'track';
    ride.totalBuildCost = 2_345_600;
    expect(computeParkValue(w)).toBe(stubPathValue(w) + 2_345_600);
  });

  it('updateParkValue stores the value in the management slice', () => {
    const w = makeTestWorld();
    placeRideDirect(w, 'big_wheel', 10, 10);
    updateParkValue(w);
    expect(w.state.management.parkValue).toBe(stubPathValue(w) + 180_000);
  });
});
