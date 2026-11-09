/**
 * Where a bench, bin, or lamp stands on its footpath tile. Owner: W2-B. Pure.
 * Items stand at an edge with no path join, back edges first (north, west), so they do not block the
 * walking line and rarely hide guests. Join mask bits: N = 1, E = 2, S = 4, W = 8 (`render/paths.ts`).
 */

export interface ItemPlacement {
  /** Local tile coordinates of the item's base centre. */
  u: number;
  v: number;
  /** The item's long side runs along map x (else along y). */
  alongX: boolean;
}

const EDGE = 0.14;
const CORNER = 0.16;

export function pathItemPlacement(joinMask: number, out: ItemPlacement): ItemPlacement {
  if ((joinMask & 1) === 0) {
    out.u = 0.5;
    out.v = EDGE;
    out.alongX = true;
  } else if ((joinMask & 8) === 0) {
    out.u = EDGE;
    out.v = 0.5;
    out.alongX = false;
  } else if ((joinMask & 2) === 0) {
    out.u = 1 - EDGE;
    out.v = 0.5;
    out.alongX = false;
  } else if ((joinMask & 4) === 0) {
    out.u = 0.5;
    out.v = 1 - EDGE;
    out.alongX = true;
  } else {
    out.u = CORNER;
    out.v = CORNER;
    out.alongX = true;
  }
  return out;
}
