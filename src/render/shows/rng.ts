/**
 * Render RNG for show visuals (Phase 6 §4.4). Owner: W4-C. Never `GameState.rng` and never `Math.random`: the seed comes
 * from `(site.id, site.startTick)`, so a replay of the same show looks and sounds the same.
 */

/** mulberry32 state holder (render only). */
export interface RenderRng {
  s: number;
}

/** Seed of one show: the site id and the tick its show started. */
export function showSeed(siteId: number, startTick: number): number {
  let h = 0x9e3779b9 ^ Math.imul(siteId | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= Math.imul(startTick | 0, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 16), 0x165667b1);
  return (h ^ (h >>> 15)) >>> 0;
}

export function renderRng(seed: number): RenderRng {
  return { s: seed >>> 0 };
}

/** Next float in [0, 1). */
export function rnext(r: RenderRng): number {
  let t = (r.s = (r.s + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [min, max]. */
export function rint(r: RenderRng, min: number, max: number): number {
  return min + Math.floor(rnext(r) * (max - min + 1));
}

/** Float in [min, max). */
export function rrange(r: RenderRng, min: number, max: number): number {
  return min + rnext(r) * (max - min);
}

/** Stateless hash of (seed, i) to [0, 1): per-particle jitter without storing arrays. */
export function hash01(seed: number, i: number): number {
  let h = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
