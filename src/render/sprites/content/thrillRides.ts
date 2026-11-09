/**
 * Owner: W2-C. Phase 3 "Thrill" flat rides (catalog §1): Pendulum Ship (3×5), Thunder Disc, Drop Tower,
 * Flip Arm. Warm hues (master §2.5). `st.angle` (0–1 per turn, from `ride.cycle`) drives the motion;
 * at angle 0 every ride rests in its loading pose.
 */
import { shade } from '../../palette';
import type { RideArtState } from '../rides';
import { box, circlePt, cylinder, line3, nearness, poly3, sx, sy, type Ctx } from '../shapes';
import { TAU, axes, dot, dot3, drawSorted, platform, rider, seatsFilled, star, type Item } from './kit';

/** A point in the ride's own frame: `l` along the long axis, `c` across it (tiles from the centre). */
interface Frame {
  cu: number;
  cv: number;
  au: number;
  av: number;
  bu: number;
  bv: number;
}

function frameOf(ex: number, ey: number, rotation: number): Frame {
  const a = axes(ex, ey, rotation);
  return { cu: ex / 2, cv: ey / 2, au: a.au, av: a.av, bu: a.cu, bv: a.cv };
}

function at(f: Frame, l: number, c: number): { u: number; v: number } {
  return { u: f.cu + f.au * l + f.bu * c, v: f.cv + f.av * l + f.bv * c };
}

// ------------------------------------------------------------------ Pendulum Ship (3×5, thrill)

const SHIP_PIVOT = 84;
/** Arm length in tiles (1 tile = 32 world px, so the swing keeps its shape). */
const SHIP_ARM = 1.85;
const SHIP_SWING = (68 * Math.PI) / 180;

