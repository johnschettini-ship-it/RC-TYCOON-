/**
 * Realistic look only (2026-11-20): track shadows on the ground under them, slopes included. The baked rail and support
 * shadows lie on a horizontal plane and the car's ellipse is drawn flat; drawn shifted by the caster's height over its
 * own tile, a shadow reaching onto a hillside floated over it or sank into it.
 *
 * `shadowGround` follows the sun ray from one point of the caster (the slice's tile centre, a support's column, a car)
 * to the ground (`surfaceHeight`, the surface the terrain painter draws) and fits the ground's plane there. Every point
 * of a shadow drawn on a horizontal plane then slides further along its own ray by `shadowDrop` m until it meets that
 * plane; across a picture that slide is an affine map of the screen (`skewedShadowTransform`), so a whole shadow sprite
 * is moved and skewed with one canvas transform. Per drawable: a handful of height lookups, no per-pixel work, nothing
 * allocated (the caller keeps one `ShadowGround`). On flat ground the skew is zero and the drop is the height over the
 * ground: exactly the shift drawn before. A shadow is fitted to one plane only: one reaching across a slope's edge onto
 * other ground is not split there.
 */
import { TILE_M } from '../../data/tuning/track';
import { STEP_PX, surfaceHeight } from '../iso';
import type { MapState } from '../../sim/map';
import { projectX, projectY, type ViewFrame } from '../track/project';
import { sunShift } from './trackShadow';

type GroundMap = Pick<MapState, 'width' | 'height' | 'heights' | 'slope'>;

/** The ground plane under one shadow, and the sun's run on the map. Written by `shadowGround`. */
export interface ShadowGround {
  /** Where the ray from the sampled point meets the ground (m) and the ground's height there. */
  qx: number;
  qy: number;
  g0: number;
  /** The ground's rise per metre along map x and y there. */
  gx: number;
  gy: number;
  /** The sun ray's run on the map per metre it drops (m). */
  rx: number;
  ry: number;
  /** How a shadow point's drop changes per world px it sits across the screen, on a horizontal plane. */
  kx: number;
  ky: number;
}

export function newShadowGround(): ShadowGround {
  return { qx: 0, qy: 0, g0: 0, gx: 0, gy: 0, rx: 0, ry: 0, kx: 0, ky: 0 };
}

/** Half the step (m) of the ground's slope sample. */
const SLOPE_STEP_M = 0.25;
/** Passes of the ray-ground fixed point (|ground slope × run| ≤ 0.3: converged far below a pixel). */
const RAY_PASSES = 5;

/** The view's projection terms and the sun's run on the map, kept per view frame (it changes with the view turn). */
const terms = { f: null as ViewFrame | null, step: 0, a: 0, b: 0, c: 0, d: 0, det: 1, rx: 0, ry: 0 };

function viewTerms(f: ViewFrame): typeof terms {
  if (terms.f === f && terms.step === STEP_PX) return terms;
  // The sun's run on the map: a metre of drop moves a point's screen position by sunShift(); a map move (rx, ry) moves
  // it by J (rx, ry), and the drop itself by STEP_PX down, so J (rx, ry) = shift − (0, step).
  const sh = sunShift();
  const ox = projectX(0, 0, f);
  const oy = projectY(0, 0, 0, f);
  terms.a = projectX(1, 0, f) - ox;
  terms.b = projectX(0, 1, f) - ox;
  terms.c = projectY(1, 0, 0, f) - oy;
  terms.d = projectY(0, 1, 0, f) - oy;
  terms.det = terms.a * terms.d - terms.b * terms.c;
  const vx = sh.x;
  const vy = sh.y - STEP_PX;
  terms.rx = (terms.d * vx - terms.b * vy) / terms.det;
  terms.ry = (terms.a * vy - terms.c * vx) / terms.det;
  terms.f = f;
  terms.step = STEP_PX;
  return terms;
}

const height = (map: GroundMap, x: number, y: number): number => surfaceHeight(map, x / TILE_M, y / TILE_M);

/**
 * Sample the ground under the shadow of point (x, y, z) m in view `f` into `out`. False when the ray meets the ground
 * off the map (nothing is drawn there).
 */
export function shadowGround(map: GroundMap, x: number, y: number, z: number, f: ViewFrame, out: ShadowGround): boolean {
  const v = viewTerms(f);
  const { a, b, c, d, det, rx, ry } = v;
  // The ray's ground point: a fixed point of q = p + (z − ground(q)) r.
  let g = height(map, x, y);
  let qx = x;
  let qy = y;
  for (let i = 0; i < RAY_PASSES; i++) {
    qx = x + (z - g) * rx;
    qy = y + (z - g) * ry;
    g = height(map, qx, qy);
  }
  if (!(qx >= 0 && qy >= 0 && qx < map.width * TILE_M && qy < map.height * TILE_M)) return false;
  const e = SLOPE_STEP_M;
  const gx = (height(map, qx + e, qy) - height(map, qx - e, qy)) / (2 * e);
  const gy = (height(map, qx, qy + e) - height(map, qx, qy - e)) / (2 * e);
  out.qx = qx;
  out.qy = qy;
  out.g0 = g;
  out.gx = gx;
  out.gy = gy;
  out.rx = rx;
  out.ry = ry;
  if (gx === 0 && gy === 0) {
    out.kx = 0;
    out.ky = 0;
    return true;
  }
  // A point p on a horizontal plane drops s(p) = (z − g0 − G·(p − q)) / (1 + G·r): ds/dp = −G / (1 + G·r). Its screen
  // position moves by J dp, so ds/dS = J⁻ᵀ ds/dp.
  const den = 1 + gx * rx + gy * ry;
  const px = -gx / den;
  const py = -gy / den;
  out.kx = (d * px - c * py) / det;
  out.ky = (a * py - b * px) / det;
  return true;
}

/** Metres a point (x, y, z) drops along its sun ray to the ground plane `G`. */
export function shadowDrop(G: ShadowGround, x: number, y: number, z: number): number {
  return (z - G.g0 - G.gx * (x - G.qx) - G.gy * (y - G.qy)) / (1 + G.gx * G.rx + G.gy * G.ry);
}

/** A canvas transform (`ctx.transform(a, b, c, d, e, f)`). */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const affine: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/**
 * The device-px transform that lays a shadow drawn on a horizontal plane onto the ground plane `G`: the plane point
 * whose screen position (world px, zoom 1) is (S0x, S0y) drops `s0` m, and every other point by its own drop. Device px
 * are world px × `scale` + (offX, offY). One object, rewritten on each call.
 */
export function skewedShadowTransform(G: ShadowGround, s0: number, S0x: number, S0y: number, scale: number, offX: number, offY: number): Affine {
  const sh = sunShift();
  // D' = D + shift × (scale s0 + k·(D − off) − scale k·S0)
  const T = scale * s0 - G.kx * offX - G.ky * offY - scale * (G.kx * S0x + G.ky * S0y);
  affine.a = 1 + sh.x * G.kx;
  affine.b = sh.y * G.kx;
  affine.c = sh.x * G.ky;
  affine.d = 1 + sh.y * G.ky;
  affine.e = sh.x * T;
  affine.f = sh.y * T;
  return affine;
}
