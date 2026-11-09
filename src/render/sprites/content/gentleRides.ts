/**
 * Owner: W2-C. Phase 3 "Gentle" flat rides (catalog §1): Bumper Cars, Rocket Rounds, Spiral Slide,
 * Observation Tower, Mirror Maze, Haunted Manor. Family rides lean green, chill rides cool (master §2.5).
 * `st.angle` (0–1 per turn, from `ride.cycle`) drives every moving part; at angle 0 the ride rests.
 * Mirror Maze and Haunted Manor are walk-through attractions: riders stay hidden (Phase 3 §4.11).
 */
import { mix32, shade } from '../../palette';
import type { RideArtState } from '../rides';
import { box, circlePt, cone, cylinder, line3, nearness, poly3, pyramid, rrect, sx, sy, type Ctx } from '../shapes';
import { TAU, dot, dot3, drawSorted, oval, platform, poly2, rider, seatsFilled, star, wave, type Item } from './kit';

// ------------------------------------------------------------------ Bumper Cars (4×4, family, covered)

const CAR_COLOURS = ['#e8503a', '#3d9be0', '#f5d03b', '#8d5ad8', '#2fb39a', '#f39a2b'];

export function drawBumperCars(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const roof = 50;
  platform(ctx, ex, ey, '#4a505c', '#2f3440');
  // Floor plates.
  for (let i = 0; i < ex; i++) {
    for (let j = 0; j < ey; j++) {
      if ((i + j) % 2) poly3(ctx, [i + 0.1, j + 0.1, 3, i + 0.9, j + 0.1, 3, i + 0.9, j + 0.9, 3, i + 0.1, j + 0.9, 3], '#555c69');
    }
  }
  const rail = (u0: number, v0: number, u1: number, v1: number): void =>
    box(ctx, u0, v0, u1, v1, 3, 8, '#f5d03b', '#d9a82c', '#c08f1e');
  const post = (u: number, v: number): void => line3(ctx, u, v, 3, u, v, roof, '#2a7c3c', 3);
  // Back rails and posts.
  rail(0.1, 0.1, ex - 0.1, 0.22);
  rail(0.1, 0.1, 0.22, ey - 0.1);
  post(0.16, 0.16);
  post(ex - 0.16, 0.16);
  post(0.16, ey - 0.16);
  // Cars on their own looping paths (whole frequencies, so a run ends where it began).
  const cars = 6;
  const filled = seatsFilled(cars, st.occupancy);
  const ru = ex / 2 - 0.7;
  const rv = ey / 2 - 0.7;
  const items: Item[] = [];
  for (let i = 0; i < cars; i++) {
    const a = st.angle;
    const u = ex / 2 + ru * Math.sin(TAU * (a * (1 + (i % 3)) + i / cars));
    const v = ey / 2 + rv * Math.sin(TAU * (a * (2 - (i % 2)) + i / cars + 0.25));
    const c = CAR_COLOURS[i] as string;
    items.push({
      n: nearness(u, v),
      draw: () => {
        cylinder(ctx, u, v, 0.3, 3, 7, '#26282e', '#3a3d45');
        cylinder(ctx, u, v, 0.25, 7, 11, shade(c, 0.8), c);
        const x = sx(u, v);
        const y = sy(u, v, 11);
        ctx.fillStyle = shade(c, 0.6);
        ctx.beginPath();
        rrect(ctx, x - 5, y - 6, 10, 5, 2, 0);
        ctx.fill();
        line3(ctx, u + 0.08, v - 0.08, 11, u + 0.08, v - 0.08, roof, '#7a808c', 1.2);
        if (i < filled) rider(ctx, x, y - 4, i);
        // Spark where the pole meets the ceiling.
        if (((mix32(i * 31 + Math.floor(st.angle * 32)) >>> 3) & 3) === 0) {
          star(ctx, sx(u + 0.08, v - 0.08), sy(u + 0.08, v - 0.08, roof), 4, 1.5, 4, '#fff3b0');
        }
      },
    });
  }
  drawSorted(items);
  // Front rails and post.
  rail(0.1, ey - 0.22, ex - 0.1, ey - 0.1);
  rail(ex - 0.22, 0.1, ex - 0.1, ey - 0.1);
  post(ex - 0.16, ey - 0.16);
  // Ceiling grid (thin, so the cars stay visible) and a striped valance on the front edges.
  for (let k = 0; k <= 4; k++) {
    const f = k / 4;
    line3(ctx, 0.16 + f * (ex - 0.32), 0.16, roof, 0.16 + f * (ex - 0.32), ey - 0.16, roof, 'rgba(40,60,50,0.55)', 1);
    line3(ctx, 0.16, 0.16 + f * (ey - 0.32), roof, ex - 0.16, 0.16 + f * (ey - 0.32), roof, 'rgba(40,60,50,0.55)', 1);
  }
  const stripes = 8;
  for (let k = 0; k < stripes; k++) {
    const c = k % 2 ? '#fff6ea' : '#4fbf63';
    const a0 = 0.1 + (k / stripes) * (ex - 0.2);
    const a1 = 0.1 + ((k + 1) / stripes) * (ex - 0.2);
    poly3(ctx, [a0, ey - 0.1, roof - 2, a1, ey - 0.1, roof - 2, a1, ey - 0.1, roof + 8, a0, ey - 0.1, roof + 8], c);
    const b0 = 0.1 + (k / stripes) * (ey - 0.2);
    const b1 = 0.1 + ((k + 1) / stripes) * (ey - 0.2);
    poly3(ctx, [ex - 0.1, b0, roof - 2, ex - 0.1, b1, roof - 2, ex - 0.1, b1, roof + 8, ex - 0.1, b0, roof + 8], shade(c, 0.85));
  }
  // Bulbs along the valance.
  for (let k = 0; k <= 8; k++) {
    const on = (k + Math.floor(st.angle * 16)) % 2 === 0;
    dot3(ctx, 0.1 + (k / 8) * (ex - 0.2), ey - 0.1, roof + 8, 1.6, on ? '#fff3b0' : '#f5d03b');
    dot3(ctx, ex - 0.1, 0.1 + (k / 8) * (ey - 0.2), roof + 8, 1.6, on ? '#f5d03b' : '#fff3b0');
  }
}

