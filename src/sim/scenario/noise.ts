/**
 * Value noise for the map generator (Phase 5 §4.2). Owner: W3-H.
 * Integer lattice hash of (seed, ix, iy, octave), smoothstep interpolation, octaves with lacunarity 2 and gain 0.5.
 * Fixed point: noise values and weights are 0 … NOISE_ONE − 1 (16 fraction bits). Integer math only.
 */
import { NOISE_ONE } from '../../data/tuning/scenario';
import { hash4, pow2, roundDiv } from './intmath';

/** Lattice value of point (ix, iy) at `octave`: 0 … NOISE_ONE − 1. */
export function latticeValue(seed: number, ix: number, iy: number, octave: number): number {
  return hash4(seed, ix, iy, octave) >>> 16;
}

/** t²(3 − 2t) in fixed point, for 0 ≤ t < NOISE_ONE. */
export function smoothstep(t: number): number {
  const t2 = Math.floor((t * t) / NOISE_ONE);
  return Math.floor((t2 * (3 * NOISE_ONE - 2 * t)) / NOISE_ONE);
}

function lerp(a: number, b: number, s: number): number {
  return a + Math.floor(((b - a) * s) / NOISE_ONE);
}

/** One octave at integer point (x, y) with lattice cells of `cell` tiles: 0 … NOISE_ONE − 1. */
export function valueNoise(seed: number, x: number, y: number, cell: number, octave: number): number {
  const ix = Math.floor(x / cell);
  const iy = Math.floor(y / cell);
  const sx = smoothstep(Math.floor(((x - ix * cell) * NOISE_ONE) / cell));
  const sy = smoothstep(Math.floor(((y - iy * cell) * NOISE_ONE) / cell));
  const top = lerp(latticeValue(seed, ix, iy, octave), latticeValue(seed, ix + 1, iy, octave), sx);
  const bottom = lerp(latticeValue(seed, ix, iy + 1, octave), latticeValue(seed, ix + 1, iy + 1, octave), sx);
  return lerp(top, bottom, sy);
}

/**
 * Fractal value noise n in fixed point: octave o has cells of `scale / 2^o` tiles (at least 1) and weight
 * `2^(octaves − 1 − o)` (gain 0.5); the weighted mean is floored.
 */
export function fractalNoise(seed: number, x: number, y: number, scale: number, octaves: number): number {
  const count = Math.max(1, Math.floor(octaves));
  let sum = 0;
  let total = 0;
  for (let o = 0; o < count; o++) {
    const cell = Math.max(1, Math.floor(Math.max(1, scale) / pow2(o)));
    const weight = pow2(count - 1 - o);
    sum += weight * valueNoise(seed, x, y, cell, o);
    total += weight;
  }
  return Math.floor(sum / total);
}

/** Height change `round(amplitude × (2n − 1))` for a fixed-point n (Phase 5 §4.2 step 2). */
export function noiseDelta(amplitude: number, n: number): number {
  if (amplitude === 0) return 0;
  const max = NOISE_ONE - 1;
  return roundDiv(amplitude * (2 * n - max), max);
}
