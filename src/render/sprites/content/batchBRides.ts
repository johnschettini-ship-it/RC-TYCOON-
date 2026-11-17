/**
 * New rides batch B (docs/superpowers/specs/2026-11-17-new-rides-design.md): Chair Swing Twist (3×3, thrill, tall),
 * Spinning Wheel Drop (3×3, thrill, tall), Loop Swing (3×4, thrill, tall), Carousel Deluxe (4×4, chill, covered) and
 * Train Station Show (4×3, chill, covered walk-through).
 * Original shapes in flat colours (master §2.5: warm = thrill, cool = chill). `st.angle` (0–1 per turn, from
 * `ride.cycle`) drives every moving part; at angle 0 each ride rests in its loading pose. `st.colour` paints the ride's
 * colour part (the same part its realistic bake masks, tools/art3d/items/<id>.js); absent or null draws Original.
 */
import { shade } from '../../palette';
import type { RideArtState } from '../rides';
import { box, circlePt, cone, cylinder, disc, line3, nearness, poly3, rrect, sx, sy, type Ctx } from '../shapes';
import { TAU, axes, dot, dot3, drawSorted, line2, oval, platform, rider, seatsFilled, star, type Item } from './kit';

type V3 = [number, number, number];

/** Screen point of an offset (world px: map u, map v, up) from a centre at height `h`. */
function ptAt(cu: number, cv: number, h: number, o: V3): [number, number, number] {
  const u = cu + o[0] / 32;
  const v = cv + o[1] / 32;
  return [sx(u, v), sy(u, v, h + o[2]), o[0] + o[1]];
}

// ------------------------------------------------------------------ Chair Swing Twist (3×3, thrill, tall)

/** The top slides up the column while the ride runs: its pivot (world px) at rest and at the top of the climb. */
const TWIST_REST = 48;
const TWIST_RISE = 36;
/** Column height (world px): the top slides on it, a beacon crowns it. */
const TWIST_COLUMN = 106;
/** Canopy rim radius (world px) where the chains hang. */
const TWIST_RIM = 22;
const TWIST_CHAIN = 40;
const TWIST_CHAIRS = 12;
/** Peak tilt of the top (radians), reached half way through each turn. */
export const TWIST_TILT = (18 * Math.PI) / 180;
/** Chair spin: turns of the top per turn of the cycle (the top's lean goes round once per turn). */
export const TWIST_SPIN = 3;
/** How far a chair swings out from the vertical while the ride runs (radians). */
export const TWIST_THROW = (35 * Math.PI) / 180;

/** The climb and the tilt at turn fraction `a`: 0 at rest, the peak half way (sin², so both start and end gently). */
export function twistShare(a: number): number {
  return Math.sin(Math.PI * a) ** 2;
}

