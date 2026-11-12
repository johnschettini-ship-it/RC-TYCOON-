/** Phase 8b stage 0b test (never merged): catalogue of track pictures (rails, supports, gates, cars) in the role colours. */
import { ALL_TRACK_PIECES, ALL_TRACK_TYPES, type TrackPieceDef, type TrackTypeDef } from '../../../src/data/track';
import { GATE_ROOFS, K_CAR, K_GATE, K_RAIL, K_SUPPORT, SUPPORT_STYLES, TRACK_PIECE_IDS, TRACK_TYPE_IDS, carKey, gateKey, railKey, supportKey } from '../../../src/render/pixel/app/keys';
import { buildRideSlices, CAR_SHAPES, paintSlice, type SliceRec } from '../../../src/render/track/layer';
import { CAR_BOUNDS, GATE_BOUNDS, paintCar, paintGateBooth, paintSupport, Projector, type SupportStyle } from '../../../src/render/track/paint';
import { PX_Z, pitchStep, projectX, projectY, rollStep, viewFrame, yawStep, type ViewFrame } from '../../../src/render/track/project';
import { pieceStatic, pieceWorldTiles } from '../../../src/sim/rides/track/geometry';
import type { TrackDir, TrackPieceInstance, TrackRideData } from '../../../src/sim/rides/track/types';
import type { World } from '../../../src/sim/types';
import { createWorld } from '../../../src/sim/world';
import type { Ctx } from '../../../src/render/sprites/shapes';
import { paintPicture, trim, type Picture } from '../picture';
import { SENTINEL, withRoles } from '../ramps';
import type { PictureSpec } from './types';

/** Where the tool places the one piece: entry tile (16, 16), entry height 4 m (Task 6). */
export const RAIL_AT = { x: 16, y: 16, z: 4 } as const;
/** Height (m) of the support the segments are cut from: foot (0 to 1 m), one step (1 to 2 m), top (2 to 3 m and the cap). */
const SUPPORT_H = 3;
/** Art pixels per metre of height (8 world px per metre, 2 world px per art pixel). */
const ART_PER_M = PX_Z / 2;
const VIEWS = [0, 1, 2, 3] as const;
const ROLE_COLOURS = { track: SENTINEL.track, supports: SENTINEL.supports, cars: SENTINEL.car };

/** The pieces a track type can build (`build.ts`: piece set, groups, excluded pieces). */
export function piecesOf(type: TrackTypeDef): TrackPieceDef[] {
  return ALL_TRACK_PIECES.filter((d) => d.set === type.pieceSet && type.groups.includes(d.group) && !type.excludePieces.includes(d.id));
}

let world: World | null = null;
/** One shared world (64 × 64, never ticked): the tool only swaps its track data. */
function railWorld(): World {
  world ??= createWorld({ seed: 1, parkName: 'Sheet tool' });
  return world;
}

/**
 * The slices of one piece alone in a world (no station needed: slices come from the piece geometry only), with the
 * support dropped and the role colours in place of the ride's colours.
 */
export function onePieceSlices(typeId: string, piece: TrackPieceInstance, f: ViewFrame): SliceRec[] {
  const w = railWorld();
  const data: TrackRideData = {
    rideId: 1,
    typeId,
    pieces: [piece],
    circuitClosed: false,
    trainConfig: { trains: 0, carsPerTrain: 1 },
    operation: { minDwellTicks: 0, maxDwellTicks: 0, laps: 1 },
    trains: [],
    test: null,
    colours: { track: 0, supports: 0, cars: 0 },
    openedOnce: false,
    testRun: null,
    lastDispatchTick: -1,
    bestLapTicks: null,
  };
  w.state.track.rides = { '1': data };
  try {
    return buildRideSlices(w, 1, f).map((sl) => ({ ...sl, support: null, colours: ROLE_COLOURS }));
  } finally {
    w.state.track.rides = {};
  }
}

/** Index of tile (x, y) in the piece's tile list (`pieceWorldTiles`, the order of `trackTileSlices`). */
export function tileIndexOf(piece: TrackPieceInstance, x: number, y: number): number {
  return pieceWorldTiles(piece).findIndex((t) => t.x === x && t.y === y);
}

