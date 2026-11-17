/**
 * New family flat rides, batch A (docs/superpowers/specs/2026-11-17-new-rides-design.md): Dodgem Boats (3×3),
 * Mini Pirate Ship (3×4), Balloon Wheel (2×2), Frog Hopper (2×2). Original designs in today's flat colours; family
 * rides lean green (master §2.5). `st.angle` (0–1 per turn, from `ride.cycle`) drives the motion through
 * `./familyMotion.ts`, shared with the realistic bake; at angle 0 each ride rests in its loading pose. `st.colour`
 * paints the ride's colour part (the one the realistic look tints): the boats, the ship's hull, the balloons, the
 * seat ring.
 */
import { shade } from '../../palette';
import type { RideArtState } from '../rides';
import { box, circlePt, cone, cylinder, disc, line3, nearness, poly3, rrect, sx, sy, type Ctx } from '../shapes';
import { TAU, axes, dot, dot3, drawSorted, oval, platform, poly2, rider, seatsFilled, type Item } from './kit';
import { BALLOON_CARS, BOATS, boatPose, frogShare, miniShipTheta } from './familyMotion';

// ------------------------------------------------------------------ Dodgem Boats (3×3, family)

const BOAT_COLOURS = ['#e8503a', '#3d9be0', '#f5d03b', '#2fb39a', '#f39a2b', '#d457a8'];
/** Boat ring round the lighthouse, in tiles from the pond centre. */
const BOAT_R0 = 0.66;
const BOAT_R1 = 0.98;
const BOAT_SIZE = 0.24;

export function drawDodgemBoats(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  platform(ctx, ex, ey, '#e9e2cf', '#8a7a5a');
  // The pond: a round basin of blue water with a stone rim and ripples.
  disc(ctx, cu, cv, 1.36, 3, '#c9c1ae', '#9c927c', 1.5);
  disc(ctx, cu, cv, 1.26, 3.4, '#4aa6d8');
  disc(ctx, cu, cv, 1.0, 3.5, '', 'rgba(255,255,255,0.35)', 1);
  disc(ctx, cu, cv, 0.6, 3.5, '', 'rgba(255,255,255,0.3)', 1);
  // A picket fence on the two far edges (the near ones are drawn last).
  const fence = (u0: number, v0: number, u1: number, v1: number): void => {
    for (let k = 0; k <= 8; k++) {
      const u = u0 + ((u1 - u0) * k) / 8;
      const v = v0 + ((v1 - v0) * k) / 8;
      line3(ctx, u, v, 3, u, v, 10, '#ffffff', 1.4);
    }
    line3(ctx, u0, v0, 9, u1, v1, 9, '#ffffff', 1.2);
    line3(ctx, u0, v0, 6, u1, v1, 6, '#ffffff', 1);
  };
  fence(0.1, 0.1, ex - 0.1, 0.1);
  fence(0.1, 0.1, 0.1, ey - 0.1);
  const filled = seatsFilled(BOATS * 2, st.occupancy);
  const items: Item[] = [];
  for (let i = 0; i < BOATS; i++) {
    const b = boatPose(i, st.angle);
    const p = circlePt(cu, cv, BOAT_R0 + (BOAT_R1 - BOAT_R0) * b.r, b.a);
    const c = st.colour ?? (BOAT_COLOURS[i] as string);
    items.push({
      n: nearness(p.u, p.v),
      draw: () => {
        // A ring of rubber bumper round a round tub, a little wake behind.
        disc(ctx, p.u, p.v, BOAT_SIZE + 0.05, 3.6, 'rgba(255,255,255,0.45)');
        cylinder(ctx, p.u, p.v, BOAT_SIZE, 3.5, 7, '#2b2d33', '#3a3d45');
        cylinder(ctx, p.u, p.v, BOAT_SIZE - 0.03, 7, 10, shade(c, 0.78), c);
        disc(ctx, p.u, p.v, BOAT_SIZE - 0.1, 10, shade(c, 0.6));
        // A little steering wheel on the turning side.
        const w = circlePt(p.u, p.v, 0.1, b.spin);
        dot3(ctx, w.u, w.v, 12, 1.6, '#f4f4f4');
        const x = sx(p.u, p.v);
        const y = sy(p.u, p.v, 10);
        if (i * 2 < filled) rider(ctx, x - 3, y - 3, i * 2);
        if (i * 2 + 1 < filled) rider(ctx, x + 3, y - 2, i * 2 + 1);
      },
    });
  }
  // The lighthouse on its rock in the middle of the pond.
  items.push({
    n: nearness(cu, cv),
    draw: () => {
      cylinder(ctx, cu, cv, 0.3, 3, 7, '#8a8378', '#a39b8d');
      for (let k = 0; k < 4; k++) cylinder(ctx, cu, cv, 0.17 - k * 0.01, 7 + k * 8, 15 + k * 8, k % 2 ? '#f4f4f4' : '#e8503a', k % 2 ? '#ffffff' : '#f0643a');
      cylinder(ctx, cu, cv, 0.12, 39, 45, '#fff3b0', '#ffe9a8');
      cone(ctx, cu, cv, 0.16, 45, 52, ['#2a7c3c', '#3aa552']);
    },
  });
  drawSorted(items);
  fence(0.1, ey - 0.1, ex - 0.1, ey - 0.1);
  fence(ex - 0.1, 0.1, ex - 0.1, ey - 0.1);
}

