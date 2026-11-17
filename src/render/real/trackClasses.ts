/**
 * Track classes (phase 8c batch 5 Task 2), shared by the bake and the game: rail and car sets of a track type are split
 * into classes, so a built circuit decodes only the classes (and headings) it uses, not the whole type.
 *
 * - Rails: a piece's class is its piece group's (`GROUP_CLASS`): `base` (S, St, G, X, Br, BB), `turn` (Ts, Tm), `bank`
 *   (B), `loop` (L), `cork` (Cs), `helix` (Hx), `spooky` (Sp), `water` (W), `launch` (Ln). Sets `rail:<type>~<class>`.
 * - Cars: a pose (quantised yaw, pitch, roll, `./pose.ts`) belongs to the first class, in `TRACK_CLASSES` order, whose
 *   pieces of the type reach it (every heading). Sets `car:<type>~<class>`. A pose no piece of the type reaches (a car
 *   between samples, or a type drawn with another type's pictures) is looked up in `base`.
 * Poses come from the game's own geometry (`pieceWorldSamples`) and the reader's own quantiser, so bake and game agree.
 */
import { getTrackPieceDef, getTrackTypeDef, ALL_TRACK_PIECES, typeBuildsPiece, type PieceGroup } from '../../data/track';
import { pieceWorldSamples } from '../../sim/rides/track/api';
import { CAR_TILT_STEPS, quantisePose } from './pose';

export type TrackClass = 'base' | 'turn' | 'bank' | 'loop' | 'cork' | 'helix' | 'spooky' | 'water' | 'launch';

/** Every class, in pose-class order (a pose belongs to the first class that reaches it). */
export const TRACK_CLASSES: readonly TrackClass[] = ['base', 'turn', 'bank', 'loop', 'cork', 'helix', 'spooky', 'water', 'launch'];

export const GROUP_CLASS: Readonly<Record<PieceGroup, TrackClass>> = {
  S: 'base', St: 'base', G: 'base', X: 'base', Br: 'base', BB: 'base',
  Ts: 'turn', Tm: 'turn', B: 'bank', L: 'loop', Cs: 'cork', Hx: 'helix', Sp: 'spooky', W: 'water', Ln: 'launch',
};

/** The class of a rail piece (`base` for an unknown piece id: it then falls back like any missing frame). */
export function pieceClass(pieceId: string): TrackClass {
  const def = getTrackPieceDef(pieceId);
  return def ? GROUP_CLASS[def.group] : 'base';
}

export interface CarPose { yaw: number; pitch: number; roll: number }

/** A pose as one number: (yaw × 24 + pitch) × 24 + roll (the look's car code without its full/empty bit). */
export const poseCode = (yaw: number, pitch: number, roll: number): number => (yaw * CAR_TILT_STEPS + pitch) * CAR_TILT_STEPS + roll;

const codesByPiece = new Map<string, number[]>();
/** Unique quantised pose codes of a piece, built at every heading (a piece can face any way; view turns add quarter turns). */
export function piecePoseCodes(pieceId: string): number[] {
  let out = codesByPiece.get(pieceId);
  if (out) return out;
  const seen = new Set<number>();
  if (getTrackPieceDef(pieceId)) {
    for (let dir = 0; dir < 4; dir++) {
      const s = pieceWorldSamples({ defId: pieceId, x: 0, y: 0, z: 0, dir: dir as 0 | 1 | 2 | 3, chain: false, brakeSpeed: null, cost: 0 });
      for (let k = 0; k < s.n; k++) {
        const p = quantisePose(s.yaw[k] as number, s.pitch[k] as number, Math.atan2(s.bankSin[k] as number, s.bankCos[k] as number));
        seen.add(poseCode(p.yaw, p.pitch, p.roll));
      }
    }
  }
  codesByPiece.set(pieceId, (out = [...seen].sort((a, b) => a - b)));
  return out;
}

/** Unique quantised poses of `pieceIds` on `trackType`, sorted by yaw, pitch, roll (the bake's car list). */
export function reachedPoses(trackType: string, pieceIds: readonly string[]): CarPose[] {
  const type = getTrackTypeDef(trackType);
  if (!type) throw new Error(`reachedPoses: unknown track type '${trackType}'`);
  const seen = new Set<number>();
  for (const id of pieceIds) {
    const def = getTrackPieceDef(id);
    if (!def || !typeBuildsPiece(type, def)) throw new Error(`reachedPoses: '${trackType}' has no piece '${id}'`);
    for (const c of piecePoseCodes(id)) seen.add(c);
  }
  return [...seen].sort((a, b) => a - b).map((c) => ({ yaw: Math.floor(c / (CAR_TILT_STEPS * CAR_TILT_STEPS)), pitch: Math.floor(c / CAR_TILT_STEPS) % CAR_TILT_STEPS, roll: c % CAR_TILT_STEPS }));
}

const poseClassByType = new Map<string, Map<number, TrackClass>>();
/** Pose code → class for every pose `typeId`'s pieces reach (empty for an unknown type). */
export function poseClasses(typeId: string): Map<number, TrackClass> {
  let m = poseClassByType.get(typeId);
  if (m) return m;
  m = new Map();
  const type = getTrackTypeDef(typeId);
  if (type) {
    const pieces = ALL_TRACK_PIECES.filter((p) => typeBuildsPiece(type, p));
    for (const cls of TRACK_CLASSES) {
      for (const p of pieces) {
        if (GROUP_CLASS[p.group] !== cls) continue;
        for (const c of piecePoseCodes(p.id)) if (!m.has(c)) m.set(c, cls);
      }
    }
  }
  poseClassByType.set(typeId, m);
  return m;
}

/** The car class of pose `code` on `typeId` (`base` when no piece of the type reaches it). */
export function poseClassOf(typeId: string, code: number): TrackClass {
  return poseClasses(typeId).get(code) ?? 'base';
}

/** The car classes a car on these pieces can need, with `typeId`'s pose classes. */
export function carClassesOf(typeId: string, pieceIds: Iterable<string>): Set<TrackClass> {
  const m = poseClasses(typeId);
  const out = new Set<TrackClass>();
  for (const id of pieceIds) for (const c of piecePoseCodes(id)) out.add(m.get(c) ?? 'base');
  return out;
}