export function drawChairSwingTwist(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  platform(ctx, ex, ey, '#f3e3c8', '#9a4a2a');
  disc(ctx, cu, cv, 1.35, 3, '#e9c79a', '#c4552c', 1.5);
  cylinder(ctx, cu, cv, 0.4, 3, 9, '#9a4a2a', '#d8833a');
  const w = twistShare(st.angle);
  const head = TWIST_REST + TWIST_RISE * w;
  const tau = TWIST_TILT * w;
  const phi = TAU * st.angle;
  const spin = TAU * st.angle * TWIST_SPIN;
  // The tilted frame of the top: e1 leans down towards phi, e2 is level, n is the top's axis.
  const e1: V3 = [Math.cos(tau) * Math.cos(phi), Math.cos(tau) * Math.sin(phi), -Math.sin(tau)];
  const e2: V3 = [-Math.sin(phi), Math.cos(phi), 0];
  const n: V3 = [Math.sin(tau) * Math.cos(phi), Math.sin(tau) * Math.sin(phi), Math.cos(tau)];
  const at = (o: V3) => ptAt(cu, cv, head, o);
  const inPlane = (th: number, r: number, up: number): V3 => [
    (Math.cos(th) * e1[0] + Math.sin(th) * e2[0]) * r + n[0] * up,
    (Math.cos(th) * e1[1] + Math.sin(th) * e2[1]) * r + n[1] * up,
    Math.cos(th) * e1[2] * r + n[2] * up,
  ];
  const throwOut = st.occupancy > 0 ? TWIST_THROW : 0;
  const filled = seatsFilled(TWIST_CHAIRS * 2, st.occupancy);
  const colours = ['#f5c518', '#ef7d2a'];
  const items: Item[] = [];
  for (let i = 0; i < TWIST_CHAIRS; i++) {
    const th = (i / TWIST_CHAIRS) * TAU + spin;
    const rim = inPlane(th, TWIST_RIM, 0);
    const hl = Math.hypot(rim[0], rim[1]) || 1;
    const seat: V3 = [
      rim[0] + (rim[0] / hl) * TWIST_CHAIN * Math.sin(throwOut),
      rim[1] + (rim[1] / hl) * TWIST_CHAIN * Math.sin(throwOut),
      rim[2] - TWIST_CHAIN * Math.cos(throwOut),
    ];
    const r = at(rim);
    const s = at(seat);
    items.push({
      n: s[2],
      draw: () => {
        line2(ctx, r[0], r[1], s[0], s[1] - 2, '#4a3a2e', 1);
        const c = colours[i % 2] as string;
        ctx.fillStyle = c;
        ctx.fillRect(s[0] - 4.5, s[1] - 1, 9, 4);
        ctx.fillStyle = shade(c, 0.65);
        ctx.fillRect(s[0] - 4.5, s[1] + 3, 9, 1.5);
        if (i * 2 < filled) rider(ctx, s[0] - 2, s[1] - 3, i * 2);
        if (i * 2 + 1 < filled) rider(ctx, s[0] + 2, s[1] - 3, i * 2 + 1);
      },
    });
  }
  // The far chairs, then the column and the tilting top, then the near chairs.
  drawSorted(items.filter((it) => it.n < 0));
  cylinder(ctx, cu, cv, 0.17, 9, TWIST_COLUMN, '#f2efe8', '#ffffff');
  for (let k = 0; k < 4; k++) cylinder(ctx, cu, cv, 0.175, 20 + k * 22, 24 + k * 22, '#c4552c', '#d8833a');
  // The canopy is the colour part: a tilted striped cone round the column (near half lighter).
  const canopy = st.colour ?? '#1e8f9c';
  const rimPts: Array<[number, number, number]> = [];
  for (let k = 0; k <= 24; k++) rimPts.push(at(inPlane((k / 24) * TAU + spin, TWIST_RIM + 3, 2)));
  const apex = at(inPlane(0, 0, 16));
  for (let k = 0; k < 24; k++) {
    const p0 = rimPts[k] as [number, number, number];
    const p1 = rimPts[k + 1] as [number, number, number];
    ctx.beginPath();
    ctx.moveTo(apex[0], apex[1]);
    ctx.lineTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.closePath();
    ctx.fillStyle = k % 2 ? '#fff3d6' : p0[2] + p1[2] > 0 ? canopy : shade(canopy, 0.8);
    ctx.fill();
  }
  // The sleeve that slides on the column, and bulbs round the rim.
  cylinder(ctx, cu, cv, 0.25, head + 14, head + 22, '#5b4a3e', '#7a6656');
  cylinder(ctx, cu, cv, 0.17, head + 22, TWIST_COLUMN, '#f2efe8', '#ffffff');
  dot(ctx, sx(cu, cv), sy(cu, cv, TWIST_COLUMN + 3), 3.5, '#fff3b0');
  for (let k = 0; k < 24; k += 2) {
    const p = rimPts[k] as [number, number, number];
    if (p[2] < -8) continue;
    dot(ctx, p[0], p[1] + 2, 1.4, k % 4 ? '#fff3b0' : '#ffd166');
  }
  drawSorted(items.filter((it) => it.n >= 0));
  // The two lamp posts by the boarding ring's gate.
  for (const a of [Math.PI * 0.15, Math.PI * 0.35]) {
    const p = circlePt(cu, cv, 1.3, a);
    line3(ctx, p.u, p.v, 3, p.u, p.v, 22, '#5b4a3e', 1.5);
    dot(ctx, sx(p.u, p.v), sy(p.u, p.v, 23), 2, '#fff3b0');
  }
}

// ------------------------------------------------------------------ Spinning Wheel Drop (3×3, thrill, tall)

