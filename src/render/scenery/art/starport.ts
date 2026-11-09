/** Starport art (12 items, thrill: white hulls with warm reds, oranges, yellows, and neon glow). Owner: W3-D. */
import { box, cone, cylinder, disc } from '../../sprites/shapes';
import {
  archPosts,
  dot,
  edgeBox,
  edgeOf,
  edgePoint,
  eyes,
  faceVec,
  facesViewer,
  glow,
  line2,
  oval,
  pedestal,
  poly2,
  poly3,
  post,
  rock,
  screenSide,
  seedOf,
  shadow,
  star,
  sx,
  sy,
  withAlpha,
  type Ctx,
  type SceneryArtFn,
} from './kit';

const CX = sx(0.5, 0.5);
const HULL = '#e9edf2';
const HULL_SIDE = '#c4ccd6';
const RED = '#e8403a';
const ORANGE = '#f39a2b';
const NEON = '#ff5ab4';

const rocket: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.34);
  // Launch pad.
  cylinder(ctx, 0.5, 0.5, 0.36, 0, 3, '#7a828e', '#9aa2ae');
  // Fins at the four sides; the rotation turns which fin faces front.
  const fins = [0, 1, 2, 3].map((k) => {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4 + o.facing * 0.2;
    return { u: 0.5 + Math.cos(a) * 0.2, v: 0.5 + Math.sin(a) * 0.2, d: Math.cos(a) + Math.sin(a) };
  });
  fins.sort((a, b) => a.d - b.d);
  const fin = (f: { u: number; v: number }): void => poly3(ctx, [0.5, 0.5, 4, f.u, f.v, 3, f.u, f.v, 14, 0.5, 0.5, 26], RED, '#a8281f', 0.6);
  fin(fins[0]!);
  fin(fins[1]!);
  cylinder(ctx, 0.5, 0.5, 0.12, 4, 52, HULL_SIDE, HULL);
  // Highlight stripe and portholes on the front.
  poly2(ctx, [CX - 5, sy(0.5, 0.5, 8), CX - 3, sy(0.5, 0.5, 8), CX - 3, sy(0.5, 0.5, 50), CX - 5, sy(0.5, 0.5, 50)], '#ffffff');
  for (const h of [24, 34]) {
    dot(ctx, CX + 1.5, sy(0.5, 0.5, h), 3, '#2a3a5a');
    glow(ctx, CX + 1.5, sy(0.5, 0.5, h), 1.8, '#9fdcff', '#ffffff');
  }
  cylinder(ctx, 0.5, 0.5, 0.122, 40, 44, '#c8302a', RED);
  cone(ctx, 0.5, 0.5, 0.12, 52, 70, [RED, '#c8302a'], 10);
  fin(fins[2]!);
  fin(fins[3]!);
  dot(ctx, CX, sy(0.5, 0.5, 4), 5, withAlpha(ORANGE, 0.35));
  glow(ctx, CX, sy(0.5, 0.5, 71), 1.6, '#ffe066');
};

const satelliteDish: SceneryArtFn = (ctx, o) => {
  const cu = o.ex / 2;
  const cv = o.ey / 2;
  shadow(ctx, cu, cv, 0.8, 0.2);
  box(ctx, cu - 0.4, cv - 0.4, cu + 0.4, cv + 0.4, 0, 8, '#aab2bc', '#8a929e', '#6e7682');
  post(ctx, cu, cv, 0.08, 8, 22, '#8a929e');
  // Dish aimed up and toward the facing: an ellipse whose tilt follows the facing vector.
  const f = faceVec(o.facing);
  const x = sx(cu + f.du * 0.15, cv + f.dv * 0.15);
  const y = sy(cu + f.du * 0.15, cv + f.dv * 0.15, 30);
  const tilt = (f.du - f.dv) * 0.5;
  oval(ctx, x, y, 26, 15, '#d6dce4', tilt);
  oval(ctx, x + (f.du - f.dv) * 2, y + 1.5, 21, 11, '#f2f5f8', tilt);
  for (const k of [-1, 1]) line2(ctx, x + k * 14, y + 3, x + (f.du - f.dv) * 10, y - 14, '#6e7682', 1.2);
  glow(ctx, x + (f.du - f.dv) * 10, y - 15, 2.2, ORANGE);
};

