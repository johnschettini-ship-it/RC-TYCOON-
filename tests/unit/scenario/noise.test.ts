/** Phase 5 §4.2 value noise: integer lattice hash, smoothstep, octaves (lacunarity 2, gain 0.5), basic math only. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOISE_ONE } from '../../../src/data/tuning/scenario';
import { hash4, isqrt, roundDiv } from '../../../src/sim/scenario/intmath';
import { fractalNoise, latticeValue, noiseDelta, smoothstep, valueNoise } from '../../../src/sim/scenario/noise';

describe('integer helpers', () => {
  it('isqrt is the floor square root', () => {
    for (let n = 0; n < 5000; n++) {
      const r = isqrt(n);
      expect(r * r <= n && (r + 1) * (r + 1) > n, `n = ${n}`).toBe(true);
    }
    expect(isqrt(4_294_967_296)).toBe(65_536);
    expect(isqrt(1e12 + 1)).toBe(1_000_000);
  });

  it('roundDiv rounds halves up, also for negative numerators', () => {
    expect(roundDiv(5, 2)).toBe(3);
    expect(roundDiv(-5, 2)).toBe(-2);
    expect(roundDiv(7, 3)).toBe(2);
    expect(roundDiv(-7, 3)).toBe(-2);
    expect(roundDiv(0, 9)).toBe(0);
  });

  it('hash4 is a stable unsigned 32-bit hash', () => {
    expect(hash4(1, 2, 3, 4)).toBe(hash4(1, 2, 3, 4));
    expect(hash4(1, 2, 3, 4)).not.toBe(hash4(1, 2, 3, 5));
    expect(hash4(1, 2, 3, 4)).not.toBe(hash4(2, 2, 3, 4));
    for (const v of [hash4(0, 0, 0, 0), hash4(-1, -7, 99, 3), hash4(0x7fffffff, 1, 2, 3)]) {
      expect(Number.isInteger(v) && v >= 0 && v < 2 ** 32).toBe(true);
    }
  });
});

describe('value noise', () => {
  it('smoothstep is 0 at 0, half at half, and below one', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(NOISE_ONE / 2)).toBe(NOISE_ONE / 2);
    expect(smoothstep(NOISE_ONE - 1)).toBeLessThan(NOISE_ONE);
    let prev = -1;
    for (let t = 0; t < NOISE_ONE; t += 97) {
      const s = smoothstep(t);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('equals the lattice value on lattice points and stays in range between them', () => {
    expect(valueNoise(42, 32, 16, 16, 0)).toBe(latticeValue(42, 2, 1, 0));
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        const n = valueNoise(42, x, y, 7, 1);
        expect(Number.isInteger(n) && n >= 0 && n < NOISE_ONE).toBe(true);
      }
    }
  });

  it('is deterministic: the same seed gives the same field, another seed a different one', () => {
    const field = (seed: number): number[] => {
      const out: number[] = [];
      for (let y = 0; y < 33; y++) for (let x = 0; x < 33; x++) out.push(fractalNoise(seed, x, y, 16, 3));
      return out;
    };
    expect(field(7)).toEqual(field(7));
    expect(field(7)).not.toEqual(field(8));
  });

  it('pins known values (same numbers in every browser)', () => {
    expect([fractalNoise(1101, 0, 0, 16, 2), fractalNoise(1101, 13, 29, 16, 2), fractalNoise(99, 200, 5, 24, 4)]).toMatchInlineSnapshot(`
      [
        29387,
        30502,
        44540,
      ]
    `);
  });

  it('delta = round(amplitude × (2n − 1)) spans −amplitude to +amplitude', () => {
    expect(noiseDelta(4, 0)).toBe(-4);
    expect(noiseDelta(4, NOISE_ONE - 1)).toBe(4);
    expect(noiseDelta(4, (NOISE_ONE - 1) / 2)).toBe(0);
    expect(noiseDelta(0, 1234)).toBe(0);
  });
});

describe('determinism rule (Phase 5 §4.2)', () => {
  it('generator code uses no Math function outside floor, round, imul, min, max, abs', () => {
    const dir = join(__dirname, '../../../src/sim/scenario');
    const allowed = new Set(['floor', 'round', 'imul', 'min', 'max', 'abs']);
    for (const file of readdirSync(dir)) {
      const src = readFileSync(join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const m of src.matchAll(/Math\.(\w+)/g)) expect(allowed.has(m[1] as string), `${file}: Math.${m[1]}`).toBe(true);
      expect(/[\w)\]]\s*\*\*\s*[\w(]/.test(src), `${file}: ** operator`).toBe(false);
    }
  });
});
