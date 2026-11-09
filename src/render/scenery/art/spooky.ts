/** Spooky Hollow art (12 items, chill and spooky, family-friendly: violets, teal greys, pumpkin orange). Owner: W3-D. */
import { box, cylinder, disc, pyramid } from '../../sprites/shapes';
import {
  archPosts,
  cluster,
  dot,
  edgeBox,
  edgeOf,
  edgePoint,
  eyes,
  facesViewer,
  glow,
  line2,
  oval,
  poly2,
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
  withAlpha,
  type Ctx,
  type SceneryArtFn,
} from './kit';

const CX = sx(0.5, 0.5);
const BARK = '#4b3d45';
const PUMPKIN = '#f08a24';
const GHOST = '#eef0ff';
const VIOLET = '#b48cff';

/** Bare branches: a recursive-looking fork drawn as fixed segments. */
function branches(ctx: Ctx, x: number, y: number, len: number, a: number, depth: number, width: number, colour: string, twist: number): void {
  const tx = x + Math.cos(a) * len;
  const ty = y + Math.sin(a) * len;
  line2(ctx, x, y, tx, ty, colour, width);
  if (depth === 0) return;
  branches(ctx, tx, ty, len * 0.68, a - 0.5 + twist, depth - 1, width * 0.65, colour, twist);
  branches(ctx, tx, ty, len * 0.62, a + 0.45 + twist, depth - 1, width * 0.65, colour, twist);
}

const treeBare: SceneryArtFn = (ctx, o) => {
  const s = screenSide(o.facing);
  shadow(ctx, 0.5, 0.5, 0.34, 0.18);
  trunk(ctx, 0.5, 0.5, 0, 30, 4, 2.4, BARK, s * 2);
  const x = CX + s * 2;
  const y = sy(0.5, 0.5, 30);
  branches(ctx, x, y, 12, -Math.PI / 2 - 0.5, 2, 2.6, BARK, s * 0.05);
  branches(ctx, x, y, 13, -Math.PI / 2 + 0.55, 2, 2.6, BARK, -s * 0.05);
  branches(ctx, x, y + 6, 9, -Math.PI / 2 + s * 1.1, 1, 2, BARK, 0);
};

const treeTwisted: SceneryArtFn = (ctx, o) => {
  const s = screenSide(o.facing);
  shadow(ctx, 0.5, 0.5, 0.34, 0.18);
  const x = CX;
  const y = sy(0.5, 0.5, 0);
  // S-shaped trunk.
  ctx.beginPath();
  ctx.moveTo(x - 5, y);
  ctx.bezierCurveTo(x - 10 * s, y - 14, x + 12 * s, y - 22, x + 2 * s, y - 38);
  ctx.lineTo(x + 6 * s, y - 37);
  ctx.bezierCurveTo(x + 16 * s, y - 22, x - 4 * s, y - 14, x + 5, y);
  ctx.closePath();
  ctx.fillStyle = '#5a4552';
  ctx.fill();
  branches(ctx, x + 4 * s, y - 37, 11, -Math.PI / 2 - s * 0.7, 2, 2.4, '#5a4552', s * 0.12);
  branches(ctx, x + 4 * s, y - 37, 9, -Math.PI / 2 + s * 0.6, 1, 2.2, '#5a4552', s * 0.12);
  // A few violet leaves left.
  cluster(ctx, x + 6 * s, y - 44, 8, 5, 3, ['#6a4a8a', '#8a6ab0'], seedOf('tree_twisted') + o.facing, 5);
  // A knot hole with two friendly glowing eyes.
  oval(ctx, x + s * 2, y - 20, 3, 3.6, '#2a1f28');
  dot(ctx, x + s * 1, y - 20.5, 0.8, '#ffe066');
  dot(ctx, x + s * 3, y - 20.5, 0.8, '#ffe066');
};

