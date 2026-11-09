/**
 * Owner: W4-D. Phase 6 flat rides (phase-6-polish.md §4.5, catalog §1): Magic Carpet (4×3, thrill), Kiddie Cars (3×3,
 * family), Merry Mill (3×3, chill windmill ride), Gyro Globe (3×3, thrill, tall). Original shapes in flat colours:
 * thrill rides warm, the family ride green, the chill ride cool (master §2.5). `st.angle` (0–1 per turn, from
 * `ride.cycle`) drives every moving part; at angle 0 each ride rests in its loading pose. Same local coordinates as
 * `../shapes.ts`; no canvas transforms, no randomness, no time: same inputs, same pixels.
 */
import { mix32, shade } from '../../palette';
import type { RideArtState } from '../rides';
import { box, circlePt, cone, cylinder, disc, line3, nearness, poly3, sx, sy, type Ctx } from '../shapes';
import { TAU, axes, dot, dot3, drawSorted, line2, oval, platform, poly2, rider, seatsFilled, star, type Item } from './kit';

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

// ------------------------------------------------------------------ Magic Carpet (4×3, thrill)

const CARPET_PIVOT = 66;
/** Arm length in tiles (1 tile = 32 world px of height). */
const CARPET_ARM = 1.12;
const CARPET_HALF = 1.15;
const CARPET_WIDTH = 0.42;
const CARPET_COLOURS = ['#c43a2a', '#f39a2b', '#ffd166', '#e8503a'];

export function drawMagicCarpet(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const f = frameOf(ex, ey, st.rotation);
  platform(ctx, ex, ey, '#f6dcc4', '#a8321c');
  // The carpet stays level while two arms carry it round the axle.
  const phi = TAU * st.angle;
  const off = CARPET_ARM * Math.sin(phi);
  const hc = CARPET_PIVOT - CARPET_ARM * 32 * Math.cos(phi);
  /** A tower at `l`: two legs spread across the ride meeting at the axle. */
  const tower = (l: number, colour: string): void => {
    const top = at(f, l, 0);
    for (const c of [-0.95, 0.95]) {
      const b = at(f, l, c);
      line3(ctx, b.u, b.v, 3, top.u, top.v, CARPET_PIVOT, colour, 5);
    }
    const m0 = at(f, l, -0.5);
    const m1 = at(f, l, 0.5);
    line3(ctx, m0.u, m0.v, 34, m1.u, m1.v, 34, shade(colour, 0.8), 2.5);
    dot3(ctx, top.u, top.v, CARPET_PIVOT, 4.5, '#ffd166');
  };
  const arm = (l: number, colour: string): void => {
    const p = at(f, l, 0);
    const q = at(f, l, off);
    line3(ctx, p.u, p.v, CARPET_PIVOT, q.u, q.v, hc, '#5b2b18', 6);
    line3(ctx, p.u, p.v, CARPET_PIVOT, q.u, q.v, hc, colour, 3.5);
  };
  const corner = (l: number, c: number, h: number): number[] => {
    const p = at(f, l, off + c);
    return [p.u, p.v, h];
  };
  // Far tower and arm first: the −l end is farther when the long axis points away from the viewer.
  const farSign = f.au + f.av > 0 ? -1 : 1;
  tower(farSign * 1.6, '#c4552c');
  arm(farSign * 1.05, '#f39a2b');
  const a0 = at(f, -1.6, 0);
  const a1 = at(f, 1.6, 0);
  line3(ctx, a0.u, a0.v, CARPET_PIVOT, a1.u, a1.v, CARPET_PIVOT, '#5b4636', 4);
  // Underside, then the patterned top in stripes along the carpet, then the fringe.
  poly3(ctx, [...corner(-CARPET_HALF, -CARPET_WIDTH, hc - 3), ...corner(CARPET_HALF, -CARPET_WIDTH, hc - 3), ...corner(CARPET_HALF, CARPET_WIDTH, hc - 3), ...corner(-CARPET_HALF, CARPET_WIDTH, hc - 3)], '#7a1f12');
  const stripes = 8;
  for (let k = 0; k < stripes; k++) {
    const l0 = -CARPET_HALF + (2 * CARPET_HALF * k) / stripes;
    const l1 = -CARPET_HALF + (2 * CARPET_HALF * (k + 1)) / stripes;
    poly3(ctx, [...corner(l0, -CARPET_WIDTH, hc), ...corner(l1, -CARPET_WIDTH, hc), ...corner(l1, CARPET_WIDTH, hc), ...corner(l0, CARPET_WIDTH, hc)], CARPET_COLOURS[k % CARPET_COLOURS.length] as string);
  }
  // A diamond in the middle and tassels on both short ends.
  poly3(ctx, [...corner(-0.4, 0, hc + 0.2), ...corner(0, -0.3, hc + 0.2), ...corner(0.4, 0, hc + 0.2), ...corner(0, 0.3, hc + 0.2)], '#fff3b0');
  for (const end of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const p = at(f, end * (CARPET_HALF + 0.08), off - CARPET_WIDTH + (k * 2 * CARPET_WIDTH) / 4);
      dot3(ctx, p.u, p.v, hc - 1, 1.8, '#ffd166');
    }
  }
  // Riders in two rows facing out across the carpet.
  const seats = 10;
  const filled = seatsFilled(seats, st.occupancy);
  const items: Item[] = [];
  for (let k = 0; k < seats; k++) {
    const row = k % 2 === 0 ? -0.2 : 0.2;
    const l = -0.9 + (1.8 * Math.floor(k / 2)) / 4;
    const p = at(f, l, off + row);
    items.push({
      n: nearness(p.u, p.v),
      draw: () => {
        const x = sx(p.u, p.v);
        const y = sy(p.u, p.v, hc + 1);
        ctx.fillStyle = '#5b2b18';
        ctx.fillRect(x - 3, y - 4, 6, 4);
        if (k < filled) rider(ctx, x, y - 6, k);
      },
    });
  }
  drawSorted(items);
  arm(-farSign * 1.05, '#ffd166');
  tower(-farSign * 1.6, '#f39a2b');
  // A spark star on the near axle cap.
  const cap = at(f, -farSign * 1.6, 0);
  star(ctx, sx(cap.u, cap.v), sy(cap.u, cap.v, CARPET_PIVOT), 6, 2.5, 5, '#fff3b0', phi);
}

