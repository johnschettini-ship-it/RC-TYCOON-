/**
 * Integer helpers for the map generator (Phase 5 §4.2 determinism rule): only `+ − × /`, `Math.floor`, `Math.round`,
 * `Math.imul`, and bit operations, so generation gives the same numbers in every browser. Owner: W3-H.
 */

/** floor(√n) for a non-negative safe integer (Newton's method on integers). */
export function isqrt(n: number): number {
  if (n < 2) return n < 0 ? 0 : Math.floor(n);
  let x = n;
  let y = Math.floor((x + 1) / 2);
  while (y < x) {
    x = y;
    y = Math.floor((x + Math.floor(n / x)) / 2);
  }
  return x;
}

/** a / b rounded half up, for b > 0. */
export function roundDiv(a: number, b: number): number {
  return Math.floor((2 * a + b) / (2 * b));
}

/** a / b rounded up, for b > 0. */
export function ceilDiv(a: number, b: number): number {
  return -Math.floor(-a / b);
}

function mix(h: number, k: number): number {
  let x = Math.imul(k | 0, 0xcc9e2d51);
  x = (x << 15) | (x >>> 17);
  x = Math.imul(x, 0x1b873593);
  let y = h ^ x;
  y = (y << 13) | (y >>> 19);
  return (Math.imul(y, 5) + 0xe6546b64) | 0;
}

/** Murmur3-style hash of four integers (the `Math.imul` finalizer of Phase 5 §4.2). Unsigned 32-bit. */
export function hash4(seed: number, a: number, b: number, c: number): number {
  let h = mix(mix(mix(seed | 0, a), b), c) ^ 16;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 2^k for a small non-negative integer k (no `Math.pow`). */
export function pow2(k: number): number {
  let v = 1;
  for (let i = 0; i < k; i++) v *= 2;
  return v;
}