export function drawPendulumShip(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const f = frameOf(ex, ey, st.rotation);
  platform(ctx, ex, ey, '#f3e2cf', '#a8321c');
  // Boarding deck under the ship.
  const d0 = at(f, -1.3, -0.55);
  const d1 = at(f, 1.3, 0.55);
  box(ctx, Math.min(d0.u, d1.u), Math.min(d0.v, d1.v), Math.max(d0.u, d1.u), Math.max(d0.v, d1.v), 3, 7, '#e0c39a', '#b78a55', '#9c7444');
  const theta = SHIP_SWING * Math.sin(TAU * st.angle);
  const ct = Math.cos(theta);
  const s = Math.sin(theta);
  /** Ship point at `l` tiles along the hull and `z` px above the keel line, swung about the pivot. */
  const ship = (l: number, z: number, c: number): { u: number; v: number; h: number } => {
    const x = l * 32;
    const y = -SHIP_ARM * 32 + z;
    const xr = x * ct - y * s;
    const yr = x * s + y * ct;
    const p = at(f, xr / 32, c);
    return { u: p.u, v: p.v, h: SHIP_PIVOT + yr };
  };
  const half = 1.35;
  const width = 0.42;
  const n = 12;
  const keel = (t: number): number => -12 + 9 * t * t;
  const deck = (t: number): number => 4 + 12 * t ** 4;
  const side = (c: number, fill: string, trim: string | null): void => {
    const pts: number[] = [];
    for (let k = 0; k <= n; k++) {
      const t = -1 + (2 * k) / n;
      const p = ship(t * half, keel(t), c);
      pts.push(p.u, p.v, p.h);
    }
    for (let k = n; k >= 0; k--) {
      const t = -1 + (2 * k) / n;
      const p = ship(t * half, deck(t), c);
      pts.push(p.u, p.v, p.h);
    }
    poly3(ctx, pts, fill);
    if (trim) {
      for (let k = 0; k < n; k++) {
        const t0 = -1 + (2 * k) / n;
        const t1 = -1 + (2 * (k + 1)) / n;
        const a = ship(t0 * half, deck(t0) - 4, c);
        const b = ship(t1 * half, deck(t1) - 4, c);
        line3(ctx, a.u, a.v, a.h, b.u, b.v, b.h, trim, 2.2);
      }
    }
  };
  const leg = (c: number, colour: string): void => {
    const top = at(f, 0, c);
    for (const l of [-1.75, 1.75]) {
      const b = at(f, l, c);
      line3(ctx, b.u, b.v, 3, top.u, top.v, SHIP_PIVOT, colour, 5);
    }
    const mid0 = at(f, -0.9, c);
    const mid1 = at(f, 0.9, c);
    line3(ctx, mid0.u, mid0.v, 42, mid1.u, mid1.v, 42, colour, 2.5);
  };
  const arm = (c: number, colour: string): void => {
    const top = at(f, 0, c);
    for (const l of [-0.75, 0.75]) {
      const p = ship(l, deck(l / half), c);
      line3(ctx, top.u, top.v, SHIP_PIVOT, p.u, p.v, p.h, colour, 3);
    }
  };
  // Far A-frame and arms, the hull (far side, deck, riders, near side), then the near ones.
  leg(-1.05, '#c4552c');
  arm(-0.32, '#a8321c');
  side(-width, '#a8321c', null);
  const deckPts: number[] = [];
  for (let k = 0; k <= n; k++) {
    const t = -1 + (2 * k) / n;
    const p = ship(t * half, deck(t), -width);
    deckPts.push(p.u, p.v, p.h);
  }
  for (let k = n; k >= 0; k--) {
    const t = -1 + (2 * k) / n;
    const p = ship(t * half, deck(t), width);
    deckPts.push(p.u, p.v, p.h);
  }
  poly3(ctx, deckPts, '#f0c27b');
  const rows = 6;
  const filled = seatsFilled(rows * 2, st.occupancy);
  for (let r = 0; r < rows; r++) {
    const t = -0.78 + (1.56 * r) / (rows - 1);
    for (let k = 0; k < 2; k++) {
      const c = k === 0 ? -0.18 : 0.18;
      const p = ship(t * half, deck(t) + 1, c);
      const x = sx(p.u, p.v);
      const y = sy(p.u, p.v, p.h);
      ctx.fillStyle = '#7a3e1d';
      ctx.fillRect(x - 3, y - 3, 6, 3);
      if (r * 2 + k < filled) rider(ctx, x, y - 5, r * 2 + k);
    }
  }
  side(width, '#e8503a', '#f5d03b');
  // Figurehead: a flame at each end.
  for (const t of [-1, 1]) {
    const p = ship(t * half * 1.02, deck(t) + 2, 0);
    star(ctx, sx(p.u, p.v), sy(p.u, p.v, p.h) - 3, 6, 2.5, 5, '#ffd166');
  }
  arm(0.32, '#c4552c');
  const b0 = at(f, 0, -1.05);
  const b1 = at(f, 0, 1.05);
  line3(ctx, b0.u, b0.v, SHIP_PIVOT, b1.u, b1.v, SHIP_PIVOT, '#5b4636', 4);
  leg(1.05, '#f39a2b');
  const hub = at(f, 0, 1.05);
  dot3(ctx, hub.u, hub.v, SHIP_PIVOT, 4, '#ffd166');
}

// ------------------------------------------------------------------ Thunder Disc (4×4, thrill)

const DISC_TRACK_END = 1.65;
const DISC_TRACK_RISE = 64;

function trackHeight(l: number): number {
  return 10 + DISC_TRACK_RISE * (l / DISC_TRACK_END) ** 2;
}

