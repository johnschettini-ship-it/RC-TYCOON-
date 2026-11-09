/**
 * Piece geometry (phase-2-coasters.md §4.1–4.3; Phase 6 §4.5 corkscrew and helix, W4-D). Owner: W1-G.
 * Each piece def gets a static sample table (one sample every 0.25 m) in its local frame:
 * entry tile (0, 0) spans metres [0, 4] × [0, 4], the entry joint is (0, 2), heading +x, entry height 0.
 * Sample tables are derived data built once per def; saves never store them.
 */
import { ALL_TRACK_PIECES, getTrackPieceDef, getTrackTypeDef, type TrackBank, type TrackPieceDef, type TrackSlope } from '../../../data/track';
import {
  BANK_ANGLE_DEG,
  CORKSCREW_KAPPA,
  CORKSCREW_RADIUS_M,
  CORKSCREW_RISE_M,
  GENTLE_PITCH_RAD,
  HELIX_LEAD_M,
  SAMPLE_STEP_MM,
  STEEP_PITCH_RAD,
  TILE_M,
} from '../../../data/tuning/track';
import { DEG, PI, TAU, tcos, tsin } from '../../trig';
import type { Dir } from '../../map';
import type { TrackDir, TrackPieceInstance } from './types';

/** Phase-2 track directions (`TrackDir`): 0 = +x, 1 = +y, 2 = −x, 3 = −y. A right turn is dir + 1. */
export const TRACK_DX: readonly number[] = Object.freeze([1, 0, -1, 0]);
export const TRACK_DY: readonly number[] = Object.freeze([0, 1, 0, -1]);

/**
 * Map `Dir` (0 = N −y, 1 = E +x, 2 = S +y, 3 = W −x) → `TrackDir` (0 = +x, 1 = +y, 2 = −x, 3 = −y):
 * E 1 → 0, S 2 → 1, W 3 → 2, N 0 → 3, i.e. (mapDir + 3) mod 4. Used at the command boundary.
 */
export function trackDirFromMapDir(dir: Dir): TrackDir {
  return ((dir + 3) % 4) as TrackDir;
}

export function slopePitch(slope: TrackSlope): number {
  switch (slope) {
    case 'G+':
      return GENTLE_PITCH_RAD;
    case 'G-':
      return -GENTLE_PITCH_RAD;
    case 'X+':
      return STEEP_PITCH_RAD;
    case 'X-':
      return -STEEP_PITCH_RAD;
    default:
      return 0;
  }
}

/** Positive = banked to the right (inside of a right turn lower). */
export function bankAngle(bank: TrackBank): number {
  if (bank === 'right') return BANK_ANGLE_DEG * DEG;
  if (bank === 'left') return -BANK_ANGLE_DEG * DEG;
  return 0;
}

export interface PieceSamples {
  n: number;
  /** Arc length (m). */
  s: Float64Array;
  /** Local position (m). */
  x: Float64Array;
  y: Float64Array;
  /** Rail height above the entry (m). */
  h: Float64Array;
  /** Pitch (rad). */
  theta: Float64Array;
  /** dh/ds: drives gravity so the work done equals the height change exactly. */
  sinT: Float64Array;
  /** cos(pitch). */
  cosT: Float64Array;
  sinB: Float64Array;
  cosB: Float64Array;
  kv: Float64Array;
  kh: Float64Array;
  /** Local heading in the ground plane (rad, + toward +y). */
  yaw: Float64Array;
  /** Index into `def.tiles` of the segment from sample k to k + 1. */
  segTile: Int32Array;
}

export interface PieceTileInfo {
  lx: number;
  ly: number;
  /** Integer rail range relative to the entry height (m). */
  railMin: number;
  railMax: number;
  /** The rail passes over this tile (false: reserved only, e.g. medium-turn corners). */
  rail: boolean;
}

export interface PieceStatic {
  def: TrackPieceDef;
  samples: PieceSamples;
  /** Same order as `def.tiles`. */
  tileInfo: PieceTileInfo[];
  /** Indices into `tileInfo`, in the order the rail visits them. */
  railOrder: number[];
}

export function entryJointLocal(): { x: number; y: number } {
  return { x: 0, y: TILE_M / 2 };
}

/** Rotate a vector by `d` quarter turns (+x → +y). */
function rotVec(u: number, v: number, d: number): [number, number] {
  switch (((d % 4) + 4) % 4) {
    case 0:
      return [u, v];
    case 1:
      return [-v, u];
    case 2:
      return [-u, -v];
    default:
      return [v, -u];
  }
}

