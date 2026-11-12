/** Frost Peaks art (11 items since the Frost Statue was removed with the mascots, Task 24; chill: blues, teals, violets, snow white). Owner: W3-D. */
import { box, cylinder, disc } from '../../sprites/shapes';
import {
  archPosts,
  cluster,
  dot,
  edgeOf,
  edgePoint,
  eyes,
  facesViewer,
  glow,
  line2,
  oval,
  pedestal,
  poly2,
  poly3,
  post,
  screenSide,
  seedOf,
  shade,
  shadow,
  sx,
  sy,
  tier,
  trunk,
  type Ctx,
  type SceneryArtFn,
} from './kit';

const CX = sx(0.5, 0.5);
const SNOW = '#f4f8ff';
const ICE = '#a8dcf4';
const ICE_DARK = '#5fa9d6';

/** Snowy conifer: dark teal tiers with snow caps. */
function snowPineAt(ctx: Ctx, x: number, yb: number, tiers: number, w: number, step: number, seed: number): void {
  const tones = ['#21504f', '#275f5c', '#2e6e69', '#367d76'];
  for (let k = 0; k < tiers; k++) {
    const ww = w - k * (w / (tiers + 1.5));
    const y = yb - k * step;
    tier(ctx, x, y, ww, step * 1.8, tones[k % tones.length] as string);
    poly2(ctx, [x - ww * 0.55, y - step * 0.75, x, y - step * 1.8, x + ww * 0.45, y - step * 0.85, x + ww * 0.1, y - step * 0.6 - (seed % 3)], SNOW);
  }
}

const snowPine: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.33);
  trunk(ctx, 0.5, 0.5, 0, 10, 3, 2.5, '#5a3d28');
  snowPineAt(ctx, CX + screenSide(o.facing) * 0.5, sy(0.5, 0.5, 8), 4, 18, 15, seedOf('snow_pine') + o.facing);
  dot(ctx, CX, sy(0.5, 0.5, 8), 2, SNOW);
};

const snowPineSmall: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.24);
  trunk(ctx, 0.5, 0.5, 0, 7, 2.4, 2, '#5a3d28');
  snowPineAt(ctx, CX - screenSide(o.facing) * 0.5, sy(0.5, 0.5, 5), 3, 13, 11, seedOf('snow_pine_small') + o.facing);
  // A little snow mound at the foot.
  oval(ctx, CX + 4, sy(0.5, 0.5, 1), 7, 3, SNOW);
};

const iceArch: SceneryArtFn = (ctx, o) => {
  const { back, front } = archPosts(o.facing);
  const top = 34;
  const icePost = (u: number, v: number): void => {
    box(ctx, u - 0.07, v - 0.07, u + 0.07, v + 0.07, 0, top, '#e3f5ff', ICE, ICE_DARK);
    line2(ctx, sx(u, v + 0.07) - 1, sy(u, v + 0.07, 4), sx(u, v + 0.07) - 1, sy(u, v + 0.07, top - 4), 'rgba(255,255,255,0.7)', 1);
  };
  if (o.part !== 2) {
    icePost(back.u, back.v);
    // Curved crystal beam: a chain of ice blocks rising to the middle.
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const u = back.u + (front.u - back.u) * t;
      const v = back.v + (front.v - back.v) * t;
      const h = top + Math.sin(t * Math.PI) * 8;
      box(ctx, u - 0.06, v - 0.06, u + 0.06, v + 0.06, h - 4, h + 3, '#eefaff', ICE, ICE_DARK);
    }
    const mu = (back.u + front.u) / 2;
    const mv = (back.v + front.v) / 2;
    glow(ctx, sx(mu, mv), sy(mu, mv, top + 14), 3, '#b8ecff', '#ffffff');
  }
  if (o.part !== 1) icePost(front.u, front.v);
};

const igloo: SceneryArtFn = (ctx, o) => {
  const cu = o.ex / 2;
  const cv = o.ey / 2;
  shadow(ctx, cu, cv, 0.9, 0.18);
  const x = sx(cu, cv);
  const y = sy(cu, cv, 0);
  // Dome: half ellipse with block lines.
  ctx.beginPath();
  ctx.ellipse(x, y, 46, 34, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = '#eaf6ff';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + 8, y, 38, 30, 0, -Math.PI * 0.45, 0);
  ctx.lineTo(x + 8, y);
  ctx.closePath();
  ctx.fillStyle = '#cfe8f7';
  ctx.fill();
  for (let k = 1; k <= 3; k++) {
    const yy = y - k * 8;
    const half = 46 * Math.sqrt(Math.max(0, 1 - ((k * 8) / 34) ** 2));
    line2(ctx, x - half, yy, x + half, yy, '#b5d6ea', 1);
    for (let j = -2; j <= 2; j++) line2(ctx, x + j * half * 0.4 + (k % 2) * 6, yy, x + j * half * 0.4 + (k % 2) * 6, yy + 8, '#b5d6ea', 1);
  }
  // Entrance tunnel toward the facing (visible sides only).
  if (facesViewer(o.facing)) {
    const s = o.facing === 1 ? 1 : -1;
    const ex = x + s * 30;
    const ey = y + 10;
    oval(ctx, ex, ey - 6, 13, 12, '#eaf6ff');
    oval(ctx, ex + s * 2, ey - 3, 7, 8, '#294a66');
  } else {
    oval(ctx, x + screenSide(o.facing) * 24, y - 14, 8, 6, '#dceefa');
  }
};