const planetGlobe: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.26);
  cylinder(ctx, 0.5, 0.5, 0.16, 0, 6, '#5a6270', '#7a8290');
  post(ctx, 0.5, 0.5, 0.025, 6, 12, '#5a6270');
  const x = CX;
  const y = sy(0.5, 0.5, 22);
  dot(ctx, x, y, 14, withAlpha(ORANGE, 0.18));
  dot(ctx, x, y, 10, '#f07a3a');
  // Bands (turn with the rotation) and a ring.
  for (let k = -2; k <= 2; k++) {
    const yy = y + k * 3.6 + (o.facing - 1.5) * 0.6;
    const half = Math.sqrt(Math.max(0, 100 - (yy - y) ** 2));
    line2(ctx, x - half + 1, yy, x + half - 1, yy, k % 2 ? '#ffb36b' : '#d8582a', 2);
  }
  dot(ctx, x - 3.5, y - 4, 2.6, 'rgba(255,255,255,0.45)');
  ctx.beginPath();
  ctx.ellipse(x, y, 17, 4.6, -0.25 + o.facing * 0.06, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 1.8;
  ctx.stroke();
};

const neonArch: SceneryArtFn = (ctx, o) => {
  const { back, front } = archPosts(o.facing);
  const top = 34;
  const pylon = (u: number, v: number): void => {
    box(ctx, u - 0.06, v - 0.06, u + 0.06, v + 0.06, 0, top, '#5a6270', '#3a414c', '#2a3039');
    line2(ctx, sx(u, v + 0.06) - 1, sy(u, v + 0.06, 2), sx(u, v + 0.06) - 1, sy(u, v + 0.06, top - 2), NEON, 1.6);
  };
  if (o.part !== 2) {
    pylon(back.u, back.v);
    // Two neon arcs (pink and orange) across the walkway.
    for (const [lift, colour] of [[0, NEON], [5, ORANGE]] as const) {
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        const u = back.u + (front.u - back.u) * t;
        const v = back.v + (front.v - back.v) * t;
        const px = sx(u, v);
        const py = sy(u, v, top + lift + Math.sin(t * Math.PI) * 10);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = withAlpha(colour, 0.35);
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    const mu = (back.u + front.u) / 2;
    const mv = (back.v + front.v) / 2;
    star(ctx, sx(mu, mv), sy(mu, mv, top + 20), 4, 1.8, 5, '#ffe066');
  }
  if (o.part !== 1) pylon(front.u, front.v);
};

const neonPost: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.12);
  box(ctx, 0.45, 0.45, 0.55, 0.55, 0, 3, '#5a6270', '#3a414c', '#2a3039');
  const s = screenSide(o.facing);
  // A tall glowing tube with a little zig-zag.
  const x = CX;
  const y0 = sy(0.5, 0.5, 3);
  const pts = [x, y0, x, y0 - 10, x + s * 3, y0 - 13, x - s * 3, y0 - 17, x, y0 - 20, x, y0 - 24];
  for (const [w, c] of [[5, withAlpha(ORANGE, 0.35)], [2.2, ORANGE], [0.8, '#fff3c0']] as const) {
    ctx.beginPath();
    ctx.moveTo(pts[0]!, pts[1]!);
    for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k]!, pts[k + 1]!);
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.stroke();
  }
  glow(ctx, x, y0 - 25, 2.4, '#ffd23f');
};