/** A rail picture: the slice painted with the tool hook, trimmed, anchored at the tile centre at the piece's base height. */
export function railPicture(sl: SliceRec, f: ViewFrame, baseZ: number): Picture {
  const p = trim(withRoles(() => paintPicture(sl.bounds, (c) => paintSlice(c as unknown as CanvasRenderingContext2D, sl, f))));
  return { ...p, oy: p.oy - baseZ * ART_PER_M };
}

function railSpecs(): PictureSpec[] {
  const out: PictureSpec[] = [];
  for (const type of ALL_TRACK_TYPES) {
    const typeIdx = TRACK_TYPE_IDS.indexOf(type.id);
    for (const def of piecesOf(type)) {
      const pieceIdx = TRACK_PIECE_IDS.indexOf(def.id);
      for (const dir of [0, 1, 2, 3] as TrackDir[]) {
        const piece: TrackPieceInstance = { defId: def.id, x: RAIL_AT.x, y: RAIL_AT.y, z: RAIL_AT.z, dir, chain: false, brakeSpeed: null, cost: 0 };
        for (const view of VIEWS) {
          const f = viewFrame(view, 64, 64);
          // Slices are built when a picture is painted (the spec list stays cheap); the tile list is known here.
          pieceWorldTiles(piece).forEach((t, tile) => {
            if (!t.rail) return;
            out.push({
              pack: 'track',
              group: `rail/${type.id}/${view}`,
              kind: K_RAIL,
              key: railKey(typeIdx, pieceIdx, dir, tile, view),
              paint: () => {
                const sl = onePieceSlices(type.id, piece, f).find((s) => s.x === t.x && s.y === t.y);
                if (!sl) throw new Error(`railSpecs: no slice for type ${type.id}, piece ${def.id}, dir ${dir}, tile ${tile} (${t.x}, ${t.y}), view ${view}`);
                return railPicture(sl, f, piece.z);
              },
              ref: null,
            });
          });
        }
      }
    }
  }
  return out;
}

/**
 * A support of `SUPPORT_H` m at view yaw `view × 90°` cut into bands of art rows: foot (rows from 1 m down), one step
 * (1 m to 2 m), top (above 2 m, with the cap). Anchors: the support point at the band's bottom height (0, 1, 2 m).
 */
export function supportPicture(style: SupportStyle, view: number, part: 0 | 1 | 2, colour: string = SENTINEL.supports): Picture {
  const f = viewFrame(0, 64, 64);
  const wx = 66;
  const wy = 66;
  const P = new Projector(f, projectX(wx, wy, f), projectY(wx, wy, 0, f));
  const bounds = { left: -40, right: 40, top: -(SUPPORT_H + 2) * PX_Z - 16, bottom: 16 };
  const full = withRoles(() =>
    paintPicture(bounds, (c) => paintSupport(c as Ctx, P, style, colour, wx, wy, (view * Math.PI) / 2, 0, SUPPORT_H)),
  );
  // Rows relative to the anchor row (ground): band k holds rows [−(k + 1) m, −k m); the foot reaches down, the top up.
  const lo = part === 0 ? Infinity : -part * ART_PER_M;
  const hi = part === 2 ? -Infinity : -(part + 1) * ART_PER_M;
  const slots = new Uint8Array(full.slots.length);
  for (let y = 0; y < full.h; y++) {
    const r = y - full.oy;
    if (r >= lo || r < hi) continue;
    slots.set(full.slots.subarray(y * full.w, (y + 1) * full.w), y * full.w);
  }
  const p = trim({ ...full, slots });
  return { ...p, oy: p.oy - part * ART_PER_M };
}

function supportSpecs(): PictureSpec[] {
  const out: PictureSpec[] = [];
  SUPPORT_STYLES.forEach((style, styleIdx) => {
    for (const view of VIEWS) {
      for (const part of [0, 1, 2] as const) {
        out.push({ pack: 'track', group: `support/${style}`, kind: K_SUPPORT, key: supportKey(styleIdx, part, view), paint: () => supportPicture(style as SupportStyle, view, part), ref: null });
      }
    }
  });
  return out;
}