export function drawThunderDisc(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const f = frameOf(ex, ey, st.rotation);
  platform(ctx, ex, ey, '#f6dcc4', '#a8321c');
  const segs = 16;
  const lAt = (k: number): number => -DISC_TRACK_END + (2 * DISC_TRACK_END * k) / segs;
  const rail = (c: number, colour: string, from: number, to: number): void => {
    for (let k = from; k < to; k++) {
      const a = at(f, lAt(k), c);
      const b = at(f, lAt(k + 1), c);
      line3(ctx, a.u, a.v, trackHeight(lAt(k)), b.u, b.v, trackHeight(lAt(k + 1)), colour, 5);
    }
  };
  /** The track surface between the rails, segments `from` to `to` (far end first). */
  const band = (from: number, to: number): void => {
    for (let k = from; k < to; k++) {
      const a0 = at(f, lAt(k), -0.45);
      const a1 = at(f, lAt(k + 1), -0.45);
      const b0 = at(f, lAt(k), 0.45);
      const b1 = at(f, lAt(k + 1), 0.45);
      const h0 = trackHeight(lAt(k));
      const h1 = trackHeight(lAt(k + 1));
      poly3(ctx, [a0.u, a0.v, h0, a1.u, a1.v, h1, b1.u, b1.v, h1, b0.u, b0.v, h0], k % 2 ? '#e8503a' : '#d8452f');
    }
  };
  // Supports under both rails, then the U-shaped track.
  for (const c of [-0.45, 0.45]) {
    for (let k = 0; k <= 6; k++) {
      const l = -DISC_TRACK_END + (2 * DISC_TRACK_END * k) / 6;
      const p = at(f, l, c);
      line3(ctx, p.u, p.v, 3, p.u, p.v, trackHeight(l), shade(c < 0 ? '#c4552c' : '#f39a2b', 0.7), 3.5);
    }
  }
  // The disc slides along the U and spins. Track beyond the disc's near edge is drawn after it.
  const l = 1.3 * Math.sin(TAU * st.angle);
  const split = Math.max(0, Math.min(segs, Math.ceil(((l + 0.6 + DISC_TRACK_END) / (2 * DISC_TRACK_END)) * segs)));
  band(0, split);
  rail(-0.45, '#c4552c', 0, segs);
  const centre = at(f, l, 0);
  const h = trackHeight(l) + 6;
  const spin = TAU * st.angle * 3;
  cylinder(ctx, centre.u, centre.v, 0.6, h - 4, h, '#a8321c', '#f0643a');
  const seats = 12;
  const filled = seatsFilled(seats, st.occupancy);
  const items: Item[] = [];
  for (let i = 0; i < seats; i++) {
    const a = spin + (i / seats) * TAU;
    const p = circlePt(centre.u, centre.v, 0.52, a);
    items.push({
      n: nearness(p.u, p.v),
      draw: () => {
        const x = sx(p.u, p.v);
        const y = sy(p.u, p.v, h);
        ctx.fillStyle = i % 2 ? '#ffd166' : '#e8503a';
        ctx.fillRect(x - 3, y - 6, 6, 6);
        if (i < filled) rider(ctx, x, y - 8, i);
      },
    });
  }
  const back = items.filter((it) => it.n < nearness(centre.u, centre.v));
  const front = items.filter((it) => it.n >= nearness(centre.u, centre.v));
  drawSorted(back);
  cylinder(ctx, centre.u, centre.v, 0.22, h, h + 8, '#f39a2b', '#ffd166');
  star(ctx, sx(centre.u, centre.v), sy(centre.u, centre.v, h + 12), 5, 2, 6, '#fff3b0', spin);
  drawSorted(front);
  band(split, segs);
  rail(0.45, '#f39a2b', 0, segs);
  // Lightning flash signs at both ends of the track.
  for (const end of [-1, 1]) {
    const p = at(f, end * (DISC_TRACK_END + 0.05), 0.45);
    const x = sx(p.u, p.v);
    const y = sy(p.u, p.v, trackHeight(DISC_TRACK_END) + 6);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(x - 2, y - 10);
    ctx.lineTo(x + 4, y - 10);
    ctx.lineTo(x + 1, y - 3);
    ctx.lineTo(x + 5, y - 3);
    ctx.lineTo(x - 3, y + 8);
    ctx.lineTo(x - 1, y);
    ctx.lineTo(x - 5, y);
    ctx.closePath();
    ctx.fill();
  }
}

// ------------------------------------------------------------------ Drop Tower (2×2, thrill, tall)

const TOWER_TOP = 182;