// ------------------------------------------------------------------ Rocket Rounds (3×3, family)

const ROCKET_COLOURS = ['#e8503a', '#3d9be0', '#f5d03b', '#8d5ad8', '#2fb39a', '#f39a2b'];

function rocket(ctx: Ctx, x: number, y: number, dx: number, dy: number, colour: string, occupied: boolean, k: number): void {
  // Body along the screen direction (dx, dy) (unit vector).
  const len = 9;
  const wid = 4.2;
  const px = -dy;
  const py = dx;
  const tailX = x - dx * len;
  const tailY = y - dy * len;
  const noseX = x + dx * (len + 6);
  const noseY = y + dy * (len + 6);
  // Fins at the tail.
  poly2(ctx, [tailX + px * wid, tailY + py * wid, tailX + px * (wid + 4) - dx * 3, tailY + py * (wid + 4) - dy * 3, tailX + dx * 4 + px * wid, tailY + dy * 4 + py * wid], shade(colour, 0.6));
  poly2(ctx, [tailX - px * wid, tailY - py * wid, tailX - px * (wid + 4) - dx * 3, tailY - py * (wid + 4) - dy * 3, tailX + dx * 4 - px * wid, tailY + dy * 4 - py * wid], shade(colour, 0.6));
  poly2(
    ctx,
    [tailX + px * wid, tailY + py * wid, x + dx * len + px * wid, y + dy * len + py * wid, x + dx * len - px * wid, y + dy * len - py * wid, tailX - px * wid, tailY - py * wid],
    colour,
  );
  poly2(ctx, [x + dx * len + px * wid, y + dy * len + py * wid, noseX, noseY, x + dx * len - px * wid, y + dy * len - py * wid], '#f2f2f2');
  dot(ctx, x + dx * 3, y + dy * 3 - 1, 1.8, '#bfe8ff');
  // Flame at the tail.
  poly2(ctx, [tailX + px * 2, tailY + py * 2, tailX - dx * 6, tailY - dy * 6, tailX - px * 2, tailY - py * 2], '#ffb36b');
  if (occupied) rider(ctx, x - dx * 2, y - dy * 2 - 4, k);
}