/** A round pumpkin at screen point (x, y) (bottom centre). */
function pumpkin(ctx: Ctx, x: number, y: number, r: number, colour: string, face: 0 | 1 | -1, lit: boolean): void {
  for (const dx of [-0.55, 0.55, 0]) oval(ctx, x + dx * r, y - r * 0.8, r * 0.62, r * 0.8, dx === 0 ? colour : shade(colour, 0.85));
  poly2(ctx, [x - 1, y - r * 1.55, x + 1, y - r * 1.55, x + 2, y - r * 2, x, y - r * 2.05], '#4a6a2a');
  if (face === 0) return;
  const f = face;
  const c = lit ? '#ffe066' : '#3a2010';
  poly2(ctx, [x + f * r * 0.1 - r * 0.42, y - r * 1.0, x + f * r * 0.1 - r * 0.2, y - r * 1.25, x + f * r * 0.1 - r * 0.05, y - r * 1.0], c);
  poly2(ctx, [x + f * r * 0.1 + r * 0.05, y - r * 1.0, x + f * r * 0.1 + r * 0.2, y - r * 1.25, x + f * r * 0.1 + r * 0.42, y - r * 1.0], c);
  poly2(ctx, [x + f * r * 0.1 - r * 0.4, y - r * 0.65, x + f * r * 0.1 + r * 0.4, y - r * 0.65, x + f * r * 0.1, y - r * 0.35], c);
}

const pumpkinPatch: SceneryArtFn = (ctx, o) => {
  const s = seedOf('pumpkin_patch') + o.facing * 17;
  shadow(ctx, 0.5, 0.5, 0.4, 0.14);
  oval(ctx, CX, sy(0.5, 0.5, 0), 24, 12, o.wilted ? '#6a5a3a' : '#4a3a28');
  // Vines and leaves.
  cluster(ctx, CX, sy(0.5, 0.5, 2), 16, 7, 4, [wilt('#2e5a2a', o.wilted), wilt('#3f7a35', o.wilted)], s, 9);
  const spots: Array<[number, number, number]> = [
    [0.36, 0.42, 6],
    [0.62, 0.4, 5],
    [0.44, 0.66, 7],
    [0.7, 0.66, 4.5],
  ];
  for (const [u, v, r] of spots) pumpkin(ctx, sx(u, v), sy(u, v, 1), o.wilted ? r * 0.8 : r, wilt(PUMPKIN, o.wilted), 0, false);
};

const pumpkinLantern: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.2);
  const s = screenSide(o.facing);
  dot(ctx, CX, sy(0.5, 0.5, 6), 13, withAlpha('#ffb040', 0.2));
  pumpkin(ctx, CX, sy(0.5, 0.5, 0), 8, PUMPKIN, facesViewer(o.facing) ? s : 0, true);
  if (!facesViewer(o.facing)) glow(ctx, CX, sy(0.5, 0.5, 13), 2, '#ffcf60');
};

/** A small round ghost (cute, Boo-style) at screen point (x, y) (bottom), looking to screen side s. */
function ghost(ctx: Ctx, x: number, y: number, r: number, s: 1 | -1, front: boolean): void {
  dot(ctx, x, y - r, r * 1.7, withAlpha(VIOLET, 0.22));
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x - r, y - r);
  ctx.arc(x, y - r, r, Math.PI, 0);
  ctx.lineTo(x + r, y);
  for (let k = 0; k < 4; k++) {
    const x0 = x + r - (k * r) / 2;
    ctx.quadraticCurveTo(x0 - r / 4, y - r * 0.35, x0 - r / 2, y);
  }
  ctx.closePath();
  ctx.fillStyle = GHOST;
  ctx.fill();
  if (front) {
    eyes(ctx, x + s * r * 0.2, y - r * 1.1, r * 0.32, r * 0.2, s, '#2a2440', '#2a2440');
    oval(ctx, x + s * r * 0.2, y - r * 0.65, r * 0.18, r * 0.12, '#ff9ac8');
  }
}

const ghostLantern: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.15);
  post(ctx, 0.5, 0.5, 0.025, 0, 20, '#3a3446');
  const x = CX;
  const y = sy(0.5, 0.5, 20);
  const s = screenSide(o.facing);
  line2(ctx, x, y, x + s * 7, y - 2, '#3a3446', 1.4);
  line2(ctx, x + s * 7, y - 2, x + s * 7, y + 2, '#3a3446', 0.8);
  // The lantern is a little glowing ghost hanging from the arm.
  ghost(ctx, x + s * 7, y + 12, 4.5, s, facesViewer(o.facing));
  glow(ctx, x + s * 7, y + 7, 1.6, '#d8c8ff', '#ffffff');
};