/** Gate booths with their real roofs (fix round 1, I2): entrance × thrill, family, chill, and the exit; not swappable. */
function gateSpecs(): PictureSpec[] {
  return GATE_ROOFS.map((roof, i) => {
    const name = i < 3 ? 'entrance' : 'exit';
    return { pack: 'track', group: 'gate', kind: K_GATE, key: gateKey(i), paint: () => withRoles(() => paintPicture(GATE_BOUNDS, (c) => paintGateBooth(c, name, roof))), ref: null };
  });
}

export interface CarPose {
  yaw: number;
  pitch: number;
  roll: number;
}

// Exact pose enumeration (fix round 1, I1, controller method). Between samples k and k + 1 `sampleAt`
// (src/sim/rides/track/layout.ts) interpolates yaw, theta, sinB and cosB each linearly in the fraction t (raw yaw, no
// wrap handling). The step functions (src/render/track/project.ts) round: yawStep = round(yaw × 16 / 2π) mod 16,
// pitchStep = round(theta × 24 / 2π) mod 24, rollStep = round(atan2(sinB, cosB) × 16 / 2π) mod 16, so each step
// changes only where its angle crosses (m + 0.5) × 2π / n. Those crossings are the only points where the pose can
// change; evaluating at 0, 1, every crossing and the midpoint of every interval between them gives every pose.

/** Fractions t in (0, 1) where a linear angle a + (b − a) t crosses a rounding boundary (m + 0.5) × 2π / n. */
export function linearCrossings(a: number, b: number, n: number): number[] {
  const out: number[] = [];
  if (a === b) return out;
  const ka = (a * n) / (Math.PI * 2);
  const kb = (b * n) / (Math.PI * 2);
  for (let m = Math.ceil(Math.min(ka, kb) - 0.5); m + 0.5 <= Math.max(ka, kb); m++) {
    const t = (m + 0.5 - ka) / (kb - ka);
    if (t > 0 && t < 1) out.push(t);
  }
  return out;
}

/**
 * The fraction t in (0, 1) where atan2(sB(t), cB(t)) of linear sB, cB crosses the angle phi, or null: the root of
 * sB(t) cos(phi) − cB(t) sin(phi) = 0, kept only when (sB, cB) then points into the half-plane of phi (not phi + π).
 */
export function rollCrossing(sB0: number, cB0: number, sB1: number, cB1: number, phi: number): number | null {
  const den = (sB1 - sB0) * Math.cos(phi) - (cB1 - cB0) * Math.sin(phi);
  if (den === 0) return null;
  const t = (cB0 * Math.sin(phi) - sB0 * Math.cos(phi)) / den;
  if (!(t > 0 && t < 1)) return null;
  const sB = sB0 + (sB1 - sB0) * t;
  const cB = cB0 + (cB1 - cB0) * t;
  return sB * Math.sin(phi) + cB * Math.cos(phi) > 0 ? t : null;
}

/**
 * Every (yaw, pitch, roll) step a car shows on piece `defId` at direction 0 and view rotation 0, exactly: per sample
 * pair, the pose at t = 0, t = 1, every boundary crossing of yaw, pitch and roll, and the midpoint of every interval
 * between neighbouring points, with the lerps of `sampleAt` and the game's step functions. Calls `visit(yaw, pitch, roll)`.
 */
