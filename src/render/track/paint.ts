/**
 * Procedural track drawing (phase-2 §4.13, master §2.5: flat colours, chunky shapes). Owner: W2-A; water W3-C;
 * Phase 6 styles W4-D: `inverted` (the rail and its spine run `lift` m above the riders' line and the cars hang
 * below it; `arm` supports stand beside the track and reach over it), `bobsled` (an ice trough), `beam` (a monorail
 * beam the cars straddle), and the cars roll with the track's bank (corkscrews, banked turns).
 * Everything here paints in world pixels (zoom 1) around an anchor; the caller caches the result as a sprite.
 * One painter per rail style: steel, wood (lattice supports), narrow (mini railway), kart (road), tunnel
 * (ghost train). Two rails (gauge per style), cross ties every metre or half metre, and a spine where the style
 * has one. Water styles (flume, rapids; phase-2 §4.14, Phase 4 §4.4) paint a channel: two walls and a water surface,
 * with marks for splashdowns, waterfalls, rough water, whirlpools, and lift conveyors.
 * Deterministic: the same inputs give the same pixels.
 */
import type { PieceSpecial, TrackTypeDef } from '../../data/track';
import { shade } from '../palette';
import { box, poly3, pyramid, type Ctx } from '../sprites/shapes';
import { PX_X, PX_Y, projectX, projectY, trackFrame, type ViewFrame } from './project';

export type RailStyle = TrackTypeDef['render']['rail'];
export type SupportStyle = TrackTypeDef['render']['supports'];
export type CarShape = TrackTypeDef['render']['car'];

/** Shape constants of a rail style (metres unless the name says px). */
export interface RailLook {
  gauge: number;
  railPx: number;
  /** Cross tie spacing (m) and half length (m). */
  tieEvery: number;
  tieHalf: number;
  tiePx: number;
  /** Null: a dark shade of the track colour. */
  tieColour: string | null;
  spine: boolean;
  /** Spine (or tie) distance below the rail line (m); supports end here. */
  drop: number;
  spinePx: number;
  /** Go-kart road surface half width (m), 0 for rails. */
  road: number;
  /** Water channel half width (m), 0 for rails and roads. */
  channel: number;
  /** Channel wall height above the water line (m). */
  wall: number;
  /** Phase 6: the rail line runs this far (m) above the sample line, the riders' line (inverted coasters). */
  lift?: number;
  /** Phase 6: a dry trough (bobsled) with this surface colour instead of water. */
  trough?: string;
  /** Phase 6: half width (m) of a monorail beam under the sample line, and its depth (m). */
  beam?: number;
  beamDepth?: number;
}

export const LOOKS: Readonly<Record<RailStyle, RailLook>> = {
  steel: { gauge: 1.2, railPx: 1.7, tieEvery: 1, tieHalf: 0.72, tiePx: 1.5, tieColour: '#434b57', spine: true, drop: 0.5, spinePx: 3.2, road: 0, channel: 0, wall: 0 },
  wood: { gauge: 1.2, railPx: 1.9, tieEvery: 0.5, tieHalf: 0.95, tiePx: 2.2, tieColour: '#6b4a2b', spine: false, drop: 0.25, spinePx: 0, road: 0, channel: 0, wall: 0 },
  narrow: { gauge: 1.0, railPx: 1.3, tieEvery: 0.5, tieHalf: 0.8, tiePx: 2.4, tieColour: '#7a5634', spine: false, drop: 0.2, spinePx: 0, road: 0, channel: 0, wall: 0 },
  tunnel: { gauge: 1.0, railPx: 1.3, tieEvery: 0.5, tieHalf: 0.8, tiePx: 2.4, tieColour: '#5b4a6e', spine: false, drop: 0.2, spinePx: 0, road: 0, channel: 0, wall: 0 },
  kart: { gauge: 3.2, railPx: 0, tieEvery: 1, tieHalf: 1.6, tiePx: 0, tieColour: null, spine: false, drop: 0.3, spinePx: 0, road: 1.6, channel: 0, wall: 0 },
  // Water channels: the sample line is the water surface; supports end under the channel floor.
  flume: { gauge: 1.2, railPx: 0, tieEvery: 1, tieHalf: 0, tiePx: 0, tieColour: null, spine: false, drop: 0.45, spinePx: 0, road: 0, channel: 0.95, wall: 0.55 },
  rapids: { gauge: 2.0, railPx: 0, tieEvery: 1, tieHalf: 0, tiePx: 0, tieColour: null, spine: false, drop: 0.5, spinePx: 0, road: 0, channel: 1.45, wall: 0.45 },
  // Phase 6 (W4-D): see `lift`, `surface`, and `beam` in PHASE6_LOOK below.
  // Inverted: `drop` is negative, so the spine sits above the rails, and supports reach up to it.
  inverted: { gauge: 1.0, railPx: 1.7, tieEvery: 1, tieHalf: 0.6, tiePx: 1.5, tieColour: '#434b57', spine: true, drop: -0.5, spinePx: 3.8, road: 0, channel: 0, wall: 0, lift: 2.4 },
  bobsled: { gauge: 1.2, railPx: 0, tieEvery: 1, tieHalf: 0, tiePx: 0, tieColour: null, spine: false, drop: 0.45, spinePx: 0, road: 0, channel: 0.85, wall: 0.65, trough: '#eaf5fb' },
  beam: { gauge: 0.9, railPx: 0, tieEvery: 1, tieHalf: 0, tiePx: 0, tieColour: null, spine: false, drop: 1.0, spinePx: 0, road: 0, channel: 0, wall: 0, beam: 0.45, beamDepth: 1.0 },
};

/** Water colours (flat, cool hues: master §2.5). */
export const WATER = { surface: '#3f9fd8', deep: '#2b78b8', light: '#9fd8f5', foam: '#f2fbff' } as const;

/** Junior coasters use the steel style with a narrower gauge and a thinner spine. */
export function lookFor(type: Pick<TrackTypeDef, 'render'>): RailLook {
  const base = LOOKS[type.render.rail];
  if (type.render.car === 'junior') return { ...base, gauge: 1.0, railPx: 1.5, spinePx: 2.4, drop: 0.4 };
  return base;
}

export interface TrackColours {
  track: string;
  supports: string;
  cars: string;
}

