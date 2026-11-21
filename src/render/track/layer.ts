/**
 * Track rendering layer (phase-2 §4.13). Owner: W2-A.
 * - Pieces: each occupied rail tile is a slice sprite holding the rail samples inside that tile and its supports (one
 *   per elevated rail run, beside any lower rail on the tile: `chooseRunSupport`; a goalpost over lower rail where the
 *   rail would span too far: `addGoalposts`, its beam in the slice, its two legs drawables of their own tiles).
 *   Slices sort with every other drawable by (x + y, railMin, layer). At most 20 slices are built per frame;
 *   a slice still waiting draws as a plain line. Slices rebuild when the track, the zoom bucket, or the view
 *   rotation changes.
 * - Chain lifts: moving dashes (tick mod 8) drawn per frame right after their slice, never cached.
 * - Trains: cars at the interpolated train position every frame; car sprites cached by (shape, yaw step,
 *   pitch step, colour, zoom bucket); riders drawn as heads in shirt colours; spinning cars add a spin frame.
 * - Gates: entrance and exit booths beside the station.
 * - Water rides (Phase 4 §4.4): channel slices; the water surface ripples per frame (an overlay like the chain);
 *   boats on a splashdown or waterfall throw spray.
 * - Builder overlay: station, piece, and gate ghosts with cost, height tag, and reason icon.
 * Frames do not allocate in the per-slice or per-car loops: buffers grow by doubling and are reused.
 */
import { getTrackRideDef } from '../../data/catalog/trackRides';
import { getTrackPieceDef, getTrackTypeDef, type PieceSpecial, type TrackTypeDef } from '../../data/track';
import { TILE_M } from '../../data/tuning/track';
import { pieceWorldSamples, trackTileSlices, trainSpinFrame } from '../../sim/rides/track/api';
import { getLayout, newSamplePoint, type CircuitLayout } from '../../sim/rides/track/layout';
import { buildOccupancy, type Occupancy } from '../../sim/rides/track/placement';
import { Content, inBounds, tileIndex } from '../../sim/map';
import type { TrackPieceInstance, TrackRideData } from '../../sim/rides/track/types';
import type { World } from '../../sim/types';
import type { ZoomBucket } from '../camera';
import { buildSprite } from '../canvas';
import { Layer } from '../depth';
import {
  GHOST_DARK_INVALID,
  GHOST_DARK_VALID,
  GHOST_FILL_INVALID,
  GHOST_INVALID,
  GHOST_LIGHT_INVALID,
  GHOST_LIGHT_VALID,
  ghostFill,
  ghostLineWidth,
  ghostStroke,
  mix32,
  shade,
  SHIRT_COLOURS,
  TAG_COLOURS,
} from '../palette';
import { bucketIndex, SpriteCache, type Sprite } from '../spriteCache';
import { drawGhostIcon } from '../sprites/props';
import type { ArtBounds } from '../sprites/rides';
import { SKIN_TONES } from '../sprites/shapes';
import type { ToolState } from '../types';
import type { RealLook } from '../real/look';
import type { ViewRotation } from '../view';
import { quantisePose } from '../real/pose';
import { SUPPORT_TOP_BELOW_RAIL, supportStack, type SupportPiece } from '../real/supportStack';
import { paletteColour } from './colours';
import {
  CAR_BOUNDS,
  carDims,
  GATE_BOUNDS,
  riderHeightM,
  lookFor,
  lookForPiece,
  paintCar,
  paintGateBooth,
  paintBox,
  paintGoalLeg,
  paintGoalPost,
  paintGoalpost,
  paintRun,
  paintSupport,
  Projector,
  type CarShape,
  type RailLook,
  type SupportStyle,
  type TrackColours,
  type WorldSamples,
} from './paint';
import {
  carCentreMm,
  carPoseAt,
  interpolatedS,
  isoX,
  isoY,
  newCarPose,
  pitchStep,
  projectX,
  PX_Z,
  rollStep,
  projectY,
  pointDepthM,
  tileDepthView,
  trackFrame,
  viewFrame,
  viewX,
  viewY,
  viewYaw,
  yawStep,
  type ViewFrame,
} from './project';
import { trackToolOf, type TrackPieceGhost } from './toolState';
// Last: its imports must not move the website bundle's module order (it is realistic-only and folds away there).
import { CAR_SHADOW_HALF_W, railShadowPlane, sunShift, withShadowReach } from '../real/trackShadow';
import { CHAIN_LINE_M, CHAIN_STYLE } from '../real/trackChain';

/** Draw-list kind for track drawables (outside the renderer's own kind numbers). */
export const KIND_TRACK = 40;

const SUB_SLICE = 0;
const SUB_CHAIN = 1;
const SUB_CAR = 2;
const SUB_GATE = 3;
const SUB_WATER = 4;
/** A goalpost leg (2026-11-21): a drawable of the tile it stands on, not of its saddle's. */
export const SUB_GOAL_LEG = 5;

/** §4.13: at most 20 slices rebuild per frame. */
export const MAX_SLICE_BUILDS_PER_FRAME = 20;
const MAX_CAR_BUILDS_PER_FRAME = 32;

/** The renderer's draw list (structural, so the renderer keeps its class private). */
export interface DrawSink {
  push(kind: number, ref: number, sub: number, ax: number, ay: number, skey: number, depth: number, z: number, layer: number): void;
}

export interface ViewBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Car shapes by cache index (Phase 6 shapes appended, so older indices stay). */
const CAR_SHAPES: readonly CarShape[] = ['coaster', 'junior', 'loco', 'mouse', 'ghost', 'kart', 'log', 'raft', 'inverted', 'bobsled', 'monorail', 'launch', 'ore', 'boat', 'flying', 'gondola'];

export interface SliceRec {
  rideId: number;
  pieceIndex: number;
  x: number;
  y: number;
  railMin: number;
  ground: number;
  depth: number;
  /** Anchor (world px): the tile centre at height 0. */
  ax: number;
  ay: number;
  bounds: ArtBounds;
  samples: WorldSamples;
  /** Sample ranges inside this tile: pairs k0, k1. */
  runs: number[];
  /** The slice's first support (`supports[0]`), or null: older callers and the realistic look's single-support paths. */
  support: SupportRec | null;
  /** Every support of the slice: one per elevated rail run (a helix tile holds its ground lead and its upper ring). */
  supports: SupportRec[];
  special: PieceSpecial;
  /** Water channel slice (ripple overlay) and lift conveyor (belt cleats). */
  water: boolean;
  conveyor: boolean;
  look: RailLook;
  supportStyle: SupportStyle;
  colours: TrackColours;
  key: string;
  sprites: Array<Sprite | null>;
  /** Realistic look: the ride's data (type id, live colours), the piece id, and this slice's number among the piece's rail tiles. */
  data: TrackRideData;
  pieceId: string;
  tile: number;
}

interface RideSig {
  data: TrackRideData;
  pieces: TrackPieceInstance[];
  n: number;
  last: TrackPieceInstance | undefined;
  track: number;
  supports: number;
}

const sampleCache = new WeakMap<TrackPieceInstance, WorldSamples>();
const NO_DASH: number[] = [];
/** Boats faster than this on a splashdown or waterfall throw spray (mm/s). */
const SPRAY_MIN_MMS = 2500;
const tagMemo = new Map<string, 'thrill' | 'family' | 'chill'>();

/** Catalog tag of a track ride type (memoized: the gate loop runs every frame). */
function tagOf(defId: string): 'thrill' | 'family' | 'chill' {
  let t = tagMemo.get(defId);
  if (!t) {
    t = getTrackRideDef(defId)?.tag ?? 'thrill';
    tagMemo.set(defId, t);
  }
  return t;
}

/** World samples of a placed piece (cached per piece instance; its geometry never changes). */
export function samplesOf(piece: TrackPieceInstance): WorldSamples {
  let s = sampleCache.get(piece);
  if (!s) {
    s = pieceWorldSamples(piece);
    sampleCache.set(piece, s);
  }
  return s;
}

/** Sample ranges [k0, k1] of a piece whose segments lie in tile (x, y) (segment midpoint rule, as the sim). */
export function runsInTile(s: WorldSamples, x: number, y: number): number[] {
  const out: number[] = [];
  let start = -1;
  for (let k = 0; k < s.n - 1; k++) {
    const mx = ((s.x[k] as number) + (s.x[k + 1] as number)) / 2;
    const my = ((s.y[k] as number) + (s.y[k + 1] as number)) / 2;
    const inside = Math.floor(mx / TILE_M) === x && Math.floor(my / TILE_M) === y;
    if (inside && start < 0) start = k;
    if (!inside && start >= 0) {
      out.push(start, k);
      start = -1;
    }
  }
  if (start >= 0) out.push(start, s.n - 1);
  return out;
}

/** The support point of a slice: the sample nearest the tile centre, or the lowest one where the rail climbs far. */
export function supportSample(s: WorldSamples, runs: readonly number[], x: number, y: number): number {
  const cx = (x + 0.5) * TILE_M;
  const cy = (y + 0.5) * TILE_M;
  let lo = Infinity;
  let hi = -Infinity;
  for (let r = 0; r < runs.length; r += 2) {
    for (let k = runs[r] as number; k <= (runs[r + 1] as number); k++) {
      lo = Math.min(lo, s.z[k] as number);
      hi = Math.max(hi, s.z[k] as number);
    }
  }
  const lowest = hi - lo > 6;
  let best = runs[0] as number;
  let bestD = Infinity;
  for (let r = 0; r < runs.length; r += 2) {
    for (let k = runs[r] as number; k <= (runs[r + 1] as number); k++) {
      const dx = (s.x[k] as number) - cx;
      const dy = (s.y[k] as number) - cy;
      const d = lowest ? (s.z[k] as number) * 1000 + dx * dx + dy * dy : dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
  }
  return best;
}

/**
 * One support: it stands at (wx, wy) from `base` (the tile's ground, or the rail of another piece it stands on where
 * track is stacked over track) up to `top` (under the rail, or the top of an inverted track's spine).
 */
export interface SupportRec {
  wx: number;
  wy: number;
  yaw: number;
  top: number;
  base: number;
  /** A goalpost (2026-11-21): the rail is over other rail, so two legs beside it hold a beam the support stands on. */
  goal?: GoalPost;
}

/**
 * A goalpost under rail that lies over other rail (2026-11-21): legs at (x0, y0) and (x1, y1) on the ground (the
 * support's `base`), each clear of every rail's car envelope as a column is, joined by a level beam whose top is `z`
 * (GOAL_BEAM_DEPTH deep, over the lower cars); the support's saddle stands on the beam at (wx, wy), under its rail.
 */
export interface GoalPost {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z: number;
}

/**
 * Rail under a candidate support point (2026-11-20, stacked supports): the samples of the slice's own piece (`index` is
 * the sample's number in that piece, so the track next to the candidate along its own run never blocks it) and the
 * samples of other pieces on the tile (`other` 1, `index` −1).
 */
export interface SupportObstacles {
  n: number;
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  other: Uint8Array;
  index: Int32Array;
  /** How much further (m) than SUPPORT_CLEAR_MIN the sample's cars reach to a side: a banked car tips out (`bankReach`). */
  reach?: Float64Array;
  /** How high (m) the sample's cars reach over its rail line, riders' heads and banking included (`carTopOf`); goalposts only. */
  top?: Float64Array;
  /** Goalpost legs only: how much further a station deck or a water channel reaches beside the sample (m). */
  legReach?: Float64Array;
}

/** A rail point at least this far (m) over its base gets a support (a tile whose lowest rail is higher always has one). */
const SUPPORT_MIN_H = 1.5;
/** Rail lower than a candidate by more than this (m) is under it. */
const SUPPORT_UNDER_M = 0.5;
/**
 * Plan distance (m) from a column to rail under it. SUPPORT_CLEAR_MIN is the car envelope (2026-11-21): the widest
 * upright car is 0.8 m to a side of its rail (`carDims` b: boat 0.8, coaster 0.78, launch 0.74, ore 0.72) and the
 * bobsled trough 0.85 m (`channel`), plus 0.15 m for the column, so no column stands where a car or sled passes.
 * SUPPORT_CLEAR_GOOD adds room for a clear look.
 */
const SUPPORT_CLEAR_GOOD = 1.5;
const SUPPORT_CLEAR_MIN = 1;
/** A car banked by β reaches b·cosβ + h1·|sinβ| to its low side (b 0.8, h1 0.9 m, the tallest car top): this much more. */
function bankReach(bankCos: number): number {
  const sin = Math.sqrt(Math.max(0, 1 - bankCos * bankCos));
  return Math.max(0, 0.8 * bankCos + 0.9 * sin + 0.15 - SUPPORT_CLEAR_MIN);
}
/** Samples (0.25 m each) along its own piece that never block a candidate: the track it is part of. */
const SUPPORT_NEAR_ALONG = 16;
/** Runs shorter than this many samples on a tile with several runs get no support of their own (a corner clipped). */
const SUPPORT_MIN_RUN = 6;
/** A second support of a slice no nearer than this (m) to one it already has. */
const SUPPORT_SPACING = 2;

/**
 * The support of one rail run `[k0, k1]` of a piece on a tile with centre (cx, cy) m: among the run's upright samples
 * (not inverted, not near vertical) at least `minH` over the ground (hanging cars: any height, the arm holds the spine
 * above), the nearest the tile centre whose column keeps SUPPORT_CLEAR_GOOD from every rail under it (of other pieces on
 * the tile, and of its own piece further along: a helix's entry lead under its exit lead); else the one with the most
 * room if that is at least SUPPORT_CLEAR_MIN, the car envelope. Every column goes to the ground; none stands on or
 * beside lower rail inside the envelope, where its cars would run through it (2026-11-21: the earlier stacked column,
 * standing on the lower rail's centre line, did). Limits: only rail on this tile is checked (rail across the tile edge
 * is not), the check is at the rail sample (hanging cars' columns stand at the arm offset, not checked there), and the
 * single-run and owned-tile fallbacks are not checked. Rail directly over lower rail along a row gets no column (up to
 * MAX_UNSUPPORTED_TILES of span): a goalpost holds it when the span is long (`addGoalposts`, after the columns). Null on a tile whose ground is not the track's (`groundOk` false: a
 * path under it) or when no point qualifies: the rail then spans to the next support. `fits(k)` turns a point down (a
 * column too near one the slice already has), so the run takes its next best.
 */
export function chooseRunSupport(s: WorldSamples, k0: number, k1: number, ground: number, groundOk: boolean, ob: SupportObstacles, cx: number, cy: number, minH = SUPPORT_MIN_H, fits: (k: number) => boolean = () => true): { k: number; base: number } | null {
  if (!groundOk) return null;
  let bestA = -1;
  let scoreA = Infinity;
  let bestB = -1;
  let scoreB = -Infinity;
  for (let k = k0; k <= k1; k++) {
    const z = s.z[k] as number;
    if (z - ground < minH) continue;
    if (Math.cos(s.pitch[k] as number) < 0.5 || (s.bankCos[k] as number) < 0.5) continue;
    const x = s.x[k] as number;
    const y = s.y[k] as number;
    let clear = Infinity;
    for (let j = 0; j < ob.n; j++) {
      if ((ob.z[j] as number) >= z - SUPPORT_UNDER_M) continue;
      if ((ob.other[j] as number) === 0 && Math.abs((ob.index[j] as number) - k) < SUPPORT_NEAR_ALONG) continue;
      const d = Math.hypot((ob.x[j] as number) - x, (ob.y[j] as number) - y) - (ob.reach ? (ob.reach[j] as number) : 0);
      if (d < clear) clear = d;
    }
    if (clear >= SUPPORT_CLEAR_GOOD) {
      const dc = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (dc < scoreA && fits(k)) {
        scoreA = dc;
        bestA = k;
      }
    } else if (clear >= SUPPORT_CLEAR_MIN && clear > scoreB && fits(k)) {
      scoreB = clear;
      bestB = k;
    }
  }
  if (bestA >= 0) return { k: bestA, base: ground };
  if (bestB >= 0) return { k: bestB, base: ground };
  return null;
}

/**
 * Goalposts (2026-11-21): where rail lies over other rail no column fits clear of the lower cars (a helix's exit lead
 * over its entry lead, a ride running along a row over another), so the rail spanned up to 8-11 m. A goalpost stands
 * two legs on the ground beside the lower rail, each clear of every rail's car envelope by the column check, joined by
 * a level beam across under the upper rail; the support's saddle sits on the beam. The beam's top is
 * SUPPORT_TOP_BELOW_RAIL (1.2 m, where the realistic saddle's plate stands) under the upper rail line, and its bottom,
 * GOAL_BEAM_DEPTH lower, keeps GOAL_HEAD_CLEAR over the top of every car whose envelope it crosses: the car's height
 * over its rail line with riders' heads (`riderHeightM`: carDims h1 + 0.3 m, the coaster's 1.15 m, the loco's 2.0 m;
 * a hanging car's rail and spine, its look's lift + 0.6 m), a banked car's top h·cosβ + 0.8·|sinβ|. Hanging cars
 * (arm supports) and the sky ride (towers) get none: their supports stand beside the track already.
 */
const GOAL_TOP_BELOW_RAIL = SUPPORT_TOP_BELOW_RAIL;
/** The beam's depth (m): a column's width, a lattice truss's 0.6 m. */
export const GOAL_BEAM_DEPTH = 0.6;
/** Room (m) between the top of a car (riders' heads included) and the beam. */
export const GOAL_HEAD_CLEAR = 0.2;
/** Rail this far (m) above a beam's top passes over it: its spine, saddles and beams hang no lower. */
const GOAL_RAIL_BELOW = 1.2;
/** Most plan distance (m) between the legs: a beam longer than a tile's width reads as a bridge, not a support. */
export const GOAL_BEAM_MAX = 4;
/** A leg goes no further than this (m) from the rail it holds (the slice's bounds pad is 3.2 m). */
const GOAL_LEG_MAX = 3;
const GOAL_LEG_STEP = 0.1;
/** A lattice leg's two posts stand this far (m) to each side of its axis (paint.ts lattice; the realistic bents' LEG). */
const LATTICE_POST_HALF = 0.75;
/** Beam angles tried (rad from square across the rail), in order. */
const GOAL_SKEWS = [0, 0.2618, -0.2618, 0.5236, -0.5236, 0.7854, -0.7854];
/** A leg's footing's half width (m): the realistic concrete foot's radius (today's footing is narrower). */
const GOAL_FOOT_HALF = 0.4;
/** Legs and other supports of the ride keep this far apart (m). */
const GOAL_LEG_SPACING = 0.8;
/** Points of a long stretch tried for a goalpost: every this many samples (0.25 m each). */
const GOAL_TRY_EVERY = 4;
/** Stretches of unheld rail longer than this (m) get goalposts where rail lies over rail. */
export const GOAL_SPAN_M = 5.5;

/** How high a type's cars reach over their rail line (m), riders' heads included (goalpost beams clear it). */
export function carTopOf(type: TrackTypeDef): number {
  const look = lookFor(type);
  if ((look.lift ?? 0) > 0) return (look.lift as number) + 0.6;
  const shape = type.render.car;
  return Math.max(riderHeightM(shape, carDims(shape, false)), riderHeightM(shape, carDims(shape, true)));
}

/** Plan distance from (px, py) to the segment (x0, y0)-(x1, y1). */
function segDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2)) : 0;
  const ex = px - x0 - t * dx;
  const ey = py - y0 - t * dy;
  return Math.sqrt(ex * ex + ey * ey);
}

