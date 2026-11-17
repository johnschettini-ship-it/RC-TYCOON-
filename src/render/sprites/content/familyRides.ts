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