/** Wheel radius (world px, 32 per tile) and its seats. */
const WHEEL_R = 34;
const WHEEL_SEATS = 16;
/** Peak tilt of the wheel (radians): near vertical. */
export const WHEEL_TILT = (75 * Math.PI) / 180;
/** Wheel spin: turns per turn of the cycle (2.5: 16 seats in two colours repeat every 45 degrees, so a run ends where it began). */
export const WHEEL_SPIN = 2.5;
/** Hub height (world px) with the wheel flat for boarding, and the rise of the telescopic arm at full tilt. */
const WHEEL_HUB = 15;
const WHEEL_RISE = 30;

const smooth = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/**
 * Tilt share (0..1) at turn fraction `a`: the wheel spins flat, rises and tilts up between 0.15 and 0.4, holds near
 * vertical until 0.7, and is lowered flat again by 0.9.
 */
export function wheelShare(a: number): number {
  const t = a - Math.floor(a);
  if (t < 0.4) return smooth((t - 0.15) / 0.25);
  if (t <= 0.7) return 1;
  return smooth((0.9 - t) / 0.2);
}

export function drawSpinWheelDrop(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  platform(ctx, ex, ey, '#efe2d0', '#8a3a2a');
  disc(ctx, cu, cv, 1.4, 3, '#d9cdbd', '#8a7a6a', 1.5);
  const w = wheelShare(st.angle);
  const tau = WHEEL_TILT * w;
  const phi = TAU * st.angle;
  const spin = TAU * st.angle * WHEEL_SPIN;
  const hub = WHEEL_HUB + WHEEL_RISE * w;
  // The turret turns once per turn; the wheel leans towards phi.
  cylinder(ctx, cu, cv, 0.5, 3, 9, '#3a3f45', '#5a6068');
  const e1: V3 = [Math.cos(tau) * Math.cos(phi), Math.cos(tau) * Math.sin(phi), Math.sin(tau)];
  const e2: V3 = [-Math.sin(phi), Math.cos(phi), 0];
  const n: V3 = [-Math.sin(tau) * Math.cos(phi), -Math.sin(tau) * Math.sin(phi), Math.cos(tau)];
  const at = (o: V3) => ptAt(cu, cv, hub, o);
  const inPlane = (th: number, r: number, up = 0): V3 => [
    (Math.cos(th) * e1[0] + Math.sin(th) * e2[0]) * r + n[0] * up,
    (Math.cos(th) * e1[1] + Math.sin(th) * e2[1]) * r + n[1] * up,
    Math.cos(th) * e1[2] * r + n[2] * up,
  ];
  // Telescopic arm from the turret to the hub (behind the wheel's lower half).
  const base = ptAt(cu, cv, 9, [0, 0, 0]);
  const top = at([0, 0, 0]);
  line2(ctx, base[0], base[1], top[0], top[1], '#c9ccd0', 6);
  line2(ctx, base[0] - 6, base[1] - 2, top[0] - 4, top[1] + 4, '#8a8f96', 2);
  const ringCol = st.colour ?? '#d6336c';
  const filled = seatsFilled(WHEEL_SEATS, st.occupancy);
  const seatCols = ['#f5c518', '#2e86de'];
  const seats: Item[] = [];
  for (let i = 0; i < WHEEL_SEATS; i++) {
    const th = (i / WHEEL_SEATS) * TAU + spin;
    const p = at(inPlane(th, WHEEL_R + 3, 3));
    seats.push({
      n: p[2],
      draw: () => {
        const c = seatCols[i % 2] as string;
        ctx.fillStyle = shade(c, 0.7);
        ctx.fillRect(p[0] - 3.5, p[1] - 5, 7, 8);
        ctx.fillStyle = c;
        ctx.fillRect(p[0] - 3, p[1] - 4, 6, 6);
        if (i < filled) rider(ctx, p[0], p[1] - 7, i);
      },
    });
  }
  const ring = (near: boolean, colour: string, width: number, r: number): void => {
    for (let k = 0; k < 32; k++) {
      const a0 = (k / 32) * TAU;
      const a1 = ((k + 1) / 32) * TAU;
      const p0 = at(inPlane(a0, r));
      const p1 = at(inPlane(a1, r));
      if (p0[2] + p1[2] >= 0 !== near) continue;
      line2(ctx, p0[0], p0[1], p1[0], p1[1], colour, width);
    }
  };
  drawSorted(seats.filter((s) => s.n < 0));
  ring(false, shade(ringCol, 0.75), 5, WHEEL_R);
  // Spokes and the floor of the wheel (the wheel's colour part is its ring).
  for (let k = 0; k < 8; k++) {
    const p = at(inPlane((k / 8) * TAU + spin, WHEEL_R));
    line2(ctx, top[0], top[1], p[0], p[1], '#e9e6df', 1.6);
  }
  dot(ctx, top[0], top[1], 6, '#f5c518');
  dot(ctx, top[0], top[1], 3, '#3a3f45');
  ring(true, ringCol, 5, WHEEL_R);
  ring(true, '#fff3b0', 1.2, WHEEL_R - 4);
  drawSorted(seats.filter((s) => s.n >= 0));
}

