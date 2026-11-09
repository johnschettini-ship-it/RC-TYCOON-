/**
 * Field stamps (Phase 4 §4.6): a source of strength `s` adds `s × (R + 1 − d)` to every tile at Chebyshev distance
 * `d ≤ R`. All math is integer. Owner: W3-E.
 *
 * Fields are `Uint16Array`s. Adding and later subtracting the same stamp is exact in modular 16-bit arithmetic, so
 * incremental updates always equal a full rebuild (a raw sum never comes near 65,536 in a real park).
 */
import { FIELD_RADIUS } from '../../data/tuning/fields';

/** Largest radius in the sources table. */
export const MAX_FIELD_RADIUS = Math.max(...Object.values(FIELD_RADIUS));

/** Weight tables per radius: `R + 1 − max(|dx|, |dy|)` for dx, dy in [−R, R], row-major. */
const WEIGHTS: readonly Int32Array[] = (() => {
  const out: Int32Array[] = [];
  for (let r = 0; r <= MAX_FIELD_RADIUS; r++) {
    const side = 2 * r + 1;
    const t = new Int32Array(side * side);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) t[(dy + r) * side + (dx + r)] = r + 1 - Math.max(Math.abs(dx), Math.abs(dy));
    }
    out.push(t);
  }
  return out;
})();

/**
 * Add `s` (negative to remove) times the radius-`r` stamp centred on (x, y) to `field` (`w` × `h`), clipped to the
 * map. Cost `(2r + 1)²`. No allocation.
 */
export function stamp(field: Uint16Array, w: number, h: number, x: number, y: number, r: number, s: number): void {
  if (s === 0) return;
  const table = WEIGHTS[r];
  if (table === undefined) return;
  const side = 2 * r + 1;
  const y0 = y - r < 0 ? 0 : y - r;
  const y1 = y + r >= h ? h - 1 : y + r;
  const x0 = x - r < 0 ? 0 : x - r;
  const x1 = x + r >= w ? w - 1 : x + r;
  for (let ty = y0; ty <= y1; ty++) {
    const row = ty * w;
    const trow = (ty - y + r) * side - x + r;
    for (let tx = x0; tx <= x1; tx++) field[row + tx] = (field[row + tx] as number) + s * (table[trow + tx] as number);
  }
}
