import { describe, expect, it } from 'vitest';
import {
  drawTemperament,
  energyDrainMultiplier,
  maxIntensity,
  minIntensity,
  nauseaGainMultiplier,
  tagFit,
} from '../../../src/sim/guests/temperament';

describe('temperament (Phase 1 §4.3)', () => {
  it('has mean 50 ± 2 over 10,000 draws and stays in 0–100', () => {
    const rng = { rng: 2024 };
    let sum = 0;
    let lo = 100;
    let hi = 0;
    const n = 10_000;
    for (let i = 0; i < n; i++) {
      const t = drawTemperament(rng);
      expect(Number.isInteger(t)).toBe(true);
      sum += t;
      lo = Math.min(lo, t);
      hi = Math.max(hi, t);
    }
    expect(Math.abs(sum / n - 50)).toBeLessThanOrEqual(2);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(100);
  });

  it('is a triangle: the middle third holds more than the outer thirds', () => {
    const rng = { rng: 99 };
    let middle = 0;
    const n = 10_000;
    for (let i = 0; i < n; i++) {
      const t = drawTemperament(rng);
      if (t > 33 && t < 67) middle++;
    }
    // Triangle on [0, 100]: P(33 < T < 67) ≈ 0.56.
    expect(middle / n).toBeGreaterThan(0.5);
  });

  it.each([
    // T, max intensity, min intensity, nausea gain ×, energy drain ×, fit thrill, fit chill, fit family
    [0, 2.0, 0.0, 1.5, 0.8, -1.0, 1.0, 0.3],
    [50, 6.0, 2.5, 1.0, 1.0, 0.0, 0.0, 0.3],
    [100, 10.0, 5.0, 0.5, 1.2, 1.0, -1.0, 0.3],
  ])('derived values at T = %i', (t, maxI, minI, nau, en, fThrill, fChill, fFamily) => {
    // Intensities are integer hundredths, like ride stats.
    expect(maxIntensity(t)).toBe(Math.round(maxI * 100));
    expect(minIntensity(t)).toBe(Math.round(minI * 100));
    expect(nauseaGainMultiplier(t)).toBeCloseTo(nau, 10);
    expect(energyDrainMultiplier(t)).toBeCloseTo(en, 10);
    expect(tagFit(t, 'thrill')).toBeCloseTo(fThrill, 10);
    expect(tagFit(t, 'chill')).toBeCloseTo(fChill, 10);
    expect(tagFit(t, 'family')).toBeCloseTo(fFamily, 10);
  });
});