export function drawRocketRounds(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  platform(ctx, ex, ey, '#d8f0dc', '#2a7c3c');
  cylinder(ctx, cu, cv, 1.35, 3, 7, '#2a7c3c', '#4fbf63');
  for (let k = 0; k < 8; k++) {
    const p = circlePt(cu, cv, 1.05, (k / 8) * TAU + 0.2);
    star(ctx, sx(p.u, p.v), sy(p.u, p.v, 7), 3.2, 1.3, 5, '#fff3b0');
  }
  const hub = 58;
  const rockets = 6;
  const filled = seatsFilled(rockets, st.occupancy);
  const lift = Math.sin(Math.PI * st.angle) ** 2;
  const items: Item[] = [];
  for (let i = 0; i < rockets; i++) {
    const th = TAU * (i / rockets + st.angle);
    const p = circlePt(cu, cv, 1.1, th);
    const h = 16 + 26 * lift + 3 * Math.sin(TAU * (st.angle * 3 + i / 3)) * lift;
    // Screen direction of travel (tangent of the circle).
    const tu = -Math.sin(th);
    const tv = Math.cos(th);
    let dx = (tu - tv) * 32;
    let dy = (tu + tv) * 16;
    const m = Math.hypot(dx, dy) || 1;
    dx /= m;
    dy /= m;
    items.push({
      n: nearness(p.u, p.v),
      draw: () => {
        line3(ctx, cu, cv, hub, p.u, p.v, h + 4, '#7a8a96', 2);
        rocket(ctx, sx(p.u, p.v), sy(p.u, p.v, h), dx, dy, ROCKET_COLOURS[i] as string, i < filled, i);
      },
    });
  }
  items.push({
    n: nearness(cu, cv),
    draw: () => {
      cylinder(ctx, cu, cv, 0.24, 7, hub + 6, '#f2f2f2', '#ffffff');
      for (let k = 0; k < 3; k++) cylinder(ctx, cu, cv, 0.245, 16 + k * 16, 22 + k * 16, '#e8503a', '#f06a52');
      cylinder(ctx, cu, cv, 0.4, hub - 2, hub + 4, '#2fb39a', '#7fe0c8');
      // Planet on top with a ring.
      const x = sx(cu, cv);
      const y = sy(cu, cv, hub + 20);
      line3(ctx, cu, cv, hub + 4, cu, cv, hub + 12, '#7a8a96', 2);
      oval(ctx, x, y + 1, 15, 4.5, '#f5d03b', -0.25);
      dot(ctx, x, y, 9, '#8d5ad8');
      dot(ctx, x - 3, y - 3, 3, '#b48bea');
      ctx.beginPath();
      ctx.ellipse(x, y + 1, 15, 4.5, -0.25, 0.1, Math.PI - 0.1);
      ctx.strokeStyle = '#f5d03b';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    },
  });
  drawSorted(items);
}

// ------------------------------------------------------------------ Spiral Slide (2×2, chill)