const fountainFrozen: SceneryArtFn = (ctx, o) => {
  const cu = o.ex / 2;
  const cv = o.ey / 2;
  shadow(ctx, cu, cv, 0.95, 0.18);
  cylinder(ctx, cu, cv, 0.8, 0, 6, '#9fb6c8', '#c4d6e4');
  disc(ctx, cu, cv, 0.68, 6, '#d6f1ff');
  disc(ctx, cu, cv, 0.4, 6, '#bfe7fb');
  // Frozen jets: icicle spires.
  const spires: Array<[number, number, number]> = [
    [0, 0, 26],
    [0.32, 0.1, 15],
    [-0.28, 0.18, 13],
    [0.12, -0.3, 12],
    [-0.12, 0.34, 16],
  ];
  spires.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  for (const [du, dv, h] of spires) {
    const u = cu + du;
    const v = cv + dv;
    const x = sx(u, v);
    const y = sy(u, v, 6);
    poly2(ctx, [x - 4, y, x, y - h, x + 4, y], ICE, '#7fc2e6', 0.8);
    poly2(ctx, [x, y - h, x + 4, y, x + 1, y], ICE_DARK);
  }
  glow(ctx, sx(cu, cv), sy(cu, cv, 34 + (o.facing % 2)), 3.4, '#9fe6ff', '#ffffff');
  glow(ctx, sx(cu + 0.5, cv + 0.3), sy(cu + 0.5, cv + 0.3, 6), 2, '#bdf0ff');
};

const iceCrystals: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.28, 0.15);
  const shards: Array<[number, number, number, number]> = [
    [0.42, 0.4, 16, -0.25],
    [0.6, 0.48, 12, 0.3],
    [0.48, 0.62, 10, -0.5],
    [0.66, 0.66, 7, 0.45],
    [0.34, 0.6, 7, -0.6],
  ];
  const side = screenSide(o.facing);
  for (const [u, v, h, tilt] of shards) {
    const x = sx(u, v);
    const y = sy(u, v, 0);
    const tx = x + tilt * side * 6;
    poly2(ctx, [x - 3, y, tx, y - h, x + 3, y], '#b4e2ff', '#6fb8e0', 0.7);
    poly2(ctx, [tx, y - h, x + 3, y, x + 0.5, y], '#7bc4ea');
  }
  glow(ctx, CX, sy(0.5, 0.5, 10), 2.6, '#a9e8ff', '#ffffff');
};

const snowdrift: SceneryArtFn = (ctx, o) => {
  const s = seedOf('snowdrift') + o.facing * 5;
  cluster(ctx, CX, sy(0.5, 0.5, 4), 14, 5, 6.5, ['#dbe9f6', '#ebf4fc', SNOW], s, 8);
  oval(ctx, CX, sy(0.5, 0.5, 1), 18, 6, '#e6f1fa');
  dot(ctx, CX + screenSide(o.facing) * 6, sy(0.5, 0.5, 7), 1.5, '#ffffff');
};

const snowman: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.2);
  const x = CX;
  const y = sy(0.5, 0.5, 0);
  const s = screenSide(o.facing);
  oval(ctx, x, y - 6, 8, 7, SNOW);
  oval(ctx, x, y - 16, 6, 5.5, '#f8fbff');
  oval(ctx, x, y - 24, 4.6, 4.4, SNOW);
  // Stick arms and a teal scarf; the face only from the front.
  line2(ctx, x - 5, y - 16, x - 12, y - 21, '#6a4a2c', 1.3);
  line2(ctx, x + 5, y - 16, x + 12, y - 20, '#6a4a2c', 1.3);
  poly2(ctx, [x - 5, y - 20.5, x + 5, y - 20.5, x + 4.5, y - 19, x - 4.5, y - 19], '#2fb39a');
  // A round knit hat (no real-world garment).
  poly2(ctx, [x - 4.5, y - 27, x + 4.5, y - 27, x + 3, y - 32, x - 3, y - 32], '#8d5ad8');
  dot(ctx, x, y - 33, 1.8, SNOW);
  if (facesViewer(o.facing)) {
    dot(ctx, x + s * 0.5 - 1.6, y - 25, 0.8, '#1b2433');
    dot(ctx, x + s * 0.5 + 1.6, y - 25, 0.8, '#1b2433');
    poly2(ctx, [x + s * 1, y - 23.5, x + s * 5, y - 23, x + s * 1, y - 22.5], '#f39a2b');
    for (const k of [0, 1, 2]) dot(ctx, x + s * 0.5, y - 14 + k * 3.5, 0.9, '#30425a');
  }
};

