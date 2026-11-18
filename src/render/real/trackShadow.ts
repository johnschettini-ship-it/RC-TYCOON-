/**
 * Track shadows in the realistic look (phase 8c batch 5 Task 4). The bake lights every picture with one sun, fixed to
 * the screen (tools/art3d/bakePage.ts `VT.sun`: from the screen's left, 52° high, azimuth 128° in the bake's axes,
 * which are view axes since the bake camera never turns), so the shadow a metre of height casts is one fixed screen
 * vector, `sunShift()`, whatever the view turn.
 *
 * - Rails: the bake shadows each rail tile picture's rail onto a flat plane `SHADOW_PLANE_BELOW_M` under the tile's
 *   lowest rail (`railMin`, so no part of the piece is under it), frame `[pieceId, t<i>, 'sh']` in the rail class set,
 *   drawn untinted. The game draws it at the rail's anchor shifted by `(plane − ground) × sunShift()`: the shadow
 *   then lies on the tile's ground.
 * - Supports: frames `foot:sh`, `seg:sh`, `top:sh` in the support set, each the part's shadow onto a plane at its own
 *   anchor; the game draws one per stacked piece, shifted by `(piece height − ground) × sunShift()`.
 * - Cars (owner decision D1 a): no art. A soft ellipse drawn live under each car at its ground point, shifted by the
 *   car's height the same way.
 * Heights are true (STEP_PX, set to REAL_STEP_PX in the realistic build). The ground under a shadow is taken flat at
 * the tile's (or the car's tile's) height: a shadow reaching onto a slope is not bent over it.
 */
import type { ArtBounds } from '../sprites/rides';
import { isoX, isoY, PX_X } from '../track/project';
import { STEP_PX } from '../heightStep';
import { SHADOW_PLANE_BELOW_M, SUN_AZ_DEG, SUN_EL_DEG } from './trackShadowPlane';

export { SHADOW_PLANE_BELOW_M, SUN_AZ_DEG, SUN_EL_DEG };

/** Darkness of the live car shadow at its middle (the baked shadows are drawn at 0.5 on a shadow catcher). */
export const CAR_SHADOW_ALPHA = 0.42;
/** Half-width of a car's shadow (m); its half-length is half the car's length. */
export const CAR_SHADOW_HALF_W = 0.75;

const shift = { x: 0, y: 0 };

/**
 * World px (zoom 1) a shadow moves per metre its caster stands above the ground it falls on: the horizontal run of the
 * sun's ray (cot elevation, away from the sun, in view axes) projected, plus the metre of height dropped. One object,
 * refreshed on each call (STEP_PX can change once at start-up).
 */
export function sunShift(): { readonly x: number; readonly y: number } {
  const el = (SUN_EL_DEG * Math.PI) / 180, az = (SUN_AZ_DEG * Math.PI) / 180;
  // The bake stretches its models up by heightScale (a metre of height lands on STEP_PX: tools/art3d/camera.ts) under an
  // unstretched sun, so a metre's ray runs heightScale × cot el across the ground (1.0002 in the realistic build).
  const heightScale = STEP_PX / (Math.SQRT2 * PX_X * Math.cos(Math.PI / 6));
  const run = (heightScale * Math.cos(el)) / Math.sin(el);
  const vx = -run * Math.cos(az), vy = -run * Math.sin(az);
  shift.x = isoX(vx, vy) - isoX(0, 0);
  shift.y = isoY(vx, vy, -1) - isoY(0, 0, 0);
  return shift;
}

/** Px beyond a shadow's moved bounds: the soft edge of baked shadows and of the car ellipse. */
const SHADOW_EDGE_PX = 4;

/**
 * Bounds `b` (world px around an anchor, zoom 1) grown to hold the drawable's shadow (review P2: culling by the rail
 * or car alone made a tall lift's shadow pop at the screen's edge). Every point of the drawable stands between `hLo` and
 * `hHi` m over the ground its shadow falls on, and its shadow is the point moved by that height × `sunShift()`, so the
 * shadow lies inside `b` swept along the shift from `hLo` to `hHi`. Written into `out`.
 */
export function withShadowReach(b: ArtBounds, hLo: number, hHi: number, out: ArtBounds): ArtBounds {
  const s = sunShift();
  const x0 = hLo * s.x, x1 = hHi * s.x, y0 = hLo * s.y, y1 = hHi * s.y;
  out.left = b.left + Math.min(0, x0, x1) - SHADOW_EDGE_PX;
  out.right = b.right + Math.max(0, x0, x1) + SHADOW_EDGE_PX;
  out.top = b.top + Math.min(0, y0, y1) - SHADOW_EDGE_PX;
  out.bottom = b.bottom + Math.max(0, y0, y1) + SHADOW_EDGE_PX;
  return out;
}

/** The height of a rail tile's shadow plane (absolute m) from the tile's lowest rail. */
export const railShadowPlane = (railMin: number): number => railMin - SHADOW_PLANE_BELOW_M;
