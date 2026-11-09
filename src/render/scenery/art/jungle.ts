/**
 * Jungle Lagoon art (12 items, chill: teals, greens, lagoon blue, bright tropical flowers). Plain mossy stonework,
 * no motifs of any real culture. Owner: W3-D.
 */
import { box, disc } from '../../sprites/shapes';
import { soilBed } from './base';
import {
  archPosts,
  cluster,
  dot,
  edgeBox,
  edgeOf,
  edgePoint,
  facesViewer,
  flowers,
  line2,
  oval,
  poly2,
  poly3,
  post,
  rock,
  screenSide,
  seedOf,
  shade,
  shadow,
  sx,
  sy,
  trunk,
  wilt,
  type Ctx,
  type SceneryArtFn,
} from './kit';

const CX = sx(0.5, 0.5);
const STONE = '#9a9a86';
const MOSS = '#5f9a4a';

/** A palm frond from (x, y) at angle a (screen radians). */
function frond(ctx: Ctx, x: number, y: number, a: number, len: number, colour: string): void {
  const tx = x + Math.cos(a) * len;
  const ty = y + Math.sin(a) * len * 0.55 + len * 0.35;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.55, y - len * 0.3, tx, ty);
  ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.45, y - len * 0.05, x, y + 2);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
}

/** Mossy stone block. */
function stoneBlock(ctx: Ctx, u0: number, v0: number, u1: number, v1: number, h0: number, h1: number, mossy: boolean): void {
  box(ctx, u0, v0, u1, v1, h0, h1, shade(STONE, 1.12), STONE, shade(STONE, 0.78));
  if (mossy) poly3(ctx, [u0, v0, h1, u1, v0, h1, u1, v1, h1, u0, v1, h1], MOSS);
}

const lagoonPalm: SceneryArtFn = (ctx, o) => {
  const s = screenSide(o.facing);
  shadow(ctx, 0.5, 0.5, 0.4);
  trunk(ctx, 0.5, 0.5, 0, 50, 3.6, 2.4, '#9a7a52', s * 9);
  for (let k = 1; k < 7; k++) line2(ctx, CX + (s * 9 * k) / 7 - 3, sy(0.5, 0.5, k * 7), CX + (s * 9 * k) / 7 + 3, sy(0.5, 0.5, k * 7 + 1), '#7a5a3a', 1);
  const x = CX + s * 9;
  const y = sy(0.5, 0.5, 51);
  const leaves = [-2.8, -2.2, -1.4, -0.6, 0, 0.7];
  leaves.forEach((a, k) => frond(ctx, x, y, a, 24, k % 2 ? '#2f9a5a' : '#3fb36a'));
  for (const k of [-1, 0, 1]) dot(ctx, x + k * 2.5, y + 3, 2.2, '#7a5a2a');
};

const giantLeaf: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.36, 0.16);
  const x = CX;
  const y = sy(0.5, 0.5, 0);
  const off = o.facing * 0.3;
  const c = (k: number): string => wilt(k % 2 ? '#2e8a4a' : '#45a85a', o.wilted);
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k - 2) * 0.55 + off * 0.2;
    const len = (o.wilted ? 14 : 20) + (k % 2) * 3;
    const tx = x + Math.cos(a) * len;
    const ty = y + Math.sin(a) * len * (o.wilted ? 0.4 : 1);
    line2(ctx, x, y, tx, ty, wilt('#2a6a3a', o.wilted), 1.2);
    oval(ctx, tx, ty, 7, 4.5, c(k), a + Math.PI / 2);
    line2(ctx, tx - Math.cos(a) * 5, ty - Math.sin(a) * 3, tx + Math.cos(a) * 5, ty + Math.sin(a) * 3, wilt('#8fd08a', o.wilted), 0.7);
  }
};

const bedTropical: SceneryArtFn = (ctx, o) => {
  soilBed(ctx, '#8a7a5a', o.wilted ? '#7b5f3e' : '#5a4028');
  const s = seedOf('bed_tropical') + o.facing * 9;
  cluster(ctx, CX, sy(0.5, 0.5, 5), 13, 6, 4, [wilt('#2e7a4a', o.wilted), wilt('#3f9a55', o.wilted)], s, 8);
  flowers(ctx, 0.5, 0.5, 0.28, 7, ['#ff5a8a', '#ff9a2b', '#ffd23f', '#e84a9a', '#ff7a4a'], s, 12, o.wilted, 2.8);
};