/** Gondola height share over one turn: slow climb, a short hold, a fast drop, a brake at the bottom. */
export function dropProfile(p: number): number {
  const t = p - Math.floor(p);
  if (t < 0.7) return 0.5 - 0.5 * Math.cos((Math.PI * t) / 0.7);
  if (t < 0.8) return 1;
  if (t < 0.9) {
    const q = (t - 0.8) / 0.1;
    return 1 - q * q;
  }
  return 0;
}

export function drawDropTower(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  platform(ctx, ex, ey, '#f6dcc4', '#a8321c');
  box(ctx, cu - 0.55, cv - 0.55, cu + 0.55, cv + 0.55, 3, 12, '#f0643a', '#c4552c', '#a8321c');
  const hg = 14 + (TOWER_TOP - 44) * dropProfile(st.angle);
  const ring = (u0: number, v0: number, u1: number, v1: number): void => box(ctx, u0, v0, u1, v1, hg, hg + 8, '#ffd166', '#f39a2b', '#c4552c');
  const r0 = cu - 0.62;
  const r1 = cu + 0.62;
  const q0 = cv - 0.62;
  const q1 = cv + 0.62;
  // Back bars of the seat ring, the column, then the front bars with the riders.
  ring(r0, q0, r1, q0 + 0.16);
  ring(r0, q0, r0 + 0.16, q1);
  const c0 = cu - 0.2;
  const c1 = cu + 0.2;
  box(ctx, c0, c0, c1, c1, 12, TOWER_TOP, '#e8503a', '#c43a2a', '#a8321c');
  for (let k = 0; k < 8; k++) {
    const h = 24 + k * 20;
    box(ctx, c0 - 0.01, c0 - 0.01, c1 + 0.01, c1 + 0.01, h, h + 6, '#ffd166', '#f5c03b', '#d9a82c');
  }
  // Chase lights on the column.
  for (let k = 0; k < 10; k++) {
    const h = 20 + k * 16;
    const on = (k + Math.floor(st.angle * 20)) % 3 === 0;
    dot3(ctx, c1, cv, h, 1.8, on ? '#fff3b0' : '#ffb36b');
  }
  box(ctx, cu - 0.45, cv - 0.45, cu + 0.45, cv + 0.45, TOWER_TOP, TOWER_TOP + 10, '#ffd166', '#f39a2b', '#c4552c');
  star(ctx, sx(cu, cv), sy(cu, cv, TOWER_TOP + 22), 8, 3.5, 5, '#ffd166');
  const filled = seatsFilled(12, st.occupancy);
  let k = 0;
  const legs = (x: number, y: number): void => {
    ctx.fillStyle = '#30425a';
    ctx.fillRect(x - 2, y + 2, 1.5, 6);
    ctx.fillRect(x + 0.5, y + 2, 1.5, 6);
  };
  ring(r0, q1 - 0.16, r1, q1);
  for (let i = 0; i < 6; i++) {
    const u = r0 + 0.12 + (i / 5) * (r1 - r0 - 0.24);
    const x = sx(u, q1);
    const y = sy(u, q1, hg);
    if (k < filled) {
      legs(x, y);
      rider(ctx, x, y - 3, k);
    }
    k++;
  }
  ring(r1 - 0.16, q0, r1, q1);
  for (let i = 0; i < 6; i++) {
    const v = q0 + 0.12 + (i / 5) * (q1 - q0 - 0.24);
    const x = sx(r1, v);
    const y = sy(r1, v, hg);
    if (k < filled) {
      legs(x, y);
      rider(ctx, x, y - 3, k);
    }
    k++;
  }
}

// ------------------------------------------------------------------ Flip Arm (3×3, thrill, tall)

const FLIP_HUB = 76;
const FLIP_ARM = 1.45;
const FLIP_WEIGHT = 0.75;