export function piecePoses(defId: string, visit: (yaw: number, pitch: number, roll: number) => void): void {
  const sm = pieceStatic(defId).samples;
  const at = (k: number, t: number): void => {
    const l = (a: Float64Array): number => (a[k] as number) + ((a[k + 1] as number) - (a[k] as number)) * t;
    visit(yawStep(l(sm.yaw)), pitchStep(l(sm.theta)), rollStep(l(sm.sinB), l(sm.cosB)));
  };
  for (let k = 0; k + 1 < sm.n; k++) {
    const ts = [0, 1, ...linearCrossings(sm.yaw[k] as number, sm.yaw[k + 1] as number, 16), ...linearCrossings(sm.theta[k] as number, sm.theta[k + 1] as number, 24)];
    for (let m = 0; m < 16; m++) {
      const t = rollCrossing(sm.sinB[k] as number, sm.cosB[k] as number, sm.sinB[k + 1] as number, sm.cosB[k + 1] as number, ((m + 0.5) * Math.PI * 2) / 16);
      if (t !== null) ts.push(t);
    }
    ts.sort((a, b) => a - b);
    for (let i = 0; i < ts.length; i++) {
      at(k, ts[i] as number);
      if (i + 1 < ts.length) at(k, ((ts[i] as number) + (ts[i + 1] as number)) / 2);
    }
  }
}

/**
 * The pose walk: every pose of every piece def (placed at direction 0, `piecePoses`), seen in all 4 view rotations
 * (yaw + k × 4 steps, which also covers the 4 piece directions). Trains only run forwards (fix round 1, M1: no reverse
 * poses). Shapes of spinning types take every yaw step for each (pitch, roll) found.
 */
export function poseWalk(): { poses: CarPose[]; spinPoses: CarPose[] } {
  const seen = new Set<number>();
  const pairs = new Set<number>();
  const poses: CarPose[] = [];
  for (const def of ALL_TRACK_PIECES) {
    piecePoses(def.id, (yaw, pitch, roll) => {
      pairs.add(pitch * 16 + roll);
      for (let k = 0; k < 4; k++) {
        const y = (yaw + 4 * k) & 15;
        const key = (y * 24 + pitch) * 16 + roll;
        if (seen.has(key)) continue;
        seen.add(key);
        poses.push({ yaw: y, pitch, roll });
      }
    });
  }
  const spinPoses: CarPose[] = [];
  for (const pr of [...pairs].sort((a, b) => a - b)) for (let yaw = 0; yaw < 16; yaw++) spinPoses.push({ yaw, pitch: pr >> 4, roll: pr & 15 });
  poses.sort((a, b) => carKey(0, a.yaw, a.pitch, a.roll, 0) - carKey(0, b.yaw, b.pitch, b.roll, 0));
  return { poses, spinPoses };
}

function carSpecs(): PictureSpec[] {
  const out: PictureSpec[] = [];
  const { poses, spinPoses } = poseWalk();
  console.log(`[sheets] car pose walk: ${poses.length} poses, ${spinPoses.length} for spinning cars`);
  const spinning = new Set(ALL_TRACK_TYPES.filter((t) => t.vehicle.spins).map((t) => t.render.car));
  CAR_SHAPES.forEach((shape, shapeIdx) => {
    for (const p of spinning.has(shape) ? spinPoses : poses) {
      for (const front of [0, 1] as const) {
        const yaw = (p.yaw / 16) * Math.PI * 2;
        const pitch = (p.pitch / 24) * Math.PI * 2;
        const roll = (p.roll / 16) * Math.PI * 2;
        out.push({
          pack: 'track',
          group: `car/${shape}`,
          kind: K_CAR,
          key: carKey(shapeIdx, p.yaw, p.pitch, p.roll, front),
          paint: () => withRoles(() => paintPicture(CAR_BOUNDS, (c) => paintCar(c, shape, yaw, pitch, SENTINEL.car, front === 1, Math.sin(roll), Math.cos(roll)))),
          ref: null,
        });
      }
    }
  });
  return out;
}

/** Pack `track` without the elevated paths: rails (swappable 1), supports (2), gates (0: real roofs), cars (3). */
export function trackSpecs(): PictureSpec[] {
  return [...railSpecs(), ...supportSpecs(), ...gateSpecs(), ...carSpecs()];
}

/** The sheet `swappable` value of a track group (`format.ts`: 1 rt, 2 rs, 3 rc). */
export function trackSwappable(group: string): number {
  if (group.startsWith('rail/')) return 1;
  if (group.startsWith('support/')) return 2;
  if (group.startsWith('car/')) return 3;
  return 0;
}

