/**
 * Deterministic trigonometry (phase-2 §4.3). Owner: W1-G.
 * The simulation never calls Math.sin or Math.cos: their results may differ between engines.
 * The table is built once with a fixed polynomial that uses only + − × ÷, which IEEE 754 doubles
 * evaluate identically everywhere. Lookups interpolate linearly (error < 3e-7).
 */

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
/** Radians per degree. */
export const DEG = PI / 180;

/** Table entries per full turn. Divisible by 4 so quarter turns land on exact entries. */
const N = 4096;
const STEP = TAU / N;
const INV_STEP = N / TAU;

/** sin(x) for x in [0, π/2] by its Taylor series (degree 23; truncation error < 1e-17). */
function polySin(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let k = 1; k <= 11; k++) {
    term = (-term * x2) / ((2 * k) * (2 * k + 1));
    sum += term;
  }
  return sum;
}

const TABLE: Float64Array = (() => {
  const t = new Float64Array(N + 2);
  const q = N / 4;
  for (let i = 0; i <= q; i++) t[i] = polySin(i * STEP);
  for (let i = q + 1; i <= 2 * q; i++) t[i] = t[2 * q - i] as number;
  for (let i = 2 * q + 1; i <= N; i++) t[i] = -(t[i - 2 * q] as number);
  t[2 * q] = 0;
  t[N] = 0;
  t[N + 1] = t[1] as number;
  return t;
})();

/** Deterministic sine. */
export function tsin(x: number): number {
  let r = x - Math.floor(x / TAU) * TAU;
  if (r < 0) r = 0;
  const f = r * INV_STEP;
  let i = Math.floor(f);
  if (i >= N) i = N - 1;
  const frac = f - i;
  const a = TABLE[i] as number;
  if (frac === 0) return a;
  const b = TABLE[i + 1] as number;
  return a + (b - a) * frac;
}

/** Deterministic cosine. */
export function tcos(x: number): number {
  return tsin(x + PI / 2);
}