const gateCrooked: SceneryArtFn = (ctx, o) => {
  const { back, front } = archPosts(o.facing);
  const top = 30;
  const pillar = (u: number, v: number, lean: number): void => {
    box(ctx, u - 0.07, v - 0.07, u + 0.07, v + 0.07, 0, top, '#6a6a78', '#55556a', '#44445a');
    const x = sx(u, v);
    poly2(ctx, [x - 4, sy(u, v, top), x + 4 + lean, sy(u, v, top + 7), x + lean, sy(u, v, top + 11)], '#55556a');
  };
  if (o.part !== 2) {
    pillar(back.u, back.v, -2);
    // A crooked iron arch with swirls and a tiny bat-shaped (cartoon) weathervane.
    const n = 8;
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const p = (t: number): [number, number] => {
        const u = back.u + (front.u - back.u) * t;
        const v = back.v + (front.v - back.v) * t;
        return [sx(u, v) + Math.sin(t * 9) * 1.2, sy(u, v, top + 4 + Math.sin(t * Math.PI) * 10 + (t > 0.5 ? 2 : 0))];
      };
      const [x0, y0] = p(t0);
      const [x1, y1] = p(t1);
      line2(ctx, x0, y0, x1, y1, '#2a2833', 2);
    }
    const mu = (back.u + front.u) / 2;
    const mv = (back.v + front.v) / 2;
    const mx = sx(mu, mv);
    const my = sy(mu, mv, top + 16);
    ctx.beginPath();
    ctx.arc(mx - 4, my + 3, 3, 0, Math.PI * 1.6);
    ctx.strokeStyle = '#2a2833';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    poly2(ctx, [mx - 5, my - 3, mx - 1, my - 5, mx, my - 3, mx + 1, my - 5, mx + 5, my - 3, mx, my - 1], '#2a2833');
  }
  if (o.part !== 1) pillar(front.u, front.v, 2);
};

const statueBoo: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.28);
  cylinder(ctx, 0.5, 0.5, 0.22, 0, 6, '#5a5470', '#7a7494');
  ghost(ctx, CX, sy(0.5, 0.5, 9), 8, screenSide(o.facing), facesViewer(o.facing));
  glow(ctx, sx(0.3, 0.7), sy(0.3, 0.7, 6), 1.5, VIOLET, '#f0e8ff');
  glow(ctx, sx(0.7, 0.3), sy(0.7, 0.3, 6), 1.5, VIOLET, '#f0e8ff');
};

const oldWell: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.34, 0.18);
  cylinder(ctx, 0.5, 0.5, 0.26, 0, 9, '#7a7680', '#8e8a94');
  disc(ctx, 0.5, 0.5, 0.2, 9, '#1f2a33');
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI;
    const u = 0.5 + Math.cos(a) * 0.26;
    const v = 0.5 + Math.sin(a) * 0.26;
    line2(ctx, sx(u, v), sy(u, v, 1), sx(u, v), sy(u, v, 8), '#6a6670', 0.8);
  }
  const along = o.facing % 2 === 0;
  const [u0, v0, u1, v1] = along ? [0.24, 0.5, 0.76, 0.5] : [0.5, 0.24, 0.5, 0.76];
  post(ctx, u0, v0, 0.025, 9, 20, '#5a4030');
  post(ctx, u1, v1, 0.025, 9, 20, '#5a4030');
  line2(ctx, sx(u0, v0), sy(u0, v0, 17), sx(u1, v1), sy(u1, v1, 17), '#5a4030', 1.6);
  line2(ctx, CX, sy(0.5, 0.5, 17), CX, sy(0.5, 0.5, 11), '#9a8a6a', 0.8);
  box(ctx, 0.46, 0.46, 0.54, 0.54, 9, 12, '#7a5a3a', '#6a4a2c', '#5a3e24');
  if (along) pyramid(ctx, 0.2, 0.36, 0.8, 0.64, 20, 26, '#4a3a4a', '#5a4a5c', '#3a2e3c');
  else pyramid(ctx, 0.36, 0.2, 0.64, 0.8, 20, 26, '#4a3a4a', '#5a4a5c', '#3a2e3c');
};