// ------------------------------------------------------------------ Kiddie Cars (3×3, family)

const KIDDIE_CARS = ['#e8503a', '#3d9be0', '#f5d03b', '#8d5ad8'];

export function drawKiddieCars(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  platform(ctx, ex, ey, '#d9f2c9', '#3f8f3a');
  // A round road with a dashed lane mark round a grassy island.
  disc(ctx, cu, cv, 1.28, 3, '#4a505a');
  disc(ctx, cu, cv, 1.28, 3, '', '#f4f4f4', 1.5);
  for (let k = 0; k < 16; k += 2) {
    const a0 = (k / 16) * TAU;
    const a1 = ((k + 1) / 16) * TAU;
    const p0 = circlePt(cu, cv, 0.98, a0);
    const p1 = circlePt(cu, cv, 0.98, a1);
    line3(ctx, p0.u, p0.v, 3.2, p1.u, p1.v, 3.2, '#f2f2f2', 1.2);
  }
  disc(ctx, cu, cv, 0.66, 4, '#6dbb4f', '#3f8f3a', 1.5);
  // Little cars driving round; the far ones first, then the hub, then the near ones.
  const cars = 4;
  const filled = seatsFilled(cars * 3, st.occupancy);
  const back: Item[] = [];
  const front: Item[] = [];
  for (let i = 0; i < cars; i++) {
    const a = TAU * st.angle + (i / cars) * TAU;
    const p = circlePt(cu, cv, 0.98, a);
    const c = KIDDIE_CARS[i] as string;
    const item: Item = {
      n: nearness(p.u, p.v),
      draw: () => {
        box(ctx, p.u - 0.17, p.v - 0.17, p.u + 0.17, p.v + 0.17, 3, 10, shade(c, 1.15), c, shade(c, 0.75));
        // Wheels and a headlight toward the direction of travel.
        dot3(ctx, p.u - 0.17, p.v + 0.12, 4, 2.2, '#26282e');
        dot3(ctx, p.u + 0.12, p.v - 0.17, 4, 2.2, '#26282e');
        const t = circlePt(p.u, p.v, 0.18, a + Math.PI / 2);
        dot3(ctx, t.u, t.v, 8, 1.6, '#fff3b0');
        const x = sx(p.u, p.v);
        const y = sy(p.u, p.v, 10);
        if (i * 3 < filled) rider(ctx, x, y - 3, i);
      },
    };
    (item.n < nearness(cu, cv) ? back : front).push(item);
  }
  drawSorted(back);
  // Hub: a striped pole with a round canopy and a flag.
  cylinder(ctx, cu, cv, 0.12, 4, 44, '#f4f4f4', '#e8503a');
  for (let k = 0; k < 4; k++) cylinder(ctx, cu, cv, 0.125, 8 + k * 10, 13 + k * 10, '#2fb39a', '#2fb39a');
  cone(ctx, cu, cv, 0.5, 44, 58, ['#4fbf63', '#ffffff', '#f5d03b', '#ffffff']);
  line3(ctx, cu, cv, 58, cu, cv, 70, '#5b4636', 1.4);
  const fx = sx(cu, cv);
  const fy = sy(cu, cv, 70);
  poly2(ctx, [fx, fy, fx + 9, fy + 2.5, fx, fy + 5], KIDDIE_CARS[Math.floor(st.angle * 8) % KIDDIE_CARS.length] as string);
  drawSorted(front);
  // A low picket fence on the two near edges.
  for (let k = 0; k <= 6; k++) {
    const t = 0.1 + ((ex - 0.2) * k) / 6;
    line3(ctx, t, ey - 0.1, 3, t, ey - 0.1, 10, '#ffffff', 1.4);
    const s = 0.1 + ((ey - 0.2) * k) / 6;
    line3(ctx, ex - 0.1, s, 3, ex - 0.1, s, 10, '#ffffff', 1.4);
  }
  line3(ctx, 0.1, ey - 0.1, 9, ex - 0.1, ey - 0.1, 9, '#ffffff', 1.2);
  line3(ctx, ex - 0.1, 0.1, 9, ex - 0.1, ey - 0.1, 9, '#ffffff', 1.2);
}