/** World samples of a piece (the track API's `pieceWorldSamples`). */
export interface WorldSamples {
  n: number;
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  yaw: Float64Array;
  pitch: Float64Array;
  bankSin: Float64Array;
  bankCos: Float64Array;
}

/** Projects world metres to sprite pixels around an anchor. */
export class Projector {
  constructor(
    readonly f: ViewFrame,
    readonly ax: number,
    readonly ay: number,
  ) {}

  x(wx: number, wy: number): number {
    return projectX(wx, wy, this.f) - this.ax;
  }

  y(wx: number, wy: number, wz: number): number {
    return projectY(wx, wy, wz, this.f) - this.ay;
  }

  /** View-space components of a map-space horizontal vector (for facing tests). */
  vx(dx: number, dy: number): number {
    switch (this.f.rot) {
      case 1:
        return -dy;
      case 2:
        return -dx;
      case 3:
        return dy;
      default:
        return dx;
    }
  }

  vy(dx: number, dy: number): number {
    switch (this.f.rot) {
      case 1:
        return dx;
      case 2:
        return -dy;
      case 3:
        return -dx;
      default:
        return dy;
    }
  }
}

const SAMPLE_M = 0.25;
const fr = new Float64Array(9);

function polyline(ctx: Ctx, xs: readonly number[], ys: readonly number[], colour: string, width: number): void {
  if (xs.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(xs[0] as number, ys[0] as number);
  for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i] as number, ys[i] as number);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function quad(ctx: Ctx, pts: readonly number[], fill: string, stroke?: string, width = 1): void {
  ctx.beginPath();
  ctx.moveTo(pts[0] as number, pts[1] as number);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] as number, pts[i + 1] as number);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

/** Brightness of a face with view-space normal (nx, ny, nz): light from above and the screen left. */
export function faceLight(nx: number, ny: number, nz: number): number {
  return Math.min(1.05, 0.55 + 0.45 * Math.max(0, nz) + 0.3 * Math.max(0, ny) + 0.15 * Math.max(0, nx));
}

/**
 * A box with axes f (length ±a), r (width ±b), u (height h0..h1) around centre c, all in map space (m).
 * Only faces turned toward the viewer (view direction (1, 1, 1)) are drawn, so the convex box needs no sorting.
 * Returns a bit mask of the drawn faces: 1 +f, 2 −f, 4 +r, 8 −r, 16 +u, 32 −u.
 */
export function paintBox(
  ctx: Ctx,
  P: Projector,
  c: readonly [number, number, number],
  f: ArrayLike<number>,
  r: ArrayLike<number>,
  u: ArrayLike<number>,
  a: number,
  b: number,
  h0: number,
  h1: number,
  colour: string,
  outline: string | null = null,
): number {
  const px: number[] = [];
  const py: number[] = [];
  // Corner k: bit 0 = +f, bit 1 = +r, bit 2 = top.
  for (let k = 0; k < 8; k++) {
    const sa = k & 1 ? a : -a;
    const sb = k & 2 ? b : -b;
    const sh = k & 4 ? h1 : h0;
    const wx = c[0] + (f[0] as number) * sa + (r[0] as number) * sb + (u[0] as number) * sh;
    const wy = c[1] + (f[1] as number) * sa + (r[1] as number) * sb + (u[1] as number) * sh;
    const wz = c[2] + (f[2] as number) * sa + (r[2] as number) * sb + (u[2] as number) * sh;
    px.push(P.x(wx, wy));
    py.push(P.y(wx, wy, wz));
  }
  const faces: Array<[number, number, number, number, ArrayLike<number>, number, number]> = [
    [1, 3, 7, 5, f, 1, 1],
    [0, 2, 6, 4, f, -1, 2],
    [2, 3, 7, 6, r, 1, 4],
    [0, 1, 5, 4, r, -1, 8],
    [4, 5, 7, 6, u, 1, 16],
    [0, 1, 3, 2, u, -1, 32],
  ];
  let mask = 0;
  for (const [i0, i1, i2, i3, n, sgn, bit] of faces) {
    const nx = P.vx(n[0] as number, n[1] as number) * sgn;
    const ny = P.vy(n[0] as number, n[1] as number) * sgn;
    const nz = (n[2] as number) * sgn;
    if (nx + ny + nz <= 1e-6) continue;
    mask |= bit;
    quad(ctx, [px[i0]!, py[i0]!, px[i1]!, py[i1]!, px[i2]!, py[i2]!, px[i3]!, py[i3]!], shade(colour, faceLight(nx, ny, nz)), outline ?? undefined, 0.6);
  }
  return mask;
}

export interface RunOptions {
  special: PieceSpecial;
  /** Draw the static chain base (the animated dashes are an overlay). */
  chain: boolean;
  /** Water lift conveyor: belt cleats across the channel. */
  conveyor?: boolean;
}

/**
 * Paint samples k0..k1 of one piece: deck or road, ties, spine, rails, brake fins, and the spooky tunnel box.
 */
