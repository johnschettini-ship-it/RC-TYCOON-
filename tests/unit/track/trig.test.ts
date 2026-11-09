import { describe, expect, it } from 'vitest';
import { PI, TAU, tcos, tsin, DEG } from '../../../src/sim/trig';

describe('trig lookup tables (phase-2 §4.3)', () => {
  it('matches Math.sin and Math.cos within 1e-6 over several turns', () => {
    let worst = 0;
    for (let i = -20000; i <= 20000; i++) {
      const x = i * 0.000731;
      worst = Math.max(worst, Math.abs(tsin(x) - Math.sin(x)), Math.abs(tcos(x) - Math.cos(x)));
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('hits exact values at quarter turns', () => {
    expect(tsin(0)).toBe(0);
    expect(Math.abs(tsin(PI / 2) - 1)).toBeLessThan(1e-15);
    expect(Math.abs(tcos(PI))).toBeCloseTo(1, 15);
    expect(Math.abs(tsin(TAU))).toBeLessThan(1e-15);
    expect(DEG * 180).toBeCloseTo(PI, 15);
  });

  it('is a pure function (same input, same output)', () => {
    const a = Array.from({ length: 100 }, (_, i) => tsin(i * 0.37));
    const b = Array.from({ length: 100 }, (_, i) => tsin(i * 0.37));
    expect(a).toEqual(b);
  });
});