// ------------------------------------------------------------------ Mini Pirate Ship (3×4, family)

const MINI_PIVOT = 50;
/** Arm length in tiles (1 tile = 32 world px, so the swing keeps its shape). */
const MINI_ARM = 1.05;

export function drawMiniPirateShip(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const ax = axes(ex, ey, st.rotation);
  const cu = ex / 2;
  const cv = ey / 2;
  const at = (l: number, c: number): { u: number; v: number } => ({ u: cu + ax.au * l + ax.cu * c, v: cv + ax.av * l + ax.cv * c });
  platform(ctx, ex, ey, '#f1e6c8', '#3f8f3a');
  // Boarding deck under the ship.
  const d0 = at(-1.0, -0.45);
  const d1 = at(1.0, 0.45);
  box(ctx, Math.min(d0.u, d1.u), Math.min(d0.v, d1.v), Math.max(d0.u, d1.u), Math.max(d0.v, d1.v), 3, 6, '#e0c39a', '#b78a55', '#9c7444');
  const theta = miniShipTheta(st.angle);
  const ct = Math.cos(theta);
  const s = Math.sin(theta);
  /** Ship point at `l` tiles along the hull and `z` px above the keel line, swung about the pivot. */
  const ship = (l: number, z: number, c: number): { u: number; v: number; h: number } => {
    const x = l * 32;
    const y = -MINI_ARM * 32 + z;
    const p = at((x * ct - y * s) / 32, c);
    return { u: p.u, v: p.v, h: MINI_PIVOT + x * s + y * ct };
  };
  const half = 0.9;
  const width = 0.32;
  const n = 10;
  const keel = (t: number): number => -9 + 7 * t * t;
  const deck = (t: number): number => 3 + 8 * t ** 4;
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
        const a = ship(t0 * half, deck(t0) - 3, c);
        const b = ship(t1 * half, deck(t1) - 3, c);
        line3(ctx, a.u, a.v, a.h, b.u, b.v, b.h, trim, 1.8);
      }
    }
  };
  const leg = (c: number, colour: string): void => {
    const top = at(0, c);
    for (const l of [-1.3, 1.3]) {
      const b = at(l, c);
      line3(ctx, b.u, b.v, 3, top.u, top.v, MINI_PIVOT, colour, 4);
    }
  };
  const arm = (c: number, colour: string): void => {
    const top = at(0, c);
    for (const l of [-0.5, 0.5]) {
      const p = ship(l, deck(l / half), c);
      line3(ctx, top.u, top.v, MINI_PIVOT, p.u, p.v, p.h, colour, 2.5);
    }
  };
  // Far A-frame and arm, the hull (far side, deck, mast and flag, riders, near side), then the near ones.
  leg(-0.8, '#2a7c3c');
  arm(-0.24, '#e9e2cf');
  side(-width, st.colour ? shade(st.colour, 0.72) : '#2f6fb5', null);
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
  // Mast and a plain two-colour pennant (no emblem).
  const foot = ship(0, deck(0), 0);
  const top = ship(0, deck(0) + 26, 0);
  line3(ctx, foot.u, foot.v, foot.h, top.u, top.v, top.h, '#7a4a2a', 2);
  const fx = sx(top.u, top.v);
  const fy = sy(top.u, top.v, top.h);
  poly2(ctx, [fx, fy, fx + 10, fy + 3, fx, fy + 6], '#f5d03b');
  poly2(ctx, [fx, fy + 3, fx + 10, fy + 3, fx, fy + 6], '#e8503a');
  const rows = 4;
  const filled = seatsFilled(rows * 4, st.occupancy);
  for (let r = 0; r < rows; r++) {
    const t = -0.72 + (1.44 * r) / (rows - 1);
    for (let k = 0; k < 2; k++) {
      const c = k === 0 ? -0.13 : 0.13;
      const p = ship(t * half, deck(t) + 1, c);
      const x = sx(p.u, p.v);
      const y = sy(p.u, p.v, p.h);
      ctx.fillStyle = '#7a3e1d';
      ctx.fillRect(x - 3, y - 2, 6, 2);
      if (r * 4 + k * 2 < filled) rider(ctx, x - 1.5, y - 4, r * 4 + k * 2);
      if (r * 4 + k * 2 + 1 < filled) rider(ctx, x + 1.5, y - 4, r * 4 + k * 2 + 1);
    }
  }
  side(width, st.colour ?? '#3d7fd0', '#f5d03b');
  // Round portholes along the near side.
  for (const t of [-0.5, 0, 0.5]) {
    const p = ship(t * half, -2, width);
    dot(ctx, sx(p.u, p.v), sy(p.u, p.v, p.h), 1.8, '#fff6ea');
  }
  arm(0.24, '#f4efe2');
  const b0 = at(0, -0.8);
  const b1 = at(0, 0.8);
  line3(ctx, b0.u, b0.v, MINI_PIVOT, b1.u, b1.v, MINI_PIVOT, '#5b4636', 3);
  leg(0.8, '#3aa552');
  const hub = at(0, 0.8);
  dot3(ctx, hub.u, hub.v, MINI_PIVOT, 3, '#ffd166');
}