// ------------------------------------------------------------------ Merry Mill (3×3, chill windmill ride)

const MILL_HUB = 72;
/** Sail length in tiles of the screen-parallel plane. */
const MILL_SAIL = 1.05;

export function drawMerryMill(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  platform(ctx, ex, ey, '#dfeaf7', '#3b5f9a');
  // Stone ring path and the tower: a tapering octagon-like drum with a violet cap.
  disc(ctx, cu, cv, 1.25, 3.5, '#c9d6ea', '#8ea4c8', 1.2);
  cylinder(ctx, cu, cv, 0.42, 3, 30, '#3aa6b9', '#58c0d1');
  cylinder(ctx, cu, cv, 0.36, 30, 58, '#3394a6', '#4fb3c4');
  cylinder(ctx, cu, cv, 0.3, 58, 76, '#2d8496', '#46a8b9');
  // Windows and a door on the visible faces.
  for (const h of [18, 44]) {
    dot3(ctx, cu + 0.2, cv + 0.32, h, 2.6, '#f4f8ff');
    dot3(ctx, cu + 0.32, cv + 0.2, h + 8, 2.6, '#f4f8ff');
  }
  poly3(ctx, [cu + 0.12, cv + 0.42, 3, cu + 0.3, cv + 0.32, 3, cu + 0.3, cv + 0.32, 16, cu + 0.12, cv + 0.42, 16], '#28455e');
  cone(ctx, cu, cv, 0.4, 76, 98, ['#6f5bd6', '#8d7ae8']);
  // Sails turn in the plane facing the viewer, in front of the tower; a gondola hangs level from each tip.
  const hu = cu + 0.36;
  const hv = cv + 0.36;
  const k = Math.SQRT1_2;
  const tip = (theta: number, r: number): { u: number; v: number; h: number } => ({
    u: hu + r * Math.cos(theta) * k,
    v: hv - r * Math.cos(theta) * k,
    h: MILL_HUB + r * 32 * Math.sin(theta),
  });
  const spin = -TAU * st.angle;
  const seats = 4;
  const filled = seatsFilled(seats * 2, st.occupancy);
  for (let i = 0; i < 4; i++) {
    const theta = spin + (i / 4) * TAU + Math.PI / 4;
    const a = tip(theta, 0.12);
    const b = tip(theta, MILL_SAIL);
    const side = tip(theta + 0.22, MILL_SAIL * 0.92);
    const side0 = tip(theta + 0.5, 0.3);
    // A lattice blade: white cloth between the spar and a side rail.
    poly3(ctx, [a.u, a.v, a.h, b.u, b.v, b.h, side.u, side.v, side.h, side0.u, side0.v, side0.h], 'rgba(244,248,255,0.92)', '#6f5bd6', 1);
    line3(ctx, a.u, a.v, a.h, b.u, b.v, b.h, '#4a3a8c', 2.4);
  }
  dot3(ctx, hu, hv, MILL_HUB, 5, '#6f5bd6');
  dot3(ctx, hu, hv, MILL_HUB, 2.5, '#d6ccff');
  for (let i = 0; i < seats; i++) {
    const theta = spin + (i / seats) * TAU + Math.PI / 4;
    const t = tip(theta, MILL_SAIL);
    const x = sx(t.u, t.v);
    const y = sy(t.u, t.v, t.h);
    line2(ctx, x, y, x, y + 7, '#4a3a8c', 1.2);
    ctx.fillStyle = i % 2 ? '#56b4e9' : '#8d7ae8';
    ctx.beginPath();
    ctx.ellipse(x, y + 11, 7, 4.5, 0, 0, TAU);
    ctx.fill();
    oval(ctx, x, y + 8.5, 6, 2.2, shade(i % 2 ? '#56b4e9' : '#8d7ae8', 0.75));
    for (let s = 0; s < 2; s++) if (i * 2 + s < filled) rider(ctx, x - 2.5 + s * 5, y + 6, i * 2 + s);
  }
}

