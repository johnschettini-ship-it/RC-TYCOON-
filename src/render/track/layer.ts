/**
 * Track rendering layer (phase-2 §4.13). Owner: W2-A.
 * - Pieces: each occupied rail tile is a slice sprite holding the rail samples inside that tile and its support.
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
import { getTrackPieceDef, getTrackTypeDef, type PieceSpecial } from '../../data/track';
import { TILE_M } from '../../data/tuning/track';
import { pieceWorldSamples, trackTileSlices, trainSpinFrame } from '../../sim/rides/track/api';
import { getLayout, newSamplePoint, type CircuitLayout } from '../../sim/rides/track/layout';
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
  SHIRT_COLOURS,
  TAG_COLOURS,
} from '../palette';
import { artStyle } from '../pixel/style';
import { isPixelSurface, type PixelSurface } from '../pixel/surface';
import { bucketIndex, SpriteCache, type Sprite } from '../spriteCache';
import { drawGhostIcon } from '../sprites/props';
import type { ArtBounds } from '../sprites/rides';
import { SKIN_TONES } from '../sprites/shapes';
import type { ToolState } from '../types';
import { paletteColour } from './colours';
import {
  CAR_BOUNDS,
  carDims,
  GATE_BOUNDS,
  lookFor,
  paintCar,
  paintGateBooth,
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
  rollStep,
  projectY,
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

/** Draw-list kind for track drawables (outside the renderer's own kind numbers). */
export const KIND_TRACK = 40;

const SUB_SLICE = 0;
const SUB_CHAIN = 1;
const SUB_CAR = 2;
const SUB_GATE = 3;
const SUB_WATER = 4;

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
const CAR_SHAPES: readonly CarShape[] = ['coaster', 'junior', 'loco', 'mouse', 'ghost', 'kart', 'log', 'raft', 'inverted', 'bobsled', 'monorail'];

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
  support: { wx: number; wy: number; yaw: number; top: number } | null;
  special: PieceSpecial;
  /** Water channel slice (ripple overlay) and lift conveyor (belt cleats). */
  water: boolean;
  conveyor: boolean;
  look: RailLook;
  supportStyle: SupportStyle;
  colours: TrackColours;
  key: string;
  sprites: Array<Sprite | null>;
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

function coloursOf(data: TrackRideData): TrackColours {
  return { track: paletteColour(data.colours.track), supports: paletteColour(data.colours.supports), cars: paletteColour(data.colours.cars) };
}

/** Bounds (world px around the anchor) of a slice: rails, deck, tunnel box, and the support down to the ground. */
function sliceBounds(P: Projector, s: WorldSamples, runs: readonly number[], ground: number, special: PieceSpecial, lift = 0): ArtBounds {
  // Pixel (stage 4a track rule 2): each run grows by one sample on each cut side before the bounds are measured.
  if (artStyle() === 'pixel') runs = widenRuns(s, runs);
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

/** Pixel: each run [k0, k1] widened to [k0 − 1, k1 + 1] on its cut sides (a side where the piece goes on). */
function widenRuns(s: WorldSamples, runs: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < runs.length; i += 2) {
    const k0 = runs[i] as number;
    const k1 = runs[i + 1] as number;
    out.push(k0 > 0 ? k0 - 1 : k0, k1 < s.n - 1 ? k1 + 1 : k1);
  }
  return out;
}

const SUPPORT_FRAME = new Float64Array(9);