export function paintRun(ctx: Ctx, P: Projector, look: RailLook, col: TrackColours, s: WorldSamples, k0: number, k1: number, opt: RunOptions): void {
  const m = k1 - k0 + 1;
  if (m < 2) return;
  if (look.channel > 0) {
    paintChannel(ctx, P, look, col, s, k0, k1, opt);
    return;
  }
  if (look.beam) {
    paintBeam(ctx, P, look, col, s, k0, k1, opt);
    return;
  }
  const lift = look.lift ?? 0;
  const half = look.gauge / 2;
  const lx: number[] = [];
  const ly: number[] = [];
  const rx: number[] = [];
  const ry: number[] = [];
  const cx: number[] = [];
  const cy: number[] = [];
  const sx: number[] = [];
  const sy: number[] = [];
  let nearRight = 0;
  for (let k = k0; k <= k1; k++) {
    trackFrame(s.yaw[k] as number, s.pitch[k] as number, s.bankSin[k] as number, s.bankCos[k] as number, fr);
    // The rail line: the sample line, or `lift` above it along the track's up (inverted coasters).
    const wx = (s.x[k] as number) + (fr[6] as number) * lift;
    const wy = (s.y[k] as number) + (fr[7] as number) * lift;
    const wz = (s.z[k] as number) + (fr[8] as number) * lift;
    const rX = fr[3] as number;
    const rY = fr[4] as number;
    const rZ = fr[5] as number;
    lx.push(P.x(wx - rX * half, wy - rY * half));
    ly.push(P.y(wx - rX * half, wy - rY * half, wz - rZ * half));
    rx.push(P.x(wx + rX * half, wy + rY * half));
    ry.push(P.y(wx + rX * half, wy + rY * half, wz + rZ * half));
    cx.push(P.x(wx, wy));
    cy.push(P.y(wx, wy, wz));
    const d = look.drop;
    sx.push(P.x(wx - (fr[6] as number) * d, wy - (fr[7] as number) * d));
    sy.push(P.y(wx - (fr[6] as number) * d, wy - (fr[7] as number) * d, wz - (fr[8] as number) * d));
    nearRight += P.vx(rX, rY) + P.vy(rX, rY) + rZ;
  }
  const track = col.track;

  if (opt.special === 'station') paintPlatform(ctx, P, s, k0, k1, nearRight > 0);
  if (look.road > 0) paintRoad(ctx, P, look, col, s, k0, k1);

  // Cross ties.
  if (look.tiePx > 0) {
    const every = Math.max(1, Math.round(look.tieEvery / SAMPLE_M));
    const tie = look.tieColour ?? shade(track, 0.45);
    for (let k = k0; k <= k1; k++) {
      if (k % every !== 0) continue;
      trackFrame(s.yaw[k] as number, s.pitch[k] as number, s.bankSin[k] as number, s.bankCos[k] as number, fr);
      const tieUp = lift > 0 ? lift + 0.08 : -0.08;
      const wx = (s.x[k] as number) + (fr[6] as number) * tieUp;
      const wy = (s.y[k] as number) + (fr[7] as number) * tieUp;
      const wz = (s.z[k] as number) + (fr[8] as number) * tieUp;
      const th = look.tieHalf;
      ctx.beginPath();
      ctx.moveTo(P.x(wx - (fr[3] as number) * th, wy - (fr[4] as number) * th), P.y(wx - (fr[3] as number) * th, wy - (fr[4] as number) * th, wz - (fr[5] as number) * th));
      ctx.lineTo(P.x(wx + (fr[3] as number) * th, wy + (fr[4] as number) * th), P.y(wx + (fr[3] as number) * th, wy + (fr[4] as number) * th, wz + (fr[5] as number) * th));
      ctx.strokeStyle = tie;
      ctx.lineWidth = look.tiePx;
      ctx.lineCap = 'butt';
      ctx.stroke();
    }
  }

  const spine = (): void => {
    if (!look.spine) return;
    polyline(ctx, sx, sy, shade(track, 0.6), look.spinePx);
    polyline(ctx, sx, sy, shade(track, 0.85), Math.max(0.8, look.spinePx * 0.35));
  };
  // The spine is under the rails, or over them on an inverted track (then drawn last: it is nearer the eye).
  if (lift === 0) spine();
  if (look.railPx > 0) {
    const far = nearRight > 0 ? [lx, ly] : [rx, ry];
    const near = nearRight > 0 ? [rx, ry] : [lx, ly];
    polyline(ctx, far[0] as number[], far[1] as number[], shade(track, 0.78), look.railPx);
    polyline(ctx, near[0] as number[], near[1] as number[], track, look.railPx);
  }
  if (lift > 0) spine();
  if (opt.chain) polyline(ctx, cx, cy, '#2b2f36', 1.6);
  if (opt.special === 'brakes' || opt.special === 'blockBrake') paintBrakeFins(ctx, P, s, k0, k1, opt.special === 'blockBrake');
  if (opt.special === 'spooky') paintTunnel(ctx, P, s, k0, k1);
}

/** Every other number of a flat point list (`offset` 0: the x values, 1: the y values). */
function every2(a: readonly number[], offset: 0 | 1): number[] {
  const out: number[] = [];
  for (let i = offset; i < a.length; i += 2) out.push(a[i] as number);
  return out;
}

/** The band between two point lists of equal length (flat x, y pairs), filled. */
function band(ctx: Ctx, a: readonly number[], b: readonly number[], fill: string): void {
  const poly: number[] = [...a];
  for (let i = b.length - 2; i >= 0; i -= 2) poly.push(b[i] as number, b[i + 1] as number);
  quad(ctx, poly, fill);
}

/**
 * Water channel (phase-2 §4.14 `medium: 'water'`): the far wall's inner face, the water surface, then the near wall's
 * outer face and both wall tops. The sample line is the water surface. Marks: platform (station), conveyor cleats
 * (lifts), foam chevrons (splashdown, waterfall, rough water), and a swirl (whirlpool, in the slice holding its middle).
 */