const ruinArch: SceneryArtFn = (ctx, o) => {
  const { back, front } = archPosts(o.facing);
  const top = 32;
  const column = (u: number, v: number): void => {
    for (let k = 0; k < 4; k++) stoneBlock(ctx, u - 0.08, v - 0.08, u + 0.08, v + 0.08, k * 8, k * 8 + 7.5, k === 3);
    cluster(ctx, sx(u, v + 0.08), sy(u, v + 0.08, 14), 3, 6, 2, ['#4a8a3a', MOSS], seedOf('vine') + Math.round(u * 10), 4);
  };
  if (o.part !== 2) {
    column(back.u, back.v);
    // A lintel with one broken corner and hanging vines.
    poly3(ctx, [back.u, back.v, top, front.u, front.v, top, front.u, front.v, top + 6, back.u * 0.6 + front.u * 0.4, back.v * 0.6 + front.v * 0.4, top + 9, back.u, back.v, top + 9], STONE, shade(STONE, 0.7), 0.8);
    for (let k = 1; k < 5; k++) {
      const t = k / 5;
      const u = back.u + (front.u - back.u) * t;
      const v = back.v + (front.v - back.v) * t;
      line2(ctx, sx(u, v), sy(u, v, top), sx(u, v) + 1, sy(u, v, top - 6 - (k % 2) * 5), '#3f8a3a', 1.2);
    }
  }
  if (o.part !== 1) column(front.u, front.v);
};

const mossyPillar: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.24, 0.2);
  stoneBlock(ctx, 0.32, 0.32, 0.68, 0.68, 0, 4, false);
  for (let k = 0; k < 3; k++) stoneBlock(ctx, 0.38, 0.38, 0.62, 0.62, 4 + k * 9, 12 + k * 9, false);
  // The top block sits askew (rotation picks the side it slipped to).
  const d = screenSide(o.facing) * 0.04;
  stoneBlock(ctx, 0.36 + d, 0.36 - d, 0.64 + d, 0.64 - d, 31, 34, true);
  cluster(ctx, sx(0.62, 0.5), sy(0.62, 0.5, 18), 3, 9, 2.2, ['#3f8a3a', MOSS, '#7cc45a'], seedOf('mossy_pillar') + o.facing, 6);
};

const ropeBridge: SceneryArtFn = (ctx, o) => {
  // Two short posts each end and a sagging plank bridge along the long axis (view footprint ex × ey).
  const alongU = o.ex >= o.ey;
  const len = alongU ? o.ex : o.ey;
  const pt = (t: number, side: number): { u: number; v: number } =>
    alongU ? { u: 0.15 + t * (len - 0.3), v: 0.5 + side * 0.22 } : { u: 0.5 + side * 0.22, v: 0.15 + t * (len - 0.3) };
  shadow(ctx, alongU ? len / 2 : 0.5, alongU ? 0.5 : len / 2, 0.7, 0.12);
  for (const t of [0, 1]) for (const sd of [-1, 1]) if (sd === -1) post(ctx, pt(t, sd).u, pt(t, sd).v, 0.04, 0, 22, '#7a5a3a');
  // Planks.
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    const sag = Math.sin(t * Math.PI) * 6;
    const a = pt(t, -1);
    const b = pt(t, 1);
    const h = 14 - sag;
    line2(ctx, sx(a.u, a.v), sy(a.u, a.v, h), sx(b.u, b.v), sy(b.u, b.v, h), k % 2 ? '#a07a4a' : '#8a6a3a', 2.6);
  }
  // Rope rails.
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 10; k++) {
      const t0 = k / 10;
      const t1 = (k + 1) / 10;
      const a = pt(t0, sd);
      const b = pt(t1, sd);
      line2(ctx, sx(a.u, a.v), sy(a.u, a.v, 24 - Math.sin(t0 * Math.PI) * 6), sx(b.u, b.v), sy(b.u, b.v, 24 - Math.sin(t1 * Math.PI) * 6), '#c8a46a', 1.1);
    }
  }
  for (const t of [0, 1]) post(ctx, pt(t, 1).u, pt(t, 1).v, 0.04, 0, 26, '#7a5a3a');
};

