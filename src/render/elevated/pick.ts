/**
 * Picking elevated paths (Phase 4 §4.2, §7). Owner: W3-B.
 * The elevated layer draws each deck as the top face of its view tile lifted to its height (a ramp deck tilted
 * toward `rampDir`), always over the terrain. `pickElevatedPath` finds the deck under a world-pixel point with the
 * same geometry, so the tools can send `demolish { z }` and `buildPathItem { level }` for the deck the player sees.
 */
import type { ElevatedPath } from '../../sim/paths/types';
import { RAMP_MASK } from '../../sim/paths/nodes';
import type { World } from '../../sim/types';
import { STEP_PX, TILE_H, TILE_W } from '../iso';
import { mapToView, rotateSlopeMask, type ViewRotation } from '../view';

const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

/** View corner offsets [N', E', S', W'] of a view tile's top face: (du, dv). */
const CORNER_DU = [0, 1, 1, 0];
const CORNER_DV = [0, 0, 1, 1];

const cx = new Float64Array(4);
const cy = new Float64Array(4);

/** Signed area test: is (px, py) inside or on triangle (a, b, c)? */
function inTriangle(px: number, py: number, ax: number, ay: number, bx: number, by: number, qx: number, qy: number): boolean {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - qx) * (by - qy) - (bx - qx) * (py - qy);
  const d3 = (px - ax) * (qy - ay) - (qx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** Does the drawn deck of `p` (view rotation `r`) contain the world-pixel point (sx, sy)? */
export function deckContains(world: World, p: ElevatedPath, r: ViewRotation, sx: number, sy: number): boolean {
  const map = world.state.map;
  const { u, v } = mapToView(p.x, p.y, r, map.width, map.height);
  const mask = p.rampDir >= 0 ? rotateSlopeMask(RAMP_MASK[p.rampDir] as number, r) : 0;
  for (let c = 0; c < 4; c++) {
    const cu = u + (CORNER_DU[c] as number);
    const cv = v + (CORNER_DV[c] as number);
    cx[c] = (cu - cv) * HALF_W;
    cy[c] = (cu + cv) * HALF_H - (p.z + ((mask >> c) & 1)) * STEP_PX;
  }
  // The two triangles of the face, split along the W'–E' diagonal like the terrain: N'-E'-W' and E'-S'-W'.
  return (
    inTriangle(sx, sy, cx[0] as number, cy[0] as number, cx[1] as number, cy[1] as number, cx[3] as number, cy[3] as number) ||
    inTriangle(sx, sy, cx[1] as number, cy[1] as number, cx[2] as number, cy[2] as number, cx[3] as number, cy[3] as number)
  );
}

/**
 * The elevated path whose deck is drawn under world-pixel point (sx, sy) at view rotation `r`, or null. When decks
 * overlap on screen, the front one wins (largest view depth u + v), then the higher one.
 */
export function pickElevatedPath(world: World, sx: number, sy: number, r: ViewRotation = 0): ElevatedPath | null {
  const map = world.state.map;
  let best: ElevatedPath | null = null;
  let bestDepth = -Infinity;
  for (const p of world.state.elevatedPaths) {
    if (!deckContains(world, p, r, sx, sy)) continue;
    const { u, v } = mapToView(p.x, p.y, r, map.width, map.height);
    const depth = u + v;
    if (best === null || depth > bestDepth || (depth === bestDepth && p.z > best.z)) {
      best = p;
      bestDepth = depth;
    }
  }
  return best;
}
