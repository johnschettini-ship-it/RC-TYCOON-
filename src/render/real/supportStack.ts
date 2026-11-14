/**
 * How the realistic look stacks a baked support (Task 9b; bake: tools/art3d/items/steel_coaster.js). A support set
 * holds three pieces per saddle heading:
 *   `foot` a concrete footing, anchored at the column axis on the ground;
 *   `seg`  a 1 m column segment, anchored at its bottom centre, drawn 1.1 m tall so stacked segments overlap;
 *   `top`  the saddle plate (0.22 m) and post (to 0.67 m), anchored at the plate's bottom on the axis.
 * The top is placed `SUPPORT_TOP_BELOW_RAIL` m under the rail line, so its post ends just inside the bottom of the
 * baked rail spine (0.27 – 0.57 m under the rail line); the rail draws over that overlap.
 */
import type { SupportPart } from './look';

/** Height of the baked `top` piece: plate 0.22 m + post 0.45 m. */
export const SUPPORT_TOP_HEIGHT = 0.67;
/** The `top` anchor under the rail line (m): the post top 0.53 m under it, 0.04 m into the spine's bottom face. */
export const SUPPORT_TOP_BELOW_RAIL = 1.2;
/** Columns shorter than this keep their footing (the footing is 0.25 m high). */
const FOOT_H = 0.25;

export interface SupportPiece {
  part: SupportPart;
  /** Anchor height (m, absolute, like the rail and the ground). */
  z: number;
}

/**
 * The pieces of one support, in draw order (bottom-up): the foot at `groundZ`, one segment per metre of column
 * (segment i at i m above the ground; the last one moved down so it ends 0.1 m above the column top, under the
 * plate, never through it), then the top. A rail too low for a column gets only its saddle, on the ground.
 */
export function supportStack(railZ: number, groundZ: number): SupportPiece[] {
  const top = railZ - SUPPORT_TOP_BELOW_RAIL;
  const h = top - groundZ;
  if (h <= 0) return [{ part: 'top', z: groundZ }];
  const out: SupportPiece[] = [{ part: 'foot', z: groundZ }];
  if (h > FOOT_H) {
    const n = Math.ceil(h - 1e-9);
    for (let i = 0; i < n; i++) out.push({ part: 'seg', z: groundZ + Math.max(0, Math.min(i, h - 1)) });
  }
  out.push({ part: 'top', z: top });
  return out;
}
