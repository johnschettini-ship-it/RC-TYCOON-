/** Volcano Ridge art (12 items, thrill: reds, oranges, yellows on dark basalt). Owner: W3-D. */
import { box, cylinder, disc } from '../../sprites/shapes';
import {
  archPosts,
  cluster,
  dot,
  edgeOf,
  edgePoint,
  eyes,
  facesViewer,
  frac,
  glow,
  line2,
  oval,
  pedestal,
  poly2,
  poly3,
  rock,
  screenSide,
  seedOf,
  shadow,
  sx,
  sy,
  trunk,
  withAlpha,
  type Ctx,
  type SceneryArtFn,
} from './kit';

const CX = sx(0.5, 0.5);
const BASALT = '#3d3638';
const LAVA = '#ff6a1a';
const EMBER = '#ffc23a';

/** Glowing cracks on a rock: short bright zigzags. */
function cracks(ctx: Ctx, x: number, y: number, w: number, seed: number): void {
  for (let k = 0; k < 3; k++) {
    const x0 = x - w / 2 + ((seed + k * 7) % 5) * (w / 5);
    line2(ctx, x0, y - k * 3, x0 + 3, y - k * 3 - 3, LAVA, 1.3);
    line2(ctx, x0 + 3, y - k * 3 - 3, x0 + 1, y - k * 3 - 6, EMBER, 1);
  }
}

const lavaRock: SceneryArtFn = (ctx, o) => {
  const s = seedOf('lava_rock') + o.facing * 3;
  shadow(ctx, 0.5, 0.5, 0.34, 0.25);
  rock(ctx, 0.5, 0.52, 0.32, 15, '#4a4042', s);
  cracks(ctx, CX, sy(0.5, 0.5, 6), 14, s);
};

const lavaCrag: SceneryArtFn = (ctx, o) => {
  const cu = o.ex / 2;
  const cv = o.ey / 2;
  const s = seedOf('lava_crag') + o.facing * 11;
  shadow(ctx, cu, cv, 0.95, 0.25);
  rock(ctx, cu - 0.3, cv - 0.25, 0.5, 30, '#3a3234', s);
  rock(ctx, cu + 0.1, cv + 0.05, 0.62, 46, BASALT, s + 1);
  rock(ctx, cu + 0.45, cv + 0.4, 0.38, 20, '#463d3f', s + 2);
  // A lava stream down the front face.
  const x = sx(cu + 0.1, cv + 0.05);
  const y = sy(cu + 0.1, cv + 0.05, 40);
  const side = screenSide(o.facing);
  poly2(ctx, [x - 2, y, x + 2, y, x + side * 6 + 4, y + 22, x + side * 10 + 6, y + 36, x + side * 10 - 2, y + 36, x + side * 6 - 3, y + 22], LAVA);
  poly2(ctx, [x - 0.5, y + 2, x + 0.8, y + 2, x + side * 7, y + 24, x + side * 6, y + 24], EMBER);
  dot(ctx, x, y - 2, 3, withAlpha(EMBER, 0.6));
};

const steamVent: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.3, 0.2);
  rock(ctx, 0.5, 0.5, 0.3, 6, '#4a4042', seedOf('steam_vent'));
  disc(ctx, 0.5, 0.5, 0.11, 6, '#ff8a2a');
  disc(ctx, 0.5, 0.5, 0.06, 6, EMBER);
  const side = screenSide(o.facing);
  cluster(ctx, CX + side * 4, sy(0.5, 0.5, 22), 7, 9, 5.5, ['rgba(235,235,240,0.55)', 'rgba(245,245,248,0.7)', 'rgba(255,255,255,0.85)'], seedOf('steam') + o.facing, 8);
  cluster(ctx, CX + side * 8, sy(0.5, 0.5, 34), 6, 6, 4.5, ['rgba(235,235,240,0.4)', 'rgba(250,250,252,0.6)'], seedOf('steam2') + o.facing, 5);
};

const glowCrystal: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.26, 0.2);
  rock(ctx, 0.5, 0.55, 0.22, 5, BASALT, seedOf('glow_crystal'));
  const side = screenSide(o.facing);
  const shards: Array<[number, number, number, number]> = [
    [0.45, 0.48, 24, -0.2],
    [0.6, 0.55, 16, 0.4],
    [0.4, 0.62, 12, -0.6],
  ];
  for (const [u, v, h, t] of shards) {
    const x = sx(u, v);
    const y = sy(u, v, 4);
    const tx = x + t * side * 7;
    poly2(ctx, [x - 3.5, y, tx, y - h, x + 3.5, y], '#ff9a2e', '#ffd23f', 0.8);
    poly2(ctx, [tx, y - h, x + 3.5, y, x + 0.6, y], '#e8501a');
  }
  glow(ctx, CX, sy(0.5, 0.5, 16), 3, EMBER, '#fff6d0');
};