/** Build the slice records of one ride (allocates; runs only when the track changes). */
export function buildRideSlices(world: World, rideId: number, f: ViewFrame): SliceRec[] {
  const data = world.state.track.rides[String(rideId)];
  const type = data ? getTrackTypeDef(data.typeId) : undefined;
  if (!data || !type) return [];
  const look = lookFor(type);
  const colours = coloursOf(data);
  const out: SliceRec[] = [];
  for (const t of trackTileSlices(world, rideId)) {
    if (!t.rail) continue;
    const piece = data.pieces[t.pieceIndex];
    const def = piece ? getTrackPieceDef(piece.defId) : undefined;
    if (!piece || !def) continue;
    const s = samplesOf(piece);
    const runs = runsInTile(s, t.x, t.y);
    if (runs.length === 0) continue;
    const cx = (t.x + 0.5) * TILE_M;
    const cy = (t.y + 0.5) * TILE_M;
    const ax = projectX(cx, cy, f);
    const ay = projectY(cx, cy, 0, f);
    const P = new Projector(f, ax, ay);
    let support: SliceRec['support'] = null;
    const lift = look.lift ?? 0;
    // Hanging cars (Phase 6 inverted): every rail tile on the track's own ground gets an arm support, stations too.
    if (t.support || (lift > 0 && t.railMin <= t.ground)) {
      const k = supportSample(s, runs, t.x, t.y);
      if (lift > 0) {
        // The arm holds the spine, `lift − drop` up the (possibly rolled) track frame from the sample.
        trackFrame(s.yaw[k] as number, s.pitch[k] as number, s.bankSin[k] as number, s.bankCos[k] as number, SUPPORT_FRAME);
        const up = lift - look.drop;
        support = {
          wx: (s.x[k] as number) + (SUPPORT_FRAME[6] as number) * up,
          wy: (s.y[k] as number) + (SUPPORT_FRAME[7] as number) * up,
          yaw: s.yaw[k] as number,
          top: (s.z[k] as number) + (SUPPORT_FRAME[8] as number) * up,
        };
      } else {
        support = { wx: s.x[k] as number, wy: s.y[k] as number, yaw: s.yaw[k] as number, top: (s.z[k] as number) - look.drop };
      }
    }
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
      support,
      special: def.special,
      water: look.channel > 0 && !look.trough,
      conveyor: def.water?.drive === 'conveyor' && def.special !== 'station',
      look,
      supportStyle: type.render.supports,
      colours,
      key: `${type.id}|${piece.defId}|${piece.x},${piece.y},${piece.z},${piece.dir}|${t.x},${t.y}|${support ? 1 : 0}|${colours.track}|${colours.supports}|${f.rot}`,
      sprites: [null, null, null],
    });
  }
  return out;
}

/**
 * Paint one slice around its anchor (world px). On a surface with `extras` on, each run also paints the one extra
 * sample on each cut side as cut pixels (stage 4a track rules 1 and 3); `extras` false paints the bare runs only.
 */
export function paintSlice(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, sl: SliceRec, f: ViewFrame, extras = true): void {
  if (isPixelSurface(ctx)) {
    paintSlicePixel(ctx, sl, f, extras);
    return;
  }
  const P = new Projector(f, sl.ax, sl.ay);
  if (sl.support) paintSupport(ctx, P, sl.supportStyle, sl.colours.supports, sl.support.wx, sl.support.wy, sl.support.yaw, sl.ground, sl.support.top);
  for (let i = 0; i < sl.runs.length; i += 2) {
    paintRun(ctx, P, sl.look, sl.colours, sl.samples, sl.runs[i] as number, sl.runs[i + 1] as number, { special: sl.special, chain: false, conveyor: sl.conveyor });
  }
}