/** A bucket grid (GRID_M cells) over an obstacle set, so a goalpost's checks read only the rail near a point. */
interface ObGrid {
  /** The most any sample's envelope grows past SUPPORT_CLEAR_MIN for a leg (banked reach and deck or channel). */
  reach: number;
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  start: Int32Array;
  idx: Int32Array;
}
const GRID_M = 1;
const gridCache = new WeakMap<SupportObstacles, ObGrid>();

function gridOf(ob: SupportObstacles): ObGrid {
  let g = gridCache.get(ob);
  if (g) return g;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let reach = 0;
  for (let j = 0; j < ob.n; j++) {
    reach = Math.max(reach, (ob.reach ? (ob.reach[j] as number) : 0) + (ob.legReach ? (ob.legReach[j] as number) : 0));
    x0 = Math.min(x0, ob.x[j] as number);
    y0 = Math.min(y0, ob.y[j] as number);
    x1 = Math.max(x1, ob.x[j] as number);
    y1 = Math.max(y1, ob.y[j] as number);
  }
  if (ob.n === 0) x0 = y0 = x1 = y1 = 0;
  const nx = Math.floor((x1 - x0) / GRID_M) + 1;
  const ny = Math.floor((y1 - y0) / GRID_M) + 1;
  const cell = new Int32Array(ob.n);
  const start = new Int32Array(nx * ny + 1);
  for (let j = 0; j < ob.n; j++) {
    const c = Math.floor(((ob.y[j] as number) - y0) / GRID_M) * nx + Math.floor(((ob.x[j] as number) - x0) / GRID_M);
    cell[j] = c;
    start[c + 1] = (start[c + 1] as number) + 1;
  }
  for (let c = 0; c < nx * ny; c++) start[c + 1] = (start[c + 1] as number) + (start[c] as number);
  const fill = start.slice(0, nx * ny);
  const idx = new Int32Array(ob.n);
  for (let j = 0; j < ob.n; j++) {
    const c = cell[j] as number;
    idx[fill[c] as number] = j;
    fill[c] = (fill[c] as number) + 1;
  }
  g = { reach, x0, y0, nx, ny, start, idx };
  gridCache.set(ob, g);
  return g;
}

/** Every obstacle in the grid cells over the box [xa, xb] × [ya, yb]; `fn` returns true to stop (then this returns true). */
function eachNear(ob: SupportObstacles, xa: number, ya: number, xb: number, yb: number, fn: (j: number) => boolean): boolean {
  const g = gridOf(ob);
  const ca = Math.max(0, Math.floor((xa - g.x0) / GRID_M));
  const cb = Math.min(g.nx - 1, Math.floor((xb - g.x0) / GRID_M));
  const ra = Math.max(0, Math.floor((ya - g.y0) / GRID_M));
  const rb = Math.min(g.ny - 1, Math.floor((yb - g.y0) / GRID_M));
  for (let r = ra; r <= rb; r++) {
    for (let c = ca; c <= cb; c++) {
      const cell = r * g.nx + c;
      for (let i = g.start[cell] as number; i < (g.start[cell + 1] as number); i++) if (fn(g.idx[i] as number)) return true;
    }
  }
  return false;
}

/**
 * A goalpost for the rail at sample k of `s` (on ground `ground`), or null. The beam runs across the rail, square to
 * its heading first, then skewed up to 45° (GOAL_SKEWS: a leg can stand inside a helix's ring while the rail it holds
 * runs on past the ring). Each leg is the nearest point to its side of the rail, at most GOAL_LEG_MAX out, on ground
 * `legGround` gives as `ground` (a flat track tile of the same height; NaN elsewhere), whose plan distance to every rail
 * lower than the rail (`SUPPORT_UNDER_M`) less its banked reach and, for a leg, its station deck or water channel
 * (`ob.legReach`) is at least SUPPORT_CLEAR_GOOD, else SUPPORT_CLEAR_MIN (the column check); no nearer than
 * GOAL_LEG_SPACING to any of `avoid` (supports of the ride, legs included) or to other rail above it (another ride's
 * column may stand there). The legs are at most GOAL_BEAM_MAX apart. The beam keeps clear of the cars of every rail
 * whose envelope it crosses (`ob.top`, GOAL_HEAD_CLEAR), of every support of `avoid` taller than its bottom, and of
 * other rail right over it (a column of that rail would stand through it). Own-piece samples within SUPPORT_NEAR_ALONG
 * of k (the rail it holds) never block the beam. `postHalf`: a lattice leg's two posts, each checked. The best is the
 * shortest beam, a metre longer per leg only SUPPORT_CLEAR_MIN clear and half a metre per radian of skew; a square beam
 * with both legs SUPPORT_CLEAR_GOOD clear is taken at once.
 */
export function chooseGoalpost(
  s: WorldSamples,
  k: number,
  ground: number,
  ob: SupportObstacles,
  legGround: (x: number, y: number) => number,
  avoid: readonly { wx: number; wy: number; top: number }[] = [],
  postHalf = 0,
): GoalPost | null {
  const z = s.z[k] as number;
  if (z - ground < SUPPORT_MIN_H) return null;
  if (Math.cos(s.pitch[k] as number) < 0.5 || (s.bankCos[k] as number) < 0.5) return null;
  const top = z - GOAL_TOP_BELOW_RAIL;
  const bot = top - GOAL_BEAM_DEPTH;
  if (bot - ground < 0.5) return null;
  const x = s.x[k] as number;
  const y = s.y[k] as number;
  const yaw = s.yaw[k] as number;
  // a leg spot reads the rail within SUPPORT_CLEAR_GOOD plus the furthest envelope growth
  const R = Math.max(GOAL_LEG_SPACING, SUPPORT_CLEAR_GOOD + gridOf(ob).reach);
  // 2: SUPPORT_CLEAR_GOOD clear, 1: SUPPORT_CLEAR_MIN, 0: not a leg spot
  let worst = Infinity;
  const postClass = (lx: number, ly: number): number => {
    if (legGround(lx, ly) !== ground) return 0;
    for (const a of avoid) {
      const ax = a.wx - lx;
      const ay = a.wy - ly;
      if (ax * ax + ay * ay < GOAL_LEG_SPACING * GOAL_LEG_SPACING) return 0;
    }
    worst = Infinity;
    const stop = eachNear(ob, lx - R, ly - R, lx + R, ly + R, (j) => {
      const ex = (ob.x[j] as number) - lx;
      const ey = (ob.y[j] as number) - ly;
      const d0 = Math.sqrt(ex * ex + ey * ey);
      const oz = ob.z[j] as number;
      if (oz >= z - SUPPORT_UNDER_M) return (ob.other[j] as number) === 1 && d0 < GOAL_LEG_SPACING;
      const d = d0 - (ob.reach ? (ob.reach[j] as number) : 0) - (ob.legReach ? (ob.legReach[j] as number) : 0);
      if (d < worst) worst = d;
      return d < SUPPORT_CLEAR_MIN;
    });
    if (stop) return 0;
    return worst >= SUPPORT_CLEAR_GOOD ? 2 : 1;
  };
  const legClass = (lx: number, ly: number, bx: number, by: number): number => {
    if (postHalf <= 0) return postClass(lx, ly);
    // a lattice leg's posts, square to the beam (website) and to the beam's nearest map axis (the realistic bents)
    const q = (Math.round(Math.atan2(by, bx) / (Math.PI / 2)) * Math.PI) / 2;
    let c = 2;
    for (const [rx, ry] of [[-by, bx], [-Math.sin(q), Math.cos(q)]] as const) {
      for (const sg of [-1, 1]) {
        c = Math.min(c, postClass(lx + rx * postHalf * sg, ly + ry * postHalf * sg));
        if (c === 0) return 0;
      }
    }
    return c;
  };
  const beamOk = (x0: number, y0: number, x1: number, y1: number): boolean => {
    const e = SUPPORT_CLEAR_MIN + 0.4;
    const hit = eachNear(ob, Math.min(x0, x1) - e, Math.min(y0, y1) - e, Math.max(x0, x1) + e, Math.max(y0, y1) + e, (j) => {
      if ((ob.other[j] as number) === 0 && Math.abs((ob.index[j] as number) - k) < SUPPORT_NEAR_ALONG) return false;
      const reach = ob.reach ? (ob.reach[j] as number) : 0;
      const d = segDist(ob.x[j] as number, ob.y[j] as number, x0, y0, x1, y1);
      const oz = ob.z[j] as number;
      // rail over the beam passes, unless another rail right over it could have a column through it
      if (oz - GOAL_RAIL_BELOW >= top) return (ob.other[j] as number) === 1 && d < GOAL_LEG_SPACING;
      if (d >= SUPPORT_CLEAR_MIN + reach) return false;
      const carTop = ob.top ? (ob.top[j] as number) : 1.2 + reach;
      return oz + carTop + GOAL_HEAD_CLEAR > bot;
    });
    if (hit) return false;
    for (const a of avoid) if (a.top > bot && segDist(a.wx, a.wy, x0, y0, x1, y1) < GOAL_LEG_SPACING) return false;
    return true;
  };
  let best: GoalPost | null = null;
  let bestScore = Infinity;
  for (const skew of GOAL_SKEWS) {
    const a = yaw + Math.PI / 2 + skew;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    // the nearest leg to each side with SUPPORT_CLEAR_GOOD, and with SUPPORT_CLEAR_MIN
    const near: [number, number][] = [];
    for (const sg of [1, -1]) {
      let good = NaN;
      let min = NaN;
      // the far side's leg pairs with this one only within GOAL_BEAM_MAX
      const most = sg === 1 ? GOAL_LEG_MAX : Math.min(GOAL_LEG_MAX, GOAL_BEAM_MAX - (near[0] as [number, number])[1]);
      for (let d = SUPPORT_CLEAR_MIN; d <= most + 1e-9 && Number.isNaN(good); d += GOAL_LEG_STEP) {
        const c = legClass(x + nx * d * sg, y + ny * d * sg, nx, ny);
        if (c === 2) good = d;
        if (c >= 1 && Number.isNaN(min)) min = d;
      }
      near.push([good, min]);
      if (sg === 1 && Number.isNaN(min)) break;
    }
    // No leg spots square across the rail within GOAL_BEAM_MAX of each other: skewed, rail along the beam's sides only
    // gets nearer (a station deck, a row of track), so give up.
    if (near.length < 2 || Number.isNaN((near[1] as [number, number])[1])) {
      if (skew === 0) return null;
      continue;
    }
    const [p, m] = near as [[number, number], [number, number]];
    for (const [i, j] of [[0, 0], [0, 1], [1, 0], [1, 1]] as const) {
      const da = p[i];
      const db = m[j];
      if (Number.isNaN(da) || Number.isNaN(db) || da + db > GOAL_BEAM_MAX + 1e-9) continue;
      const score = da + db + i + j + 0.5 * Math.abs(skew);
      if (score >= bestScore - 1e-9) continue;
      const g: GoalPost = { x0: x + nx * da, y0: y + ny * da, x1: x - nx * db, y1: y - ny * db, z: top };
      if (beamOk(g.x0, g.y0, g.x1, g.y1)) {
        best = g;
        bestScore = score;
      }
    }
    if (skew === 0 && best) return best;
  }
  return best;
}