const rockWaterfall: SceneryArtFn = (ctx, o) => {
  const cu = o.ex / 2;
  const cv = o.ey / 2;
  const s = seedOf('rock_waterfall') + o.facing * 13;
  shadow(ctx, cu, cv, 0.95, 0.2);
  // Pool in front, cliff behind.
  disc(ctx, cu + 0.3, cv + 0.3, 0.6, 1, '#3fa7d6');
  disc(ctx, cu + 0.3, cv + 0.3, 0.42, 1, '#6cc4e6');
  rock(ctx, cu - 0.35, cv - 0.35, 0.55, 46, '#7d7d6e', s);
  rock(ctx, cu - 0.05, cv - 0.5, 0.42, 38, '#8a8a7a', s + 1);
  rock(ctx, cu - 0.55, cv - 0.05, 0.4, 30, '#76766a', s + 2);
  // The fall: a ribbon from the cliff top into the pool, toward the facing side.
  const side = screenSide(o.facing);
  const x0 = sx(cu - 0.2, cv - 0.2) + side * 4;
  const y0 = sy(cu - 0.2, cv - 0.2, 42);
  const x1 = sx(cu + 0.25, cv + 0.25) + side * 2;
  const y1 = sy(cu + 0.25, cv + 0.25, 2);
  poly2(ctx, [x0 - 5, y0, x0 + 5, y0, x1 + 8, y1, x1 - 8, y1], 'rgba(190,232,250,0.92)');
  for (let k = 0; k < 4; k++) line2(ctx, x0 - 3 + k * 2, y0 + 3, x1 - 6 + k * 4, y1 - 2, 'rgba(255,255,255,0.75)', 0.8);
  cluster(ctx, x1, y1 - 2, 9, 3, 3.5, ['rgba(255,255,255,0.7)', 'rgba(220,245,255,0.8)'], s, 7);
  cluster(ctx, sx(cu - 0.4, cv - 0.4), sy(cu - 0.4, cv - 0.4, 44), 12, 4, 4, ['#3f8a3a', MOSS, '#7cc45a'], s + 5, 7);
};

const bambooGrove: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.34, 0.16);
  const stalks: Array<[number, number, number]> = [
    [0.34, 0.36, 44],
    [0.5, 0.3, 48],
    [0.62, 0.44, 40],
    [0.38, 0.56, 38],
    [0.56, 0.62, 44],
    [0.68, 0.64, 32],
  ];
  const lean = screenSide(o.facing) * 0.08;
  stalks.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  for (const [u, v, h] of stalks) {
    const x = sx(u, v);
    const y = sy(u, v, 0);
    line2(ctx, x, y, x + lean * h, y - h, '#7aa84a', 2.6);
    for (let k = 1; k * 9 < h; k++) line2(ctx, x + lean * k * 9 - 1.6, y - k * 9, x + lean * k * 9 + 1.6, y - k * 9, '#5a8a3a', 1);
    for (const d of [-1, 1]) oval(ctx, x + lean * h + d * 4, y - h + 3, 4.5, 1.6, '#4a9a4a', d * 0.5);
  }
};

const lilyPond: SceneryArtFn = (ctx, o) => {
  disc(ctx, 0.5, 0.5, 0.4, 0, '#6a7a5a');
  disc(ctx, 0.5, 0.5, 0.36, 1, '#2f8fb8');
  disc(ctx, 0.52, 0.52, 0.26, 1, '#4aa8cc');
  const s = seedOf('lily_pond') + o.facing * 7;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + (s % 7) * 0.3 + o.facing * 0.55;
    const u = 0.5 + Math.cos(a) * 0.2;
    const v = 0.5 + Math.sin(a) * 0.2;
    oval(ctx, sx(u, v), sy(u, v, 1.5), 4.5, 2.4, '#3f9a4a');
    poly2(ctx, [sx(u, v), sy(u, v, 1.5), sx(u, v) + 4, sy(u, v, 1.5) - 1, sx(u, v) + 4, sy(u, v, 1.5) + 1], '#2f8fb8');
    if (k % 2 === 0) dot(ctx, sx(u, v) - 1, sy(u, v, 3), 1.8, k === 0 ? '#ff9ac8' : '#ffffff');
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const u = 0.5 + Math.cos(a) * 0.4;
    const v = 0.5 + Math.sin(a) * 0.4;
    if (Math.cos(a) + Math.sin(a) > -0.5) oval(ctx, sx(u, v), sy(u, v, 2), 3.5, 2, k % 2 ? '#9a9a86' : '#8a8a78');
  }
};