// ------------------------------------------------------------------ Loop Swing (3×4, thrill, tall)

/**
 * The arm's angle (degrees from hanging down, + towards the front of the long axis) at each of the 16 time steps of a
 * turn: three swings, each higher than the last (the -90 of step 7 is the 270 of step 15, one picture in the bake),
 * then all the way over the top.
 */
export const LOOP_STEPS: readonly number[] = [0, 30, 0, -50, 0, 70, 0, -90, 0, 115, 0, -140, 0, 90, 180, 270];
/** Axle height and arm length (world px). */
const LOOP_AXLE = 66;
const LOOP_ARM = 48;

/** Arm angle (radians) at turn fraction `a`: the step table, eased between steps (each step is 1/16 of a turn). */
export function loopTheta(a: number): number {
  const t = (a - Math.floor(a)) * 16;
  const k = Math.floor(t);
  const f = t - k;
  const e = f * f * (3 - 2 * f);
  const a0 = LOOP_STEPS[k] as number;
  const a1 = k === 15 ? 360 : (LOOP_STEPS[k + 1] as number);
  return ((a0 + (a1 - a0) * e) * Math.PI) / 180;
}

export function drawLoopSwing(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const ax = axes(ex, ey, st.rotation);
  const cu = ex / 2;
  const cv = ey / 2;
  /** Map point `l` tiles along the long axis and `c` across it. */
  const at = (l: number, c: number): { u: number; v: number } => ({ u: cu + ax.au * l + ax.cu * c, v: cv + ax.av * l + ax.cv * c });
  platform(ctx, ex, ey, '#efe1cf', '#7a2f22');
  const d0 = at(-0.7, -0.75);
  const d1 = at(0.7, 0.75);
  box(ctx, Math.min(d0.u, d1.u), Math.min(d0.v, d1.v), Math.max(d0.u, d1.u), Math.max(d0.v, d1.v), 3, 9, '#cdbfae', '#9c8a76', '#86745f');
  const th = loopTheta(st.angle);
  const g = (l: number, h: number, c: number): { u: number; v: number; h: number } => {
    // a point of the arm frame: `l` tiles along the arm from the axle (towards the gondola), `h` px off it
    const r = l * 32;
    const x = r * Math.sin(th) + h * Math.cos(th);
    const z = -r * Math.cos(th) + h * Math.sin(th);
    const p = at(x / 32, c);
    return { u: p.u, v: p.v, h: LOOP_AXLE + z };
  };
  const frame = (c: number, colour: string): void => {
    const top = at(0, c);
    for (const l of [-1.35, 1.35]) {
      const b = at(l, c * 1.15);
      line3(ctx, b.u, b.v, 9, top.u, top.v, LOOP_AXLE, colour, 5);
    }
  };
  // Which side of the gondola faces the viewer decides the draw order of the far frame, the arm and the near frame.
  const near = nearness(at(0, 1).u, at(0, 1).v) > nearness(at(0, -1).u, at(0, -1).v) ? 1 : -1;
  frame(-near * 1.05, '#8a3a2a');
  // The arm: the long beam to the gondola and the counterweight on the short end.
  const end = g(LOOP_ARM / 32, 0, 0);
  const cw = g(-0.75, 0, 0);
  line3(ctx, cw.u, cw.v, cw.h, end.u, end.v, end.h, '#3a3f45', 5);
  dot3(ctx, cw.u, cw.v, cw.h, 7, '#f5c518');
  // The gondola is the colour part: a shell across the arm's end, riders in two rows back to back.
  const shell = st.colour ?? '#e2582c';
  const c0 = g(LOOP_ARM / 32, -9, -0.7);
  const c1 = g(LOOP_ARM / 32, -9, 0.7);
  const c2 = g(LOOP_ARM / 32, 9, 0.7);
  const c3 = g(LOOP_ARM / 32, 9, -0.7);
  poly3(ctx, [c0.u, c0.v, c0.h, c1.u, c1.v, c1.h, c2.u, c2.v, c2.h, c3.u, c3.v, c3.h], shade(shell, 0.8));
  const filled = seatsFilled(16, st.occupancy);
  for (let k = 0; k < 8; k++) {
    for (const side of [-1, 1]) {
      const c = -0.6 + (1.2 * k) / 7;
      const p = g(LOOP_ARM / 32 - 0.08, side * 6, c);
      const x = sx(p.u, p.v);
      const y = sy(p.u, p.v, p.h);
      ctx.fillStyle = '#2a2624';
      ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
      const i = k * 2 + (side > 0 ? 1 : 0);
      if (i < filled) rider(ctx, x, y - 3, i);
    }
  }
  const b0 = g(LOOP_ARM / 32 + 0.12, -9, -0.72);
  const b1 = g(LOOP_ARM / 32 + 0.12, -9, 0.72);
  const b2 = g(LOOP_ARM / 32 + 0.12, 9, 0.72);
  const b3 = g(LOOP_ARM / 32 + 0.12, 9, -0.72);
  line3(ctx, b0.u, b0.v, b0.h, b1.u, b1.v, b1.h, shell, 4);
  line3(ctx, b2.u, b2.v, b2.h, b3.u, b3.v, b3.h, shell, 4);
  const axle0 = at(0, -1.05);
  const axle1 = at(0, 1.05);
  line3(ctx, axle0.u, axle0.v, LOOP_AXLE, axle1.u, axle1.v, LOOP_AXLE, '#5b4636', 4);
  frame(near * 1.05, '#c4552c');
  const hub = at(0, near * 1.05);
  dot3(ctx, hub.u, hub.v, LOOP_AXLE, 4, '#f5c518');
}

