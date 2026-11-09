/**
 * The music's own seeded RNG (Phase 6 §4.1: audio never uses the sim RNG). Owner: W4-B.
 * mulberry32 on a private state, plus a small integer hash to derive seeds.
 */

export interface MusicRng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, n). */
  int(n: number): number;
  chance(p: number): boolean;
  /** Index drawn with integer weights (at least one weight > 0). */
  weighted(weights: readonly number[]): number;
}

export function musicRng(seed: number): MusicRng {
  let s = seed | 0;
  const next = (): number => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
    weighted(weights) {
      let total = 0;
      for (const w of weights) total += w;
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i] as number;
        if (r < 0) return i;
      }
      for (let i = weights.length - 1; i >= 0; i--) if ((weights[i] as number) > 0) return i;
      return 0;
    },
  };
}

/** Mix integers into one 32-bit seed (murmur3 finalizer per step). */
export function mixSeed(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) {
    h = Math.imul(h ^ (p | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}