export function drawSpiralSlide(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  const top = 74;
  const bottom = 6;
  const turns = 2.25;
  const segs = 54;
  const r0 = 0.42;
  const r1 = 0.82;
  platform(ctx, ex, ey, '#dff2f7', '#20628a');
  // Run-out mat toward the front.
  poly3(ctx, [cu + 0.3, ey - 0.75, 3.5, cu + 0.85, ey - 0.75, 3.5, cu + 0.85, ey - 0.12, 3.5, cu + 0.3, ey - 0.12, 3.5], '#9bd8f0');
  const items: Item[] = [];
  const start = Math.PI * 0.25; // the slide ends facing the front
  const angleAt = (s: number): number => start - turns * TAU * (1 - s);
  const hAt = (s: number): number => bottom + (top - bottom) * (1 - s);
  for (let k = 0; k < segs; k++) {
    const s0 = k / segs;
    const s1 = (k + 1) / segs;
    const a0 = angleAt(s0);
    const a1 = angleAt(s1);
    const h0 = hAt(s0);
    const h1 = hAt(s1);
    const i0 = circlePt(cu, cv, r0, a0);
    const o0 = circlePt(cu, cv, r1, a0);
    const i1 = circlePt(cu, cv, r0, a1);
    const o1 = circlePt(cu, cv, r1, a1);
    const mid = circlePt(cu, cv, (r0 + r1) / 2, (a0 + a1) / 2);
    const colour = k % 2 ? '#e8f7ff' : '#3fa7d6';
    items.push({
      n: nearness(mid.u, mid.v),
      draw: () => {
        poly3(ctx, [o0.u, o0.v, h0, o1.u, o1.v, h1, o1.u, o1.v, h1 - 4, o0.u, o0.v, h0 - 4], '#8d5ad8');
        poly3(ctx, [i0.u, i0.v, h0, o0.u, o0.v, h0, o1.u, o1.v, h1, i1.u, i1.v, h1], colour);
      },
    });
  }
  // Riders on mats, spread down the slide.
  const filled = seatsFilled(4, st.occupancy);
  for (let i = 0; i < filled; i++) {
    const s = (st.angle * 2 + i / 4) % 1;
    const a = angleAt(s);
    const p = circlePt(cu, cv, (r0 + r1) / 2, a);
    const h = hAt(s);
    items.push({
      n: nearness(p.u, p.v) + 0.01,
      draw: () => {
        const x = sx(p.u, p.v);
        const y = sy(p.u, p.v, h);
        oval(ctx, x, y - 1, 5, 2.5, ['#f5d03b', '#e8503a', '#2fb39a', '#f39a2b'][i] as string);
        rider(ctx, x, y - 5, i + 3);
      },
    });
  }
  const centre = nearness(cu, cv);
  drawSorted(items.filter((it) => it.n < centre));
  // Tower with a window band, then the hut on top.
  cylinder(ctx, cu, cv, r0, 3, top + 4, '#f4fbff', '#ffffff');
  for (let k = 0; k < 4; k++) cylinder(ctx, cu, cv, r0 + 0.005, 10 + k * 18, 14 + k * 18, '#3fa7d6', '#3fa7d6');
  const door = circlePt(cu, cv, r0, Math.PI / 4);
  ctx.fillStyle = '#20628a';
  ctx.beginPath();
  rrect(ctx, sx(door.u, door.v) - 4, sy(door.u, door.v, 3) - 12, 8, 12, 4, 0);
  ctx.fill();
  cylinder(ctx, cu, cv, 0.5, top + 4, top + 14, '#8d5ad8', '#b48bea');
  cone(ctx, cu, cv, 0.56, top + 14, top + 34, ['#3fa7d6', '#e8f7ff'], 12);
  line3(ctx, cu, cv, top + 34, cu, cv, top + 42, '#20628a', 1.5);
  poly2(ctx, [sx(cu, cv), sy(cu, cv, top + 42), sx(cu, cv) + 8, sy(cu, cv, top + 40), sx(cu, cv), sy(cu, cv, top + 37)], '#9bd8f0');
  drawSorted(items.filter((it) => it.n >= centre));
}

// ------------------------------------------------------------------ Observation Tower (2×2, chill, tall, covered)