/** A friendly round robot (original design): dome head, antenna, chest light. */
function robotFigure(ctx: Ctx, x: number, y: number, s: 1 | -1, front: boolean): void {
  poly2(ctx, [x - 6, y, x - 4, y - 6, x - 1, y - 6, x - 2, y], '#8a929e');
  poly2(ctx, [x + 2, y, x + 1, y - 6, x + 4, y - 6, x + 6, y], '#8a929e');
  poly2(ctx, [x - 8, y - 6, x + 8, y - 6, x + 7, y - 19, x - 7, y - 19], '#d8dee6');
  poly2(ctx, [x + 2, y - 6, x + 8, y - 6, x + 7, y - 19, x + 2, y - 19], HULL_SIDE);
  line2(ctx, x - 8, y - 16, x - 12, y - 10 - (s > 0 ? 0 : 6), '#8a929e', 2);
  line2(ctx, x + 8, y - 16, x + 12, y - 10 - (s > 0 ? 6 : 0), '#8a929e', 2);
  oval(ctx, x, y - 25, 7, 6.5, '#e9edf2');
  line2(ctx, x, y - 31, x + s * 2, y - 36, '#6e7682', 1);
  glow(ctx, x + s * 2, y - 37, 1.6, RED);
  if (front) {
    poly2(ctx, [x - 5 + s, y - 27.5, x + 5 + s, y - 27.5, x + 4 + s, y - 22.5, x - 4 + s, y - 22.5], '#2a3a5a');
    eyes(ctx, x + s * 1.2, y - 25, 2.4, 1.2, s, '#9fdcff', '#ffffff');
    glow(ctx, x + s, y - 13, 2, ORANGE);
  }
}

const statueRobot: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.3);
  pedestal(ctx, 0.24, 6, '#5a6270');
  robotFigure(ctx, CX, sy(0.5, 0.5, 6), screenSide(o.facing), facesViewer(o.facing));
};

const crater: SceneryArtFn = (ctx, o) => {
  const cu = o.ex / 2;
  const cv = o.ey / 2;
  const s = seedOf('crater') + o.facing * 7;
  const rim = (front: boolean): void => {
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      if (Math.cos(a) + Math.sin(a) >= 0 !== front) continue;
      rock(ctx, cu + Math.cos(a) * 0.72, cv + Math.sin(a) * 0.72, 0.16, 4 + (k % 3) * 2, k % 2 ? '#a7a2a8' : '#b8b3b8', s + k);
    }
  };
  rim(false);
  disc(ctx, cu, cv, 0.62, 0, '#7a767e');
  disc(ctx, cu + 0.08, cv + 0.08, 0.44, 0, '#68646c');
  disc(ctx, cu - 0.2, cv + 0.1, 0.1, 0, '#8a868e');
  disc(ctx, cu + 0.25, cv - 0.15, 0.07, 0, '#8a868e');
  rim(true);
};

const moonRock: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.32, 0.2);
  rock(ctx, 0.5, 0.52, 0.3, 14, '#b4b0b8', seedOf('moon_rock') + o.facing * 3);
  for (const [du, dh, r] of [[-0.08, 9, 2], [0.1, 6, 1.4], [0.02, 12, 1.2]] as const) oval(ctx, sx(0.5 + du, 0.5), sy(0.5 + du, 0.5, dh), r * 1.4, r, '#8e8a94');
};

const starBeacon: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.22);
  // A lattice tower with a spinning star lamp.
  const legs: Array<[number, number]> = [
    [0.32, 0.32],
    [0.68, 0.32],
    [0.32, 0.68],
    [0.68, 0.68],
  ];
  const top = 42;
  for (const [u, v] of legs) line2(ctx, sx(u, v), sy(u, v, 0), CX, sy(0.5, 0.5, top), '#8a929e', 1.6);
  for (let k = 1; k < 4; k++) {
    const t = k / 4;
    const r = 0.18 * (1 - t);
    poly3(ctx, [0.5 - r, 0.5 - r, top * t, 0.5 + r, 0.5 - r, top * t, 0.5 + r, 0.5 + r, top * t, 0.5 - r, 0.5 + r, top * t], null, '#6e7682', 0.9);
  }
  dot(ctx, CX, sy(0.5, 0.5, top + 4), 12, withAlpha('#ffd23f', 0.2));
  star(ctx, CX, sy(0.5, 0.5, top + 4), 7, 3, 5, '#ffd23f', o.facing * 0.3);
  star(ctx, CX, sy(0.5, 0.5, top + 4), 3.5, 1.6, 5, '#fff6cc', o.facing * 0.3);
};