// ------------------------------------------------------------------ Gyro Globe (3×3, thrill, tall)

const GYRO_CENTRE = 94;
/** Ring radii in world px. */
const GYRO_OUTER = 44;
const GYRO_MIDDLE = 36;
const GYRO_POD = 15;

type V3 = [number, number, number];

function rot(a: V3, b: V3, t: number, r: number): V3 {
  const c = Math.cos(t) * r;
  const s = Math.sin(t) * r;
  return [a[0] * c + b[0] * s, a[1] * c + b[1] * s, a[2] * c + b[2] * s];
}

export function drawGyroGlobe(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  platform(ctx, ex, ey, '#f6dcc4', '#a8321c');
  // Pedestal and the fork that holds the outer ring's axle.
  cylinder(ctx, cu, cv, 0.55, 3, 10, '#a8321c', '#c4552c');
  for (let k = 0; k < 10; k++) {
    const p = circlePt(cu, cv, 0.5, (k / 10) * TAU);
    dot3(ctx, p.u, p.v, 10, 1.6, k % 2 ? '#ffd166' : '#fff3b0');
  }
  cylinder(ctx, cu, cv, 0.16, 10, GYRO_CENTRE - GYRO_OUTER, '#e8503a', '#f06a52');
  // The outer ring turns about the vertical axis, the middle ring about the outer ring's level axle, the pod spins.
  const alpha = TAU * st.angle;
  const beta = TAU * st.angle * 2;
  const gamma = TAU * st.angle * 3;
  const a: V3 = [Math.cos(alpha), Math.sin(alpha), 0];
  const b: V3 = [-Math.sin(alpha), Math.cos(alpha), 0];
  const up: V3 = [0, 0, 1];
  const b2: V3 = [b[0] * Math.cos(beta), b[1] * Math.cos(beta), Math.sin(beta)];
  const n: V3 = [a[1] * b2[2] - a[2] * b2[1], a[2] * b2[0] - a[0] * b2[2], a[0] * b2[1] - a[1] * b2[0]];
  /** Screen point of an offset (px, map axes) from the centre. */
  const pt = (o: V3): [number, number, number] => {
    const u = cu + o[0] / 32;
    const v = cv + o[1] / 32;
    return [sx(u, v), sy(u, v, GYRO_CENTRE + o[2]), o[0] + o[1]];
  };
  const ring = (e1: V3, e2: V3, r: number, colour: string, width: number, nearHalf: boolean): void => {
    const segs = 28;
    for (let k = 0; k < segs; k++) {
      const t0 = (k / segs) * TAU;
      const t1 = ((k + 1) / segs) * TAU;
      const p0 = rot(e1, e2, t0, r);
      const p1 = rot(e1, e2, t1, r);
      const near = p0[0] + p0[1] + p1[0] + p1[1] > 0;
      if (near !== nearHalf) continue;
      const s0 = pt(p0);
      const s1 = pt(p1);
      line2(ctx, s0[0], s0[1], s1[0], s1[1], colour, width);
    }
  };
  ring(a, up, GYRO_OUTER, '#c43a2a', 5, false);
  ring(a, b2, GYRO_MIDDLE, '#f39a2b', 4, false);
  // Axle pins of the middle ring on the outer ring.
  for (const sgn of [-1, 1]) {
    const s = pt([a[0] * GYRO_OUTER * sgn, a[1] * GYRO_OUTER * sgn, 0]);
    dot(ctx, s[0], s[1], 3, '#ffd166');
  }
  // The pod: a ball with seats round its waist; riders face out and turn with it.
  const c = pt([0, 0, 0]);
  dot(ctx, c[0], c[1], GYRO_POD, '#a8321c');
  dot(ctx, c[0] - 3, c[1] - 4, GYRO_POD * 0.55, '#e8503a');
  const seats = 8;
  const filled = seatsFilled(seats, st.occupancy);
  const e1 = rot(a, b2, gamma, 1);
  const e2 = rot(a, b2, gamma + Math.PI / 2, 1);
  const pods: Item[] = [];
  for (let i = 0; i < seats; i++) {
    const o = rot(e1, e2, (i / seats) * TAU, GYRO_POD + 4);
    const s = pt(o);
    pods.push({
      n: s[2],
      draw: () => {
        ctx.fillStyle = i % 2 ? '#ffd166' : '#f39a2b';
        ctx.fillRect(s[0] - 3, s[1] - 3, 6, 6);
        if (i < filled) rider(ctx, s[0] + n[0] * 2, s[1] - n[2] * 3 - 2, i);
      },
    });
  }
  drawSorted(pods);
  ring(a, b2, GYRO_MIDDLE, '#ffb04a', 4, true);
  ring(a, up, GYRO_OUTER, '#e8503a', 5, true);
  // Top light: a star on the outer ring's crown that blinks with the turn.
  const crown = pt([0, 0, GYRO_OUTER + 2]);
  const on = (mix32(Math.floor(st.angle * 16)) & 1) === 0;
  star(ctx, crown[0], crown[1] - 3, on ? 6 : 4, 2.2, 5, on ? '#fff3b0' : '#ffd166', alpha);
}