// ------------------------------------------------------------------ Carousel Deluxe (4×4, chill, covered)

/** The ride repeats every 60 degrees (6 of each design round each ring); its horses rise and fall 6 times a turn. */
export const DELUXE_PERIOD = Math.PI / 3;
const DELUXE_DECK = 40;
const DELUXE_ROOF = 76;

/** A carousel horse in profile at screen (x, y), facing `dir` (±1). */
function horse(ctx: Ctx, x: number, y: number, dir: number, body: string): void {
  oval(ctx, x, y, 5.5, 3.2, body);
  ctx.fillStyle = body;
  ctx.fillRect(x + dir * 3.5, y - 6, dir * 3, 5);
  ctx.strokeStyle = shade(body, 0.6);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 3, y + 2);
  ctx.lineTo(x - 4, y + 6);
  ctx.moveTo(x + 3, y + 2);
  ctx.lineTo(x + 4, y + 6);
  ctx.stroke();
}

export function drawCarouselDeluxe(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  platform(ctx, ex, ey, '#e6e0d4', '#5d6f8f');
  cylinder(ctx, cu, cv, 1.85, 3, 8, '#8a7a5a', '#efe3c6');
  const spin = TAU * st.angle;
  const filled = seatsFilled(36, st.occupancy);
  let seat = 0;
  const lower: Item[] = [];
  const horseCols = ['#f4f1ea', '#2b2522'];
  // Lower deck: 6 horses and 6 two-seat carriages on the outer ring, 6 horses on the inner one.
  for (let i = 0; i < 12; i++) {
    const th = (i / 12) * TAU + spin;
    const p = circlePt(cu, cv, 1.55, th);
    const bob = 16 + 4 * Math.sin(6 * th);
    const k = seat;
    seat += i % 2 ? 2 : 1;
    lower.push({
      n: nearness(p.u, p.v),
      draw: () => {
        line3(ctx, p.u, p.v, 8, p.u, p.v, DELUXE_DECK, '#e0b84a', 1.4);
        const x = sx(p.u, p.v);
        if (i % 2) {
          const y = sy(p.u, p.v, 12);
          ctx.fillStyle = '#7a2a4a';
          ctx.beginPath();
          rrect(ctx, x - 7, y - 7, 14, 9, 3, 2);
          ctx.fill();
          ctx.fillStyle = '#e0b84a';
          ctx.fillRect(x - 7, y - 7, 14, 1.5);
          if (k < filled) rider(ctx, x - 3, y - 8, k);
          if (k + 1 < filled) rider(ctx, x + 3, y - 8, k + 1);
        } else {
          const y = sy(p.u, p.v, bob);
          horse(ctx, x, y, -Math.sin(th) + Math.cos(th) >= 0 ? 1 : -1, '#f4f1ea');
          if (k < filled) rider(ctx, x, y - 6, k);
        }
      },
    });
  }
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * TAU + spin + TAU / 12;
    const p = circlePt(cu, cv, 1.0, th);
    const y0 = 18 + 4 * Math.sin(6 * th + Math.PI);
    const k = seat++;
    lower.push({
      n: nearness(p.u, p.v),
      draw: () => {
        line3(ctx, p.u, p.v, 8, p.u, p.v, DELUXE_DECK, '#e0b84a', 1.4);
        const x = sx(p.u, p.v);
        const y = sy(p.u, p.v, y0);
        horse(ctx, x, y, -Math.sin(th) + Math.cos(th) >= 0 ? 1 : -1, '#c9a46a');
        if (k < filled) rider(ctx, x, y - 6, k);
      },
    });
  }
  lower.push({ n: nearness(cu, cv), draw: () => cylinder(ctx, cu, cv, 0.45, 8, DELUXE_ROOF, '#c8a24a', '#f0d66e') });
  drawSorted(lower);
  // Upper deck: a gilded floor, 12 horses on its ring, the inner stair drum.
  cylinder(ctx, cu, cv, 1.6, DELUXE_DECK, DELUXE_DECK + 4, '#c8a24a', '#efe3c6');
  const upper: Item[] = [];
  for (let i = 0; i < 12; i++) {
    const th = (i / 12) * TAU + spin + TAU / 24;
    const p = circlePt(cu, cv, 1.2, th);
    const bob = DELUXE_DECK + 14 + 4 * Math.sin(6 * th);
    const k = seat++;
    upper.push({
      n: nearness(p.u, p.v),
      draw: () => {
        line3(ctx, p.u, p.v, DELUXE_DECK + 4, p.u, p.v, DELUXE_ROOF, '#e0b84a', 1.4);
        const x = sx(p.u, p.v);
        const y = sy(p.u, p.v, bob);
        horse(ctx, x, y, -Math.sin(th) + Math.cos(th) >= 0 ? 1 : -1, horseCols[i % 2] as string);
        if (k < filled) rider(ctx, x, y - 6, k);
      },
    });
  }
  upper.push({ n: nearness(cu, cv), draw: () => cylinder(ctx, cu, cv, 0.5, DELUXE_DECK + 4, DELUXE_ROOF, '#5d6f8f', '#8a9ab5') });
  drawSorted(upper);
  // The canopy is the colour part: a striped cone with a gilded cupola and bulbs at both eaves.
  const canopy = st.colour ?? '#2f6fb5';
  cone(ctx, cu, cv, 1.95, DELUXE_ROOF, DELUXE_ROOF + 14, [canopy, '#f4ead2'], 24);
  cylinder(ctx, cu, cv, 0.4, DELUXE_ROOF + 14, DELUXE_ROOF + 19, '#c8a24a', '#f0d66e');
  cone(ctx, cu, cv, 0.5, DELUXE_ROOF + 19, DELUXE_ROOF + 26, [shade(canopy, 0.85), '#e0b84a'], 8);
  for (const [r, h] of [[1.95, DELUXE_ROOF], [1.6, DELUXE_DECK + 3]] as const) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU + spin;
      if (Math.cos(a) + Math.sin(a) < -0.2) continue;
      const p = circlePt(cu, cv, r, a);
      dot(ctx, sx(p.u, p.v), sy(p.u, p.v, h) + 1, 1.3, k % 2 ? '#fff3b0' : '#ffd166');
    }
  }
  star(ctx, sx(cu, cv), sy(cu, cv, DELUXE_ROOF + 29), 4.5, 2, 5, '#f5c518');
}