const parrotPerch: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.16);
  post(ctx, 0.5, 0.5, 0.03, 0, 18, '#8a6a3a');
  const s = screenSide(o.facing);
  line2(ctx, CX - 8, sy(0.5, 0.5, 18), CX + 8, sy(0.5, 0.5, 18), '#8a6a3a', 2);
  cluster(ctx, CX - s * 7, sy(0.5, 0.5, 19), 3, 2, 2.2, ['#3f9a4a', '#5fbf5a'], seedOf('parrot_perch'), 4);
  // A bright parrot (red, yellow, blue) perched on the bar.
  const x = CX + s * 3;
  const y = sy(0.5, 0.5, 19);
  poly2(ctx, [x - s * 1, y - 2, x - s * 7, y + 9, x - s * 4, y + 9, x + s * 1, y], '#2f6fd0');
  oval(ctx, x, y - 5, 3.6, 5.2, '#e8403a');
  oval(ctx, x - s * 1.5, y - 4, 2, 3.6, '#f5d03b', s * 0.4);
  oval(ctx, x + s * 0.5, y - 11, 3, 3, '#e8403a');
  poly2(ctx, [x + s * 2.6, y - 12, x + s * 5, y - 10.5, x + s * 2.6, y - 9.5], '#3a3030');
  if (facesViewer(o.facing)) dot(ctx, x + s * 1.2, y - 11.6, 0.8, '#1b2433');
};

const fernCluster: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.3, 0.14);
  const x = CX;
  const y = sy(0.5, 0.5, 0);
  for (let k = 0; k < 8; k++) {
    const a = -Math.PI / 2 + (k - 3.5) * 0.38 + o.facing * 0.05;
    const len = o.wilted ? 9 : 13 + (k % 3) * 2;
    const tx = x + Math.cos(a) * len;
    const ty = y + Math.sin(a) * len * (o.wilted ? 0.35 : 0.8);
    const c = wilt(k % 2 ? '#2e8a4a' : '#4aaa5a', o.wilted);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.6, ty - (o.wilted ? 0 : 5), tx, ty);
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    for (let j = 1; j < 4; j++) dot(ctx, x + (tx - x) * (j / 4), y + (ty - y) * (j / 4) - (o.wilted ? 0 : 2), 1.6, c);
  }
};

const wallVine: SceneryArtFn = (ctx, o) => {
  const e = edgeOf(o);
  edgeBox(ctx, e, 0.12, 0, 15, shade(STONE, 1.1), STONE, shade(STONE, 0.78), 0.02);
  const s = seedOf('wall_vine') + e;
  for (let k = 0; k < 4; k++) {
    const p = edgePoint(e, 0.12 + k * 0.25, e === 1 || e === 2 ? 0.0 : 0.12);
    const x = sx(p.u, p.v);
    line2(ctx, x, sy(p.u, p.v, 15), x + (k % 2 ? 2 : -2), sy(p.u, p.v, 3 + (k % 3) * 2), '#3f8a3a', 1.4);
    cluster(ctx, x, sy(p.u, p.v, 10 - (k % 2) * 3), 3, 4, 2, ['#3f8a3a', MOSS, '#7cc45a'], s + k * 11, 4);
  }
  for (let k = 0; k < 3; k++) {
    const p = edgePoint(e, 0.2 + k * 0.3, e === 1 || e === 2 ? 0.0 : 0.12);
    dot(ctx, sx(p.u, p.v), sy(p.u, p.v, 12), 1.6, k % 2 ? '#ff5a8a' : '#ffd23f');
  }
};

export const JUNGLE_ART: Readonly<Record<string, SceneryArtFn>> = {
  lagoon_palm: lagoonPalm,
  giant_leaf: giantLeaf,
  bed_tropical: bedTropical,
  ruin_arch: ruinArch,
  mossy_pillar: mossyPillar,
  rope_bridge_decor: ropeBridge,
  rock_waterfall: rockWaterfall,
  bamboo_grove: bambooGrove,
  lily_pond: lilyPond,
  parrot_perch: parrotPerch,
  fern_cluster: fernCluster,
  wall_vine: wallVine,
};