// ------------------------------------------------------------------ Balloon Wheel (2×2, family)

const BALLOON_COLOURS = ['#e8503a', '#f5d03b', '#3d9be0', '#2fb39a'];
const WHEEL_HUB = 50;
const WHEEL_R = 0.68;

export function drawBalloonWheel(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  const alongX = st.rotation % 2 === 0;
  const au = alongX ? 1 : 0;
  const av = alongX ? 0 : 1;
  const pu = av;
  const pv = au;
  platform(ctx, ex, ey, '#e3f1d6', '#3f8f3a');
  box(ctx, cu - 0.75 * au - 0.3 * pu, cv - 0.75 * av - 0.3 * pv, cu + 0.75 * au + 0.3 * pu, cv + 0.75 * av + 0.3 * pv, 3, 6, '#cfe6c2', '#7fae6c', '#6a9659');
  const leg = (sd: number, colour: string): void => {
    const ou = pu * 0.3 * sd;
    const ov = pv * 0.3 * sd;
    const hu = pu * 0.1 * sd;
    const hv = pv * 0.1 * sd;
    line3(ctx, cu - au * 0.7 + ou, cv - av * 0.7 + ov, 3, cu + hu, cv + hv, WHEEL_HUB, colour, 3.5);
    line3(ctx, cu + au * 0.7 + ou, cv + av * 0.7 + ov, 3, cu + hu, cv + hv, WHEEL_HUB, colour, 3.5);
  };
  leg(-1, '#2a7c3c');
  const rimPt = (phi: number, r = WHEEL_R): { u: number; v: number; h: number } => {
    const c = Math.cos(phi);
    return { u: cu + au * r * c, v: cv + av * r * c, h: WHEEL_HUB + r * 32 * Math.sin(phi) };
  };
  const hubX = sx(cu, cv);
  const hubY = sy(cu, cv, WHEEL_HUB);
  for (let k = 0; k < BALLOON_CARS; k++) {
    const p = rimPt(TAU * (k / BALLOON_CARS + st.angle));
    line3(ctx, cu, cv, WHEEL_HUB, p.u, p.v, p.h, '#f4f4f4', 1.2);
  }
  ctx.beginPath();
  for (let k = 0; k <= 40; k++) {
    const p = rimPt((k / 40) * TAU);
    const x = sx(p.u, p.v);
    const y = sy(p.u, p.v, p.h);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#f5d03b';
  ctx.lineWidth = 2.6;
  ctx.stroke();
  // Each car hangs level from its rim pin: a balloon over a wicker basket on four cords.
  const filled = seatsFilled(BALLOON_CARS * 2, st.occupancy);
  for (let i = 0; i < BALLOON_CARS; i++) {
    const p = rimPt(TAU * (i / BALLOON_CARS + st.angle));
    const c = st.colour ?? (BALLOON_COLOURS[i % BALLOON_COLOURS.length] as string);
    const x = sx(p.u, p.v);
    const y = sy(p.u, p.v, p.h);
    ctx.fillStyle = '#5b4636';
    ctx.fillRect(x - 0.6, y, 1.2, 2);
    oval(ctx, x, y + 8, 6.5, 7, c);
    oval(ctx, x - 2, y + 6, 2, 3, shade(c, 1.25));
    poly2(ctx, [x - 3.5, y + 13.5, x + 3.5, y + 13.5, x + 2, y + 16, x - 2, y + 16], shade(c, 0.7));
    line3(ctx, p.u, p.v, p.h - 16, p.u, p.v, p.h - 19, '#5b4636', 0.8);
    if (i * 2 < filled) rider(ctx, x - 2, y + 19, i * 2);
    if (i * 2 + 1 < filled) rider(ctx, x + 2, y + 19, i * 2 + 1);
    ctx.fillStyle = '#b07a3e';
    ctx.beginPath();
    rrect(ctx, x - 4, y + 19, 8, 5, 1, 1.5);
    ctx.fill();
    ctx.fillStyle = '#8a5a2a';
    ctx.fillRect(x - 4, y + 19, 8, 1.2);
  }
  dot(ctx, hubX, hubY, 3.8, '#f4f4f4');
  dot(ctx, hubX, hubY, 1.8, '#e8503a');
  leg(1, '#3aa552');
}

// ------------------------------------------------------------------ Frog Hopper (2×2, family)

const STALK_TOP = 46;
/** Seat ring travel, world px (2.75 m). */
const HOP_TRAVEL = 22;

export function drawFrogHopper(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  platform(ctx, ex, ey, '#e3f1d6', '#3f8f3a');
  // A shallow lily pond round the foot of the stalk.
  disc(ctx, cu, cv, 0.85, 3.2, '#5fb7d9', '#3f8f3a', 1.2);
  for (const [a, r] of [[0.4, 0.62], [2.3, 0.66], [4.1, 0.6]] as const) {
    const p = circlePt(cu, cv, r, a);
    oval(ctx, sx(p.u, p.v), sy(p.u, p.v, 3.4), 4.5, 2.2, '#6dbb4f');
  }
  const hg = 6 + HOP_TRAVEL * frogShare(st.angle);
  const [rt, rl, rr] = st.colour ? [shade(st.colour, 1.15), st.colour, shade(st.colour, 0.75)] : ['#ffd166', '#f39a2b', '#c4552c'];
  const ring = (u0: number, v0: number, u1: number, v1: number): void => box(ctx, u0, v0, u1, v1, hg, hg + 5, rt, rl, rr);
  const r0 = cu - 0.46;
  const r1 = cu + 0.46;
  const q0 = cv - 0.46;
  const q1 = cv + 0.46;
  ring(r0, q0, r1, q0 + 0.12);
  ring(r0, q0, r0 + 0.12, q1);
  // The stalk: a green stem with leaves, and the lily pad with a friendly frog on top.
  cylinder(ctx, cu, cv, 0.13, 3, STALK_TOP, '#3aa552', '#4fbf63');
  for (const h of [14, 26, 38]) {
    const p = circlePt(cu, cv, 0.18, h);
    oval(ctx, sx(p.u, p.v) + (h % 2 ? 4 : -4), sy(p.u, p.v, h), 5, 2, '#2a7c3c', h % 2 ? 0.4 : -0.4);
  }
  cylinder(ctx, cu, cv, 0.42, STALK_TOP, STALK_TOP + 3, '#3f8f3a', '#6dbb4f');
  cylinder(ctx, cu, cv, 0.25, STALK_TOP + 3, STALK_TOP + 9, '#4fbf63', '#6fd07a');
  const fx = sx(cu, cv);
  const fy = sy(cu, cv, STALK_TOP + 9);
  oval(ctx, fx, fy, 7, 4, '#6fd07a');
  for (const d of [-1, 1]) {
    dot(ctx, fx + d * 4, fy - 4, 3, '#6fd07a');
    dot(ctx, fx + d * 4, fy - 4.5, 2, '#ffffff');
    dot(ctx, fx + d * 4.3, fy - 4.4, 1, '#1f1f24');
  }
  ctx.strokeStyle = '#2a7c3c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(fx, fy - 0.5, 3, 0.3, Math.PI - 0.3);
  ctx.stroke();
  // Front bars of the ring with the riders, legs dangling.
  const filled = seatsFilled(4, st.occupancy);
  const legs = (x: number, y: number): void => {
    ctx.fillStyle = '#30425a';
    ctx.fillRect(x - 2, y + 2, 1.5, 5);
    ctx.fillRect(x + 0.5, y + 2, 1.5, 5);
  };
  let k = 0;
  ring(r0, q1 - 0.12, r1, q1);
  for (let i = 0; i < 2; i++) {
    const x = sx(r0 + 0.3 + i * 0.36, q1);
    const y = sy(r0 + 0.3 + i * 0.36, q1, hg);
    if (k < filled) {
      legs(x, y);
      rider(ctx, x, y - 3, k);
    }
    k++;
  }
  ring(r1 - 0.12, q0, r1, q1);
  for (let i = 0; i < 2; i++) {
    const x = sx(r1, q0 + 0.3 + i * 0.36);
    const y = sy(r1, q0 + 0.3 + i * 0.36, hg);
    if (k < filled) {
      legs(x, y);
      rider(ctx, x, y - 3, k);
    }
    k++;
  }
}