/** Exit joint of a def in its local frame: the next piece's entry joint. */
export function exitJointLocal(def: TrackPieceDef): { x: number; y: number } {
  const half = TILE_M / 2;
  const [u, v] = rotVec(-half, 0, def.exit.turn);
  return { x: def.exit.dx * TILE_M + half + u, y: def.exit.dy * TILE_M + half + v };
}

const cache = new Map<string, PieceStatic>();

export function pieceStatic(defId: string): PieceStatic {
  let st = cache.get(defId);
  if (!st) {
    const def = getTrackPieceDef(defId);
    if (!def) throw new Error(`Unknown track piece ${defId}`);
    st = buildStatic(def);
    cache.set(defId, st);
  }
  return st;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** atan(x) for |x| ≤ 0.5 by its Taylor series (+ − × ÷ only, error < 1e-16): pitches of the Phase 6 pieces. */
export function atanSmall(x: number): number {
  const x2 = x * x;
  let p = x;
  let sum = x;
  for (let k = 1; k <= 30; k++) {
    p *= -x2;
    sum += p / (2 * k + 1);
  }
  return sum;
}

/** asin(x) for |x| ≤ 0.5 by its Taylor series (+ − × ÷ only, error < 1e-16). */
export function asinSmall(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let k = 1; k <= 30; k++) {
    term *= (x2 * (2 * k - 1) * (2 * k - 1)) / (2 * k * (2 * k + 1));
    sum += term;
  }
  return sum;
}

