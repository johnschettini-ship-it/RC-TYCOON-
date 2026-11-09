/**
 * Litter and mess decal placement (Phase 3 §4.3: "The renderer places items at sub-positions from a hash
 * of tile index and item index. This is deterministic."). Owner: W2-B. Pure; writes into a caller record.
 */
import { mix32 } from '../palette';

/** Litter looks: cup, wrapper, can, napkin. */
export const LITTER_VARIANTS = 4;
export const MESS_VARIANTS = 2;

export interface DecalSlot {
  /** Local tile coordinates (0–1 along x and y). */
  u: number;
  v: number;
  variant: number;
  /** Mirror the decal (0 or 1). */
  flip: number;
}

const LITTER_SALT = 0x5bd1e995;
const MESS_SALT = 0x27d4eb2f;
const LITTER_MIN = 0.12;
const LITTER_SPAN = 0.76;
const MESS_MIN = 0.32;
const MESS_SPAN = 0.36;

/** Map 12 hash bits to [min, min + span]. */
function unit(h: number, shift: number, min: number, span: number): number {
  return min + (((h >>> shift) & 0xfff) / 0xfff) * span;
}

/**
 * Litter item `k` (0–7) on `tile`. Items 0–7 use the 8 cells of a jittered 3 × 3 grid (centre left
 * free for walking guests), so the items on one tile never sit on top of each other.
 */
export function litterSlot(tile: number, k: number, out: DecalSlot): DecalSlot {
  const h = mix32(Math.imul(tile, 8) + k + LITTER_SALT);
  const g = mix32(h ^ tile);
  // Rotate the cell order per tile so tiles look different.
  const cell = (k + (g % 8)) % 8;
  const c = cell >= 4 ? cell + 1 : cell;
  const cx = c % 3;
  const cy = (c - cx) / 3;
  const third = LITTER_SPAN / 3;
  out.u = LITTER_MIN + cx * third + unit(h, 0, 0.1, 0.8) * third;
  out.v = LITTER_MIN + cy * third + unit(h, 12, 0.1, 0.8) * third;
  out.variant = (h >>> 24) % LITTER_VARIANTS;
  out.flip = (h >>> 30) & 1;
  return out;
}

/** Mess item `k` (0–1) on `tile`: a puddle near the tile centre. */
export function messSlot(tile: number, k: number, out: DecalSlot): DecalSlot {
  const h = mix32(Math.imul(tile, 2) + k + MESS_SALT);
  out.u = unit(h, 0, MESS_MIN, MESS_SPAN);
  out.v = unit(h, 12, MESS_MIN, MESS_SPAN);
  out.variant = (h >>> 24) % MESS_VARIANTS;
  out.flip = (h >>> 30) & 1;
  return out;
}
