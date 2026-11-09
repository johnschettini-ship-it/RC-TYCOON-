/**
 * Seeded RNG (mulberry32). The only randomness the simulation may use.
 * The generator state lives in `GameState.rng`, so saves and replays are exact.
 */
export interface RngHolder {
  rng: number;
}

export function rngNext(s: RngHolder): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [min, max], both inclusive. */
export function rngInt(s: RngHolder, min: number, max: number): number {
  if (max < min) throw new RangeError(`rngInt: max ${max} < min ${min}`);
  return min + Math.floor(rngNext(s) * (max - min + 1));
}

export function rngChance(s: RngHolder, p: number): boolean {
  return rngNext(s) < p;
}

export function rngPick<T>(s: RngHolder, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('rngPick: empty array');
  return items[rngInt(s, 0, items.length - 1)] as T;
}