function buildStatic(def: TrackPieceDef): PieceStatic {
  const L = def.lengthMm / 1000;
  const n = Math.floor((def.lengthMm - 1) / SAMPLE_STEP_MM) + 2;
  const mk = (): Float64Array => new Float64Array(n);
  const sm: PieceSamples = {
    n, s: mk(), x: mk(), y: mk(), h: mk(), theta: mk(), sinT: mk(), cosT: mk(), sinB: mk(), cosB: mk(), kv: mk(), kh: mk(), yaw: mk(),
    segTile: new Int32Array(Math.max(1, n - 1)),
  };
  const th0 = slopePitch(def.entry.slope);
  const th1 = slopePitch(def.exit.slope);
  const b0 = bankAngle(def.entry.bank);
  const b1 = bankAngle(def.exit.bank);
  const dz = def.exit.dz;
  const g = def.geometry;
  const half = TILE_M / 2;

  // Transition constants (pitch linear in s, heights and x scaled to land exactly on the exit joint).
  const k = (th1 - th0) / L;
  const xr = (th: number): number => (tsin(th) - tsin(th0)) / k;
  const hr = (th: number): number => (tcos(th0) - tcos(th)) / k;
  const X = g.kind === 'transition' ? xr(th1) : 1;
  const H = g.kind === 'transition' ? hr(th1) : 1;
  // Loop: true arc length 16π m over four quarters (radii 12, 4, 4, 12).
  const LOOP = 16 * PI;
  // Corkscrew and helix (Phase 6): side sign (+1 right, −1 left).
  const side = g.kind === 'corkscrew' || g.kind === 'helix' ? (g.side === 'right' ? 1 : -1) : 0;

  // Straight and ramp pieces run along +x for `exit.dx` tiles (the water splashdown is 2 tiles long).
  const run = g.kind === 'straight' || g.kind === 'ramp' ? TILE_M * def.exit.dx : TILE_M;
  for (let i = 0; i < n; i++) {
    const smm = Math.min(i * SAMPLE_STEP_MM, def.lengthMm);
    const s = smm / 1000;
    const t = s / L;
    let x = run * t;
    let y = half;
    let h = dz * t;
    let th = th0;
    let sinT = dz / L;
    let beta = b0;
    let kv = 0;
    let kh = 0;
    let yaw = 0;
    switch (g.kind) {
      case 'straight':
        break;
      case 'ramp':
        // Constant pitch between flat joints; sinT = dz / L keeps the gravity work equal to the height change.
        th = slopePitch(g.slope);
        break;
      case 'transition':
        th = th0 + k * s;
        x = (TILE_M * xr(th)) / X;
        h = (dz * hr(th)) / H;
        sinT = (dz * tsin(th)) / H;
        kv = def.kv;
        break;
      case 'bank':
        beta = b0 + (b1 - b0) * t;
        sinT = 0;
        break;
      case 'turn': {
        const R = g.radiusM;
        const phi = (PI / 2) * t;
        x = R * tsin(phi);
        y = g.side === 'right' ? half + R - R * tcos(phi) : half - R + R * tcos(phi);
        h = 0;
        sinT = 0;
        kh = def.kh;
        yaw = g.side === 'right' ? phi : -phi;
        break;
      }
      case 'loop': {
        const st = t * LOOP;
        let x0: number;
        let h0: number;
        let thA: number;
        let R: number;
        if (st <= 6 * PI) {
          R = 12; thA = 0; x0 = 0; h0 = 0; th = st / 12;
        } else if (st <= 8 * PI) {
          R = 4; thA = PI / 2; x0 = 12; h0 = 12; th = PI / 2 + (st - 6 * PI) / 4;
        } else if (st <= 10 * PI) {
          R = 4; thA = PI; x0 = 8; h0 = 16; th = PI + (st - 8 * PI) / 4;
        } else {
          R = 12; thA = (3 * PI) / 2; x0 = 4; h0 = 12; th = (3 * PI) / 2 + (st - 10 * PI) / 12;
        }
        x = x0 + R * (tsin(th) - tsin(thA));
        h = h0 + R * (tcos(thA) - tcos(th));
        sinT = (tsin(th) * LOOP) / L;
        kv = 1 / R;
        const shift = TILE_M * smooth(t);
        y = g.side === 'right' ? half + shift : half - shift;
        break;
      }
      case 'corkscrew': {
        // The car rolls a full turn toward `side`; the rail spirals round the riders' heartline at radius D, so the rail
        // sits at heartline − D × (car up). The heartline rises CORKSCREW_RISE_M and comes back (zero slope at the
        // joints). Gravity follows the heartline (sinT = its slope), so the net work is 0; the G estimate uses a
        // curvature toward the riders that grows as sin(π t) (κ rule): κv = κ cos β, κh = κ sin β.
        const D = CORKSCREW_RADIUS_M;
        const run3 = TILE_M * def.exit.dx;
        beta = side * TAU * t;
        const sb = tsin(beta);
        const cb = tcos(beta);
        const c2 = tcos(TAU * t);
        const s2 = tsin(TAU * t);
        x = run3 * t;
        y = half - D * sb;
        h = D + (CORKSCREW_RISE_M * (1 - c2)) / 2 - D * cb;
        th = atanSmall((CORKSCREW_RISE_M * PI * s2) / run3);
        sinT = (CORKSCREW_RISE_M * PI * s2) / L;
        const kc = CORKSCREW_KAPPA * tsin(PI * t);
        kv = kc * cb;
        kh = kc * sb;
        break;
      }
      case 'helix': {
        // Lead in along the entry row, a full circle toward `side` from the tangent point, lead out along the same row.
        // Bank rolls in over the lead in and out over the lead out; the height follows a smooth step (level joints).
        const R = g.radiusM;
        const circ = TAU * R;
        const P = 2 * HELIX_LEAD_M + circ;
        const p = P * t;
        let bankShare: number;
        if (p <= HELIX_LEAD_M) {
          x = p;
          y = half;
          bankShare = p / HELIX_LEAD_M;
        } else if (p <= HELIX_LEAD_M + circ) {
          const phi = (p - HELIX_LEAD_M) / R;
          x = HELIX_LEAD_M + R * tsin(phi);
          y = half + side * R * (1 - tcos(phi));
          yaw = side * phi;
          kh = side / R;
          bankShare = 1;
        } else {
          const q = p - HELIX_LEAD_M - circ;
          x = HELIX_LEAD_M + q;
          y = half;
          yaw = side * TAU;
          bankShare = 1 - q / HELIX_LEAD_M;
        }
        beta = side * BANK_ANGLE_DEG * DEG * bankShare;
        h = dz * smooth(t);
        sinT = (dz * 6 * t * (1 - t)) / L;
        th = asinSmall(sinT);
        kv = (dz * 6 * (1 - 2 * t)) / (L * L);
        break;
      }
    }
    sm.s[i] = s;
    sm.x[i] = x;
    sm.y[i] = y;
    sm.h[i] = h;
    sm.theta[i] = th;
    sm.sinT[i] = sinT;
    sm.cosT[i] = tcos(th);
    sm.sinB[i] = tsin(beta);
    sm.cosB[i] = tcos(beta);
    sm.kv[i] = kv;
    sm.kh[i] = kh;
    sm.yaw[i] = yaw;
  }
  // Snap the last sample onto the exact exit joint (removes float residue below 1e-12).
  const ex = exitJointLocal(def);
  sm.x[n - 1] = ex.x;
  sm.y[n - 1] = ex.y;
  sm.h[n - 1] = dz;
  sm.h[0] = 0;

  // Tile of each segment, from the segment midpoint.
  const tileIndexOf = new Map<string, number>(def.tiles.map(([tx, ty], i) => [`${tx},${ty}`, i]));
  const lo = new Array<number>(def.tiles.length).fill(Infinity);
  const hi = new Array<number>(def.tiles.length).fill(-Infinity);
  const railOrder: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const mx = ((sm.x[i] as number) + (sm.x[i + 1] as number)) / 2;
    const my = ((sm.y[i] as number) + (sm.y[i + 1] as number)) / 2;
    const key = `${Math.floor(mx / TILE_M)},${Math.floor(my / TILE_M)}`;
    const ti = tileIndexOf.get(key);
    if (ti === undefined) throw new Error(`Piece ${def.id}: sample ${i} leaves its tiles (${key})`);
    sm.segTile[i] = ti;
    lo[ti] = Math.min(lo[ti] as number, sm.h[i] as number, sm.h[i + 1] as number);
    hi[ti] = Math.max(hi[ti] as number, sm.h[i] as number, sm.h[i + 1] as number);
    if (!railOrder.includes(ti)) railOrder.push(ti);
  }
  const tileInfo: PieceTileInfo[] = def.tiles.map(([lx, ly], i) => {
    const rail = railOrder.includes(i);
    return {
      lx,
      ly,
      railMin: rail ? Math.floor((lo[i] as number) + 1e-9) + 0 : def.railMin,
      railMax: rail ? Math.ceil((hi[i] as number) - 1e-9) + 0 : def.railMax,
      rail,
    };
  });
  return { def, samples: sm, tileInfo, railOrder };
}

