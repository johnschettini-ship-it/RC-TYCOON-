/**
 * Track classes (phase 8c batch 5 Task 2), shared by the bake and the game: rail and car sets of a track type are split
 * into classes, so a built circuit decodes only the classes (and headings) it uses, not the whole type.
 *
 * - Rails: a piece's class is its piece group's (`GROUP_CLASS`): `base` (S, St, G, X, Br, BB), `turn` (Ts, Tm), `bank`
 *   (B), `loop` (L), `cork` (Cs), `helix` (Hx), `spooky` (Sp), `water` (W), `launch` (Ln). Sets `rail:<type>~<class>`.
 * - Cars: a pose (quantised yaw, pitch, roll, `./pose.ts`) belongs to the first class, in `TRACK_CLASSES` order, whose
 *   pieces of the type reach it (every heading). A pose no piece of the type reaches (a car between samples, or a type
 *   drawn with another type's pictures) is looked up in `base`. Each class's cars are split by the yaw quadrant the car
 *   faces in the view (`carQuadrant`): sets `car:<type>~<class>:d*:r<q>` (fix wave: one set per class was 8.9-20.9 MiB
 *   at d4 for the steel coaster's bank, loop, cork and helix classes, over the 8 MiB per-set rule). A view turn adds a
 *   quadrant, so the scope wants a car set like a rail heading: by the world quadrant its cars face (`carSetsOf`).
 * Poses come from the game's own geometry (`pieceWorldSamples`) and the reader's own quantiser, so bake and game agree.
 */
import { getTrackPieceDef, getTrackTypeDef, ALL_TRACK_PIECES, typeBuildsPiece, type PieceGroup } from '../../data/track';
import { pieceWorldSamples } from '../../sim/rides/track/api';
import { CAR_TILT_STEPS, CAR_YAW_STEPS, quantisePose } from './pose';

export type TrackClass = 'base' | 'turn' | 'bank' | 'loop' | 'cork' | 'helix' | 'spooky' | 'water' | 'launch';

/** Every class, in pose-class order (a pose belongs to the first class that reaches it). */
export const TRACK_CLASSES: readonly TrackClass[] = ['base', 'turn', 'bank', 'loop', 'cork', 'helix', 'spooky', 'water', 'launch'];

export const GROUP_CLASS: Readonly<Record<PieceGroup, TrackClass>> = {
  S: 'base', St: 'base', G: 'base', X: 'base', Br: 'base', BB: 'base',
  Ts: 'turn', Tm: 'turn', B: 'bank', L: 'loop', Cs: 'cork', Hx: 'helix', Sp: 'spooky', W: 'water', Ln: 'launch',
};

/**
 * A rail class's half (after batch 5 Task 7: a masked helix set was over the 8 MiB per-set rule): `<class>.0` or
 * `<class>.1`, by the piece's place among its class's pieces in ALL_TRACK_PIECES order (even or odd), so the helix splits
 * into its up and down pieces. A type's bake splits a class only when one set would pass the limit (its spec's
 * `splitRailClasses`); the reader and the scope ask for the half and, when the art has no halves, get the whole class
 * (look/core.ts classRec). Same for any type and view, like the class itself.
 */
export function railSplitClass(pieceId: string): string {
  const def = getTrackPieceDef(pieceId);
  if (!def) return 'base.0';
  const cls = GROUP_CLASS[def.group];
  const i = ALL_TRACK_PIECES.filter((p) => GROUP_CLASS[p.group] === cls).findIndex((p) => p.id === pieceId);
  return `${cls}.${i % 2}`;
}

/** Whether a set's class name is a class or a class's half (`<class>.0`, `<class>.1`). */
export function isRailSetClass(name: string): boolean {
  const m = /^(\w+)(?:\.([01]))?$/.exec(name);
  return !!m && (TRACK_CLASSES as readonly string[]).includes(m[1] as string);
}

/** The class of a rail piece (`base` for an unknown piece id: it then falls back like any missing frame). */
export function pieceClass(pieceId: string): TrackClass {
  const def = getTrackPieceDef(pieceId);
  return def ? GROUP_CLASS[def.group] : 'base';
}

export interface CarPose { yaw: number; pitch: number; roll: number }

/** A pose as one number: (yaw × 24 + pitch) × 24 + roll (the look's car code without its full/empty bit). */
export const poseCode = (yaw: number, pitch: number, roll: number): number => (yaw * CAR_TILT_STEPS + pitch) * CAR_TILT_STEPS + roll;