function paintChannel(ctx: Ctx, P: Projector, look: RailLook, col: TrackColours, s: WorldSamples, k0: number, k1: number, opt: RunOptions): void {
  const w = look.channel;
  const floor = 0.35;
  const L: number[] = [];
  const R: number[] = [];
  const LT: number[] = [];
  const RT: number[] = [];
  const LB: number[] = [];
  const RB: number[] = [];
  let nearRight = 0;
  const push = (out: number[], wx: number, wy: number, wz: number, side: number, up: number): void => {
    const x = wx + (fr[3] as number) * side + (fr[6] as number) * up;
    const y = wy + (fr[4] as number) * side + (fr[7] as number) * up;
    out.push(P.x(x, y), P.y(x, y, wz + (fr[5] as number) * side + (fr[8] as number) * up));
  };
  for (let k = k0; k <= k1; k++) {
    trackFrame(s.yaw[k] as number, s.pitch[k] as number, s.bankSin[k] as number, s.bankCos[k] as number, fr);
    const wx = s.x[k] as number;
    const wy = s.y[k] as number;
    const wz = s.z[k] as number;
    push(L, wx, wy, wz, -(w - 0.08), 0);
    push(R, wx, wy, wz, w - 0.08, 0);
    push(LT, wx, wy, wz, -w, look.wall);
    push(RT, wx, wy, wz, w, look.wall);
    push(LB, wx, wy, wz, -w, -floor);
    push(RB, wx, wy, wz, w, -floor);
    nearRight += P.vx(fr[3] as number, fr[4] as number) + P.vy(fr[3] as number, fr[4] as number) + (fr[5] as number);
  }
  const rightNear = nearRight > 0;
  if (opt.special === 'station') paintPlatform(ctx, P, s, k0, k1, rightNear, w + 0.15);
  const farTop = rightNear ? LT : RT;
  const nearTop = rightNear ? RT : LT;
  band(ctx, farTop, rightNear ? LB : RB, shade(col.track, 0.62));
  const surface = look.trough ?? (opt.special === 'whirlpool' ? WATER.deep : opt.special === 'splashdown' || opt.special === 'waterfall' ? WATER.light : WATER.surface);
  band(ctx, L, R, surface);
  if (opt.conveyor) {
    // Belt cleats across the channel every half metre (by absolute sample index, so neighbouring slices line up).
    for (let k = k0; k <= k1; k++) {
      if (k % 2 !== 0) continue;
      const i = (k - k0) * 2;
      polyline(ctx, [L[i] as number, R[i] as number], [L[i + 1] as number, R[i + 1] as number], '#2b3440', 1.1);
    }
  }
  if (opt.special === 'splashdown' || opt.special === 'waterfall' || opt.special === 'rough') {
    const step = opt.special === 'rough' ? 3 : 2;
    for (let k = k0; k < k1; k++) {
      if (k % step !== 0) continue;
      const i = (k - k0) * 2;
      const lx = L[i] as number;
      const ly = L[i + 1] as number;
      const rx = R[i] as number;
      const ry = R[i + 1] as number;
      const mx = (lx + rx) / 2;
      const my = (ly + ry) / 2;
      // A foam chevron pointing downstream.
      const dx = ((L[i + 2] as number) - lx) * 0.6;
      const dy = ((L[i + 3] as number) - ly) * 0.6;
      polyline(ctx, [lx * 0.7 + mx * 0.3, mx + dx, rx * 0.7 + mx * 0.3], [ly * 0.7 + my * 0.3, my + dy, ry * 0.7 + my * 0.3], WATER.foam, opt.special === 'rough' ? 1.2 : 1.6);
    }
  }
  if (opt.special === 'whirlpool') {
    const mid = Math.floor((s.n - 1) / 2);
    if (mid >= k0 && mid <= k1) {
      const x = P.x(s.x[mid] as number, s.y[mid] as number);
      const y = P.y(s.x[mid] as number, s.y[mid] as number, s.z[mid] as number);
      for (const r of [0.35, 0.65, 0.9]) {
        ctx.beginPath();
        ctx.ellipse(x, y, r * w * PX_X, r * w * PX_Y, 0, 0.3, Math.PI * 1.6);
        ctx.strokeStyle = WATER.light;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    }
  }
  band(ctx, nearTop, rightNear ? RB : LB, col.track);
  polyline(ctx, every2(farTop, 0), every2(farTop, 1), shade(col.track, 0.85), 1.2);
  polyline(ctx, every2(nearTop, 0), every2(nearTop, 1), shade(col.track, 1.15), 1.4);
}

/**
 * Monorail beam (Phase 6): a concrete box beam under the sample line, which is the beam's top: the top face, the near
 * side face, and a light edge line. Stations add the platform.
 */
function paintBeam(ctx: Ctx, P: Projector, look: RailLook, col: TrackColours, s: WorldSamples, k0: number, k1: number, opt: RunOptions): void {
  const w = look.beam ?? 0.45;
  const depth = look.beamDepth ?? 1;
  const L: number[] = [];
  const R: number[] = [];
  const LB: number[] = [];
  const RB: number[] = [];
  let nearRight = 0;
  const push = (out: number[], wx: number, wy: number, wz: number, side: number, up: number): void => {
    const x = wx + (fr[3] as number) * side + (fr[6] as number) * up;
    const y = wy + (fr[4] as number) * side + (fr[7] as number) * up;
    out.push(P.x(x, y), P.y(x, y, wz + (fr[5] as number) * side + (fr[8] as number) * up));
  };
  for (let k = k0; k <= k1; k++) {
    trackFrame(s.yaw[k] as number, s.pitch[k] as number, s.bankSin[k] as number, s.bankCos[k] as number, fr);
    const wx = s.x[k] as number;
    const wy = s.y[k] as number;
    const wz = s.z[k] as number;
    push(L, wx, wy, wz, -w, 0);
    push(R, wx, wy, wz, w, 0);
    push(LB, wx, wy, wz, -w, -depth);
    push(RB, wx, wy, wz, w, -depth);
    nearRight += P.vx(fr[3] as number, fr[4] as number) + P.vy(fr[3] as number, fr[4] as number) + (fr[5] as number);
  }
  const rightNear = nearRight > 0;
  if (opt.special === 'station') paintPlatform(ctx, P, s, k0, k1, rightNear, w + 0.6);
  const beam = '#c9ccd2';
  band(ctx, rightNear ? R : L, rightNear ? RB : LB, shade(beam, 0.78));
  band(ctx, L, R, beam);
  // A stripe in the ride's colour along the near top edge.
  const edge = rightNear ? R : L;
  polyline(ctx, every2(edge, 0), every2(edge, 1), col.track, 1.6);
}

/** Station platform: a deck on both sides of the rails (or channel) from `from` m out, with a yellow safety edge. */
function paintPlatform(ctx: Ctx, P: Projector, s: WorldSamples, k0: number, k1: number, rightNear: boolean, from = 0.85): void {
  const deck = 0.3;
  const width = 1.1;
  const sides = rightNear ? [-1, 1] : [1, -1];
  for (const side of sides) {
    const inner: number[] = [];
    const outer: number[] = [];
    const base: number[] = [];
    for (let k = k0; k <= k1; k++) {
      trackFrame(s.yaw[k] as number, 0, 0, 1, fr);
      const wx = s.x[k] as number;
      const wy = s.y[k] as number;
      const wz = (s.z[k] as number) + deck;
      const ix = wx + (fr[3] as number) * from * side;
      const iy = wy + (fr[4] as number) * from * side;
      const ox = wx + (fr[3] as number) * (from + width) * side;
      const oy = wy + (fr[4] as number) * (from + width) * side;
      inner.push(P.x(ix, iy), P.y(ix, iy, wz));
      outer.push(P.x(ox, oy), P.y(ox, oy, wz));
      base.push(P.x(ox, oy), P.y(ox, oy, wz - deck));
    }
    // Front face of the deck (visible on the near side only).
    const nearSide = side === (rightNear ? 1 : -1);
    if (nearSide) {
      const face: number[] = [...outer];
      for (let i = base.length - 2; i >= 0; i -= 2) face.push(base[i] as number, base[i + 1] as number);
      quad(ctx, face, '#a2946f');
    }
    const top: number[] = [...inner];
    for (let i = outer.length - 2; i >= 0; i -= 2) top.push(outer[i] as number, outer[i + 1] as number);
    quad(ctx, top, '#ddd0b2', '#b8a988', 0.6);
    const ex: number[] = [];
    const ey: number[] = [];
    for (let i = 0; i < inner.length; i += 2) {
      ex.push(inner[i] as number);
      ey.push(inner[i + 1] as number);
    }
    polyline(ctx, ex, ey, '#f2c230', 1.4);
  }
}

/** Go-kart road: asphalt between the edges, kerbs in the track colour and white every metre. */
function paintRoad(ctx: Ctx, P: Projector, look: RailLook, col: TrackColours, s: WorldSamples, k0: number, k1: number): void {
  const left: number[] = [];
  const right: number[] = [];
  for (let k = k0; k <= k1; k++) {
    trackFrame(s.yaw[k] as number, s.pitch[k] as number, s.bankSin[k] as number, s.bankCos[k] as number, fr);
    const wx = s.x[k] as number;
    const wy = s.y[k] as number;
    const wz = (s.z[k] as number) + 0.05;
    const h = look.road;
    left.push(P.x(wx - (fr[3] as number) * h, wy - (fr[4] as number) * h), P.y(wx - (fr[3] as number) * h, wy - (fr[4] as number) * h, wz));
    right.push(P.x(wx + (fr[3] as number) * h, wy + (fr[4] as number) * h), P.y(wx + (fr[3] as number) * h, wy + (fr[4] as number) * h, wz));
  }
  const poly: number[] = [...left];
  for (let i = right.length - 2; i >= 0; i -= 2) poly.push(right[i] as number, right[i + 1] as number);
  quad(ctx, poly, '#4a505a');
  // Kerbs: alternate every metre (4 samples) by absolute sample index, so neighbouring slices line up.
  for (const edge of [left, right]) {
    for (let i = 0; i + 2 < edge.length; i += 2) {
      const k = k0 + i / 2;
      const c = Math.floor(k / 4) % 2 === 0 ? col.track : '#f4f4f4';
      ctx.beginPath();
      ctx.moveTo(edge[i] as number, edge[i + 1] as number);
      ctx.lineTo(edge[i + 2] as number, edge[i + 3] as number);
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'butt';
      ctx.stroke();
    }
  }
  // Dashed centre line.
  for (let k = k0; k < k1; k++) {
    if (Math.floor(k / 3) % 2 !== 0) continue;
    const x0 = P.x(s.x[k] as number, s.y[k] as number);
    const y0 = P.y(s.x[k] as number, s.y[k] as number, (s.z[k] as number) + 0.06);
    const x1 = P.x(s.x[k + 1] as number, s.y[k + 1] as number);
    const y1 = P.y(s.x[k + 1] as number, s.y[k + 1] as number, (s.z[k + 1] as number) + 0.06);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
}

/** Brake fins between the rails (orange); block brakes alternate yellow and black and add a signal post. */
function paintBrakeFins(ctx: Ctx, P: Projector, s: WorldSamples, k0: number, k1: number, block: boolean): void {
  for (let k = k0; k < k1; k += 2) {
    const k2 = Math.min(k + 1, k1);
    const c = block ? (Math.floor(k / 2) % 2 === 0 ? '#f2c230' : '#2b2f36') : '#f08a24';
    ctx.beginPath();
    ctx.moveTo(P.x(s.x[k] as number, s.y[k] as number), P.y(s.x[k] as number, s.y[k] as number, (s.z[k] as number) + 0.12));
    ctx.lineTo(P.x(s.x[k2] as number, s.y[k2] as number), P.y(s.x[k2] as number, s.y[k2] as number, (s.z[k2] as number) + 0.12));
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'butt';
    ctx.stroke();
  }
  if (block) {
    const k = Math.floor((k0 + k1) / 2);
    trackFrame(s.yaw[k] as number, 0, 0, 1, fr);
    const wx = (s.x[k] as number) + (fr[3] as number) * 1.3;
    const wy = (s.y[k] as number) + (fr[4] as number) * 1.3;
    const wz = s.z[k] as number;
    const x = P.x(wx, wy);
    ctx.beginPath();
    ctx.moveTo(x, P.y(wx, wy, wz - 0.3));
    ctx.lineTo(x, P.y(wx, wy, wz + 2.4));
    ctx.strokeStyle = '#30353d';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, P.y(wx, wy, wz + 2.6), 1.6, 0, Math.PI * 2);
    ctx.fillStyle = '#46d160';
    ctx.fill();
  }
}

/** Spooky tunnel (§4.2): a closed box 4 m high over the rail, with a friendly ghost face on its end walls. */
function paintTunnel(ctx: Ctx, P: Projector, s: WorldSamples, k0: number, k1: number): void {
  const n = s.n;
  const mid = Math.floor((n - 1) / 2);
  // Only the slice holding the middle of the piece draws the box.
  if (mid < k0 || mid > k1) return;
  trackFrame(s.yaw[mid] as number, 0, 0, 1, fr);
  const f = [fr[0] as number, fr[1] as number, 0];
  const r = [fr[3] as number, fr[4] as number, 0];
  const u = [0, 0, 1];
  const c: [number, number, number] = [s.x[mid] as number, s.y[mid] as number, s.z[mid] as number];
  const mask = paintBox(ctx, P, c, f, r, u, 1.95, 1.9, -0.2, 4, '#4a3a73', '#2d2347');
  // Ghost faces on the visible end walls.
  for (const sgn of [1, -1]) {
    if (!(mask & (sgn > 0 ? 1 : 2))) continue;
    const fx = c[0] + f[0]! * 1.96 * sgn;
    const fy = c[1] + f[1]! * 1.96 * sgn;
    // Dark doorway where the rail goes in.
    const dw = 1.1;
    const door = [
      P.x(fx - r[0]! * dw, fy - r[1]! * dw), P.y(fx - r[0]! * dw, fy - r[1]! * dw, c[2]),
      P.x(fx + r[0]! * dw, fy + r[1]! * dw), P.y(fx + r[0]! * dw, fy + r[1]! * dw, c[2]),
      P.x(fx + r[0]! * dw, fy + r[1]! * dw), P.y(fx + r[0]! * dw, fy + r[1]! * dw, c[2] + 2.2),
      P.x(fx - r[0]! * dw, fy - r[1]! * dw), P.y(fx - r[0]! * dw, fy - r[1]! * dw, c[2] + 2.2),
    ];
    quad(ctx, door, '#160f24');
    for (const e of [-0.6, 0.6]) {
      ctx.beginPath();
      ctx.ellipse(P.x(fx + r[0]! * e, fy + r[1]! * e), P.y(fx + r[0]! * e, fy + r[1]! * e, c[2] + 3.1), 1.6, 2.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#e8f6ff';
      ctx.fill();
    }
  }
}

/** A support (§4.13) from the ground up to `top` (absolute m) at (wx, wy); `yaw` orients lattice frames. */
export function paintSupport(ctx: Ctx, P: Projector, style: SupportStyle, colour: string, wx: number, wy: number, yaw: number, ground: number, top: number): void {
  if (top <= ground) return;
  const x = P.x(wx, wy);
  const yb = P.y(wx, wy, ground);
  const yt = P.y(wx, wy, top);
  if (style === 'arm') {
    // Hanging cars (Phase 6 inverted): (wx, wy, top) is the top of the spine. A post 1.3 m beside the track on the
    // far side rises past it; a braced arm reaches over and down onto the spine.
    let rX = -Math.sin(yaw);
    let rY = Math.cos(yaw);
    if (P.vx(rX, rY) + P.vy(rX, rY) > 0) {
      rX = -rX;
      rY = -rY;
    }
    const px = wx + rX * 1.3;
    const py = wy + rY * 1.3;
    const armZ = top + 0.45;
    const w = 0.55 * PX_X;
    const sx0 = P.x(px, py);
    const yg = P.y(px, py, ground);
    const ya = P.y(px, py, armZ);
    ctx.beginPath();
    ctx.ellipse(sx0, yg, w * 0.9, w * 0.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#8b939d';
    ctx.fill();
    ctx.fillStyle = shade(colour, 1.05);
    ctx.fillRect(sx0 - w / 2, ya, w / 2, yg - ya);
    ctx.fillStyle = shade(colour, 0.72);
    ctx.fillRect(sx0, ya, w / 2, yg - ya);
    const mx = P.x(wx + rX * 0.55, wy + rY * 0.55);
    ctx.beginPath();
    ctx.moveTo(sx0, ya);
    ctx.lineTo(x, P.y(wx, wy, armZ));
    ctx.lineTo(x, yt);
    ctx.moveTo(sx0, P.y(px, py, armZ - 1.1));
    ctx.lineTo(mx, P.y(wx + rX * 0.55, wy + rY * 0.55, armZ));
    ctx.strokeStyle = shade(colour, 0.8);
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    return;
  }
  if (style === 'lattice') {
    const rX = -Math.sin(yaw);
    const rY = Math.cos(yaw);
    const legs: Array<[number, number]> = [];
    for (const sgn of [-1, 1]) {
      const lx = wx + rX * 0.75 * sgn;
      const ly = wy + rY * 0.75 * sgn;
      legs.push([lx, ly]);
    }
    const [a, b] = legs as [[number, number], [number, number]];
    const dark = shade(colour, 0.7);
    // Cross braces every 2 m, then the legs over them.
    for (let h = ground; h < top - 0.5; h += 2) {
      const h2 = Math.min(top, h + 2);
      ctx.beginPath();
      ctx.moveTo(P.x(a[0], a[1]), P.y(a[0], a[1], h));
      ctx.lineTo(P.x(b[0], b[1]), P.y(b[0], b[1], h2));
      ctx.moveTo(P.x(b[0], b[1]), P.y(b[0], b[1], h));
      ctx.lineTo(P.x(a[0], a[1]), P.y(a[0], a[1], h2));
      ctx.moveTo(P.x(a[0], a[1]), P.y(a[0], a[1], h2));
      ctx.lineTo(P.x(b[0], b[1]), P.y(b[0], b[1], h2));
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1;
      ctx.lineCap = 'butt';
      ctx.stroke();
    }
    for (const [lx, ly] of legs) {
      ctx.beginPath();
      ctx.moveTo(P.x(lx, ly), P.y(lx, ly, ground));
      ctx.lineTo(P.x(lx, ly), P.y(lx, ly, top));
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    return;
  }
  if (style === 'pillar') {
    const w = 0.9 * PX_X;
    ctx.fillStyle = '#9aa3ad';
    ctx.fillRect(x - w / 2, yt, w / 2, yb - yt);
    ctx.fillStyle = '#7d8691';
    ctx.fillRect(x, yt, w / 2, yb - yt);
    ctx.beginPath();
    ctx.ellipse(x, yt, w / 2 + 0.6, (w / 2 + 0.6) * (PX_Y / PX_X), 0, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
    return;
  }
  // Round steel post: a lit left half, a shaded right half, a footing and a cap.
  const w = 0.55 * PX_X;
  ctx.beginPath();
  ctx.ellipse(x, yb, w * 0.9, w * 0.45, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#8b939d';
  ctx.fill();
  ctx.fillStyle = shade(colour, 1.05);
  ctx.fillRect(x - w / 2, yt, w / 2, yb - yt);
  ctx.fillStyle = shade(colour, 0.72);
  ctx.fillRect(x, yt, w / 2, yb - yt);
  ctx.beginPath();
  ctx.ellipse(x, yt, w / 2, w / 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = shade(colour, 0.9);
  ctx.fill();
}

// ---------------------------------------------------------------- cars

interface CarDims {
  a: number;
  b: number;
  h0: number;
  h1: number;
}

export function carDims(shape: CarShape, front: boolean): CarDims {
  switch (shape) {
    case 'junior':
      return { a: 0.85, b: 0.62, h0: 0.12, h1: 0.72 };
    case 'loco':
      return front ? { a: 1.3, b: 0.72, h0: 0.15, h1: 1.7 } : { a: 1.3, b: 0.78, h0: 0.15, h1: 0.8 };
    case 'mouse':
      return { a: 0.85, b: 0.85, h0: 0.15, h1: 0.9 };
    case 'ghost':
      return { a: 0.85, b: 0.72, h0: 0.12, h1: 0.62 };
    case 'kart':
      return { a: 0.8, b: 0.55, h0: 0.08, h1: 0.42 };
    case 'log':
      return { a: 1.5, b: 0.6, h0: -0.25, h1: 0.45 };
    case 'raft':
      return { a: 1.25, b: 1.25, h0: -0.15, h1: 0.4 };
    // Phase 6: a hanging chair row under the rail, a low sled, a long monorail car astride its beam.
    case 'inverted':
      return { a: 0.55, b: 0.8, h0: 0.0, h1: 0.8 };
    case 'bobsled':
      return { a: 1.0, b: 0.55, h0: -0.2, h1: 0.45 };
    case 'monorail':
      return { a: 1.42, b: 0.75, h0: -0.45, h1: 1.45 };
    default:
      return { a: 1.05, b: 0.78, h0: 0.15, h1: 0.85 };
  }
}

const IDENTITY: ViewFrame = { rot: 0, wm: 0, hm: 0 };
const carP = new Projector(IDENTITY, 0, 0);
const cf = new Float64Array(9);

/** Hanging cars (Phase 6 inverted): the rail runs this far above the riders' line (the `inverted` look's lift). */
export const HANG_M = 2.4;

/**
 * A car around its rail point (0, 0, 0) in view space: `yaw` is the view-space heading, `pitch` the climb, and
 * (`bankSin`, `bankCos`) the roll (Phase 6: cars roll with banked turns and corkscrews).
 * Cars are cached by yaw step, pitch step, roll step, zoom bucket, and colour (§4.13).
 */
export function paintCar(ctx: Ctx, shape: CarShape, yaw: number, pitch: number, colour: string, front: boolean, bankSin = 0, bankCos = 1): void {
  trackFrame(yaw, pitch, bankSin, bankCos, cf);
  const f = [cf[0] as number, cf[1] as number, cf[2] as number];
  const r = [cf[3] as number, cf[4] as number, cf[5] as number];
  const u = [cf[6] as number, cf[7] as number, cf[8] as number];
  const d = carDims(shape, front);
  const c: [number, number, number] = [0, 0, 0];
  if (shape === 'log' || shape === 'raft') {
    paintBoat(ctx, shape, f, r, u, d, colour);
    return;
  }
  if (shape === 'inverted' || shape === 'bobsled' || shape === 'monorail') {
    paintPhase6Car(ctx, shape, f, r, u, d, colour, front);
    return;
  }
  // Bogie under the body.
  paintBox(ctx, carP, c, f, r, u, d.a * 0.7, d.b * 0.55, -0.15, d.h0, '#30353d');
  if (shape === 'loco' && front) {
    paintBox(ctx, carP, c, f, r, u, d.a, d.b, d.h0, 0.95, colour, shade(colour, 0.5));
    // Cab at the back, boiler and chimney at the front.
    const cab: [number, number, number] = [-f[0]! * 0.7, -f[1]! * 0.7, -f[2]! * 0.7];
    paintBox(ctx, carP, cab, f, r, u, 0.55, d.b, 0.95, d.h1, shade(colour, 0.85), shade(colour, 0.5));
    const ch: [number, number, number] = [f[0]! * 0.8, f[1]! * 0.8, f[2]! * 0.8];
    paintBox(ctx, carP, ch, f, r, u, 0.18, 0.18, 0.95, 1.6, '#30353d');
    return;
  }
  paintBox(ctx, carP, c, f, r, u, d.a, d.b, d.h0, d.h1, colour, shade(colour, 0.55));
  // Seat well on the top.
  const topWell: [number, number, number] = [u[0]! * (d.h1 + 0.01), u[1]! * (d.h1 + 0.01), u[2]! * (d.h1 + 0.01)];
  if (shape !== 'kart') paintBox(ctx, carP, topWell, f, r, u, d.a * 0.72, d.b * 0.72, 0, 0.001, '#2b2f36');
  if (shape === 'ghost') {
    const back: [number, number, number] = [-f[0]! * (d.a - 0.12), -f[1]! * (d.a - 0.12), -f[2]! * (d.a - 0.12)];
    paintBox(ctx, carP, back, f, r, u, 0.12, d.b, d.h1, 1.5, shade(colour, 0.8), shade(colour, 0.5));
  }
  if (shape === 'mouse') {
    for (const side of [-1, 1]) {
      const ear: [number, number, number] = [
        -f[0]! * 0.55 + r[0]! * 0.5 * side + u[0]! * (d.h1 + 0.35),
        -f[1]! * 0.55 + r[1]! * 0.5 * side + u[1]! * (d.h1 + 0.35),
        -f[2]! * 0.55 + r[2]! * 0.5 * side + u[2]! * (d.h1 + 0.35),
      ];
      ctx.beginPath();
      ctx.arc(carP.x(ear[0], ear[1]), carP.y(ear[0], ear[1], ear[2]), 2.6, 0, Math.PI * 2);
      ctx.fillStyle = shade(colour, 0.85);
      ctx.fill();
    }
  }
  if (front && (shape === 'coaster' || shape === 'junior')) {
    // A nose stripe on the front car.
    const nose: [number, number, number] = [f[0]! * d.a, f[1]! * d.a, f[2]! * d.a];
    paintBox(ctx, carP, nose, f, r, u, 0.05, d.b, d.h0, d.h1 * 0.7, '#f4f4f4');
  }
}

/**
 * Boats float in the channel (the sample line is the water surface): a hollow log with bark rings and a carved prow,
 * or a round raft with a dark well and yellow rim handles. Riders sit in the well.
 */
function paintBoat(ctx: Ctx, shape: 'log' | 'raft', f: number[], r: number[], u: number[], d: CarDims, colour: string): void {
  const c: [number, number, number] = [0, 0, 0];
  const top = d.h1 + 0.01;
  const well: [number, number, number] = [u[0]! * top, u[1]! * top, u[2]! * top];
  paintBox(ctx, carP, c, f, r, u, d.a, d.b, d.h0, d.h1, colour, shade(colour, 0.5));
  if (shape === 'log') {
    paintBox(ctx, carP, well, f, r, u, d.a * 0.78, d.b * 0.62, 0, 0.001, shade(colour, 0.45));
    for (const sgn of [1, -1]) {
      const e = d.a * 0.92 * sgn;
      paintBox(ctx, carP, [f[0]! * e, f[1]! * e, f[2]! * e], f, r, u, 0.06, d.b * 1.02, d.h0, d.h1 + 0.02, shade(colour, 0.7));
    }
    const p = d.a - 0.2;
    paintBox(ctx, carP, [f[0]! * p, f[1]! * p, f[2]! * p], f, r, u, 0.2, d.b * 0.5, d.h1, d.h1 + 0.35, shade(colour, 1.1), shade(colour, 0.5));
    return;
  }
  paintBox(ctx, carP, well, f, r, u, d.a * 0.72, d.b * 0.72, 0, 0.001, '#2b2f36');
  for (const [ea, eb] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const h: [number, number, number] = [
      f[0]! * d.a * ea + r[0]! * d.b * eb + u[0]! * d.h1,
      f[1]! * d.a * ea + r[1]! * d.b * eb + u[1]! * d.h1,
      f[2]! * d.a * ea + r[2]! * d.b * eb + u[2]! * d.h1,
    ];
    paintBox(ctx, carP, h, f, r, u, 0.12, 0.12, 0, 0.12, '#f2c230');
  }
}

const at3 = (f: number[], r: number[], u: number[], a: number, b: number, h: number): [number, number, number] => [
  f[0]! * a + r[0]! * b + u[0]! * h,
  f[1]! * a + r[1]! * b + u[1]! * h,
  f[2]! * a + r[2]! * b + u[2]! * h,
];

/**
 * Phase 6 cars (W4-D):
 * - `inverted`: a chair row hanging from a bogie on the rail `HANG_M` above, with a footrest; the riders face out.
 * - `bobsled`: a low two-seat sled with a pointed nose and side runners.
 * - `monorail`: a long rounded car with a window band, astride the beam (its skirt hides the beam top).
 */
function paintPhase6Car(ctx: Ctx, shape: 'inverted' | 'bobsled' | 'monorail', f: number[], r: number[], u: number[], d: CarDims, colour: string, front: boolean): void {
  const c: [number, number, number] = [0, 0, 0];
  if (shape === 'inverted') {
    // A floorless row of seats hanging from a bogie on the rail: bogie, hanger, seat back, bench.
    paintBox(ctx, carP, at3(f, r, u, 0, 0, HANG_M), f, r, u, 0.5, 0.3, -0.12, 0.14, '#30353d');
    paintBox(ctx, carP, at3(f, r, u, -0.25, 0, d.h1), f, r, u, 0.08, 0.08, 0, HANG_M - d.h1 - 0.1, '#30353d');
    paintBox(ctx, carP, at3(f, r, u, -0.32, 0, 0), f, r, u, 0.1, d.b, d.h0, d.h1, colour, shade(colour, 0.55));
    paintBox(ctx, carP, c, f, r, u, d.a * 0.6, d.b, d.h0, 0.14, shade(colour, 0.8));
    if (front) paintBox(ctx, carP, at3(f, r, u, 0.3, 0, 0.1), f, r, u, 0.04, d.b * 0.9, 0, 0.35, '#f2c230');
    return;
  }
  if (shape === 'bobsled') {
    for (const side of [-1, 1]) paintBox(ctx, carP, at3(f, r, u, 0, side * (d.b - 0.06), 0), f, r, u, d.a * 0.95, 0.05, d.h0 - 0.08, d.h0 + 0.05, '#30353d');
    paintBox(ctx, carP, c, f, r, u, d.a, d.b, d.h0, d.h1, colour, shade(colour, 0.55));
    paintBox(ctx, carP, at3(f, r, u, 0, 0, d.h1 + 0.01), f, r, u, d.a * 0.6, d.b * 0.65, 0, 0.001, '#2b2f36');
    if (front) paintBox(ctx, carP, at3(f, r, u, d.a + 0.18, 0, d.h0 + 0.05), f, r, u, 0.2, d.b * 0.7, 0, d.h1 - d.h0 - 0.1, shade(colour, 1.15), shade(colour, 0.55));
    return;
  }
  // Monorail: body, a dark window band, a light roof, and a rounded nose on the front car.
  paintBox(ctx, carP, c, f, r, u, d.a, d.b, d.h0, d.h1, colour, shade(colour, 0.55));
  paintBox(ctx, carP, at3(f, r, u, 0, 0, 0.62), f, r, u, d.a * 0.92, d.b + 0.01, 0, 0.42, '#24364a');
  paintBox(ctx, carP, at3(f, r, u, 0, 0, d.h1), f, r, u, d.a * 0.9, d.b * 0.85, 0, 0.12, '#f4f6f8');
  if (front) paintBox(ctx, carP, at3(f, r, u, d.a + 0.25, 0, 0.1), f, r, u, 0.25, d.b * 0.8, -0.3, d.h1 - 0.3, shade(colour, 1.1), shade(colour, 0.55));
}

/**
 * Car sprite bounds around the rail point (world px): wide enough for any yaw, pitch, roll, or loop inversion, and for a
 * hanging car's hanger up to its rail (Phase 6) when a corkscrew rolls it sideways.
 */
export const CAR_BOUNDS = { left: -38, right: 38, top: -40, bottom: 38 } as const;

// ---------------------------------------------------------------- gates

/** Entrance or exit booth for a track ride, around the gate tile centre on the ground. */
export function paintGateBooth(ctx: Ctx, kind: 'entrance' | 'exit', roof: string): void {
  const walls = '#ece4d2';
  box(ctx, -0.24, -0.24, 0.24, 0.24, 0, 13, walls, shade(walls, 0.88), shade(walls, 0.74));
  // Doorways on both visible sides.
  poly3(ctx, [-0.07, 0.241, 0, 0.07, 0.241, 0, 0.07, 0.241, 8, -0.07, 0.241, 8], '#3a3f47');
  poly3(ctx, [0.241, -0.07, 0, 0.241, 0.07, 0, 0.241, 0.07, 8, 0.241, -0.07, 8], '#3a3f47');
  pyramid(ctx, -0.3, -0.3, 0.3, 0.3, 13, 22, shade(roof, 0.8), roof, shade(roof, 0.75));
  if (kind === 'entrance') {
    // Flag pole with a pennant.
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(0, -32);
    ctx.strokeStyle = '#30353d';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.lineTo(7, -29.5);
    ctx.lineTo(0, -27);
    ctx.closePath();
    ctx.fillStyle = roof;
    ctx.fill();
  }
}

export const GATE_BOUNDS = { left: -22, right: 22, top: -36, bottom: 12 } as const;