/** Build every sample table now (start-up). */
export function buildAllPieceStatics(): void {
  for (const d of ALL_TRACK_PIECES) pieceStatic(d.id);
}

export interface Joint {
  /** Entry tile of the next piece. */
  x: number;
  y: number;
  z: number;
  dir: TrackDir;
  slope: TrackSlope;
  bank: TrackBank;
}

export function pieceDef(piece: TrackPieceInstance): TrackPieceDef {
  const def = getTrackPieceDef(piece.defId);
  if (!def) throw new Error(`Unknown track piece ${piece.defId}`);
  return def;
}

/** The joint at the end of a placed piece. */
export function pieceExitJoint(piece: TrackPieceInstance): Joint {
  const def = pieceDef(piece);
  const [ox, oy] = rotVec(def.exit.dx, def.exit.dy, piece.dir);
  return {
    x: piece.x + ox,
    y: piece.y + oy,
    z: piece.z + def.exit.dz,
    dir: ((piece.dir + def.exit.turn + 4) % 4) as TrackDir,
    slope: def.exit.slope,
    bank: def.exit.bank,
  };
}

/** The joint at the start of a placed piece. */
export function pieceEntryJoint(piece: TrackPieceInstance): Joint {
  const def = pieceDef(piece);
  return { x: piece.x, y: piece.y, z: piece.z, dir: piece.dir, slope: def.entry.slope, bank: def.entry.bank };
}

export function jointsEqual(a: Joint, b: Joint): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z && a.dir === b.dir && a.slope === b.slope && a.bank === b.bank;
}

export interface WorldPieceTile {
  x: number;
  y: number;
  /** Absolute integer rail range (m). */
  railMin: number;
  railMax: number;
  rail: boolean;
}

/** World tiles of a placed piece, in `def.tiles` order. */
export function pieceWorldTiles(piece: TrackPieceInstance): WorldPieceTile[] {
  const st = pieceStatic(piece.defId);
  return st.tileInfo.map((t) => {
    const [rx, ry] = rotVec(t.lx, t.ly, piece.dir);
    return { x: piece.x + rx, y: piece.y + ry, railMin: piece.z + t.railMin, railMax: piece.z + t.railMax, rail: t.rail };
  });
}

/** Local metres → world metres (tile x covers [4x, 4x + 4]). */
export function localToWorld(piece: TrackPieceInstance, px: number, py: number): { x: number; y: number } {
  const half = TILE_M / 2;
  const [u, v] = rotVec(px - half, py - half, piece.dir);
  return { x: piece.x * TILE_M + half + u, y: piece.y * TILE_M + half + v };
}

/** World heading (rad, 0 = +x, π/2 = +y) of a local heading. */
export function worldYaw(piece: TrackPieceInstance, localYaw: number): number {
  return localYaw + (piece.dir * PI) / 2;
}

/**
 * Pieces of a type whose entry matches an end state (palette, §7.1): pieces of the type's set (rail, flume, or rapids)
 * in its groups. `afterStation`: the end is the station run.
 */
export function piecesForEnd(typeId: string, slope: TrackSlope, bank: TrackBank, afterStation = false): TrackPieceDef[] {
  const type = getTrackTypeDef(typeId);
  if (!type) return [];
  return ALL_TRACK_PIECES.filter(
    (p) =>
      p.set === type.pieceSet &&
      type.groups.includes(p.group) &&
      !type.excludePieces.includes(p.id) &&
      p.entry.slope === slope &&
      p.entry.bank === bank &&
      (p.special !== 'station' || afterStation),
  );
}
