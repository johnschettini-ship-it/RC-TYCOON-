/**
 * Derived circuit layout (phase-2 §5: cumulative piece lengths, block layout, sample lookup). Owner: W1-G.
 * Derived, never saved: rebuilt on demand from the pieces (cache keyed by the ride data object).
 */
import { STATION_STOP_MARGIN_MM } from '../../../data/tuning/track';
import { localToWorld, pieceStatic, worldYaw, type PieceStatic } from './geometry';
import type { TrackPieceInstance, TrackRideData } from './types';

export interface CircuitLayout {
  pieces: TrackPieceInstance[];
  statics: PieceStatic[];
  /** Start of each piece along the circuit (mm); `startMm[n]` = total length. */
  startMm: number[];
  lengthMm: number;
  /** Station pieces at the start of the circuit. */
  stationCount: number;
  stationEndMm: number;
  /** Front position of a train stopped in the station (mm). */
  stopFrontMm: number;
  /** Front positions where trains hold (mm, ascending). [0] is the station stop; the rest are block brake exits. */
  blockPoints: number[];
  blockBrakeCount: number;
}

interface CacheEntry {
  pieces: TrackPieceInstance[];
  n: number;
  last: TrackPieceInstance | undefined;
  defs: string;
  layout: CircuitLayout;
}

const cache = new WeakMap<TrackRideData, CacheEntry>();

function defsKey(pieces: TrackPieceInstance[]): string {
  let k = '';
  for (const p of pieces) k += p.defId + ';';
  return k;
}

export function buildLayout(pieces: TrackPieceInstance[]): CircuitLayout {
  const statics = pieces.map((p) => pieceStatic(p.defId));
  const startMm: number[] = [0];
  let total = 0;
  for (const st of statics) {
    total += st.def.lengthMm;
    startMm.push(total);
  }
  let stationCount = 0;
  while (stationCount < statics.length && statics[stationCount]?.def.special === 'station') stationCount++;
  const stationEndMm = startMm[stationCount] ?? 0;
  const stopFrontMm = Math.max(0, stationEndMm - STATION_STOP_MARGIN_MM);
  const blockPoints = [stopFrontMm];
  let blockBrakeCount = 0;
  statics.forEach((st, i) => {
    if (st.def.special === 'blockBrake') {
      blockBrakeCount++;
      blockPoints.push(startMm[i + 1] as number);
    }
  });
  return { pieces, statics, startMm, lengthMm: total, stationCount, stationEndMm, stopFrontMm, blockPoints, blockBrakeCount };
}

/** Layout of a ride's current pieces (cached until the piece list changes). */
export function getLayout(data: TrackRideData): CircuitLayout {
  const pieces = data.pieces;
  const e = cache.get(data);
  const n = pieces.length;
  const last = pieces[n - 1];
  if (e && e.pieces === pieces && e.n === n && e.last === last) {
    return e.layout;
  }
  const defs = defsKey(pieces);
  if (e && e.pieces === pieces && e.defs === defs) {
    e.n = n;
    e.last = last;
    return e.layout;
  }
  const layout = buildLayout(pieces);
  cache.set(data, { pieces, n, last, defs, layout });
  return layout;
}

/** Forget a cached layout (call after editing pieces in place). */
export function invalidateLayout(data: TrackRideData): void {
  cache.delete(data);
}

/** Wrap a position into [0, length). */
export function wrapMm(layout: CircuitLayout, s: number): number {
  const L = layout.lengthMm;
  if (L <= 0) return 0;
  let r = s % L;
  if (r < 0) r += L;
  return r;
}

/** Index of the piece holding position `s` (mm, already wrapped). */
export function pieceIndexAt(layout: CircuitLayout, s: number): number {
  const st = layout.startMm;
  let lo = 0;
  let hi = layout.statics.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((st[mid] as number) <= s) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface SamplePoint {
  pieceIndex: number;
  /** Distance into the piece (mm). */
  u: number;
  sinT: number;
  cosT: number;
  theta: number;
  sinB: number;
  cosB: number;
  kv: number;
  kh: number;
  /** Local position and height above the piece entry (m) and heading. */
  x: number;
  y: number;
  h: number;
  yaw: number;
}

export function newSamplePoint(): SamplePoint {
  return { pieceIndex: 0, u: 0, sinT: 0, cosT: 1, theta: 0, sinB: 0, cosB: 1, kv: 0, kh: 0, x: 0, y: 0, h: 0, yaw: 0 };
}

/** Interpolated sample at circuit position `s` (mm). Writes into `out`. */
export function sampleAt(layout: CircuitLayout, s: number, out: SamplePoint = newSamplePoint()): SamplePoint {
  const ws = wrapMm(layout, s);
  const pi = pieceIndexAt(layout, ws);
  const st = layout.statics[pi] as PieceStatic;
  const sm = st.samples;
  const u = ws - (layout.startMm[pi] as number);
  const um = u / 1000;
  let k = Math.floor(u / 250);
  if (k > sm.n - 2) k = sm.n - 2;
  if (k < 0) k = 0;
  const s0 = sm.s[k] as number;
  const s1 = sm.s[k + 1] as number;
  let f = s1 > s0 ? (um - s0) / (s1 - s0) : 0;
  if (f < 0) f = 0;
  else if (f > 1) f = 1;
  const lerp = (a: Float64Array): number => (a[k] as number) + ((a[k + 1] as number) - (a[k] as number)) * f;
  out.pieceIndex = pi;
  out.u = u;
  out.sinT = lerp(sm.sinT);
  out.cosT = lerp(sm.cosT);
  out.theta = lerp(sm.theta);
  out.sinB = lerp(sm.sinB);
  out.cosB = lerp(sm.cosB);
  out.kv = f < 0.5 ? (sm.kv[k] as number) : (sm.kv[k + 1] as number);
  out.kh = lerp(sm.kh);
  out.x = lerp(sm.x);
  out.y = lerp(sm.y);
  out.h = lerp(sm.h);
  out.yaw = lerp(sm.yaw);
  return out;
}

/** World pose at circuit position `s` (mm), for rendering: metres (tile x spans [4x, 4x + 4]), absolute height. */
export interface TrackPose {
  x: number;
  y: number;
  z: number;
  /** Heading in the ground plane (rad, 0 = +x, π/2 = +y). */
  yaw: number;
  pitch: number;
  /** Sine and cosine of the bank angle (+ = banked right). */
  bankSin: number;
  bankCos: number;
}

export function poseAt(layout: CircuitLayout, s: number, sp: SamplePoint = newSamplePoint()): TrackPose {
  sampleAt(layout, s, sp);
  const piece = layout.pieces[sp.pieceIndex] as TrackPieceInstance;
  const w = localToWorld(piece, sp.x, sp.y);
  return { x: w.x, y: w.y, z: piece.z + sp.h, yaw: worldYaw(piece, sp.yaw), pitch: sp.theta, bankSin: sp.sinB, bankCos: sp.cosB };
}
