/** Phase 4 §4.7 light stamps: `255 × (R + 1 − d) / (R + 1)` (integer division) for d² ≤ R² (Euclidean). Owner: W3-F. */
import { describe, expect, it } from 'vitest';
import { stampTable, stampValue } from '../../../src/sim/lighting/stamps';
import { LIGHT_MAX, LIGHT_RADIUS, LIT_THRESHOLD } from '../../../src/data/tuning/night';

describe('light stamp tables', () => {
  it('give exact integers that match the spec formula', () => {
    for (let r = 1; r <= 4; r++) {
      for (let q = 0; q <= r * r; q++) {
        const d = Math.sqrt(q);
        const ideal = (LIGHT_MAX * (r + 1 - d)) / (r + 1);
        const v = stampValue(r, q);
        expect(Number.isInteger(v)).toBe(true);
        // floor of the ideal value: v ≤ ideal < v + 1
        expect(v).toBeLessThanOrEqual(ideal + 1e-9);
        expect(v + 1).toBeGreaterThan(ideal - 1e-9);
      }
      expect(stampValue(r, r * r + 1)).toBe(0);
    }
  });

  it('are the known values of the lamp radius 3', () => {
    expect([0, 1, 2, 4, 5, 8, 9].map((q) => stampValue(3, q))).toEqual([255, 191, 164, 127, 112, 74, 63]);
  });

  it('cover a Euclidean disc: 5, 13, 29, 49 tiles for R = 1–4', () => {
    expect([1, 2, 3, 4].map((r) => stampTable(r).count)).toEqual([5, 13, 29, 49]);
    const t = stampTable(3);
    for (let k = 0; k < t.count; k++) {
      const dx = t.dx[k] as number;
      const dy = t.dy[k] as number;
      expect(dx * dx + dy * dy).toBeLessThanOrEqual(9);
      expect(t.value[k]).toBe(stampValue(3, dx * dx + dy * dy));
    }
  });

  it('a path lamp alone lights the tiles with d² ≤ 5 (lit threshold 96)', () => {
    const t = stampTable(LIGHT_RADIUS.pathLamp);
    let lit = 0;
    for (let k = 0; k < t.count; k++) {
      const dx = t.dx[k] as number;
      const dy = t.dy[k] as number;
      const isLit = (t.value[k] as number) >= LIT_THRESHOLD;
      expect(isLit).toBe(dx * dx + dy * dy <= 5);
      if (isLit) lit++;
    }
    expect(lit).toBe(21);
  });

  it('memoises one table per radius', () => {
    expect(stampTable(2)).toBe(stampTable(2));
  });
});