export function drawObservationTower(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  const mast = 176;
  platform(ctx, ex, ey, '#dfe8f0', '#55657a');
  cylinder(ctx, cu, cv, 0.8, 3, 10, '#3f5f80', '#9bb8d6');
  cylinder(ctx, cu, cv, 0.17, 10, mast, '#e9eef5', '#ffffff');
  for (let k = 0; k < 6; k++) cylinder(ctx, cu, cv, 0.175, 24 + k * 26, 30 + k * 26, '#3fa7d6', '#9bd8f0');
  // The ring cabin rides up and down the mast.
  const hc = 12 + (mast - 50) * wave(st.angle);
  const cabin = 18;
  cylinder(ctx, cu, cv, 0.72, hc, hc + 3, '#20628a', '#3f78a6');
  cylinder(ctx, cu, cv, 0.7, hc + 3, hc + cabin, '#9bd8f0', '#cfeefa');
  // Window mullions on the visible half; riders behind the glass.
  const filled = seatsFilled(8, st.occupancy);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    if (Math.cos(a) + Math.sin(a) < -0.2) continue;
    const p = circlePt(cu, cv, 0.7, a);
    line3(ctx, p.u, p.v, hc + 3, p.u, p.v, hc + cabin, '#20628a', 1.2);
  }
  for (let i = 0; i < filled; i++) {
    const a = (i / 8) * TAU * 0.5 - Math.PI / 4 + Math.PI / 2 + 0.2;
    const p = circlePt(cu, cv, 0.62, a);
    rider(ctx, sx(p.u, p.v), sy(p.u, p.v, hc + 9), i);
  }
  cylinder(ctx, cu, cv, 0.76, hc + cabin, hc + cabin + 4, '#20628a', '#3fa7d6');
  // Mast above the cabin roof, then the beacon crown.
  cylinder(ctx, cu, cv, 0.17, hc + cabin + 4, mast, '#e9eef5', '#ffffff');
  cylinder(ctx, cu, cv, 0.34, mast, mast + 6, '#20628a', '#3fa7d6');
  cone(ctx, cu, cv, 0.3, mast + 6, mast + 22, ['#3fa7d6', '#e8f7ff'], 8);
  const bx = sx(cu, cv);
  const by = sy(cu, cv, mast + 24);
  dot(ctx, bx, by, 3.2, Math.floor(st.angle * 8) % 2 ? '#e8f7ff' : '#9bd8f0');
}

// ------------------------------------------------------------------ Mirror Maze (3×3, chill, covered, walk-through)

export function drawMirrorMaze(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  const wall = 34;
  platform(ctx, ex, ey, '#e3ecf5', '#55657a');
  const u0 = 0.3;
  const v0 = 0.3;
  const u1 = ex - 0.3;
  const v1 = ey - 0.3;
  box(ctx, u0, v0, u1, v1, 3, wall, '#e8f7ff', '#a9cbe3', '#86aecb');
  // Moving sheen across the mirror walls.
  const sweep = (st.angle * 2) % 1;
  for (let k = 0; k < 3; k++) {
    const f = (sweep + k / 3) % 1;
    const a = u0 + f * (u1 - u0);
    const b = Math.min(u1, a + 0.22);
    poly3(ctx, [a, v1, 6, b, v1, 6, Math.min(u1, b + 0.25), v1, wall - 3, Math.min(u1, a + 0.25), v1, wall - 3], 'rgba(255,255,255,0.75)');
    const c = v0 + f * (v1 - v0);
    const d = Math.min(v1, c + 0.22);
    poly3(ctx, [u1, c, 6, u1, d, 6, u1, Math.min(v1, d + 0.25), wall - 3, u1, Math.min(v1, c + 0.25), wall - 3], 'rgba(255,255,255,0.6)');
  }
  // Panel seams.
  for (let k = 1; k < 4; k++) {
    const f = k / 4;
    line3(ctx, u0 + f * (u1 - u0), v1, 3, u0 + f * (u1 - u0), v1, wall, '#6f93b3', 1);
    line3(ctx, u1, v0 + f * (v1 - v0), 3, u1, v0 + f * (v1 - v0), wall, '#6f93b3', 1);
  }
  // Maze pattern on the roof.
  const n = 5;
  const cell = (u1 - u0) / n;
  const celv = (v1 - v0) / n;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const m = mix32(i * 17 + j * 131 + 7);
      const a = u0 + i * cell;
      const b = v0 + j * celv;
      if (i < n && (m & 1) && j > 0 && j < n) line3(ctx, a, b, wall, a + cell, b, wall, '#4f63d9', 2);
      if (j < n && (m & 2) && i > 0 && i < n) line3(ctx, a, b, wall, a, b + celv, wall, '#4f63d9', 2);
    }
  }
  line3(ctx, u0, v0, wall, u1, v0, wall, '#4f63d9', 2);
  line3(ctx, u0, v0, wall, u0, v1, wall, '#4f63d9', 2);
  line3(ctx, u1, v0, wall, u1, v1, wall, '#4f63d9', 2);
  line3(ctx, u0, v1, wall, u1, v1, wall, '#4f63d9', 2);
  // Doorway on the visible face nearest the entrance (east when the front faces east).
  const east = st.rotation === 3;
  const dx = east ? sx(u1, cv) : sx(cu, v1);
  const dy = east ? sy(u1, cv, 3) : sy(cu, v1, 3);
  ctx.fillStyle = '#20628a';
  ctx.beginPath();
  rrect(ctx, dx - 7, dy - 18, 14, 18, 7, 0);
  ctx.fill();
  // A turning crystal on a stand above the roof.
  line3(ctx, cu, cv, wall, cu, cv, wall + 14, '#86aecb', 2.5);
  const x = sx(cu, cv);
  const y = sy(cu, cv, wall + 32);
  const w = 11 * (0.45 + 0.55 * Math.abs(Math.cos(TAU * st.angle)));
  poly2(ctx, [x, y - 18, x + w, y, x, y + 16, x - w, y], '#9bd8f0');
  poly2(ctx, [x, y - 18, x + w, y, x, y], '#e8f7ff');
  poly2(ctx, [x, y + 16, x - w, y, x, y], '#3fa7d6');
  poly2(ctx, [x, y - 18, x - w * 0.4, y, x, y + 16], 'rgba(141,90,216,0.55)');
  for (let k = 0; k < 4; k++) {
    const a = TAU * (k / 4 + st.angle);
    star(ctx, x + 19 * Math.cos(a), y + 9 * Math.sin(a), 3.6, 1.2, 4, '#ffffff');
  }
}

