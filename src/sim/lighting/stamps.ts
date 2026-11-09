/**
 * Light stamp tables (Phase 4 §4.7). Owner: W3-F.
 *
 * A source of radius `R` adds `255 × (R + 1 − d) / (R + 1)` (integer division, rounded down) to every tile with
 * `d² ≤ R²`, where `d` is the Euclidean tile distance. The table is computed with integers only, so it is exact on
 * every platform: with `q = d²`, the value is `255 − k` where `k` is the smallest integer with
 * `k² × (R + 1)² ≥ 255² × q` (that is, `k = ceil(255 × d / (R + 1))`).
 */
import { LIGHT_MAX } from '../../data/tuning/night';

export interface StampTable {
  radius: number;
  count: number;
  dx: Int8Array;
  dy: Int8Array;
  value: Uint8Array;
}

/** Stamp value at squared distance `q` for radius `r` (0 outside the disc). */
export function stampValue(r: number, q: number): number {
  if (q > r * r) return 0;
  const lhs = LIGHT_MAX * LIGHT_MAX * q;
  const r1 = (r + 1) * (r + 1);
  let k = 0;
  while (k * k * r1 < lhs) k++;
  return LIGHT_MAX - k;
}

const tables = new Map<number, StampTable>();

/** The stamp offsets of radius `r`, row by row (dy, then dx ascending). Memoised. */
export function stampTable(r: number): StampTable {
  let t = tables.get(r);
  if (t) return t;
  const dx: number[] = [];
  const dy: number[] = [];
  const value: number[] = [];
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const q = x * x + y * y;
      if (q > r * r) continue;
      dx.push(x);
      dy.push(y);
      value.push(stampValue(r, q));
    }
  }
  t = { radius: r, count: dx.length, dx: Int8Array.from(dx), dy: Int8Array.from(dy), value: Uint8Array.from(value) };
  tables.set(r, t);
  return t;
}