const auroraLantern: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.16);
  cylinder(ctx, 0.5, 0.5, 0.08, 0, 3, '#5c6f8a', '#7c90aa');
  post(ctx, 0.5, 0.5, 0.025, 3, 16, '#4a5c78');
  const x = CX;
  const y = sy(0.5, 0.5, 21);
  // Hexagonal glass lantern with shifting aurora colours (the rotation picks the band order).
  const bands = ['#5fe0b0', '#7fa8ff', '#c08cff', '#5fe0b0'];
  const off = o.facing;
  dot(ctx, x, y, 9, 'rgba(120,230,200,0.18)');
  poly2(ctx, [x - 5, y - 6, x + 5, y - 6, x + 6, y, x + 5, y + 6, x - 5, y + 6, x - 6, y], '#1f2f4a');
  for (let k = 0; k < 3; k++) poly2(ctx, [x - 4.5, y - 5 + k * 3.4, x + 4.5, y - 5 + k * 3.4, x + 4.5, y - 1.6 + k * 3.4, x - 4.5, y - 1.6 + k * 3.4], bands[(k + off) % 4] as string);
  glow(ctx, x, y, 2.4, '#e0fff4', '#ffffff');
  poly2(ctx, [x - 6, y - 6, x, y - 11, x + 6, y - 6], '#4a5c78');
};

const sledRack: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.3, 0.14);
  const along = o.facing % 2 === 0;
  const [u0, v0, u1, v1] = along ? [0.2, 0.5, 0.8, 0.5] : [0.5, 0.2, 0.5, 0.8];
  post(ctx, u0, v0, 0.03, 0, 11, '#7a5233');
  post(ctx, u1, v1, 0.03, 0, 11, '#7a5233');
  poly3(ctx, [u0, v0, 9, u1, v1, 9, u1, v1, 11, u0, v0, 11], '#9a6e44');
  // Three leaning sleds.
  const cols = ['#e8503a', '#3d9be0', '#2fb39a'];
  for (let k = 0; k < 3; k++) {
    const t = 0.22 + k * 0.28;
    const u = u0 + (u1 - u0) * t;
    const v = v0 + (v1 - v0) * t;
    const du = along ? 0 : 0.16;
    const dv = along ? 0.16 : 0;
    poly3(ctx, [u - 0.06 * (along ? 1 : 0), v - 0.06 * (along ? 0 : 1), 10, u + 0.06 * (along ? 1 : 0), v + 0.06 * (along ? 0 : 1), 10, u + du + 0.06 * (along ? 1 : 0), v + dv + 0.06 * (along ? 0 : 1), 0, u + du - 0.06 * (along ? 1 : 0), v + dv - 0.06 * (along ? 0 : 1), 0], cols[k] as string, shade(cols[k] as string, 0.7), 0.8);
  }
};

const wallIce: SceneryArtFn = (ctx, o) => {
  const e = edgeOf(o);
  for (let row = 0; row < 2; row++) {
    for (let k = 0; k < 4; k++) {
      const a = edgePoint(e, (row % 2 ? 0.125 : 0) + k * 0.25, 0.07);
      const b = edgePoint(e, Math.min(1, (row % 2 ? 0.125 : 0) + k * 0.25 + 0.24), 0.07);
      if (row === 1 && k === 3) continue;
      const u0 = Math.min(a.u, b.u) - 0.06;
      const u1 = Math.max(a.u, b.u) + 0.06;
      const v0 = Math.min(a.v, b.v) - 0.06;
      const v1 = Math.max(a.v, b.v) + 0.06;
      box(ctx, u0, v0, u1, v1, row * 8, row * 8 + 7.5, '#eaf8ff', (k + row) % 2 ? ICE : '#b9e4f8', ICE_DARK);
    }
  }
  const m = edgePoint(e, 0.5, 0.07);
  line2(ctx, sx(m.u, m.v) - 6, sy(m.u, m.v, 13), sx(m.u, m.v) + 2, sy(m.u, m.v, 15), 'rgba(255,255,255,0.8)', 1);
};

export const FROST_ART: Readonly<Record<string, SceneryArtFn>> = {
  snow_pine: snowPine,
  snow_pine_small: snowPineSmall,
  ice_arch: iceArch,
  igloo,
  fountain_frozen: fountainFrozen,
  ice_crystals: iceCrystals,
  snowdrift,
  snowman,
  aurora_lantern: auroraLantern,
  sled_rack: sledRack,
  wall_ice: wallIce,
};