const emberTorch: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.14);
  box(ctx, 0.44, 0.44, 0.56, 0.56, 0, 16, '#5a4a44', BASALT, '#2a2527');
  // Iron bowl and flames (the flame leans with the rotation).
  cylinder(ctx, 0.5, 0.5, 0.1, 16, 19, '#2b2f36', '#4a3a30');
  const x = CX;
  const y = sy(0.5, 0.5, 19);
  const s = screenSide(o.facing);
  dot(ctx, x, y - 6, 9, withAlpha(LAVA, 0.25));
  poly2(ctx, [x - 5, y, x + s * 2, y - 14, x + 5, y], LAVA);
  poly2(ctx, [x - 2.5, y, x + s * 1, y - 9, x + 2.5, y], EMBER);
  dot(ctx, x, y - 2, 1.6, '#fff4c0');
};

/** Spark the fire fox (catalog §7): orange fox with a flame tail. */
function sparkFigure(ctx: Ctx, x: number, y: number, s: 1 | -1, front: boolean): void {
  // Flame tail behind.
  poly2(ctx, [x - s * 4, y - 6, x - s * 16, y - 18, x - s * 12, y - 26, x - s * 9, y - 16, x - s * 6, y - 22, x - s * 3, y - 12], LAVA);
  poly2(ctx, [x - s * 5, y - 8, x - s * 12, y - 18, x - s * 7, y - 14], EMBER);
  oval(ctx, x, y - 9, 8, 9, '#f07a2a');
  oval(ctx, x + s * 2, y - 7, 4, 6, '#ffe6c8');
  oval(ctx, x + s * 2, y - 22, 8, 7, '#f07a2a');
  for (const k of [-1, 1]) poly2(ctx, [x + s * 2 + k * 4, y - 26, x + s * 2 + k * 7, y - 35, x + s * 2 + k * 1, y - 28], '#e0601a');
  if (front) {
    poly2(ctx, [x + s * 2, y - 22, x + s * 11, y - 19, x + s * 2, y - 16], '#ffe6c8');
    dot(ctx, x + s * 11, y - 19, 1.3, '#2a1a14');
    eyes(ctx, x + s * 3, y - 23, 2.6, 1.4, s);
  }
}

const statueSpark: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.3);
  pedestal(ctx, 0.24, 6, '#5a4a44');
  for (const [u, v] of [[0.3, 0.72], [0.72, 0.3]] as const) glow(ctx, sx(u, v), sy(u, v, 6), 1.6, EMBER);
  sparkFigure(ctx, CX, sy(0.5, 0.5, 6), screenSide(o.facing), facesViewer(o.facing));
};

const fireFern: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.3, 0.16);
  const x = CX;
  const y = sy(0.5, 0.5, 0);
  const off = o.facing * 0.4;
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.42 + off * 0.1;
    const len = 14 + (k % 2) * 4;
    const tx = x + Math.cos(a) * len;
    const ty = y + Math.sin(a) * len * 0.9;
    const c = k % 2 ? '#e8501a' : '#ff8a2a';
    poly2(ctx, [x - 1.5, y, tx, ty, x + 1.5, y], c);
    dot(ctx, tx, ty, 1.4, EMBER);
  }
  oval(ctx, x, y - 1, 5, 2.5, '#5a3a20');
};

const ashPalm: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.36);
  const s = screenSide(o.facing);
  trunk(ctx, 0.5, 0.5, 0, 44, 3.4, 2.4, '#5a4a44', s * 5);
  for (let k = 1; k < 6; k++) line2(ctx, CX + s * k - 3, sy(0.5, 0.5, k * 8), CX + s * k + 3, sy(0.5, 0.5, k * 8 + 1), '#3a3032', 1);
  const x = CX + s * 5;
  const y = sy(0.5, 0.5, 45);
  const leaves: Array<[number, string]> = [
    [-2.6, '#5c3a2a'],
    [-1.9, '#7a3a24'],
    [-1.1, '#a8401c'],
    [-0.4, '#c84e1c'],
    [0.4, '#a8401c'],
    [1.2, '#7a3a24'],
  ];
  for (const [a, c] of leaves) {
    const tx = x + Math.cos(a) * 22;
    const ty = y + Math.sin(a) * 9 + 9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * 12, y - 8, tx, ty);
    ctx.quadraticCurveTo(x + Math.cos(a) * 10, y - 2, x, y + 2);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
  }
  dot(ctx, x, y, 2.4, '#ff8a2a');
};