export function drawFlipArm(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const f = frameOf(ex, ey, st.rotation);
  platform(ctx, ex, ey, '#f6dcc4', '#a8321c');
  cylinder(ctx, f.cu, f.cv, 1.3, 3, 7, '#c4552c', '#f0643a');
  for (let k = 0; k < 10; k++) {
    const p = circlePt(f.cu, f.cv, 1.1, (k / 10) * TAU);
    dot3(ctx, p.u, p.v, 7, 1.8, k % 2 ? '#ffd166' : '#fff3b0');
  }
  // A banded pillar on the far side with two braces; the arm turns in front of it.
  const pillar = at(f, 0, -0.5);
  for (const l of [-0.95, 0.95]) {
    const b = at(f, l, -0.55);
    line3(ctx, b.u, b.v, 7, pillar.u, pillar.v, FLIP_HUB - 18, '#a8321c', 6);
  }
  cylinder(ctx, pillar.u, pillar.v, 0.3, 7, FLIP_HUB + 6, '#e8503a', '#f06a52');
  for (let k = 0; k < 3; k++) cylinder(ctx, pillar.u, pillar.v, 0.305, 18 + k * 18, 24 + k * 18, '#ffd166', '#ffe08a');
  const hub = at(f, 0, 0.05);
  line3(ctx, pillar.u, pillar.v, FLIP_HUB, hub.u, hub.v, FLIP_HUB, '#5b4636', 7);
  const phi = TAU * st.angle;
  /** A point on the arm: `r` tiles from the hub (positive toward the gondola, which hangs down at rest). */
  const armPt = (r: number): { u: number; v: number; h: number } => {
    const p = at(f, r * Math.sin(phi), 0.05);
    return { u: p.u, v: p.v, h: FLIP_HUB - r * Math.cos(phi) * 32 };
  };
  const w = armPt(-FLIP_WEIGHT);
  const g = armPt(FLIP_ARM);
  line3(ctx, w.u, w.v, w.h, g.u, g.v, g.h, '#7a3e1d', 9);
  line3(ctx, w.u, w.v, w.h, g.u, g.v, g.h, '#f39a2b', 5);
  // Counterweight: a striped drum.
  const wx = sx(w.u, w.v);
  const wy = sy(w.u, w.v, w.h);
  dot(ctx, wx, wy, 10, '#a8321c');
  dot(ctx, wx, wy, 7, '#ffd166');
  star(ctx, wx, wy, 5, 2, 5, '#e8503a', phi);
  // Gondola: a seat bench across the arm end; riders sit on the hub side and turn over with it.
  const a = at(f, 0, -0.55);
  const b = at(f, 0, 0.65);
  const gx = sx(g.u, g.v);
  const gy = sy(g.u, g.v, g.h);
  const dx = (sx(b.u, b.v) - sx(a.u, a.v)) / 2;
  const dy = (sy(b.u, b.v, 0) - sy(a.u, a.v, 0)) / 2;
  // Unit screen vector from the gondola toward the hub.
  const hx = sx(hub.u, hub.v) - gx;
  const hy = sy(hub.u, hub.v, FLIP_HUB) - gy;
  const hl = Math.hypot(hx, hy) || 1;
  const ux = hx / hl;
  const uy = hy / hl;
  const bench = (off: number, colour: string, width: number): void => {
    ctx.beginPath();
    ctx.moveTo(gx - dx + ux * off, gy - dy + uy * off);
    ctx.lineTo(gx + dx + ux * off, gy + dy + uy * off);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
  };
  bench(-3, '#7a1f12', 12);
  bench(-3, '#e8503a', 8);
  const filled = seatsFilled(8, st.occupancy);
  for (let i = 0; i < filled; i++) {
    const t = -0.85 + (1.7 * i) / 7;
    rider(ctx, gx + dx * t + ux * 5, gy + dy * t + uy * 5, i);
  }
  bench(2, '#ffd166', 3);
  // Hub cap with a turning spark.
  const cx = sx(hub.u, hub.v);
  const cy = sy(hub.u, hub.v, FLIP_HUB);
  dot(ctx, cx, cy, 7, '#a8321c');
  star(ctx, cx, cy, 6, 2.5, 6, '#ffd166', phi);
}