/**
 * The yaw quadrant of a car set (0-3) for a quantised yaw step (32 a turn, 0 = +x): quadrants are centred on the 4
 * headings (steps 28-3 are quadrant 0, 4-11 quadrant 1, …), so a car running straight along a heading needs one set.
 * A view turn adds 8 steps and so one quadrant.
 */
export function carQuadrant(yawStep: number): 0 | 1 | 2 | 3 {
  const y = ((Math.round(yawStep) % CAR_YAW_STEPS) + CAR_YAW_STEPS) % CAR_YAW_STEPS;
  return (Math.floor(((y + CAR_YAW_STEPS / 8) % CAR_YAW_STEPS) / (CAR_YAW_STEPS / 4)) & 3) as 0 | 1 | 2 | 3;
}

const codesByPieceDir = new Map<string, number[]>();
/** Unique quantised pose codes of a piece built at heading `dir` (world yaw: view turn 0). */
export function piecePoseCodesAt(pieceId: string, dir: number): number[] {
  const k = `${pieceId}/${dir & 3}`;
  let out = codesByPieceDir.get(k);
  if (out) return out;
  const seen = new Set<number>();
  if (getTrackPieceDef(pieceId)) {
    const s = pieceWorldSamples({ defId: pieceId, x: 0, y: 0, z: 0, dir: (dir & 3) as 0 | 1 | 2 | 3, chain: false, brakeSpeed: null, cost: 0 });
    for (let i = 0; i < s.n; i++) {
      const p = quantisePose(s.yaw[i] as number, s.pitch[i] as number, Math.atan2(s.bankSin[i] as number, s.bankCos[i] as number));
      seen.add(poseCode(p.yaw, p.pitch, p.roll));
    }
  }
  codesByPieceDir.set(k, (out = [...seen].sort((a, b) => a - b)));
  return out;
}

const codesByPiece = new Map<string, number[]>();
/** Unique quantised pose codes of a piece, built at every heading (a piece can face any way; view turns add quarter turns). */
export function piecePoseCodes(pieceId: string): number[] {
  let out = codesByPiece.get(pieceId);
  if (out) return out;
  const seen = new Set<number>();
  if (getTrackPieceDef(pieceId)) {
    for (let dir = 0; dir < 4; dir++) for (const c of piecePoseCodesAt(pieceId, dir)) seen.add(c);
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

/** Whether `poseClasses(typeId)` has been made (the look warms the baked types when it is created). */
export function poseClassesReady(typeId: string): boolean {
  return poseClassByType.has(typeId);
}

/**
 * The car class of pose `code` on `typeId` (`base` when no piece of the type reaches it). Spinning types
 * (`vehicle.spins`): a car spun to a yaw no piece reaches (any yaw on a slope, a bank or a turn's pitch) resolves to
 * `base`, so Task 3's spin bake (32 yaws for every reached pitch and roll) must file those frames in `~base`, or
 * change this rule for spinning types and TRACK_COMPLETE with it (checkIndex files frames by this function).
 */
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

/**
 * The car sets a circuit's cars can draw from: class → the world yaw quadrants (`carQuadrant` at view turn 0) of the
 * poses its built pieces reach at their headings. A spinning type (`vehicle.spins`) turns its cars to any yaw at each
 * reached pitch and roll, so each of its tilts is taken at all 32 yaws (a spun yaw no piece reaches is `base`).
 */
export function carSetsOf(typeId: string, pieces: Iterable<{ defId: string; dir: number }>): Map<TrackClass, Set<number>> {
  const m = poseClasses(typeId);
  const spins = getTrackTypeDef(typeId)?.vehicle.spins === true;
  const out = new Map<TrackClass, Set<number>>();
  const add = (code: number): void => {
    const cls = m.get(code) ?? 'base';
    const q = carQuadrant(Math.floor(code / (CAR_TILT_STEPS * CAR_TILT_STEPS)));
    let set = out.get(cls);
    if (!set) out.set(cls, (set = new Set()));
    set.add(q);
  };
  const seen = new Set<string>();
  for (const p of pieces) {
    const k = `${p.defId}/${p.dir & 3}`;
    if (seen.has(k)) continue;
    seen.add(k);
    for (const c of piecePoseCodesAt(p.defId, p.dir)) {
      if (!spins) { add(c); continue; }
      const tilt = c % (CAR_TILT_STEPS * CAR_TILT_STEPS);
      for (let y = 0; y < CAR_YAW_STEPS; y++) add(y * CAR_TILT_STEPS * CAR_TILT_STEPS + tilt);
    }
  }
  return out;
}

