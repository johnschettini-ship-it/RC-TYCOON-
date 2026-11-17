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