/** Pixel slice: the runs as today, then the extra samples [k0 − 1, k0] and [k1, k1 + 1] with `cut(true)`. */
function paintSlicePixel(ctx: PixelSurface, sl: SliceRec, f: ViewFrame, extras: boolean): void {
  const c = ctx as unknown as CanvasRenderingContext2D;
  const P = new Projector(f, sl.ax, sl.ay);
  if (sl.support) paintSupport(c, P, sl.supportStyle, sl.colours.supports, sl.support.wx, sl.support.wy, sl.support.yaw, sl.ground, sl.support.top);
  const opt = { special: sl.special, chain: false, conveyor: sl.conveyor };
  const n = sl.samples.n;
  for (let i = 0; i < sl.runs.length; i += 2) {
    const k0 = sl.runs[i] as number;
    const k1 = sl.runs[i + 1] as number;
    paintRun(c, P, sl.look, sl.colours, sl.samples, k0, k1, opt);
    if (!extras) continue;
    // The extra samples share their points with the next slice (rule 3), so two slices give the same pixels there.
    ctx.cut(true);
    if (k0 > 0) paintRun(c, P, sl.look, sl.colours, sl.samples, k0 - 1, k0, opt);
    if (k1 < n - 1) paintRun(c, P, sl.look, sl.colours, sl.samples, k1, k1 + 1, opt);
    ctx.cut(false);
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
  private sigs = new Map<number, RideSig>();
  private frameRef: ViewFrame = viewFrame(0, 64, 64);
  private readonly cars = new CarBuffer();
  private gateAx = new Float64Array(16);
  private gateAy = new Float64Array(16);
  private gateKind = new Uint8Array(16);
  private gateColour: string[] = [];
  private nGates = 0;
  private readonly carCache = new SpriteCache(6_000_000);
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
      for (const sl of buildRideSlices(world, r.id, this.frameRef)) {
        const reuse = old.get(sl.key);
        if (reuse) sl.sprites = reuse;
        next.push(sl);
      }
    }
    this.slices = next;
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
      const b = sl.bounds;
      if (sl.ax + b.right < view.x0 || sl.ax + b.left > view.x1 || sl.ay + b.bottom < view.y0 || sl.ay + b.top > view.y1) continue;
      sink.push(KIND_TRACK, i, SUB_SLICE, sl.ax, sl.ay, 0, sl.depth, sl.railMin, Layer.Object);
      if (sl.rideId !== lastRide) {
        lastRide = sl.rideId;
        data = s.track.rides[String(sl.rideId)];
      }
      if (data?.pieces[sl.pieceIndex]?.chain) sink.push(KIND_TRACK, i, SUB_CHAIN, sl.ax, sl.ay, 0, sl.depth, sl.railMin, Layer.Object);
      if (sl.water) sink.push(KIND_TRACK, i, SUB_WATER, sl.ax, sl.ay, 0, sl.depth, sl.railMin, Layer.Object);
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
    if (ax + CAR_BOUNDS.right < view.x0 || ax + CAR_BOUNDS.left > view.x1 || ay + CAR_BOUNDS.bottom < view.y0 || ay + CAR_BOUNDS.top > view.y1) return;
    const c = this.cars;
    const i = c.add();
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

  /** Draw one collected track drawable. */
  drawItem(ctx: CanvasRenderingContext2D, ref: number, sub: number): void {
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
    }
  }

  private blit(ctx: CanvasRenderingContext2D, sp: Sprite, wx: number, wy: number): void {
    const f = this.scale / sp.scale;
    const x0 = Math.round(this.devX(wx) - sp.ox * f);
    const y0 = Math.round(this.devY(wy) - sp.oy * f);
    const x1 = Math.round(this.devX(wx) + (sp.w - sp.ox) * f);
    const y1 = Math.round(this.devY(wy) + (sp.h - sp.oy) * f);
    ctx.drawImage(sp.image, x0, y0, x1 - x0, y1 - y0);
  }

  private drawSlice(ctx: CanvasRenderingContext2D, i: number): void {
    const sl = this.slices[i];
    if (!sl) return;
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
      sl.sprites[bi] = sp;
    }
    this.blit(ctx, sp, sl.ax, sl.ay);
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
    ctx.beginPath();
    for (let r = 0; r < sl.runs.length; r += 2) {
      const k0 = sl.runs[r] as number;
      const k1 = sl.runs[r + 1] as number;
      for (let k = k0; k <= k1; k++) {
        trackFrame(s.yaw[k] as number, s.pitch[k] as number, s.bankSin[k] as number, s.bankCos[k] as number, fr);
        const up = (sl.look.lift ?? 0) + 0.05;
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
    ctx.strokeStyle = '#262a31';
    ctx.lineWidth = Math.max(1, 1.8 * k);
    ctx.stroke();
    const period = 4 * k;
    this.dash[0] = period / 2;
    this.dash[1] = period / 2;
    ctx.setLineDash(this.dash);
    ctx.lineDashOffset = -((this.tick % 8) / 8) * period;
    ctx.strokeStyle = '#c8ced6';
    ctx.lineWidth = Math.max(0.8, 1 * k);
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
      const h = d.h1 + 0.3;
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

  private drawPieceGhost(ctx: CanvasRenderingContext2D, world: World, g: TrackPieceGhost, k: number): void {
    const map = world.state.map;
    if (!this.ghostSamples || this.ghostSamples.ghost !== g) this.ghostSamples = { ghost: g, s: pieceWorldSamples(g.piece) };
    const s = this.ghostSamples.s;
    const f = this.frameRef;
    const fr = this.fr;
    for (const t of g.conflictTiles) this.tileOutline(ctx, map.width, t, map.heights[t] as number, GHOST_FILL_INVALID, GHOST_INVALID);
    // Light tints of the safe pair: the rails stay readable over dark terrain and track art.
    const colour = g.ok ? GHOST_LIGHT_VALID : GHOST_LIGHT_INVALID;
    // Two rails and the centre line.
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