const hologramPad: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.32, 0.16);
  cylinder(ctx, 0.5, 0.5, 0.3, 0, 4, '#4a525e', '#5a6270');
  disc(ctx, 0.5, 0.5, 0.22, 4, '#ff8a3a');
  disc(ctx, 0.5, 0.5, 0.15, 4, '#ffd23f');
  // A translucent hologram of a small planet with a moon (turns with the rotation).
  const x = CX;
  const y = sy(0.5, 0.5, 4);
  poly2(ctx, [x - 12, y, x + 12, y, x + 7, y - 22, x - 7, y - 22], 'rgba(255,170,90,0.18)');
  dot(ctx, x, y - 15, 6, 'rgba(255,200,120,0.55)');
  const a = (o.facing / 4) * Math.PI * 2;
  dot(ctx, x + Math.cos(a) * 9, y - 15 + Math.sin(a) * 3, 2, 'rgba(255,240,200,0.8)');
  for (let k = 0; k < 3; k++) line2(ctx, x - 6, y - 10 - k * 4, x + 6, y - 10 - k * 4, 'rgba(255,220,160,0.5)', 0.6);
};

const radarTower: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.26);
  box(ctx, 0.36, 0.36, 0.64, 0.64, 0, 10, '#c4ccd6', '#9aa2ae', '#7a828e');
  cylinder(ctx, 0.5, 0.5, 0.07, 10, 52, '#9aa2ae', '#c4ccd6');
  for (const h of [22, 36]) cylinder(ctx, 0.5, 0.5, 0.1, h, h + 2, RED, '#ff7a5a');
  // A rotating radar bar (its angle follows the rotation) and a red top light.
  const a = (o.facing / 4) * Math.PI + 0.3;
  const x = CX;
  const y = sy(0.5, 0.5, 56);
  poly2(ctx, [x - Math.cos(a) * 16, y - Math.sin(a) * 5 - 3, x + Math.cos(a) * 16, y + Math.sin(a) * 5 - 3, x + Math.cos(a) * 16, y + Math.sin(a) * 5 + 2, x - Math.cos(a) * 16, y - Math.sin(a) * 5 + 2], '#e9edf2', '#7a828e', 0.8);
  line2(ctx, x, y + 2, x, sy(0.5, 0.5, 52), '#7a828e', 2);
  glow(ctx, x, y - 6, 2, RED);
};

const wallHull: SceneryArtFn = (ctx, o) => {
  const e = edgeOf(o);
  edgeBox(ctx, e, 0.08, 0, 15, '#d8dee6', '#b8c0ca', '#98a0aa', 0.02);
  for (let k = 0; k < 4; k++) {
    const p = edgePoint(e, 0.13 + k * 0.25, e === 1 || e === 2 ? -0.005 : 0.085);
    for (const h of [3, 12]) dot(ctx, sx(p.u, p.v), sy(p.u, p.v, h), 0.9, '#6e7682');
  }
  // A warm light stripe along the panel.
  const a = edgePoint(e, 0.06, e === 1 || e === 2 ? -0.005 : 0.085);
  const b = edgePoint(e, 0.94, e === 1 || e === 2 ? -0.005 : 0.085);
  line2(ctx, sx(a.u, a.v), sy(a.u, a.v, 7.5), sx(b.u, b.v), sy(b.u, b.v, 7.5), withAlpha(ORANGE, 0.45), 3);
  line2(ctx, sx(a.u, a.v), sy(a.u, a.v, 7.5), sx(b.u, b.v), sy(b.u, b.v, 7.5), '#ffd23f', 1.2);
};

export const STARPORT_ART: Readonly<Record<string, SceneryArtFn>> = {
  rocket_model: rocket,
  satellite_dish: satelliteDish,
  planet_globe: planetGlobe,
  neon_arch: neonArch,
  neon_post: neonPost,
  statue_robot: statueRobot,
  crater,
  moon_rock: moonRock,
  star_beacon: starBeacon,
  hologram_pad: hologramPad,
  radar_tower: radarTower,
  wall_hull: wallHull,
};
