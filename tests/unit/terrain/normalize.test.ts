import { describe, expect, it } from 'vitest';
import { MAX_CORNER_HEIGHT } from '../../../src/data/tuning/terrain';
import { normalizeCorners, setTileCorners } from '../../../src/sim/terrain/normalize';
import { cornerHeightsOf, maxCorner, minCorner } from '../../../src/sim/terrain/corners';
import { CORNER_BIT, type CornerHeights } from '../../../src/sim/terrain/types';
import { generateMap, tileIndex } from '../../../src/sim/map';

/** Corner heights a normalized tile stands for. */
function cornersOf(height: number, slope: number): number[] {
  return CORNER_BIT.map((b) => height + ((slope & b) !== 0 ? 1 : 0));
}

describe('normalize rule (Phase 4 §4.1)', () => {
  it('every 4-corner combination with spread 0–3 gives a valid height and slope', () => {
    let checked = 0;
    for (const base of [0, 1, 8, 30, 60]) {
      for (let a = 0; a <= 3; a++)
        for (let b = 0; b <= 3; b++)
          for (let c = 0; c <= 3; c++)
            for (let d = 0; d <= 3; d++) {
              const input: CornerHeights = [base + a, base + b, base + c, base + d];
              const m = Math.min(...input);
              const n = normalizeCorners(input);
              // Step 3: base and corners stay in 0–63; the mask is a 4-bit mask that is never all 4 bits.
              expect(n.height).toBeGreaterThanOrEqual(0);
              expect(n.height).toBeLessThanOrEqual(MAX_CORNER_HEIGHT);
              expect(n.slope).toBeGreaterThanOrEqual(0);
              expect(n.slope).toBeLessThan(15);
              const out = cornersOf(n.height, n.slope);
              for (const v of out) expect(v).toBeLessThanOrEqual(MAX_CORNER_HEIGHT);
              // Steps 1–2: height = min, corners above m + 1 drop to m + 1, slope = corners at m + 1.
              expect(n.height).toBe(m);
              expect(out).toEqual(input.map((v) => Math.min(v, m + 1)));
              checked++;
            }
    }
    expect(checked).toBe(5 * 256);
  });

  it('keeps every corner in 0–63 at the top and bottom of the range', () => {
    expect(normalizeCorners([63, 63, 63, 63])).toEqual({ height: 63, slope: 0 });
    expect(normalizeCorners([63, 62, 62, 62])).toEqual({ height: 62, slope: 1 });
    expect(normalizeCorners([0, 1, 3, 0])).toEqual({ height: 0, slope: 2 | 4 });
    // Out-of-range input is clamped first (callers reject it before, with the §4.1 strings).
    expect(normalizeCorners([64, 63, 63, 63])).toEqual({ height: 63, slope: 0 });
    expect(normalizeCorners([-1, 0, 0, 0])).toEqual({ height: 0, slope: 0 });
  });

  it('setTileCorners writes the normalized result into the map', () => {
    const map = generateMap();
    const i = tileIndex(map, 10, 10);
    setTileCorners(map, i, [9, 8, 8, 8]);
    expect(map.heights[i]).toBe(8);
    expect(map.slope[i]).toBe(1);
    expect(cornerHeightsOf(map, i)).toEqual([9, 8, 8, 8]);
    setTileCorners(map, i, [6, 8, 8, 8]);
    expect(cornerHeightsOf(map, i)).toEqual([6, 7, 7, 7]);
    expect(minCorner(map, i)).toBe(6);
    expect(maxCorner(map, i)).toBe(7);
  });
});