/** The rail under candidate supports on tile (x, y): every sample of the slice's piece, and the samples of other pieces on the tile. */
function supportObstacles(world: World, occ: Occupancy, tile: number, x: number, y: number, rideId: number, pieceIndex: number, s: WorldSamples): SupportObstacles {
  const others: { s: WorldSamples; runs: number[] }[] = [];
  let n = s.n;
  for (const e of occ.get(tile) ?? []) {
    if (e.rideId === rideId && e.pieceIndex === pieceIndex) continue;
    const p = world.state.track.rides[String(e.rideId)]?.pieces[e.pieceIndex];
    if (!p || !getTrackPieceDef(p.defId)) continue;
    const os = samplesOf(p);
    const runs = runsInTile(os, x, y);
    for (let r = 0; r < runs.length; r += 2) n += (runs[r + 1] as number) - (runs[r] as number) + 1;
    others.push({ s: os, runs });
  }
  const reach = new Float64Array(n);
  const ob: SupportObstacles = { n, x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n), other: new Uint8Array(n), index: new Int32Array(n), reach };
  let i = 0;
  for (let k = 0; k < s.n; k++, i++) {
    ob.x[i] = s.x[k] as number;
    ob.y[i] = s.y[k] as number;
    ob.z[i] = s.z[k] as number;
    ob.index[i] = k;
    reach[i] = bankReach(s.bankCos[k] as number);
  }
  for (const o of others) {
    for (let r = 0; r < o.runs.length; r += 2) {
      for (let k = o.runs[r] as number; k <= (o.runs[r + 1] as number); k++, i++) {
        ob.x[i] = o.s.x[k] as number;
        ob.y[i] = o.s.y[k] as number;
        ob.z[i] = o.s.z[k] as number;
        ob.other[i] = 1;
        ob.index[i] = -1;
        reach[i] = bankReach(o.s.bankCos[k] as number);
      }
    }
  }
  return ob;
}

/**
 * The rail around tile (x, y) for a goalpost's legs and beam, which reach past the tile (a leg up to GOAL_LEG_MAX from
 * its rail, a lattice post 0.75 m further, then the envelope and a station deck: under 7 m, so two tiles each way):
 * every sample of the slice's piece, and the samples of other pieces (of any ride) on the 5 × 5 tiles around it, each
 * with its cars' top and, for legs, its station deck or water channel beyond the car envelope.
 */