const fogPot: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.3, 0.18);
  // A stone urn with violet fog spilling over the rim.
  cylinder(ctx, 0.5, 0.5, 0.17, 0, 3, '#5a5470', '#6a6484');
  cylinder(ctx, 0.5, 0.5, 0.24, 3, 10, '#6a6484', '#7a7494');
  disc(ctx, 0.5, 0.5, 0.18, 10, '#2a2440');
  const s = seedOf('fog_pot') + o.facing * 5;
  cluster(ctx, CX, sy(0.5, 0.5, 12), 14, 6, 6, ['rgba(180,140,255,0.35)', 'rgba(200,170,255,0.45)', 'rgba(225,210,255,0.55)'], s, 9);
  cluster(ctx, CX + screenSide(o.facing) * 10, sy(0.5, 0.5, 2), 10, 4, 5, ['rgba(180,140,255,0.3)', 'rgba(210,190,255,0.4)'], s + 1, 5);
};

const owlPerch: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.16);
  post(ctx, 0.5, 0.5, 0.035, 0, 24, '#5a4552');
  const s = screenSide(o.facing);
  line2(ctx, CX - 9, sy(0.5, 0.5, 24), CX + 9, sy(0.5, 0.5, 24), '#5a4552', 2.2);
  const x = CX + s * 4;
  const y = sy(0.5, 0.5, 25);
  // A round, friendly owl.
  oval(ctx, x, y - 7, 5.5, 7, '#8a7a9a');
  oval(ctx, x, y - 6, 3.5, 4.5, '#c8bcd6');
  for (const k of [-1, 1]) poly2(ctx, [x + k * 2, y - 12, x + k * 5, y - 16, x + k * 4.5, y - 11], '#8a7a9a');
  if (facesViewer(o.facing)) {
    dot(ctx, x - 2, y - 10, 2.2, '#fff6cc');
    dot(ctx, x + 2, y - 10, 2.2, '#fff6cc');
    dot(ctx, x - 2 + s * 0.4, y - 10, 1, '#2a2440');
    dot(ctx, x + 2 + s * 0.4, y - 10, 1, '#2a2440');
    poly2(ctx, [x - 0.8, y - 8.5, x + 0.8, y - 8.5, x, y - 7], '#f0a030');
  } else {
    line2(ctx, x - 3, y - 4, x + 3, y - 4, '#6a5a7a', 1);
  }
};

const mossyStones: SceneryArtFn = (ctx, o) => {
  const s = seedOf('mossy_stones') + o.facing * 7;
  rock(ctx, 0.38, 0.4, 0.17, 7, '#7a7a86', s);
  rock(ctx, 0.64, 0.5, 0.15, 5, '#6e6e7a', s + 1);
  rock(ctx, 0.46, 0.68, 0.13, 4, '#84848e', s + 2);
  for (const [u, v, h] of [[0.38, 0.4, 7], [0.64, 0.5, 5], [0.46, 0.68, 4]] as const) cluster(ctx, sx(u, v), sy(u, v, h), 4, 1.6, 1.8, ['#4a7a4a', '#5f9a55'], s + u * 100, 4);
};

const fenceSpiked: SceneryArtFn = (ctx, o) => {
  const e = edgeOf(o);
  edgeBox(ctx, e, 0.04, 2, 3.5, '#4a4458', '#33303e', '#26232e', 0.02);
  edgeBox(ctx, e, 0.04, 11, 12.5, '#4a4458', '#33303e', '#26232e', 0.02);
  for (let k = 0; k <= 7; k++) {
    const p = edgePoint(e, 0.03 + k * 0.134, 0.05);
    const x = sx(p.u, p.v);
    line2(ctx, x, sy(p.u, p.v, 0), x, sy(p.u, p.v, 14), '#2a2833', 1.5);
    poly2(ctx, [x - 1.8, sy(p.u, p.v, 14), x, sy(p.u, p.v, 18.5), x + 1.8, sy(p.u, p.v, 14)], '#2a2833');
  }
  const m = edgePoint(e, 0.5, 0.05);
  dot(ctx, sx(m.u, m.v), sy(m.u, m.v, 7.5), 2, VIOLET);
};

export const SPOOKY_ART: Readonly<Record<string, SceneryArtFn>> = {
  tree_bare: treeBare,
  tree_twisted: treeTwisted,
  pumpkin_patch: pumpkinPatch,
  pumpkin_lantern: pumpkinLantern,
  ghost_lantern: ghostLantern,
  gate_crooked: gateCrooked,
  statue_boo: statueBoo,
  old_well: oldWell,
  fog_pot: fogPot,
  owl_perch: owlPerch,
  mossy_stones: mossyStones,
  fence_spiked: fenceSpiked,
};
