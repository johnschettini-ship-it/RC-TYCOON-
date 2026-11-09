/**
 * Track render math (phase-2 §4.13, master 6.4). Owner: W2-A. Pure: no canvas.
 * Track data is in world metres (tile x spans [4x, 4x + 4]) with absolute heights (1 m = 1 height step = 8 px).
 * A view rotation (Phase 4) turns map coordinates before the iso projection, so every piece direction and every
 * view rotation goes through the same code. Build 1 always draws with rotation 0.
 */
import { DT, TILE_M } from '../../data/tuning/track';
import { Layer, packDepth } from '../depth';
import { STEP_PX, TILE_H, TILE_W } from '../iso';
import { sampleAt, type CircuitLayout, type SamplePoint } from '../../sim/rides/track/layout';
import type { TrackPieceInstance } from '../../sim/rides/track/types';

/** Screen px per metre: a 4 m tile is a 64 × 32 px diamond, so (x − y) × 8 across and (x + y) × 4 down. */
export const PX_X = TILE_W / 2 / TILE_M;
export const PX_Y = TILE_H / 2 / TILE_M;
/** Screen px per metre of height. */
export const PX_Z = STEP_PX;

/** View rotation (quarter turns) and map size in metres. */
export interface ViewFrame {
  rot: number;
  wm: number;
  hm: number;
}

export function viewFrame(rot: number, mapW: number, mapH: number): ViewFrame {
  return { rot: ((rot % 4) + 4) % 4, wm: mapW * TILE_M, hm: mapH * TILE_M };
}

/** View-space x (m) of a map point: the map turned by `rot` quarter turns. */
export function viewX(wx: number, wy: number, f: ViewFrame): number {
  switch (f.rot) {
    case 1:
      return f.hm - wy;
    case 2:
      return f.wm - wx;
    case 3:
      return wy;
    default:
      return wx;
  }
}

export function viewY(wx: number, wy: number, f: ViewFrame): number {
  switch (f.rot) {
    case 1:
      return wx;
    case 2:
      return f.hm - wy;
    case 3:
      return f.wm - wx;
    default:
      return wy;
  }
}

/** Heading in view space (rad): the map heading plus the view rotation. */
export function viewYaw(yaw: number, f: ViewFrame): number {
  return yaw + (f.rot * Math.PI) / 2;
}

/** Iso screen x (world px, zoom 1) of a view-space point. */
export function isoX(vx: number, vy: number): number {
  return (vx - vy) * PX_X;
}

/** Iso screen y (world px, zoom 1) of a view-space point at absolute height `z` (m). */
export function isoY(vx: number, vy: number, z: number): number {
  return (vx + vy) * PX_Y - z * PX_Z;
}

/** Screen x of a world point (m). With rotation 0 this equals `tileToScreen(wx / 4, wy / 4, z).sx`. */
export function projectX(wx: number, wy: number, f: ViewFrame): number {
  return isoX(viewX(wx, wy, f), viewY(wx, wy, f));
}

export function projectY(wx: number, wy: number, wz: number, f: ViewFrame): number {
  return isoY(viewX(wx, wy, f), viewY(wx, wy, f), wz);
}

/** Depth (master 6.4, tile units) of a world point: x + y in view space. */
export function pointDepthM(wx: number, wy: number, f: ViewFrame): number {
  return (viewX(wx, wy, f) + viewY(wx, wy, f)) / TILE_M;
}

/** Depth of tile (x, y): its centre, so rotation 0 gives `tileDepth(x, y)` = x + y + 1. */
export function tileDepthView(x: number, y: number, f: ViewFrame): number {
  return pointDepthM((x + 0.5) * TILE_M, (y + 0.5) * TILE_M, f);
}

/** Sort key of a track slice (§4.13): (x + y, railMin, layer), packed like every other drawable. */
export function sliceSortKey(x: number, y: number, railMin: number, f: ViewFrame, layer: number = Layer.Object): number {
  return packDepth(tileDepthView(x, y, f), railMin, layer);
}

/** Support height (m): from the ground up to the underside of the rail (rail z minus the spine drop). */
export function supportHeight(railZ: number, ground: number, drop: number): number {
  return Math.max(0, railZ - drop - ground);
}