function goalObstacles(world: World, occ: Occupancy, x: number, y: number, rideId: number, pieceIndex: number, s: WorldSamples): SupportObstacles {
  const map = world.state.map;
  const own = world.state.track.rides[String(rideId)];
  const ownType = own ? getTrackTypeDef(own.typeId) : undefined;
  const ownDef = own ? getTrackPieceDef(own.pieces[pieceIndex]?.defId ?? '') : undefined;
  const parts: { s: WorldSamples; other: boolean; top: number; leg: number }[] = [];
  const legExtra = (type: TrackTypeDef, def: ReturnType<typeof getTrackPieceDef>): number => {
    const look = lookForPiece(type, def);
    // a station's deck (paint.ts paintPlatform: 1.1 m wide from beside the track) and a water channel's wall (at its
    // half width), with a leg's footing (GOAL_FOOT_HALF), past the envelope
    if (def?.special === 'station') {
      const from = look.channel > 0 ? look.channel + 0.15 : look.beam ? look.beam + 0.6 : look.cable ? 0.95 : 0.85;
      return Math.max(0, from + 1.1 + GOAL_FOOT_HALF - SUPPORT_CLEAR_MIN);
    }
    if (look.channel > 0 && !look.trough) return Math.max(0, look.channel + 0.05 + GOAL_FOOT_HALF - SUPPORT_CLEAR_MIN);
    return 0;
  };
  parts.push({ s, other: false, top: ownType ? carTopOf(ownType) : 1.2, leg: ownType ? legExtra(ownType, ownDef) : 0 });
  const seen = new Set<string>([`${rideId}:${pieceIndex}`]);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!inBounds(map, x + dx, y + dy)) continue;
      for (const e of occ.get(tileIndex(map, x + dx, y + dy)) ?? []) {
        const id = `${e.rideId}:${e.pieceIndex}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const rd = world.state.track.rides[String(e.rideId)];
        const p = rd?.pieces[e.pieceIndex];
        const type = rd ? getTrackTypeDef(rd.typeId) : undefined;
        const def = p ? getTrackPieceDef(p.defId) : undefined;
        if (!p || !type || !def) continue;
        parts.push({ s: samplesOf(p), other: true, top: carTopOf(type), leg: legExtra(type, def) });
      }
    }
  }
  const x0 = (x - 2) * TILE_M;
  const x1 = (x + 3) * TILE_M;
  const y0 = (y - 2) * TILE_M;
  const y1 = (y + 3) * TILE_M;
  const inArea = (o: WorldSamples, k: number): boolean => {
    const px = o.x[k] as number;
    const py = o.y[k] as number;
    return px >= x0 && px <= x1 && py >= y0 && py <= y1;
  };
  let n = 0;
  for (const o of parts) for (let k = 0; k < o.s.n; k++) if (inArea(o.s, k)) n++;
  const ob: SupportObstacles = { n, x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n), other: new Uint8Array(n), index: new Int32Array(n), reach: new Float64Array(n), top: new Float64Array(n), legReach: new Float64Array(n) };
  let i = 0;
  for (const o of parts) {
    for (let k = 0; k < o.s.n; k++) {
      if (!inArea(o.s, k)) continue;
      ob.x[i] = o.s.x[k] as number;
      ob.y[i] = o.s.y[k] as number;
      ob.z[i] = o.s.z[k] as number;
      ob.other[i] = o.other ? 1 : 0;
      ob.index[i] = o.other ? -1 : k;
      (ob.reach as Float64Array)[i] = bankReach(o.s.bankCos[k] as number);
      // a banked car's top: h·cosβ + b·|sinβ| (b 0.8 m, the widest car's half width)
      const c = o.s.bankCos[k] as number;
      (ob.top as Float64Array)[i] = o.top * c + 0.8 * Math.sqrt(Math.max(0, 1 - c * c));
      (ob.legReach as Float64Array)[i] = o.leg;
      i++;
    }
  }
  return ob;
}

/** True when a column at sample k (of the obstacles' own piece) keeps SUPPORT_CLEAR_MIN of every rail under it. */
function columnClear(ob: SupportObstacles, s: WorldSamples, k: number): boolean {
  const x = s.x[k] as number;
  const y = s.y[k] as number;
  const z = s.z[k] as number;
  const r = SUPPORT_CLEAR_MIN + 0.4;
  return !eachNear(ob, x - r, y - r, x + r, y + r, (j) => {
    if ((ob.z[j] as number) >= z - SUPPORT_UNDER_M) return false;
    if ((ob.other[j] as number) === 0 && Math.abs((ob.index[j] as number) - k) < SUPPORT_NEAR_ALONG) return false;
    const ex = (ob.x[j] as number) - x;
    const ey = (ob.y[j] as number) - y;
    return Math.sqrt(ex * ex + ey * ey) - (ob.reach ? (ob.reach[j] as number) : 0) < SUPPORT_CLEAR_MIN;
  });
}

/** Optional switch for measurements (tests): false builds a ride's slices without goalposts. */
let goalpostsOn = true;
export function setGoalpostsForTest(on: boolean): void {
  goalpostsOn = on;
}

/**
 * Goalposts for one ride's slices (2026-11-21), after its columns: along the whole track in piece order, a stretch of
 * rail at least SUPPORT_MIN_H over its ground with no support under it (a support holds the sample it stands at) that is
 * longer than GOAL_SPAN_M gets a goalpost: the points over other rail (where no column clears the lower cars) are tried
 * every GOAL_TRY_EVERY samples outward from the stretch's middle, and the first where `chooseGoalpost` finds one takes
 * it; repeated while a stretch is too long and has such a point. A point that found none is not tried again (later
 * goalposts only add things to keep clear of). Hanging cars (arm) and the sky ride (tower) get none. Other tracks are
 * untouched, so a ride whose rail never spans that far over other rail builds exactly the supports it did.
 */
function addGoalposts(world: World, occ: () => Occupancy, out: SliceRec[], from: number, others: readonly SliceRec[] = []): void {
  if (!goalpostsOn) return;
  const map = world.state.map;
  const sls = out.slice(from);
  if (sls.length === 0) return;
  const style = (sls[0] as SliceRec).supportStyle;
  if (style === 'arm' || style === 'tower') return;
  // every sample of the ride in track order (pieces in order: the slices come so), with its slice
  let n = 0;
  const base = new Map<number, number>();
  for (const sl of sls) {
    if (base.has(sl.pieceIndex)) continue;
    base.set(sl.pieceIndex, n);
    n += sl.samples.n;
  }
  const sOf: WorldSamples[] = new Array<WorldSamples>(n);
  const kOf = new Int32Array(n);
  const slOf: (SliceRec | null)[] = new Array<SliceRec | null>(n).fill(null);
  for (const sl of sls) {
    const o = base.get(sl.pieceIndex) as number;
    for (let k = 0; k < sl.samples.n; k++) {
      sOf[o + k] = sl.samples;
      kOf[o + k] = k;
    }
    for (let r = 0; r < sl.runs.length; r += 2) for (let k = sl.runs[r] as number; k <= (sl.runs[r + 1] as number); k++) slOf[o + k] = sl;
  }
  const dist = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const sa = sOf[i - 1] as WorldSamples;
    const sb = sOf[i] as WorldSamples;
    const dx = (sb.x[kOf[i] as number] as number) - (sa.x[kOf[i - 1] as number] as number);
    const dy = (sb.y[kOf[i] as number] as number) - (sa.y[kOf[i - 1] as number] as number);
    dist[i] = (dist[i - 1] as number) + Math.sqrt(dx * dx + dy * dy);
  }
  // held: off the slices, hanging cars, low rail, or a support standing at the sample
  const held = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const sl = slOf[i];
    held[i] = !sl || (sl.look.lift ?? 0) > 0 || ((sOf[i] as WorldSamples).z[kOf[i] as number] as number) - sl.ground < SUPPORT_MIN_H ? 1 : 0;
  }
  for (const sl of sls) {
    const o = base.get(sl.pieceIndex) as number;
    const s = sl.samples;
    for (const su of sl.supports) {
      for (let r = 0; r < sl.runs.length; r += 2) {
        for (let k = sl.runs[r] as number; k <= (sl.runs[r + 1] as number); k++) {
          const dx = su.wx - (s.x[k] as number);
          const dy = su.wy - (s.y[k] as number);
          if (dx * dx + dy * dy < 0.36 && Math.abs(su.top + sl.look.drop - (s.z[k] as number)) < 0.6) held[o + k] = 1;
        }
      }
    }
  }
  const obs = new Map<SliceRec, SupportObstacles>();
  const legGround = (x: number, y: number): number => {
    const tx = Math.floor(x / TILE_M);
    const ty = Math.floor(y / TILE_M);
    if (!inBounds(map, tx, ty)) return NaN;
    const i = tileIndex(map, tx, ty);
    // track ground only (a path, scenery or water tile can change without the track changing), and flat
    return map.content[i] === Content.Track && (map.slope[i] as number) === 0 ? (map.heights[i] as number) : NaN;
  };
  const avoid: { wx: number; wy: number; top: number }[] = [];
  for (const sl of sls) for (const su of sl.supports) avoid.push(su);
  // other rides' goalposts: their legs, and their beams every half metre
  for (const sl of others) {
    for (const su of sl.supports) {
      const g = su.goal;
      if (!g) continue;
      const len = Math.hypot(g.x1 - g.x0, g.y1 - g.y0);
      const m = Math.max(1, Math.ceil(len / 0.5));
      for (let i = 0; i <= m; i++) avoid.push({ wx: g.x0 + ((g.x1 - g.x0) * i) / m, wy: g.y0 + ((g.y1 - g.y0) * i) / m, top: g.z });
    }
  }
  const tried = new Uint8Array(n);
  const failed = new Set<number>();
  for (let guard = 0; guard < 64; guard++) {
    // the longest stretch from a held sample to the next that has not failed
    let best = -1;
    let bestA = 0;
    let bestB = 0;
    let a = -1;
    for (let i = 0; i <= n; i++) {
      if (i < n && !held[i]) continue;
      const lo = a < 0 ? 0 : a;
      const hi = i < n ? i : n - 1;
      const len = (dist[hi] as number) - (dist[lo] as number);
      if (hi - lo > 1 && len > GOAL_SPAN_M && !failed.has(lo) && len > best) {
        best = len;
        bestA = lo;
        bestB = hi;
      }
      a = i;
    }
    if (best < 0) return;
    // outward from the middle of the stretch
    const mid = ((dist[bestA] as number) + (dist[bestB] as number)) / 2;
    const order: number[] = [];
    for (let i = bestA + 1; i < bestB; i += GOAL_TRY_EVERY) order.push(i);
    order.sort((p, q) => Math.abs((dist[p] as number) - mid) - Math.abs((dist[q] as number) - mid) || p - q);
    let pick = -1;
    let pickGoal: GoalPost | null = null;
    for (const i of order) {
      if (tried[i]) continue;
      tried[i] = 1;
      const t = { s: sOf[i] as WorldSamples, k: kOf[i] as number };
      const sl = slOf[i] as SliceRec;
      const z = t.s.z[t.k] as number;
      if (z - GOAL_TOP_BELOW_RAIL - GOAL_BEAM_DEPTH - sl.ground < 0.5) continue;
      if (Math.cos(t.s.pitch[t.k] as number) < 0.5 || (t.s.bankCos[t.k] as number) < 0.5) continue;
      let ob = obs.get(sl);
      if (!ob) {
        ob = goalObstacles(world, occ(), sl.x, sl.y, sl.rideId, sl.pieceIndex, sl.samples);
        obs.set(sl, ob);
      }
      // only over other rail: where a column clears the lower cars, the run's own column choice stands
      if (columnClear(ob, t.s, t.k)) continue;
      const g = chooseGoalpost(t.s, t.k, sl.ground, ob, legGround, avoid, style === 'lattice' ? LATTICE_POST_HALF : 0);
      if (!g) continue;
      pick = i;
      pickGoal = g;
      break;
    }
    if (pick < 0 || !pickGoal) {
      failed.add(bestA);
      continue;
    }
    const t = { s: sOf[pick] as WorldSamples, k: kOf[pick] as number };
    const sl = slOf[pick] as SliceRec;
    const g = pickGoal;
    const su: SupportRec = { wx: t.s.x[t.k] as number, wy: t.s.y[t.k] as number, yaw: t.s.yaw[t.k] as number, top: (t.s.z[t.k] as number) - sl.look.drop, base: sl.ground, goal: g };
    sl.supports.push(su);
    sl.support = sl.supports[0] as SupportRec;
    sl.key += `|g${su.wx.toFixed(2)},${su.wy.toFixed(2)},${g.x0.toFixed(2)},${g.y0.toFixed(2)},${g.x1.toFixed(2)},${g.y1.toFixed(2)}`;
    avoid.push(su, { wx: g.x0, wy: g.y0, top: g.z }, { wx: g.x1, wy: g.y1, top: g.z });
    held[pick] = 1;
  }
}

function coloursOf(data: TrackRideData): TrackColours {
  return { track: paletteColour(data.colours.track), supports: paletteColour(data.colours.supports), cars: paletteColour(data.colours.cars) };
}

/** Bounds (world px around the anchor) of a slice: rails, deck, tunnel box, and the support down to the ground. */
function sliceBounds(P: Projector, s: WorldSamples, runs: readonly number[], ground: number, special: PieceSpecial, lift = 0): ArtBounds {
  let l = Infinity;
  let r = -Infinity;
  let t = Infinity;
  let b = -Infinity;
  const pad = 3.2;
  // Inverted track (Phase 6): the rail, its spine, and the support arm run `lift` m above the sample line.
  const up = special === 'spooky' ? 4.4 : Math.max(2.8, lift + 1.4);
  for (let i = 0; i < runs.length; i += 2) {
    for (let k = runs[i] as number; k <= (runs[i + 1] as number); k++) {
      const wx = s.x[k] as number;
      const wy = s.y[k] as number;
      const wz = s.z[k] as number;
      for (const [dx, dy] of [[-pad, -pad], [pad, -pad], [pad, pad], [-pad, pad]] as const) {
        const px = P.x(wx + dx, wy + dy);
        l = Math.min(l, px);
        r = Math.max(r, px);
        t = Math.min(t, P.y(wx + dx, wy + dy, wz + up));
        b = Math.max(b, P.y(wx + dx, wy + dy, Math.min(wz - pad, ground)));
      }
    }
  }
  return { left: Math.floor(l) - 2, right: Math.ceil(r) + 2, top: Math.floor(t) - 2, bottom: Math.ceil(b) + 2 };
}

const SUPPORT_FRAME = new Float64Array(9);

/** Build the slice records of one ride (allocates; runs only when the track changes). */
/**
 * `others`: slices of other rides built before this one (TrackLayer.rebuild, in ride order): their goalposts are kept
 * clear of this ride's.
 */
export function buildRideSlices(world: World, rideId: number, f: ViewFrame, others: readonly SliceRec[] = []): SliceRec[] {
  const data = world.state.track.rides[String(rideId)];
  const type = data ? getTrackTypeDef(data.typeId) : undefined;
  if (!data || !type) return [];
  const typeLook = lookFor(type);
  const colours = coloursOf(data);
  const out: SliceRec[] = [];
  let lastPiece = -1;
  let occ: Occupancy | undefined;
  let tile = 0;
  for (const t of trackTileSlices(world, rideId)) {
    if (!t.rail) continue;
    tile = t.pieceIndex === lastPiece ? tile + 1 : 0;
    lastPiece = t.pieceIndex;
    const piece = data.pieces[t.pieceIndex];
    const def = piece ? getTrackPieceDef(piece.defId) : undefined;
    if (!piece || !def) continue;
    const s = samplesOf(piece);
    const runs = runsInTile(s, t.x, t.y);
    if (runs.length === 0) continue;
    // Batch C: a water piece on a rail type (the Water Coaster's splashdown) paints as a channel.
    const look = def.water ? lookForPiece(type, def) : typeLook;
    const cx = (t.x + 0.5) * TILE_M;
    const cy = (t.y + 0.5) * TILE_M;
    const ax = projectX(cx, cy, f);
    const ay = projectY(cx, cy, 0, f);
    const P = new Projector(f, ax, ay);
    const lift = look.lift ?? 0;
    // A support at sample k standing on `base`. Hanging cars (Phase 6 inverted): the arm holds the spine,
    // `lift − drop` up the (possibly rolled) track frame from the sample.
    const supportAt = (k: number, base: number): SupportRec => {
      if (lift > 0) {
        trackFrame(s.yaw[k] as number, s.pitch[k] as number, s.bankSin[k] as number, s.bankCos[k] as number, SUPPORT_FRAME);
        const up = lift - look.drop;
        return {
          wx: (s.x[k] as number) + (SUPPORT_FRAME[6] as number) * up,
          wy: (s.y[k] as number) + (SUPPORT_FRAME[7] as number) * up,
          yaw: s.yaw[k] as number,
          top: (s.z[k] as number) + (SUPPORT_FRAME[8] as number) * up,
          base,
        };
      }
      return { wx: s.x[k] as number, wy: s.y[k] as number, yaw: s.yaw[k] as number, top: (s.z[k] as number) - look.drop, base };
    };
    const supports: SupportRec[] = [];
    // Hanging cars (Phase 6 inverted): every rail tile on the track's own ground gets an arm support, stations too.
    // Batch C, the sky ride: a tower on every third tile only (by the tile's diagonal), so the rope spans between them.
    const towerTile = type.render.supports !== 'tower' || (t.x + t.y) % 3 === 0;
    const owned = t.support || (lift > 0 && t.railMin <= t.ground);
    if (towerTile && type.render.supports !== 'tower') {
      // One support per elevated rail run (2026-11-20): a tile can hold rail at two heights (a helix's ground lead
      // and its upper ring, or another piece stacked over this one); its lowest rail alone used to decide the support,
      // so the upper rail floated. A tile with one run, or a loop's tile, keeps its one support as before.
      let lo = Infinity;
      let hi = -Infinity;
      for (let r = 0; r < runs.length; r += 2) {
        for (let k = runs[r] as number; k <= (runs[r + 1] as number); k++) {
          lo = Math.min(lo, s.z[k] as number);
          hi = Math.max(hi, s.z[k] as number);
        }
      }
      if (owned && (runs.length === 2 || hi - lo > 6)) supports.push(supportAt(supportSample(s, runs, t.x, t.y), t.ground));
      else if (lift > 0 || hi - t.ground >= SUPPORT_MIN_H) {
        occ ??= buildOccupancy(world);
        const ob = supportObstacles(world, occ, t.tile, t.x, t.y, rideId, t.pieceIndex, s);
        const groundOk = world.state.map.content[t.tile] === Content.Track;
        // The highest run first: rail over other rail has the fewest clear points, the lower rail more (2026-11-21).
        const order: number[] = [];
        for (let r = 0; r < runs.length; r += 2) order.push(r);
        const top = (r: number): number => {
          let h = -Infinity;
          for (let k = runs[r] as number; k <= (runs[r + 1] as number); k++) h = Math.max(h, s.z[k] as number);
          return h;
        };
        if (order.length > 1) order.sort((a, b) => top(b) - top(a) || a - b);
        const picked: { r: number; su: SupportRec }[] = [];
        for (const r of order) {
          const k0 = runs[r] as number;
          const k1 = runs[r + 1] as number;
          if (runs.length > 2 && k1 - k0 < SUPPORT_MIN_RUN) continue;
          // A column no nearer than SUPPORT_SPACING to one the slice already has: the run takes its next best point
          // rather than none (2026-11-21: a helix's exit lead lost its column to its entry lead's and floated).
          const fits = (k: number): boolean => {
            const su = lift > 0 ? supportAt(k, t.ground) : null;
            const wx = su ? su.wx : (s.x[k] as number);
            const wy = su ? su.wy : (s.y[k] as number);
            return !picked.some((o) => Math.hypot(o.su.wx - wx, o.su.wy - wy) < SUPPORT_SPACING);
          };
          const c = chooseRunSupport(s, k0, k1, t.ground, groundOk, ob, cx, cy, lift > 0 ? -Infinity : SUPPORT_MIN_H, fits);
          if (c) picked.push({ r, su: supportAt(c.k, c.base) });
        }
        // in run order, as before (`support` is the first)
        picked.sort((a, b) => a.r - b.r);
        for (const p of picked) supports.push(p.su);
        if (owned && supports.length === 0) supports.push(supportAt(supportSample(s, runs, t.x, t.y), t.ground));
      }
    } else if (towerTile && owned) supports.push(supportAt(supportSample(s, runs, t.x, t.y), t.ground));
    out.push({
      rideId,
      pieceIndex: t.pieceIndex,
      x: t.x,
      y: t.y,
      railMin: t.railMin,
      ground: t.ground,
      depth: tileDepthView(t.x, t.y, f),
      ax,
      ay,
      bounds: sliceBounds(P, s, runs, t.ground, def.special, look.lift ?? 0),
      samples: s,
      runs,
      support: supports[0] ?? null,
      supports,
      special: def.special,
      water: look.channel > 0 && !look.trough,
      conveyor: def.water?.drive === 'conveyor' && def.special !== 'station',
      look,
      supportStyle: type.render.supports,
      colours,
      key: `${type.id}|${piece.defId}|${piece.x},${piece.y},${piece.z},${piece.dir}|${t.x},${t.y}|${supports.map((su) => `${su.wx.toFixed(2)},${su.wy.toFixed(2)},${su.base}`).join(';')}|${colours.track}|${colours.supports}|${f.rot}`,
      sprites: [null, null, null],
      data,
      pieceId: import.meta.env.VITE_ART === 'real' ? piece.defId : '',
      tile,
    });
  }
  addGoalposts(world, () => (occ ??= buildOccupancy(world)), out, 0, others);
  return out;
}

/**
 * Realistic rail of a slice (Task 9b, the bake's contract): the set's turn is the piece's heading in the view,
 * `(piece.dir + view turn) mod 4`, and the picture is anchored at the tile's centre at the piece's ENTRY rail height
 * (`piece.z`), where today's slice anchor is at height 0.
 */
export function realRailPlacement(sl: SliceRec, f: ViewFrame): { heading: ViewRotation; ax: number; ay: number } {
  const piece = sl.data.pieces[sl.pieceIndex];
  const cx = (sl.x + 0.5) * TILE_M;
  const cy = (sl.y + 0.5) * TILE_M;
  return {
    heading: (((piece?.dir ?? 0) + f.rot) % 4) as ViewRotation,
    ax: projectX(cx, cy, f),
    ay: projectY(cx, cy, piece?.z ?? 0, f),
  };
}

/**
 * Realistic support of a slice (Task 9b): the saddle's heading is the track's at the support point, in the view; the
 * pieces (`supportStack`) stand on the support point, each anchored at its own height. Null without a support.
 */
export function realSupportPlacement(sl: SliceRec, f: ViewFrame, su: SupportRec | null = sl.support): { heading: ViewRotation; ax: number; pieces: (SupportPiece & { ay: number })[] } | null {
  if (!su) return null;
  const q = Math.round(viewYaw(su.yaw, f) / (Math.PI / 2));
  // `top` is the rail line less the look's drop (buildRideSlices), so the rail line is top + drop. A goalpost's saddle
  // stands on its beam, whose top is the saddle's anchor (GOAL_TOP_BELOW_RAIL = SUPPORT_TOP_BELOW_RAIL): just the top.
  const pieces = supportStack(su.top + sl.look.drop, su.goal ? su.goal.z : su.base).map((p) => ({ ...p, ay: projectY(su.wx, su.wy, p.z, f) }));
  return { heading: (((q % 4) + 4) % 4) as ViewRotation, ax: projectX(su.wx, su.wy, f), pieces };
}

const GOAL_UP = [0, 0, 1];

/**
 * The realistic goalpost beam's base colour: the ride's support colour as the baked columns show it (light paint under
 * the bake's sun, tinted), timber darker for a lattice look.
 */
export function realGoalColour(sl: SliceRec): string {
  const k = sl.data.typeId === 'mine_train' ? REAL_GOAL_SHADE.mine : sl.supportStyle === 'lattice' ? REAL_GOAL_SHADE.lattice : REAL_GOAL_SHADE.steel;
  return shade(paletteColour(sl.data.colours.supports), k);
}
/** Measured off the baked columns' lit faces: steel paint, painted timber (wooden coaster), the mine's dark wood. */
const REAL_GOAL_SHADE = { steel: 0.84, lattice: 0.72, mine: 0.4 } as const;

/** Realistic goalpost beam (procedural: no baked part): its depth and half width (m), a lattice look's two timbers. */
export const REAL_GOAL_BEAM = { depth: 0.4, half: 0.22, timberDepth: 0.3, timberHalf: 0.1 } as const;

/**
 * The legs of a realistic goalpost (2026-11-21), far leg first: each a stacked column (`supportStack` foot and 1 m
 * segments, no saddle) from the support's base up into the beam, turned to the beam's nearest heading in the view (a
 * lattice bent's posts then stand square to the beam, as `chooseGoalpost` checked them).
 */
export function realGoalLegPlacement(sl: SliceRec, f: ViewFrame, su: SupportRec): { heading: ViewRotation; ax: number; wx: number; wy: number; pieces: (SupportPiece & { ay: number })[] }[] {
  const g = su.goal;
  if (!g) return [];
  const q = Math.round(viewYaw(Math.atan2(g.y1 - g.y0, g.x1 - g.x0), f) / (Math.PI / 2));
  const heading = (((q % 4) + 4) % 4) as ViewRotation;
  // a column's segments end 0.1 m over the column top: inside the beam
  const top = g.z - (sl.supportStyle === 'lattice' ? 0.1 : REAL_GOAL_BEAM.depth / 2) - 0.1;
  const legs = [
    [g.x0, g.y0],
    [g.x1, g.y1],
  ].map(([wx, wy]) => ({
    heading,
    ax: projectX(wx as number, wy as number, f),
    wx: wx as number,
    wy: wy as number,
    pieces: supportStack(top + SUPPORT_TOP_BELOW_RAIL, su.base)
      .filter((p) => p.part !== 'top')
      .map((p) => ({ ...p, ay: projectY(wx as number, wy as number, p.z, f) })),
  }));
  if (projectY(g.x0, g.y0, 0, f) > projectY(g.x1, g.y1, 0, f)) legs.reverse();
  return legs;
}

/**
 * The beam boxes of a realistic goalpost in map metres (`paintBox` arguments): one steel box, or for a lattice look two
 * timbers under the bents' posts (square to the beam's nearest map axis, as the legs' bents). `half`: only the far half
 * (the far leg's end up to the saddle), or the near half; the layer draws the far half before the tile's rail picture
 * and the near half after it (the lower rail and its cars pass under the beam).
 */
export function realGoalBeams(sl: SliceRec, su: SupportRec, f: ViewFrame, half: 'all' | 'far' | 'near' = 'all'): { c: [number, number, number]; f: number[]; r: number[]; a: number; b: number; h0: number; h1: number }[] {
  const g = su.goal;
  if (!g) return [];
  // from the far leg A to the near leg B (lower on the screen), as `realGoalLegPlacement` sorts them
  const flip = projectY(g.x0, g.y0, 0, f) > projectY(g.x1, g.y1, 0, f);
  const ax = flip ? g.x1 : g.x0;
  const ay = flip ? g.y1 : g.y0;
  const dx = (flip ? g.x0 : g.x1) - ax;
  const dy = (flip ? g.y0 : g.y1) - ay;
  const len = Math.hypot(dx, dy);
  const u = [dx / len, dy / len, 0];
  const r = [-u[1]!, u[0]!, 0];
  const lattice = sl.supportStyle === 'lattice';
  const over = lattice ? 0.25 : REAL_GOAL_BEAM.half;
  const split = Math.max(0, Math.min(len, (su.wx - ax) * u[0]! + (su.wy - ay) * u[1]!));
  const t0 = half === 'near' ? split : -over;
  const t1 = half === 'far' ? split : len + over;
  if (t1 <= t0) return [];
  const m = (t0 + t1) / 2;
  const c: [number, number, number] = [ax + u[0]! * m, ay + u[1]! * m, 0];
  if (!lattice) return [{ c, f: u, r, a: (t1 - t0) / 2, b: REAL_GOAL_BEAM.half, h0: g.z - REAL_GOAL_BEAM.depth, h1: g.z }];
  const q = (Math.round(Math.atan2(dy, dx) / (Math.PI / 2)) * Math.PI) / 2;
  const rq = [-Math.sin(q), Math.cos(q)];
  return [-1, 1].map((sg) => ({
    c: [c[0] + rq[0]! * LATTICE_POST_HALF * sg, c[1] + rq[1]! * LATTICE_POST_HALF * sg, 0] as [number, number, number],
    f: u,
    r,
    a: (t1 - t0) / 2,
    b: REAL_GOAL_BEAM.timberHalf,
    h0: g.z - REAL_GOAL_BEAM.timberDepth,
    h1: g.z,
  }));
}

/**
 * The view depths (tile units, as cars sort: `floor(view x / 4) + floor(view y / 4) + 1` under a car's front or back)
 * that a car passing under goalpost `su` can take (2026-11-21): rail of any slice of `slices` lower than the beam whose
 * envelope the beam crosses, with car ends up to a car's length either way along it, and the highest such rail (`z`).
 * Infinity / −Infinity when none.
 */
export function carDepthsUnder(slices: readonly SliceRec[], su: SupportRec, f: ViewFrame): { min: number; max: number; z: number } {
  const g = su.goal as GoalPost;
  const out = { min: Infinity, max: -Infinity, z: -Infinity };
  const tx = Math.floor(su.wx / TILE_M);
  const ty = Math.floor(su.wy / TILE_M);
  const depthAt = (x: number, y: number): number => Math.floor(viewX(x, y, f) / TILE_M) + Math.floor(viewY(x, y, f) / TILE_M) + 1;
  for (const sl of slices) {
    if (Math.abs(sl.x - tx) > 2 || Math.abs(sl.y - ty) > 2) continue;
    const half = (getTrackTypeDef(sl.data.typeId)?.vehicle.carLengthMm ?? 3000) / 2000;
    const s = sl.samples;
    for (let r = 0; r < sl.runs.length; r += 2) {
      for (let k = sl.runs[r] as number; k <= (sl.runs[r + 1] as number); k++) {
        if ((s.z[k] as number) >= g.z - GOAL_BEAM_DEPTH) continue;
        const x = s.x[k] as number;
        const y = s.y[k] as number;
        if (segDist(x, y, g.x0, g.y0, g.x1, g.y1) >= SUPPORT_CLEAR_MIN + bankReach(s.bankCos[k] as number)) continue;
        out.z = Math.max(out.z, s.z[k] as number);
        const cx = Math.cos(s.yaw[k] as number);
        const cy = Math.sin(s.yaw[k] as number);
        for (let t = -2 * half; t <= 2 * half + 1e-9; t += 0.5) {
          const d = depthAt(x + cx * t, y + cy * t);
          if (d < out.min) out.min = d;
          if (d > out.max) out.max = d;
        }
      }
    }
  }
  return out;
}

/** Screen bounds (world px, zoom 1, absolute) of a goalpost frame: its leg and the whole beam, with a margin. */
function goalFrameBounds(x: number, y: number, su: SupportRec, f: ViewFrame, out: ArtBounds): ArtBounds {
  const g = su.goal as GoalPost;
  const xs = [projectX(x, y, f), projectX(g.x0, g.y0, f), projectX(g.x1, g.y1, f)];
  const ys = [projectY(x, y, su.base, f), projectY(g.x0, g.y0, g.z, f), projectY(g.x1, g.y1, g.z, f)];
  out.left = Math.min(...xs) - 16;
  out.right = Math.max(...xs) + 16;
  out.top = Math.min(...ys) - 16;
  out.bottom = Math.max(...ys) + 12;
  return out;
}

/**
 * Realistic rail shadow of a slice (batch 5 Task 4, `../real/trackShadow.ts`): the baked shadow frame lies on a plane
 * under the tile's lowest rail and is anchored like the rail; drawn at the rail's anchor shifted by the plane's height
 * above the tile's ground along `sunShift()`, it lies on the ground.
 */
export function realRailShadowPlacement(sl: SliceRec, f: ViewFrame): { heading: ViewRotation; ax: number; ay: number } {
  const r = realRailPlacement(sl, f);
  const s = sunShift();
  const h = railShadowPlane(sl.railMin) - sl.ground;
  return { heading: r.heading, ax: r.ax + h * s.x, ay: r.ay + h * s.y };
}

/**
 * Realistic support shadows of a slice (Task 4): one baked `<part>:sh` frame per stacked piece, each the piece's shadow
 * onto a plane at its own anchor, shifted by the piece's height above the ground. Null without a support.
 */
export function realSupportShadowPlacement(sl: SliceRec, f: ViewFrame, rec: SupportRec | null = sl.support): { heading: ViewRotation; pieces: { part: SupportPiece['part']; ax: number; ay: number }[] } | null {
  const su = realSupportPlacement(sl, f, rec);
  if (!su) return null;
  const s = sunShift();
  return { heading: su.heading, pieces: su.pieces.map((p) => ({ part: p.part, ax: su.ax + (p.z - sl.ground) * s.x, ay: p.ay + (p.z - sl.ground) * s.y })) };
}

/** A car's live shadow (Task 4, owner decision D1 a): centre and half-axes in world px (zoom 1). */
export interface CarShadow { cx: number; cy: number; ax: number; ay: number; bx: number; by: number }

/**
 * The soft ellipse under a car at (x, y, z) over ground `g`: centred on the point's shadow (its projection shifted by
 * `(z − g) × sunShift()`), half the car long along its heading (shorter as it pitches) and CAR_SHADOW_HALF_W across.
 */
export function carShadowAt(x: number, y: number, z: number, g: number, yaw: number, pitch: number, carLenM: number, f: ViewFrame, out: CarShadow = { cx: 0, cy: 0, ax: 0, ay: 0, bx: 0, by: 0 }): CarShadow {
  const s = sunShift();
  const h = z - g;
  out.cx = projectX(x, y, f) + h * s.x;
  out.cy = projectY(x, y, z, f) + h * s.y;
  const half = (carLenM / 2) * Math.max(Math.abs(Math.cos(pitch)), 0.35);
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const x0 = projectX(x, y, f), y0 = projectY(x, y, 0, f);
  out.ax = projectX(x + c * half, y + sn * half, f) - x0;
  out.ay = projectY(x + c * half, y + sn * half, 0, f) - y0;
  out.bx = projectX(x - sn * CAR_SHADOW_HALF_W, y + c * CAR_SHADOW_HALF_W, f) - x0;
  out.by = projectY(x - sn * CAR_SHADOW_HALF_W, y + c * CAR_SHADOW_HALF_W, 0, f) - y0;
  return out;
}

/** Paint one slice around its anchor (world px). */
export function paintSlice(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, sl: SliceRec, f: ViewFrame): void {
  const P = new Projector(f, sl.ax, sl.ay);
  // A goalpost (2026-11-21): the slice draws its post on the beam; its two frames (a leg and half the beam each) are
  // drawables of their own (`SUB_GOAL_LEG`), sorted round the cars that pass under the beam.
  for (const su of sl.supports) {
    if (su.goal) paintGoalPost(ctx, P, sl.supportStyle, sl.colours.supports, su.goal, su.wx, su.wy, su.yaw, su.top);
    else paintSupport(ctx, P, sl.supportStyle, sl.colours.supports, su.wx, su.wy, su.yaw, su.base, su.top);
  }
  for (let i = 0; i < sl.runs.length; i += 2) {
    paintRun(ctx, P, sl.look, sl.colours, sl.samples, sl.runs[i] as number, sl.runs[i + 1] as number, { special: sl.special, chain: false, conveyor: sl.conveyor });
  }
}

/** Growable typed buffer set for per-frame cars and gates. */
class CarBuffer {
  n = 0;
  x = new Float64Array(64);
  y = new Float64Array(64);
  z = new Float64Array(64);
  yaw = new Float64Array(64);
  mapYaw = new Float64Array(64);
  pitch = new Float64Array(64);
  /** Roll (Phase 6): sine and cosine of the track bank under the car. */
  bankSin = new Float64Array(64);
  bankCos = new Float64Array(64);
  shape = new Uint8Array(64);
  front = new Uint8Array(64);
  colour = new Uint8Array(64);
  /** 1 when the boat throws spray (splashdown or waterfall at speed). */
  spray = new Uint8Array(64);
  seatStart = new Int32Array(64);
  seatCount = new Uint8Array(64);
  seats = new Int32Array(256);
  nSeats = 0;

  reset(): void {
    this.n = 0;
    this.nSeats = 0;
  }

  add(): number {
    if (this.n === this.x.length) this.grow();
    return this.n++;
  }

  addSeat(g: number): void {
    if (this.nSeats === this.seats.length) {
      const b = new Int32Array(this.seats.length * 2);
      b.set(this.seats);
      this.seats = b;
    }
    this.seats[this.nSeats++] = g;
  }

  private grow(): void {
    const cap = this.x.length * 2;
    const f = (a: Float64Array<ArrayBuffer>): Float64Array<ArrayBuffer> => {
      const b = new Float64Array(cap);
      b.set(a);
      return b;
    };
    const u = (a: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
      const b = new Uint8Array(cap);
      b.set(a);
      return b;
    };
    this.x = f(this.x);
    this.y = f(this.y);
    this.z = f(this.z);
    this.yaw = f(this.yaw);
    this.mapYaw = f(this.mapYaw);
    this.pitch = f(this.pitch);
    this.bankSin = f(this.bankSin);
    this.bankCos = f(this.bankCos);
    this.shape = u(this.shape);
    this.front = u(this.front);
    this.colour = u(this.colour);
    this.spray = u(this.spray);
    this.seatCount = u(this.seatCount);
    const s = new Int32Array(cap);
    s.set(this.seatStart);
    this.seatStart = s;
  }
}

export class TrackLayer {
  private slices: SliceRec[] = [];
  /**
   * Goalpost frames (2026-11-21), rebuilt with the slices: a leg and its half of the beam, one drawable each. The far
   * frame sorts behind every car that can pass under the beam (no deeper than the far leg, nor than the shallowest tile
   * such a car's ends touch) and first on its tile (z 0); the near frame in front of them (no shallower than the near leg,
   * nor than the deepest such tile), just over those cars' rail height there. A car under the beam is then always between
   * its frames.
   */
  private goalLegs: { slice: number; su: SupportRec; x: number; y: number; near: boolean; depth: number; z: number }[] = [];
  private sigs = new Map<number, RideSig>();
  private frameRef: ViewFrame = viewFrame(0, 64, 64);
  private readonly cars = new CarBuffer();
  private gateAx = new Float64Array(16);
  private gateAy = new Float64Array(16);
  private gateKind = new Uint8Array(16);
  private gateColour: string[] = [];
  private nGates = 0;
  private readonly carCache = new SpriteCache(6_000_000);
  /** Realistic look: ride type of each collected car, and the look of the current `drawItem`. */
  private carDef: string[] = [];
  private curDef = '';
  private look: RealLook | undefined;
  /**
   * The realistic test build only (declared, never emitted in the website build): the slices whose realistic rail
   * drew at their last draw (their chain dashes take the realistic style and height); the map, for a car's ground under
   * its shadow; and scratch bounds for culling with the shadow.
   */
  declare private realRails?: WeakSet<SliceRec>;
  declare private shadowMap?: World['state']['map'];
  declare private reach?: ArtBounds;
  private legBounds?: ArtBounds;
  /** Gate booth sprites by roof colour: [entrance × 3 buckets, exit × 3 buckets]. */
  private readonly gateCache = new Map<string, Array<Sprite | null>>();
  private readonly dash = [0, 0];
  private readonly sp = newSamplePoint();
  private readonly pose = newCarPose();
  private readonly fr = new Float64Array(9);

  private scale = 1;
  private offX = 0;
  private offY = 0;
  private bucket: ZoomBucket = 1;
  private builds = 0;
  private carBuilds = 0;
  private tick = 0;

  /** Slices currently known (tests and debug). */
  get sliceCount(): number {
    return this.slices.length;
  }

  private devX(wx: number): number {
    return wx * this.scale + this.offX;
  }

  private devY(wy: number): number {
    return wy * this.scale + this.offY;
  }

  /** True when the track changed since the last frame (piece lists, colours, rides added or removed). */
  private changed(world: World): boolean {
    const s = world.state;
    let count = 0;
    let dirty = false;
    for (const r of s.rides) {
      if (r.kind !== 'track') continue;
      const data = s.track.rides[String(r.id)];
      if (!data) continue;
      count++;
      const sig = this.sigs.get(r.id);
      const n = data.pieces.length;
      const last = data.pieces[n - 1];
      if (
        !sig ||
        sig.data !== data ||
        sig.pieces !== data.pieces ||
        sig.n !== n ||
        sig.last !== last ||
        sig.track !== data.colours.track ||
        sig.supports !== data.colours.supports
      ) {
        dirty = true;
        this.sigs.set(r.id, { data, pieces: data.pieces, n, last, track: data.colours.track, supports: data.colours.supports });
      }
    }
    if (count !== this.sigs.size) {
      dirty = true;
      const live = new Set<number>();
      for (const r of s.rides) if (r.kind === 'track') live.add(r.id);
      for (const id of [...this.sigs.keys()]) if (!live.has(id)) this.sigs.delete(id);
    }
    return dirty;
  }

  private rebuild(world: World): void {
    const old = new Map<string, Array<Sprite | null>>();
    for (const sl of this.slices) old.set(sl.key, sl.sprites);
    const next: SliceRec[] = [];
    for (const r of world.state.rides) {
      if (r.kind !== 'track') continue;
      for (const sl of buildRideSlices(world, r.id, this.frameRef, next)) {
        const reuse = old.get(sl.key);
        if (reuse) sl.sprites = reuse;
        next.push(sl);
      }
    }
    this.slices = next;
    this.goalLegs = [];
    const f = this.frameRef;
    next.forEach((sl, i) => {
      for (const su of sl.supports) {
        const g = su.goal;
        if (!g) continue;
        const near0 = projectY(g.x0, g.y0, 0, f) > projectY(g.x1, g.y1, 0, f);
        const cars = carDepthsUnder(next, su, f);
        for (const [x, y, near] of [[g.x0, g.y0, near0], [g.x1, g.y1, !near0]] as const) {
          const d = pointDepthM(x, y, f);
          // the near frame just over those cars on their tile (a car sorts by its rail height, as a Guest), not over
          // higher track there that may stand in front of it. Limit: a car takes the deeper tile under its front or back,
          // and draws over that tile's rail of its height even where the rail is in front; the near frame, sorted after
          // it, does the same (2026-11-21, the down helix in view turn 2: the leg over the return run on the next tile).
          const z = near ? (cars.z > -Infinity ? Math.min(255, Math.floor(cars.z + 0.5) + 1) : 255) : 0;
          this.goalLegs.push({ slice: i, su, x, y, near, depth: near ? Math.max(d, cars.max) : Math.min(d, cars.min), z });
        }
      }
    });
  }

  /** Collect the track drawables of this frame into the renderer's draw list. */
  collect(world: World, sink: DrawSink, view: ViewBox, bucket: ZoomBucket, scale: number, offX: number, offY: number, alpha: number, rotation = 0): void {
    const map = world.state.map;

    this.scale = scale;
    this.offX = offX;
    this.offY = offY;
    this.bucket = bucket;
    this.builds = 0;
    this.carBuilds = 0;
    this.tick = world.state.tick;
    this.carCache.beginFrame();
    const rot = ((rotation % 4) + 4) % 4;
    let dirty = this.changed(world);
    if (rot !== this.frameRef.rot || this.frameRef.wm !== map.width * TILE_M || this.frameRef.hm !== map.height * TILE_M) {
      this.frameRef = viewFrame(rot, map.width, map.height);
      dirty = true;
    }
    if (dirty) this.rebuild(world);

    // Slices and chain overlays.
    const s = world.state;
    let lastRide = -1;
    let data: TrackRideData | undefined;
    for (let i = 0; i < this.slices.length; i++) {
      const sl = this.slices[i] as SliceRec;
      let b = sl.bounds;
      // Realistic: the slice's shadow is drawn from its drawable, so cull with the shadow in (review P2). Everything in
      // the slice stands between the ground and the bounds' height span over it.
      if (import.meta.env.VITE_ART === 'real') b = withShadowReach(b, Math.min(0, sl.railMin - sl.ground), (b.bottom - b.top) / PX_Z, (this.reach ??= { left: 0, right: 0, top: 0, bottom: 0 }));
      if (sl.ax + b.right < view.x0 || sl.ax + b.left > view.x1 || sl.ay + b.bottom < view.y0 || sl.ay + b.top > view.y1) continue;
      sink.push(KIND_TRACK, i, SUB_SLICE, sl.ax, sl.ay, 0, sl.depth, sl.railMin, Layer.Object);
      if (sl.rideId !== lastRide) {
        lastRide = sl.rideId;
        data = s.track.rides[String(sl.rideId)];
      }
      if (data?.pieces[sl.pieceIndex]?.chain) sink.push(KIND_TRACK, i, SUB_CHAIN, sl.ax, sl.ay, 0, sl.depth, sl.railMin, Layer.Object);
      if (sl.water) sink.push(KIND_TRACK, i, SUB_WATER, sl.ax, sl.ay, 0, sl.depth, sl.railMin, Layer.Object);
    }

    // Goalpost frames: a leg and half the beam each.
    for (let i = 0; i < this.goalLegs.length; i++) {
      const l = this.goalLegs[i] as (typeof this.goalLegs)[number];
      const g = l.su.goal as GoalPost;
      const f = this.frameRef;
      let b = goalFrameBounds(l.x, l.y, l.su, f, (this.legBounds ??= { left: 0, right: 0, top: 0, bottom: 0 }));
      if (import.meta.env.VITE_ART === 'real') b = withShadowReach(b, 0, g.z - l.su.base, (this.reach ??= { left: 0, right: 0, top: 0, bottom: 0 }));
      if (b.right < view.x0 || b.left > view.x1 || b.bottom < view.y0 || b.top > view.y1) continue;
      sink.push(KIND_TRACK, i, SUB_GOAL_LEG, projectX(l.x, l.y, f), projectY(l.x, l.y, l.su.base, f), 0, l.depth, l.z, Layer.Object);
    }

    // Gates.
    this.nGates = 0;
    for (const r of s.rides) {
      if (r.kind !== 'track') continue;
      const tag = tagOf(r.defId);
      for (let kind = 0; kind < 2; kind++) {
        const g = kind === 0 ? r.entrance : r.exit;
        if (!g || g.gate < 0) continue;
        const gx = g.gate % map.width;
        const gy = (g.gate - gx) / map.width;
        const cx = (gx + 0.5) * TILE_M;
        const cy = (gy + 0.5) * TILE_M;
        const z = map.heights[g.gate] as number;
        const ax = projectX(cx, cy, this.frameRef);
        const ay = projectY(cx, cy, z, this.frameRef);
        if (ax + GATE_BOUNDS.right < view.x0 || ax + GATE_BOUNDS.left > view.x1 || ay + GATE_BOUNDS.bottom < view.y0 || ay + GATE_BOUNDS.top > view.y1) continue;
        if (this.nGates === this.gateAx.length) {
          const cap = this.nGates * 2;
          const a = new Float64Array(cap);
          a.set(this.gateAx);
          this.gateAx = a;
          const b = new Float64Array(cap);
          b.set(this.gateAy);
          this.gateAy = b;
          const k = new Uint8Array(cap);
          k.set(this.gateKind);
          this.gateKind = k;
        }
        const gi = this.nGates++;
        this.gateAx[gi] = ax;
        this.gateAy[gi] = ay;
        this.gateKind[gi] = kind;
        this.gateColour[gi] = kind === 0 ? TAG_COLOURS[tag].main : '#8a96a3';
        sink.push(KIND_TRACK, gi, SUB_GATE, ax, ay, 0, tileDepthView(gx, gy, this.frameRef), z, Layer.Object);
      }
    }

    this.collectCars(world, sink, view, alpha);
  }

  private collectCars(world: World, sink: DrawSink, view: ViewBox, alpha: number): void {
    const s = world.state;
    const c = this.cars;
    const f = this.frameRef;
    c.reset();
    if (import.meta.env.VITE_ART === 'real') this.shadowMap = s.map;
    for (const r of s.rides) {
      if (r.kind !== 'track') continue;
      const data = s.track.rides[String(r.id)];
      if (!data || data.trains.length === 0 || data.pieces.length === 0) continue;
      const type = getTrackTypeDef(data.typeId);
      if (!type) continue;
      const layout = getLayout(data);
      if (layout.lengthMm <= 0) continue;
      const carLen = type.vehicle.carLengthMm;
      const shape = CAR_SHAPES.indexOf(type.render.car);
      const spins = type.vehicle.spins;
      const seatsPerCar = type.vehicle.seatsPerCar;
      if (import.meta.env.VITE_ART === 'real') this.curDef = data.typeId;
      for (const t of data.trains) {
        if (t.parked) continue;
        const n = Math.max(1, Math.round(t.seats.length / seatsPerCar)) || data.trainConfig.carsPerTrain;
        const centre = interpolatedS(t.s, t.v, alpha, layout.lengthMm);
        const spin = spins ? (trainSpinFrame(t) / 16) * Math.PI * 2 : 0;
        for (let k = 0; k < n; k++) {
          this.addCar(layout, carCentreMm(centre, n, k, carLen), carLen, shape, k === 0, data.colours.cars, spin, seatsPerCar, t.seats, k, view, sink, f, t.v);
        }
      }
    }
  }

  private addCar(
    layout: CircuitLayout,
    s: number,
    carLen: number,
    shape: number,
    front: boolean,
    colour: number,
    spin: number,
    seatsPerCar: number,
    seats: readonly number[],
    k: number,
    view: ViewBox,
    sink: DrawSink,
    f: ViewFrame,
    vMms = 0,
  ): void {
    const p = carPoseAt(layout, s, this.sp, this.pose);
    const special = layout.statics[p.pieceIndex]?.def.special;
    // Cars inside a spooky tunnel are hidden by its walls.
    if (special === 'spooky') return;
    const ax = projectX(p.x, p.y, f);
    const ay = projectY(p.x, p.y, p.z, f);
    if (ax + CAR_BOUNDS.right < view.x0 || ax + CAR_BOUNDS.left > view.x1 || ay + CAR_BOUNDS.bottom < view.y0 || ay + CAR_BOUNDS.top > view.y1) {
      // Realistic: a car off screen may still cast its shadow on screen (review P2), over its tile's ground as
      // `realShadow.ts` draws it.
      if (import.meta.env.VITE_ART !== 'real' || !this.shadowMap) return;
      const m = this.shadowMap;
      const h = p.z - ((m.heights[Math.floor(p.y / TILE_M) * m.width + Math.floor(p.x / TILE_M)] as number | undefined) ?? 0);
      const cb = withShadowReach(CAR_BOUNDS, Math.min(0, h), Math.max(0, h), (this.reach ??= { left: 0, right: 0, top: 0, bottom: 0 }));
      if (ax + cb.right < view.x0 || ax + cb.left > view.x1 || ay + cb.bottom < view.y0 || ay + cb.top > view.y1) return;
    }
    const c = this.cars;
    const i = c.add();
    if (import.meta.env.VITE_ART === 'real') this.carDef[i] = this.curDef;
    const yaw = p.yaw + spin;
    c.x[i] = p.x;
    c.y[i] = p.y;
    c.z[i] = p.z;
    c.mapYaw[i] = yaw;
    c.yaw[i] = viewYaw(yaw, f);
    c.pitch[i] = p.pitch;
    c.bankSin[i] = p.bankSin;
    c.bankCos[i] = p.bankCos;
    c.shape[i] = shape < 0 ? 0 : shape;
    c.front[i] = front ? 1 : 0;
    c.colour[i] = colour;
    c.spray[i] = (special === 'splashdown' || special === 'waterfall') && vMms > SPRAY_MIN_MMS ? 1 : 0;
    c.seatStart[i] = c.nSeats;
    let cnt = 0;
    for (let j = 0; j < seatsPerCar; j++) {
      const g = seats[k * seatsPerCar + j];
      c.addSeat(g === undefined ? -1 : g);
      cnt++;
    }
    c.seatCount[i] = cnt;
    // Depth: the nearer of the tiles under the car's front and back, so the rails under it draw first.
    const half = (carLen / 2000) * Math.cos(p.pitch);
    const dx = Math.cos(p.yaw) * half;
    const dy = Math.sin(p.yaw) * half;
    const d1 = Math.floor(viewX(p.x + dx, p.y + dy, f) / TILE_M) + Math.floor(viewY(p.x + dx, p.y + dy, f) / TILE_M) + 1;
    const d2 = Math.floor(viewX(p.x - dx, p.y - dy, f) / TILE_M) + Math.floor(viewY(p.x - dx, p.y - dy, f) / TILE_M) + 1;
    sink.push(KIND_TRACK, i, SUB_CAR, ax, ay, 0, Math.max(d1, d2), p.z, Layer.Guest);
  }

  /** Draw one collected track drawable. `look`: the realistic look, when on (rails, supports and cars). */
  drawItem(ctx: CanvasRenderingContext2D, ref: number, sub: number, look?: RealLook): void {
    // Compile-time gate: the website build (VITE_ART unset) folds the realistic branches away.
    this.look = import.meta.env.VITE_ART === 'real' ? look : undefined;
    switch (sub) {
      case SUB_SLICE:
        this.drawSlice(ctx, ref);
        break;
      case SUB_CHAIN:
        this.drawChain(ctx, ref);
        break;
      case SUB_CAR:
        this.drawCar(ctx, ref);
        break;
      case SUB_GATE:
        this.drawGate(ctx, ref);
        break;
      case SUB_WATER:
        this.drawWater(ctx, ref);
        break;
      case SUB_GOAL_LEG:
        this.drawGoalLeg(ctx, ref);
        break;
    }
  }

  private blit(ctx: CanvasRenderingContext2D, sp: Sprite, wx: number, wy: number): void {
    const f = this.scale / sp.scale;
    const x0 = Math.round(this.devX(wx) - sp.ox * f);
    const y0 = Math.round(this.devY(wy) - sp.oy * f);
    const x1 = Math.round(this.devX(wx) + (sp.w - sp.ox) * f);
    const y1 = Math.round(this.devY(wy) + (sp.h - sp.oy) * f);
    if (sp.sx === undefined) ctx.drawImage(sp.image, x0, y0, x1 - x0, y1 - y0);
    else ctx.drawImage(sp.image, sp.sx, sp.sy ?? 0, sp.w, sp.h, x0, y0, x1 - x0, y1 - y0);
  }

  private drawSlice(ctx: CanvasRenderingContext2D, i: number): void {
    const sl = this.slices[i];
    if (!sl) return;
    const look = import.meta.env.VITE_ART === 'real' ? this.look : undefined;
    if (import.meta.env.VITE_ART === 'real') (this.realRails ??= new WeakSet()).delete(sl);
    if (look) {
      // Realistic rail (Task 9b): one picture per (piece, rail tile, heading in the view), anchored at the tile centre
      // at the piece's entry height; its support stacked from foot, 1 m segments and top, drawn first.
      const f = this.frameRef;
      const type = sl.data.typeId;
      const rp = realRailPlacement(sl, f);
      const rail = look.rail(type, sl.pieceId, sl.tile, rp.heading, sl.data.colours.track);
      if (rail === null) return;
      if (rail) {
        if (import.meta.env.VITE_ART === 'real') this.realRails?.add(sl);
        for (const rec of sl.supports) {
          const su = realSupportPlacement(sl, f, rec);
          if (!su) continue;
          // a goalpost (2026-11-21): the saddle on its beam; its two frames are drawables of their own (`SUB_GOAL_LEG`)
          for (const p of su.pieces) {
            const sp = look.support(type, p.part, su.heading, sl.data.colours.supports);
            if (sp) this.blit(ctx, sp, su.ax, p.ay);
          }
        }
        this.blit(ctx, rail, rp.ax, rp.ay);
        // A chained piece (Task 5): its baked trough over the rail; the moving dashes follow (SUB_CHAIN).
        if (sl.data.pieces[sl.pieceIndex]?.chain && look.railPart) {
          const trough = look.railPart(type, sl.pieceId, sl.tile, rp.heading, 'chain');
          if (trough) this.blit(ctx, trough, rp.ax, rp.ay);
        }
        return;
      }
    }
    const bi = bucketIndex(this.bucket);
    let sp = sl.sprites[bi] ?? null;
    if (!sp) {
      if (this.builds >= MAX_SLICE_BUILDS_PER_FRAME) {
        this.drawPlainSlice(ctx, sl);
        return;
      }
      this.builds++;
      const f = this.frameRef;
      sp = buildSprite(sl.bounds, this.bucket, (c) => paintSlice(c, sl, f));
      // Realistic build: refused room (canvas.ts classicGate), nothing was made: the plain rail, and ask again next frame.
      if (import.meta.env.VITE_ART === 'real' && sp.notMade) {
        this.drawPlainSlice(ctx, sl);
        return;
      }
      sl.sprites[bi] = sp;
    }
    this.blit(ctx, sp, sl.ax, sl.ay);
  }

  /** Half a realistic goalpost's beam (`near`: from the saddle to the near leg), drawn procedurally in the support colour. */
  private drawRealGoal(ctx: CanvasRenderingContext2D, sl: SliceRec, rec: SupportRec, near: boolean): void {
    const f = this.frameRef;
    const colour = realGoalColour(sl);
    ctx.save();
    ctx.translate(this.offX, this.offY);
    ctx.scale(this.scale, this.scale);
    const P = new Projector(f, 0, 0);
    for (const b of realGoalBeams(sl, rec, f, near ? 'near' : 'far')) paintBox(ctx, P, b.c, b.f, b.r, GOAL_UP, b.a, b.b, b.h0, b.h1, colour);
    ctx.restore();
  }

  /**
   * A goalpost frame: its leg (the realistic look's baked column pieces, or today's look painted live: it is no slice's
   * sprite) and its half of the beam, the far frame's beam over its leg's top, the near frame's leg over its beam.
   */
  private drawGoalLeg(ctx: CanvasRenderingContext2D, i: number): void {
    const l = this.goalLegs[i];
    const sl = l ? this.slices[l.slice] : undefined;
    const g = l?.su.goal;
    if (!l || !sl || !g) return;
    const f = this.frameRef;
    const look = import.meta.env.VITE_ART === 'real' ? this.look : undefined;
    if (look) {
      // as its slice: the baked pieces where the slice draws its baked rail, nothing where it draws nothing
      const rail = look.rail(sl.data.typeId, sl.pieceId, sl.tile, realRailPlacement(sl, f).heading, sl.data.colours.track);
      if (rail === null) return;
      if (rail) {
        const leg = (): void => {
          for (const lp of realGoalLegPlacement(sl, f, l.su)) {
            if (lp.wx !== l.x || lp.wy !== l.y) continue;
            for (const p of lp.pieces) {
              const sp = look.support(sl.data.typeId, p.part, lp.heading, sl.data.colours.supports);
              if (sp) this.blit(ctx, sp, lp.ax, p.ay);
            }
          }
        };
        if (!l.near) leg();
        this.drawRealGoal(ctx, sl, l.su, l.near);
        if (l.near) leg();
        return;
      }
    }
    ctx.save();
    ctx.translate(this.offX, this.offY);
    ctx.scale(this.scale, this.scale);
    const P = new Projector(f, 0, 0);
    const colour = sl.colours.supports;
    if (!l.near) paintGoalLeg(ctx, P, sl.supportStyle, colour, g, l.x, l.y, l.su.base);
    paintGoalpost(ctx, P, sl.supportStyle, colour, g, l.su.wx, l.su.wy, l.near);
    if (l.near) paintGoalLeg(ctx, P, sl.supportStyle, colour, g, l.x, l.y, l.su.base);
    ctx.restore();
  }


  /** A slice whose sprite is still waiting: its rail as a plain line (§4.13). */
  private drawPlainSlice(ctx: CanvasRenderingContext2D, sl: SliceRec): void {
    const s = sl.samples;
    const f = this.frameRef;
    ctx.beginPath();
    for (let r = 0; r < sl.runs.length; r += 2) {
      const k0 = sl.runs[r] as number;
      const k1 = sl.runs[r + 1] as number;
      for (let k = k0; k <= k1; k++) {
        const x = this.devX(projectX(s.x[k] as number, s.y[k] as number, f));
        const y = this.devY(projectY(s.x[k] as number, s.y[k] as number, s.z[k] as number, f));
        if (k === k0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = sl.colours.track;
    ctx.lineWidth = Math.max(1, 2 * this.scale);
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  /** Lift chain overlay: a dark chain with light links that move by tick mod 8 (§4.13). */
  private drawChain(ctx: CanvasRenderingContext2D, i: number): void {
    const sl = this.slices[i];
    if (!sl) return;
    const s = sl.samples;
    const f = this.frameRef;
    const fr = this.fr;
    // Realistic (Task 5): on the baked trough's chain, at the rail line, not today's 5 cm over it; only where the
    // realistic rail drew (review P2): over today's painted rail, today's dashes.
    const real = import.meta.env.VITE_ART === 'real' && this.look !== undefined && this.realRails?.has(sl) === true;
    ctx.beginPath();
    for (let r = 0; r < sl.runs.length; r += 2) {
      const k0 = sl.runs[r] as number;
      const k1 = sl.runs[r + 1] as number;
      for (let k = k0; k <= k1; k++) {
        trackFrame(s.yaw[k] as number, s.pitch[k] as number, s.bankSin[k] as number, s.bankCos[k] as number, fr);
        const up = (sl.look.lift ?? 0) + (real ? CHAIN_LINE_M : 0.05);
        const wx = (s.x[k] as number) + (fr[6] as number) * up;
        const wy = (s.y[k] as number) + (fr[7] as number) * up;
        const wz = (s.z[k] as number) + (fr[8] as number) * up;
        const x = this.devX(projectX(wx, wy, f));
        const y = this.devY(projectY(wx, wy, wz, f));
        if (k === k0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    const k = this.scale;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = real ? CHAIN_STYLE.base : '#262a31';
    ctx.lineWidth = real ? Math.max(0.6, CHAIN_STYLE.baseW * k) : Math.max(1, 1.8 * k);
    ctx.stroke();
    const period = (real ? CHAIN_STYLE.periodPx : 4) * k;
    this.dash[0] = period / 2;
    this.dash[1] = period / 2;
    ctx.setLineDash(this.dash);
    ctx.lineDashOffset = -((this.tick % 8) / 8) * period;
    ctx.strokeStyle = real ? CHAIN_STYLE.link : '#c8ced6';
    ctx.lineWidth = real ? Math.max(0.4, CHAIN_STYLE.linkW * k) : Math.max(0.8, 1 * k);
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    ctx.lineDashOffset = 0;
  }

  /**
   * Water surface overlay: light ripples on the channel that drift downstream by tick mod 16 (never cached, like the
   * chain). Reuses the dash buffer; no allocation per frame.
   */
  private drawWater(ctx: CanvasRenderingContext2D, i: number): void {
    const sl = this.slices[i];
    if (!sl) return;
    const s = sl.samples;
    const f = this.frameRef;
    const fr = this.fr;
    const k = this.scale;
    const half = sl.look.channel * 0.45;
    for (let lane = -1; lane <= 1; lane += 2) {
      ctx.beginPath();
      for (let r = 0; r < sl.runs.length; r += 2) {
        const k0 = sl.runs[r] as number;
        const k1 = sl.runs[r + 1] as number;
        for (let q = k0; q <= k1; q++) {
          trackFrame(s.yaw[q] as number, s.pitch[q] as number, s.bankSin[q] as number, s.bankCos[q] as number, fr);
          const wx = (s.x[q] as number) + (fr[3] as number) * half * lane + (fr[6] as number) * 0.03;
          const wy = (s.y[q] as number) + (fr[4] as number) * half * lane + (fr[7] as number) * 0.03;
          const wz = (s.z[q] as number) + (fr[5] as number) * half * lane + (fr[8] as number) * 0.03;
          const x = this.devX(projectX(wx, wy, f));
          const y = this.devY(projectY(wx, wy, wz, f));
          if (q === k0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      const period = 6 * k;
      this.dash[0] = period * 0.35;
      this.dash[1] = period * 0.65;
      ctx.setLineDash(this.dash);
      ctx.lineDashOffset = -(((this.tick + (lane > 0 ? 5 : 0)) % 16) / 16) * period;
      ctx.strokeStyle = 'rgba(232,248,255,0.75)';
      ctx.lineWidth = Math.max(0.6, 0.9 * k);
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.setLineDash(NO_DASH);
    ctx.lineDashOffset = 0;
  }

  /** Spray around a boat on a splashdown or waterfall: a few drops placed by the tick (render only, deterministic). */
  private drawSpray(ctx: CanvasRenderingContext2D, i: number): void {
    const c = this.cars;
    const f = this.frameRef;
    const k = this.scale;
    const x = this.devX(projectX(c.x[i] as number, c.y[i] as number, f));
    const y = this.devY(projectY(c.x[i] as number, c.y[i] as number, (c.z[i] as number) + 0.6, f));
    ctx.fillStyle = 'rgba(240,250,255,0.85)';
    for (let d = 0; d < 7; d++) {
      const ph = ((this.tick * 3 + d * 37) % 64) / 64;
      const ang = (d / 7) * Math.PI * 2 + this.tick * 0.05;
      const rad = (6 + 14 * ph) * k;
      ctx.beginPath();
      ctx.arc(x + Math.cos(ang) * rad, y - (10 * ph - 6 * ph * ph) * k * 1.6 + Math.sin(ang) * rad * 0.5, Math.max(0.8, (2.2 - 1.6 * ph) * k), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawGate(ctx: CanvasRenderingContext2D, gi: number): void {
    const kind = this.gateKind[gi] === 0 ? 'entrance' : 'exit';
    const colour = this.gateColour[gi] ?? '#8a96a3';
    let set = this.gateCache.get(colour);
    if (!set) {
      set = [null, null, null, null, null, null];
      this.gateCache.set(colour, set);
    }
    const slot = (kind === 'entrance' ? 0 : 3) + bucketIndex(this.bucket);
    let sp = set[slot] ?? null;
    if (!sp) {
      sp = buildSprite(GATE_BOUNDS, this.bucket, (c) => paintGateBooth(c, kind, colour));
      // Realistic build: refused room, nothing was made or kept: no booth this frame, asked again next frame.
      if (import.meta.env.VITE_ART === 'real' && sp.notMade) return;
      set[slot] = sp;
    }
    this.blit(ctx, sp, this.gateAx[gi] as number, this.gateAy[gi] as number);
  }

  private drawCar(ctx: CanvasRenderingContext2D, i: number): void {
    const c = this.cars;
    const f = this.frameRef;
    const shape = c.shape[i] as number;
    const ys = yawStep(c.yaw[i] as number);
    const ps = pitchStep(c.pitch[i] as number);
    const rs = rollStep(c.bankSin[i] as number, c.bankCos[i] as number);
    const colour = c.colour[i] as number;
    const front = c.front[i] as number;
    const look = import.meta.env.VITE_ART === 'real' ? this.look : undefined;
    if (look) {
      // Realistic car: pose in the bake's steps (yaw 32, pitch and roll 24), riders baked in its `full` frames.
      const start = c.seatStart[i] as number;
      let full = false;
      for (let j = 0; j < (c.seatCount[i] as number); j++) if ((c.seats[start + j] as number) >= 0) full = true;
      const q = quantisePose(c.yaw[i] as number, c.pitch[i] as number, Math.atan2(c.bankSin[i] as number, c.bankCos[i] as number));
      const real = look.car(this.carDef[i] as string, q.yaw, q.pitch, q.roll, full, colour);
      if (real === null) return;
      if (real) {
        this.blit(ctx, real, projectX(c.x[i] as number, c.y[i] as number, f), projectY(c.x[i] as number, c.y[i] as number, c.z[i] as number, f));
        if (c.spray[i] === 1) this.drawSpray(ctx, i);
        return;
      }
    }
    const bi = bucketIndex(this.bucket);
    const key = (((((shape * 16 + ys) * 24 + ps) * 16 + rs) * 12 + (colour % 12)) * 2 + front) * 3 + bi;
    let sp = this.carCache.get(key);
    if (!sp) {
      if (this.carBuilds >= MAX_CAR_BUILDS_PER_FRAME) {
        this.drawPlainCar(ctx, i);
        return;
      }
      this.carBuilds++;
      const shapeName = CAR_SHAPES[shape] ?? 'coaster';
      const hex = paletteColour(colour);
      const yaw = (ys / 16) * Math.PI * 2;
      const pitch = (ps / 24) * Math.PI * 2;
      const roll = (rs / 16) * Math.PI * 2;
      sp = buildSprite(CAR_BOUNDS, this.bucket, (cx) => paintCar(cx, shapeName, yaw, pitch, hex, front === 1, Math.sin(roll), Math.cos(roll)));
      // Realistic build: refused room, nothing was made (and the cache keeps nothing): the plain car this frame.
      if (import.meta.env.VITE_ART === 'real' && sp.notMade) {
        this.drawPlainCar(ctx, i);
        return;
      }
      this.carCache.set(key, sp);
    }
    const wx = c.x[i] as number;
    const wy = c.y[i] as number;
    const wz = c.z[i] as number;
    this.blit(ctx, sp, projectX(wx, wy, f), projectY(wx, wy, wz, f));
    this.drawRiders(ctx, i);
    if (c.spray[i] === 1) this.drawSpray(ctx, i);
  }

  private drawPlainCar(ctx: CanvasRenderingContext2D, i: number): void {
    const c = this.cars;
    const f = this.frameRef;
    const x = this.devX(projectX(c.x[i] as number, c.y[i] as number, f));
    const y = this.devY(projectY(c.x[i] as number, c.y[i] as number, (c.z[i] as number) + 0.5, f));
    ctx.fillStyle = paletteColour(c.colour[i] as number);
    const r = 5 * this.scale;
    ctx.fillRect(x - r, y - r * 0.6, 2 * r, 1.2 * r);
  }

  /** Riders as heads with shirt colours (§4.13). */
  private drawRiders(ctx: CanvasRenderingContext2D, i: number): void {
    if (this.scale < 0.4) return;
    const c = this.cars;
    const cnt = c.seatCount[i] as number;
    if (cnt === 0) return;
    const start = c.seatStart[i] as number;
    let any = false;
    for (let j = 0; j < cnt; j++) if ((c.seats[start + j] as number) >= 0) any = true;
    if (!any) return;
    const f = this.frameRef;
    const fr = this.fr;
    trackFrame(c.mapYaw[i] as number, c.pitch[i] as number, c.bankSin[i] as number, c.bankCos[i] as number, fr);
    const shapeName = CAR_SHAPES[c.shape[i] as number] ?? 'coaster';
    const d = carDims(shapeName, c.front[i] === 1);
    const cols = cnt >= 2 ? 2 : 1;
    const rows = Math.ceil(cnt / cols);
    const k = this.scale;
    for (let j = 0; j < cnt; j++) {
      const g = c.seats[start + j] as number;
      if (g < 0) continue;
      const row = Math.floor(j / cols);
      const col = j % cols;
      const along = d.a * 0.55 * (1 - (2 * (row + 0.5)) / rows);
      const side = cols === 2 ? (col === 0 ? -0.4 : 0.4) * d.b : 0;
      const h = riderHeightM(shapeName, d);
      const wx = (c.x[i] as number) + (fr[0] as number) * along + (fr[3] as number) * side + (fr[6] as number) * h;
      const wy = (c.y[i] as number) + (fr[1] as number) * along + (fr[4] as number) * side + (fr[7] as number) * h;
      const wz = (c.z[i] as number) + (fr[2] as number) * along + (fr[5] as number) * side + (fr[8] as number) * h;
      const x = this.devX(projectX(wx, wy, f));
      const y = this.devY(projectY(wx, wy, wz, f));
      const m = mix32(g);
      ctx.fillStyle = SHIRT_COLOURS[m % SHIRT_COLOURS.length] as string;
      ctx.beginPath();
      ctx.ellipse(x, y + 1.6 * k, 2.4 * k, 1.5 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SKIN_TONES[(m >>> 8) % SKIN_TONES.length] as string;
      ctx.beginPath();
      ctx.arc(x, y - 0.6 * k, 1.8 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ------------------------------------------------------------------ builder overlay

  private ghostSamples: { ghost: TrackPieceGhost; s: WorldSamples } | null = null;

  /** Builder ghosts (station, piece, gates), drawn over the scene. Also trims the car sprite cache (once per frame). */
  drawOverlay(ctx: CanvasRenderingContext2D, world: World, tool: ToolState): void {
    this.carCache.trim();
    if (tool.tool !== 'track') return;
    const st = trackToolOf(tool);
    const map = world.state.map;
    const k = Math.max(0.8, Math.min(2.4, this.scale));
    if (st.phase === 'station' && st.stationGhost) {
      const g = st.stationGhost;
      for (const t of g.tiles) this.tileOutline(ctx, map.width, t, map.heights[t] as number, ghostFill(g.valid), ghostStroke(g.valid));
      // Direction arrow along the station.
      const first = g.tiles[0];
      if (first !== undefined) {
        const z = map.heights[first] as number;
        const dirX = [0, 1, 0, -1][g.dir] as number;
        const dirY = [-1, 0, 1, 0][g.dir] as number;
        const x0 = (g.x + 0.5) * TILE_M;
        const y0 = (g.y + 0.5) * TILE_M;
        const len = g.length * TILE_M;
        const x1 = x0 + dirX * len;
        const y1 = y0 + dirY * len;
        this.arrow(ctx, x0 - dirX * 1.5, y0 - dirY * 1.5, x1 - dirX * 1.5, y1 - dirY * 1.5, z + 0.3, g.valid ? GHOST_LIGHT_VALID : GHOST_LIGHT_INVALID);
        const lx = this.devX(projectX(x0, y0, this.frameRef));
        const ly = this.devY(projectY(x0, y0, z + 3, this.frameRef));
        drawGhostIcon(ctx, lx, ly, g.valid, 10 * k);
      }
      return;
    }
    // R1 (Task 8): a found Auto-finish path shows as valid ghosts of all its pieces, in place of the piece ghost.
    const af = st.autoFinish;
    if (st.phase === 'pieces' && af?.state === 'found') {
      for (const p of af.pieces) this.ghostRails(ctx, samplesOf(p), true);
      return;
    }
    if (st.phase === 'pieces' && st.pieceGhost) {
      this.drawPieceGhost(ctx, world, st.pieceGhost, k);
      return;
    }
    if (st.phase === 'entrance' || st.phase === 'exit') {
      ctx.setLineDash([4 * k, 3 * k]);
      for (const t of st.gateCandidates) this.tileOutline(ctx, map.width, t, map.heights[t] as number, 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.9)');
      ctx.setLineDash([]);
      const g = st.gateGhost;
      if (g && g.tile >= 0 && g.tile < map.width * map.height) {
        this.tileOutline(ctx, map.width, g.tile, map.heights[g.tile] as number, ghostFill(g.valid), ghostStroke(g.valid));
        const gx = g.tile % map.width;
        const gy = (g.tile - gx) / map.width;
        const x = this.devX(projectX((gx + 0.5) * TILE_M, (gy + 0.5) * TILE_M, this.frameRef));
        const y = this.devY(projectY((gx + 0.5) * TILE_M, (gy + 0.5) * TILE_M, (map.heights[g.tile] as number) + 2.5, this.frameRef));
        drawGhostIcon(ctx, x, y, g.valid, 10 * k);
      }
    }
  }

  /** Two rails and the centre line of a ghost piece, in the light tints of the safe pair (valid or invalid). */
  private ghostRails(ctx: CanvasRenderingContext2D, s: WorldSamples, ok: boolean): void {
    const f = this.frameRef;
    const fr = this.fr;
    // Light tints of the safe pair: the rails stay readable over dark terrain and track art.
    const colour = ok ? GHOST_LIGHT_VALID : GHOST_LIGHT_INVALID;
    for (const side of [-0.6, 0, 0.6]) {
      ctx.beginPath();
      for (let i = 0; i < s.n; i++) {
        trackFrame(s.yaw[i] as number, s.pitch[i] as number, s.bankSin[i] as number, s.bankCos[i] as number, fr);
        const wx = (s.x[i] as number) + (fr[3] as number) * side;
        const wy = (s.y[i] as number) + (fr[4] as number) * side;
        const wz = (s.z[i] as number) + (fr[5] as number) * side;
        const x = this.devX(projectX(wx, wy, f));
        const y = this.devY(projectY(wx, wy, wz, f));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = colour;
      ctx.lineWidth = ghostLineWidth(side === 0 ? Math.max(1, 1.2 * this.scale) : Math.max(1.5, 2.2 * this.scale));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  private drawPieceGhost(ctx: CanvasRenderingContext2D, world: World, g: TrackPieceGhost, k: number): void {
    const map = world.state.map;
    if (!this.ghostSamples || this.ghostSamples.ghost !== g) this.ghostSamples = { ghost: g, s: pieceWorldSamples(g.piece) };
    const s = this.ghostSamples.s;
    const f = this.frameRef;
    const fr = this.fr;
    for (const t of g.conflictTiles) this.tileOutline(ctx, map.width, t, map.heights[t] as number, GHOST_FILL_INVALID, GHOST_INVALID);
    this.ghostRails(ctx, s, g.ok);
    // Dashed line from the highest point down to the ground, and the labels there.
    let top = 0;
    for (let i = 1; i < s.n; i++) if ((s.z[i] as number) > (s.z[top] as number)) top = i;
    const wx = s.x[top] as number;
    const wy = s.y[top] as number;
    const tx = Math.min(map.width - 1, Math.max(0, Math.floor(wx / TILE_M)));
    const ty = Math.min(map.height - 1, Math.max(0, Math.floor(wy / TILE_M)));
    const ground = map.heights[ty * map.width + tx] as number;
    const x = this.devX(projectX(wx, wy, f));
    const yTop = this.devY(projectY(wx, wy, s.z[top] as number, f));
    const yGround = this.devY(projectY(wx, wy, ground, f));
    ctx.setLineDash([4 * k, 3 * k]);
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yGround);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1, 1.2 * k);
    ctx.stroke();
    ctx.setLineDash([]);
    const label = g.ok ? `✓ ${moneyLabel(g.cost)}` : '✕';
    const tag = `+${Math.max(0, Math.round(g.heightAboveGround))} m`;
    drawGhostIcon(ctx, x, yTop - 14 * k, g.ok, 8 * k);
    this.label(ctx, x + 12 * k, yTop - 14 * k, label, g.ok ? GHOST_DARK_VALID : GHOST_DARK_INVALID);
    this.label(ctx, x + 12 * k, yTop + 4 * k, tag, '#25374a');
  }

  private label(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string): void {
    const k = Math.max(0.8, Math.min(2.4, this.scale));
    ctx.font = `600 ${Math.round(12 * k)}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 10 * k;
    const h = 18 * k;
    ctx.fillStyle = bg;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(x, y - h / 2, w, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 5 * k, y + 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  private arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, z: number, colour: string): void {
    const f = this.frameRef;
    const ax = this.devX(projectX(x0, y0, f));
    const ay = this.devY(projectY(x0, y0, z, f));
    const bx = this.devX(projectX(x1, y1, f));
    const by = this.devY(projectY(x1, y1, z, f));
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const h = Math.min(len * 0.4, 12 * this.scale);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - ux * h - uy * h * 0.6, by - uy * h + ux * h * 0.6);
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - ux * h + uy * h * 0.6, by - uy * h - ux * h * 0.6);
    ctx.strokeStyle = colour;
    ctx.lineWidth = ghostLineWidth(Math.max(1.5, 2.5 * this.scale));
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  private tileOutline(ctx: CanvasRenderingContext2D, w: number, tile: number, z: number, fill: string, stroke: string): void {
    const f = this.frameRef;
    const x = tile % w;
    const y = (tile - x) / w;
    const inset = 0.08;
    const corners: ReadonlyArray<readonly [number, number]> = [
      [x + inset, y + inset],
      [x + 1 - inset, y + inset],
      [x + 1 - inset, y + 1 - inset],
      [x + inset, y + 1 - inset],
    ];
    ctx.beginPath();
    corners.forEach(([cx, cy], i) => {
      const px = this.devX(isoX(viewX(cx * TILE_M, cy * TILE_M, f), viewY(cx * TILE_M, cy * TILE_M, f)));
      const py = this.devY(isoY(viewX(cx * TILE_M, cy * TILE_M, f), viewY(cx * TILE_M, cy * TILE_M, f), z));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = ghostLineWidth(Math.max(1, 1.5 * this.scale));
    ctx.stroke();
  }
}

/** "$45" style money for canvas labels (whole dollars, cents when needed). */
export function moneyLabel(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const d = Math.floor(abs / 100);
  const c = abs % 100;
  const body = `$${String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${c === 0 ? '' : `.${String(c).padStart(2, '0')}`}`;
  return cents < 0 ? `−${body}` : body;
}
