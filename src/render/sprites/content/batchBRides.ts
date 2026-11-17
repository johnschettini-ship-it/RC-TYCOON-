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
import { circlePt, cylinder, disc, line3, sx, sy, type Ctx } from '../shapes';
import { TAU, dot, drawSorted, line2, platform, rider, seatsFilled, type Item } from './kit';

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