// ------------------------------------------------------------------ Haunted Manor (4×4, chill, covered, spooky, walk-through)

function windowGlow(ctx: Ctx, pts: readonly number[], lit: boolean): void {
  poly3(ctx, pts, lit ? '#e9f58a' : '#3a2f52');
}

export function drawHauntedManor(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  platform(ctx, ex, ey, '#4f6a4a', '#33402f');
  // The door, its path, and the fence gap face the entrance when it is on a visible side (S or E).
  const east = st.rotation === 3;
  const cu = ex / 2;
  const cv = ey / 2;
  if (east) poly3(ctx, [ex - 0.5, cv - 0.3, 3.5, ex - 0.1, cv - 0.3, 3.5, ex - 0.1, cv + 0.3, 3.5, ex - 0.5, cv + 0.3, 3.5], '#8a7f6a');
  else poly3(ctx, [cu - 0.3, ey - 0.6, 3.5, cu + 0.3, ey - 0.6, 3.5, cu + 0.3, ey - 0.1, 3.5, cu - 0.3, ey - 0.1, 3.5], '#8a7f6a');
  const u0 = 0.45;
  const v0 = 0.5;
  const u1 = ex - 0.45;
  const v1 = ey - 0.6;
  const wall = 44;
  const flick = Math.floor(st.angle * 32);
  // Side tower at the back-right corner (drawn first: it stands behind the house front).
  const tu = u1 - 0.35;
  const tv = v0 + 0.35;
  cylinder(ctx, tu, tv, 0.42, 3, wall + 26, '#4a3c68', '#5b4a7a');
  cone(ctx, tu, tv, 0.55, wall + 26, wall + 62, ['#2f2747', '#3b3159'], 10);
  dot3(ctx, tu + 0.3, tv + 0.3, wall + 10, 3.2, (flick + 1) % 5 ? '#e9f58a' : '#3a2f52');
  box(ctx, u0, v0, u1, v1, 3, wall, '#5b4a7a', '#4a3c68', '#3b3159');
  pyramid(ctx, u0 - 0.1, v0 - 0.1, u1 + 0.1, v1 + 0.1, wall, wall + 30, '#2f2747', '#3b3159', '#2a2240');
  // Crooked windows on the two visible faces; some flicker.
  const cols = 3;
  for (let k = 0; k < cols; k++) {
    const a = u0 + ((k + 0.5) / cols) * (u1 - u0);
    const lit = (mix32(k * 13 + flick) & 7) !== 0;
    windowGlow(ctx, [a - 0.17, v1, 22, a + 0.15, v1, 23, a + 0.17, v1, 36, a - 0.15, v1, 35], lit);
    const b = v0 + ((k + 0.5) / cols) * (v1 - v0);
    const lit2 = (mix32(k * 29 + flick + 3) & 7) !== 0;
    windowGlow(ctx, [u1, b - 0.16, 22, u1, b + 0.16, 23, u1, b + 0.16, 36, u1, b - 0.16, 35], lit2);
  }
  // Arched door with a soft glow.
  const dx = east ? sx(u1, cv) : sx(cu, v1);
  const dy = east ? sy(u1, cv, 3) : sy(cu, v1, 3);
  ctx.fillStyle = '#2a2240';
  ctx.beginPath();
  rrect(ctx, dx - 8, dy - 18, 16, 18, 8, 0);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,140,255,0.55)';
  ctx.beginPath();
  rrect(ctx, dx - 5, dy - 14, 10, 14, 5, 0);
  ctx.fill();
  // A friendly ghost bobs out from behind the roof.
  const rise = wave(st.angle);
  const gx = sx(cu - 0.4, ey / 2 - 0.4) - 10 + 8 * Math.sin(TAU * st.angle * 2);
  const gy = sy(cu - 0.4, ey / 2 - 0.4, wall + 30 + 24 * rise);
  ctx.fillStyle = '#f7f4ff';
  ctx.beginPath();
  ctx.arc(gx, gy, 8, Math.PI, 0);
  ctx.lineTo(gx + 8, gy + 9);
  for (let k = 0; k < 4; k++) {
    const x0 = gx + 8 - (k + 0.5) * 4;
    ctx.quadraticCurveTo(x0, gy + (k % 2 ? 12 : 6), gx + 8 - (k + 1) * 4, gy + 9);
  }
  ctx.closePath();
  ctx.fill();
  dot(ctx, gx - 3, gy - 1, 1.6, '#2a2240');
  dot(ctx, gx + 3, gy - 1, 1.6, '#2a2240');
  oval(ctx, gx, gy + 3.5, 1.8, 1.2, '#b48bea');
  // Fence posts along the door side, with a gap at the path.
  const len = east ? ey : ex;
  const mid = len / 2;
  const fence = (a: number): { u: number; v: number } => (east ? { u: ex - 0.12, v: a } : { u: a, v: ey - 0.12 });
  for (let k = 0; k <= 8; k++) {
    const a = 0.15 + (k / 8) * (len - 0.3);
    if (Math.abs(a - mid) < 0.4) continue;
    const p = fence(a);
    line3(ctx, p.u, p.v, 3, p.u, p.v, 13, '#2a2240', 2);
  }
  for (const [a0, a1] of [
    [0.15, mid - 0.4],
    [mid + 0.4, len - 0.15],
  ] as const) {
    const p = fence(a0);
    const q = fence(a1);
    line3(ctx, p.u, p.v, 10, q.u, q.v, 10, '#2a2240', 1.5);
  }
  // Pumpkin by the door.
  const px = dx + 16;
  const py = dy + 2;
  oval(ctx, px, py, 5, 4, '#f39a2b');
  ctx.fillStyle = '#5b8a3a';
  ctx.fillRect(px - 0.8, py - 6, 1.6, 3);
  poly2(ctx, [px - 2.5, py - 1, px - 1, py - 2.5, px + 0.5, py - 1], '#3a2f52');
  // Roof finial.
  line3(ctx, (u0 + u1) / 2, (v0 + v1) / 2, wall + 30, (u0 + u1) / 2, (v0 + v1) / 2, wall + 36, shade('#2f2747', 0.7), 2);
}