/** Train centre between two ticks (mm): `s + v · dt · alpha`, wrapped into the circuit (render interpolation). */
export function interpolatedS(sMm: number, vMms: number, alpha: number, lengthMm: number): number {
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  if (!(lengthMm > 0)) return 0;
  const r = (sMm + vMms * DT * a) % lengthMm;
  return r < 0 ? r + lengthMm : r;
}

/** Centre of car `k` (front car 0) of a train whose centre is at `centre` (mm). */
export function carCentreMm(centre: number, cars: number, k: number, carLengthMm: number): number {
  return centre + (cars * carLengthMm) / 2 - (k + 0.5) * carLengthMm;
}

/** A car pose in world metres; reused by the caller (no allocation per frame). */
export interface CarPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  bankSin: number;
  bankCos: number;
  pieceIndex: number;
}

export function newCarPose(): CarPose {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bankSin: 0, bankCos: 1, pieceIndex: 0 };
}

/** Pose at circuit position `s` (mm), written into `out`. Same result as the track API's `poseAt`. */
export function carPoseAt(layout: CircuitLayout, s: number, sp: SamplePoint, out: CarPose): CarPose {
  sampleAt(layout, s, sp);
  const piece = layout.pieces[sp.pieceIndex] as TrackPieceInstance;
  const half = TILE_M / 2;
  const u = sp.x - half;
  const v = sp.y - half;
  let rx: number;
  let ry: number;
  switch (piece.dir) {
    case 1:
      rx = -v;
      ry = u;
      break;
    case 2:
      rx = -u;
      ry = -v;
      break;
    case 3:
      rx = v;
      ry = -u;
      break;
    default:
      rx = u;
      ry = v;
  }
  out.x = piece.x * TILE_M + half + rx;
  out.y = piece.y * TILE_M + half + ry;
  out.z = piece.z + sp.h;
  out.yaw = sp.yaw + (piece.dir * Math.PI) / 2;
  out.pitch = sp.theta;
  out.bankSin = sp.sinB;
  out.bankCos = sp.cosB;
  out.pieceIndex = sp.pieceIndex;
  return out;
}

/**
 * Track frame vectors at a sample: forward f, right r (banked), and up u = f × r, in map space.
 * Positive bank lowers the right rail (§4.1). Writes 9 numbers into `out` (fx, fy, fz, rx, ry, rz, ux, uy, uz).
 */
export function trackFrame(yaw: number, pitch: number, bankSin: number, bankCos: number, out: Float64Array): Float64Array {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const fx = cy * cp;
  const fy = sy * cp;
  const fz = sp;
  // Unbanked right (horizontal) and up = f × r0.
  const r0x = -sy;
  const r0y = cy;
  const u0x = fy * 0 - fz * r0y;
  const u0y = fz * r0x - fx * 0;
  const u0z = fx * r0y - fy * r0x;
  out[0] = fx;
  out[1] = fy;
  out[2] = fz;
  out[3] = r0x * bankCos - u0x * bankSin;
  out[4] = r0y * bankCos - u0y * bankSin;
  out[5] = -u0z * bankSin;
  out[6] = u0x * bankCos + r0x * bankSin;
  out[7] = u0y * bankCos + r0y * bankSin;
  out[8] = u0z * bankCos;
  return out;
}

/** Quantized car yaw (16 steps) and pitch (24 steps) for the car sprite cache (§4.13). */
export function yawStep(yaw: number): number {
  const k = Math.round((yaw / (Math.PI * 2)) * 16);
  return ((k % 16) + 16) % 16;
}

export function pitchStep(pitch: number): number {
  const k = Math.round((pitch / (Math.PI * 2)) * 24);
  return ((k % 24) + 24) % 24;
}

/** Quantized car roll (16 steps) from the bank's sine and cosine (Phase 6: cars roll with the track). */
export function rollStep(bankSin: number, bankCos: number): number {
  const k = Math.round((Math.atan2(bankSin, bankCos) / (Math.PI * 2)) * 16);
  return ((k % 16) + 16) % 16;
}