const magmaPool: SceneryArtFn = (ctx, o) => {
  const cu = o.ex / 2;
  const cv = o.ey / 2;
  const s = seedOf('magma_pool') + o.facing * 9;
  const rim = (front: boolean): void => {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      if (Math.cos(a) + Math.sin(a) >= 0 !== front) continue;
      rock(ctx, cu + Math.cos(a) * 0.78, cv + Math.sin(a) * 0.78, 0.2, 5 + (k % 3) * 2, k % 2 ? BASALT : '#4a4042', s + k);
    }
  };
  // Rocky rim around a glowing pit: back stones, the pit, then front stones.
  rim(false);
  disc(ctx, cu, cv, 0.66, 1, '#7a1a10');
  disc(ctx, cu, cv, 0.56, 1, '#e8401a');
  disc(ctx, cu + 0.05, cv + 0.05, 0.38, 1, LAVA);
  disc(ctx, cu + 0.1, cv, 0.18, 1, EMBER);
  for (let b = 0; b < 4; b++) {
    const bu = cu - 0.3 + frac(s + b) * 0.6;
    const bv = cv - 0.3 + frac(s + b * 3) * 0.6;
    dot(ctx, sx(bu, bv), sy(bu, bv, 2), 1.8, '#fff0a0');
  }
  dot(ctx, sx(cu, cv), sy(cu, cv, 6), 22, withAlpha(LAVA, 0.18));
  rim(true);
};

const basaltColumns: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.36, 0.25);
  const cols: Array<[number, number, number]> = [
    [0.36, 0.34, 40],
    [0.56, 0.36, 32],
    [0.34, 0.56, 28],
    [0.54, 0.56, 22],
    [0.72, 0.5, 14],
    [0.5, 0.74, 10],
  ];
  const rot = o.facing % 2 ? cols.map(([u, v, h]) => [v, u, h] as [number, number, number]) : cols;
  rot.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  for (const [u, v, h] of rot) {
    // Hexagonal column: three visible faces.
    const r = 0.09;
    poly3(ctx, [u - r, v + r * 0.5, 0, u, v + r, 0, u, v + r, h, u - r, v + r * 0.5, h], '#2f2a2c');
    poly3(ctx, [u, v + r, 0, u + r, v + r * 0.5, 0, u + r, v + r * 0.5, h, u, v + r, h], '#262123');
    poly3(ctx, [u + r, v + r * 0.5, 0, u + r, v - r * 0.5, 0, u + r, v - r * 0.5, h, u + r, v + r * 0.5, h], '#1e1a1b');
    poly3(ctx, [u - r, v - r * 0.5, h, u, v - r, h, u + r, v - r * 0.5, h, u + r, v + r * 0.5, h, u, v + r, h, u - r, v + r * 0.5, h], '#55494b');
  }
};

const volcanoGate: SceneryArtFn = (ctx, o) => {
  const { back, front } = archPosts(o.facing);
  const top = 40;
  const column = (u: number, v: number): void => {
    box(ctx, u - 0.08, v - 0.08, u + 0.08, v + 0.08, 0, top, '#4e4446', BASALT, '#2a2527');
    for (let k = 1; k < 4; k++) line2(ctx, sx(u, v + 0.08) - 2, sy(u, v + 0.08, k * 10), sx(u, v + 0.08) + 1, sy(u, v + 0.08, k * 10 + 4), LAVA, 1.2);
    glow(ctx, sx(u, v), sy(u, v, top + 4), 2.4, LAVA, '#fff0a0');
  };
  if (o.part !== 2) {
    column(back.u, back.v);
    // Jagged basalt lintel with a molten seam.
    poly3(ctx, [back.u, back.v, top - 3, front.u, front.v, top - 3, front.u, front.v, top + 6, (back.u + front.u) / 2, (back.v + front.v) / 2, top + 12, back.u, back.v, top + 6], BASALT, '#1e1a1b');
    poly3(ctx, [back.u, back.v, top + 1, front.u, front.v, top + 1, front.u, front.v, top + 2.5, back.u, back.v, top + 2.5], LAVA);
  }
  if (o.part !== 1) column(front.u, front.v);
};

const wallBasalt: SceneryArtFn = (ctx, o) => {
  const e = edgeOf(o);
  for (let k = 0; k < 5; k++) {
    const p = edgePoint(e, 0.1 + k * 0.2, 0.07);
    const h = 12 + ((k * 5) % 4) * 1.5;
    box(ctx, p.u - 0.07, p.v - 0.07, p.u + 0.07, p.v + 0.07, 0, h, '#55494b', k % 2 ? '#3a3436' : BASALT, '#262123');
    if (k % 2 === 0) line2(ctx, sx(p.u, p.v + 0.07), sy(p.u, p.v + 0.07, 3), sx(p.u, p.v + 0.07) + 2, sy(p.u, p.v + 0.07, 8), LAVA, 1.1);
  }
};

export const VOLCANO_ART: Readonly<Record<string, SceneryArtFn>> = {
  lava_rock: lavaRock,
  lava_crag: lavaCrag,
  steam_vent: steamVent,
  glow_crystal: glowCrystal,
  ember_torch: emberTorch,
  statue_spark: statueSpark,
  fire_fern: fireFern,
  ash_palm: ashPalm,
  magma_pool: magmaPool,
  basalt_columns: basaltColumns,
  volcano_gate: volcanoGate,
  wall_basalt: wallBasalt,
};
