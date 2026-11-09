/** Classic Fair art (12 items): striped tents, bunting, tubs, fountain, ticket arch, lamps, bandstand. Owner: W3-D. */
import { box, cone, cylinder, disc, pyramid } from '../../sprites/shapes';
import {
  archPosts,
  dot,
  edgeBox,
  edgeOf,
  edgePoint,
  faceVec,
  flowers,
  glow,
  line2,
  poly2,
  poly3,
  post,
  screenSide,
  seedOf,
  shadow,
  sx,
  sy,
  type Ctx,
  type SceneryArtFn,
} from './kit';

const CX = sx(0.5, 0.5);

/** Small pennant flag on a pole top at screen (x, y). */
function pennant(ctx: Ctx, x: number, y: number, side: 1 | -1, colour: string): void {
  line2(ctx, x, y, x, y - 9, '#5b4a3a', 1.2);
  poly2(ctx, [x, y - 9, x + side * 8, y - 7, x, y - 5], colour);
}

const tentRed: SceneryArtFn = (ctx, o) => {
  const cu = o.ex / 2;
  const cv = o.ey / 2;
  shadow(ctx, cu, cv, 0.95, 0.22);
  cylinder(ctx, cu, cv, 0.82, 0, 18, '#f2ece0', '#f7f2e8');
  // Stripes on the wall (front half).
  for (let k = 0; k < 8; k++) {
    const a = Math.PI * 0.05 + (k / 8) * Math.PI * 0.95;
    if (k % 2) continue;
    const a1 = a + Math.PI / 8;
    const p0 = { u: cu + Math.cos(a) * 0.82, v: cv + Math.sin(a) * 0.82 };
    const p1 = { u: cu + Math.cos(a1) * 0.82, v: cv + Math.sin(a1) * 0.82 };
    poly3(ctx, [p0.u, p0.v, 0, p1.u, p1.v, 0, p1.u, p1.v, 18, p0.u, p0.v, 18], '#d93a2f');
  }
  // Door flap toward the facing (only drawn when it faces the viewer).
  const f = faceVec(o.facing);
  if (o.facing === 1 || o.facing === 2) {
    const du = cu + f.du * 0.82;
    const dv = cv + f.dv * 0.82;
    poly3(ctx, [du - f.dv * 0.18, dv - f.du * 0.18, 0, du + f.dv * 0.18, dv + f.du * 0.18, 0, du, dv, 15], '#3a2420');
  }
  cone(ctx, cu, cv, 0.95, 18, 40, ['#d93a2f', '#f7f2e8'], 16);
  pennant(ctx, sx(cu, cv), sy(cu, cv, 40), screenSide(o.facing), '#f5d03b');
};

const tentBlue: SceneryArtFn = (ctx, o) => {
  const cu = o.ex / 2;
  const cv = o.ey / 2;
  shadow(ctx, cu, cv, 0.9, 0.22);
  box(ctx, 0.25, 0.25, o.ex - 0.25, o.ey - 0.25, 0, 16, '#f4f1ea', '#e9e4da', '#d9d2c4');
  // Vertical stripes on the two visible walls.
  for (let k = 0; k < 6; k += 2) {
    const a = 0.25 + ((o.ex - 0.5) * k) / 6;
    const b = 0.25 + ((o.ex - 0.5) * (k + 1)) / 6;
    poly3(ctx, [a, o.ey - 0.25, 0, b, o.ey - 0.25, 0, b, o.ey - 0.25, 16, a, o.ey - 0.25, 16], '#2f6fd0');
    const c = 0.25 + ((o.ey - 0.5) * k) / 6;
    const d = 0.25 + ((o.ey - 0.5) * (k + 1)) / 6;
    poly3(ctx, [o.ex - 0.25, c, 0, o.ex - 0.25, d, 0, o.ex - 0.25, d, 16, o.ex - 0.25, c, 16], '#2a5fb5');
  }
  if (o.facing === 1 || o.facing === 2) {
    const f = faceVec(o.facing);
    const du = cu + f.du * (o.ex / 2 - 0.25);
    const dv = cv + f.dv * (o.ey / 2 - 0.25);
    poly3(ctx, [du - f.dv * 0.2, dv - f.du * 0.2, 0, du + f.dv * 0.2, dv + f.du * 0.2, 0, du + f.dv * 0.2, dv + f.du * 0.2, 11, du - f.dv * 0.2, dv - f.du * 0.2, 11], '#1d2b48');
  }
  pyramid(ctx, 0.15, 0.15, o.ex - 0.15, o.ey - 0.15, 16, 38, '#2a5fb5', '#3d7fe0', '#f4f1ea');
  // Scalloped valance.
  for (let k = 0; k < 8; k++) {
    const u = 0.2 + ((o.ex - 0.4) * (k + 0.5)) / 8;
    dot(ctx, sx(u, o.ey - 0.15), sy(u, o.ey - 0.15, 15), 2.6, k % 2 ? '#f4f1ea' : '#2f6fd0');
    const v = 0.2 + ((o.ey - 0.4) * (k + 0.5)) / 8;
    dot(ctx, sx(o.ex - 0.15, v), sy(o.ex - 0.15, v, 15), 2.6, k % 2 ? '#2f6fd0' : '#f4f1ea');
  }
  pennant(ctx, sx(cu, cv), sy(cu, cv, 38), screenSide(o.facing), '#e8503a');
};

const buntingPole: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.2);
  post(ctx, 0.5, 0.5, 0.035, 0, 46, '#e9e2d0');
  dot(ctx, CX, sy(0.5, 0.5, 47), 2.6, '#f5d03b');
  const cols = ['#e8503a', '#f5d03b', '#3d9be0', '#7cc04b', '#d457a8'];
  const anchors = o.facing % 2 ? [[0.08, 0.08], [0.92, 0.92]] : [[0.92, 0.08], [0.08, 0.92]];
  for (const [u, v] of anchors) {
    const x0 = CX;
    const y0 = sy(0.5, 0.5, 44);
    const x1 = sx(u as number, v as number);
    const y1 = sy(u as number, v as number, 2);
    line2(ctx, x0, y0, x1, y1, '#4a3a2a', 0.8);
    for (let k = 1; k < 6; k++) {
      const t = k / 6;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 4;
      poly2(ctx, [x - 2.5, y, x + 2.5, y, x, y + 5], cols[(k + (u as number > 0.5 ? 2 : 0)) % cols.length] as string);
    }
    post(ctx, u as number, v as number, 0.02, 0, 3, '#6b5a48');
  }
};

const flowerTub: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.3);
  cylinder(ctx, 0.5, 0.5, 0.24, 0, 9, '#9a6a3c', '#5a3e26');
  for (const h of [2, 7]) disc(ctx, 0.5, 0.5, 0.245, h, '', '#4a4a4a', 1.2);
  flowers(ctx, 0.5, 0.5, 0.18, 9, ['#e8503a', '#f5d03b', '#f2f2f2', '#d457a8'], seedOf('flower_tub') + o.facing * 7, 10, o.wilted, 2.4);
};

const fountainCarved: SceneryArtFn = (ctx, o) => {
  const cu = o.ex / 2;
  const cv = o.ey / 2;
  shadow(ctx, cu, cv, 0.95, 0.2);
  // Octagonal-looking basin: wide cylinder with a carved rim.
  cylinder(ctx, cu, cv, 0.82, 0, 7, '#c6bba8', '#ddd3c1');
  disc(ctx, cu, cv, 0.7, 7, '#3f9fd8');
  disc(ctx, cu, cv, 0.5, 7, '#59b6e6');
  // Carved rosettes on the rim; the rotation turns where they sit.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + o.facing * (Math.PI / 16);
    const u = cu + Math.cos(a) * 0.8;
    const v = cv + Math.sin(a) * 0.8;
    dot(ctx, sx(u, v), sy(u, v, 8), 2, '#efe6d3');
  }
  cylinder(ctx, cu, cv, 0.12, 7, 16, '#c9bfae', '#e2d9c8');
  cylinder(ctx, cu, cv, 0.32, 16, 19, '#c6bba8', '#ddd3c1');
  disc(ctx, cu, cv, 0.26, 19, '#59b6e6');
  cylinder(ctx, cu, cv, 0.06, 19, 24, '#c9bfae', '#e2d9c8');
  const x = sx(cu, cv);
  const y = sy(cu, cv, 25);
  for (const k of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + k * 16, y - 8, x + k * 26, sy(cu, cv, 8));
    ctx.strokeStyle = 'rgba(200,236,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // Underwater lights (flag L).
  glow(ctx, sx(cu + 0.45, cv + 0.2), sy(cu + 0.45, cv + 0.2, 7), 2.2, '#ffe9a0');
  glow(ctx, sx(cu - 0.2, cv + 0.45), sy(cu - 0.2, cv + 0.45, 7), 2.2, '#ffe9a0');
  dot(ctx, x, y - 2, 3, '#e6f7ff');
};

const ticketArch: SceneryArtFn = (ctx, o) => {
  const { back, front } = archPosts(o.facing);
  const top = 34;
  if (o.part !== 2) {
    post(ctx, back.u, back.v, 0.06, 0, top, '#c9302c');
    // Sign board across the posts.
    poly3(ctx, [back.u, back.v, top - 2, front.u, front.v, top - 2, front.u, front.v, top + 9, back.u, back.v, top + 9], '#f5d03b', '#8a2a20');
    poly3(ctx, [back.u, back.v, top + 9, front.u, front.v, top + 9, (back.u + front.u) / 2, (back.v + front.v) / 2, top + 15], '#e8503a');
    for (let k = 1; k < 6; k++) {
      const t = k / 6;
      const u = back.u + (front.u - back.u) * t;
      const v = back.v + (front.v - back.v) * t;
      glow(ctx, sx(u, v), sy(u, v, top + 3.5), 1.4, '#fff3b0');
    }
  }
  if (o.part !== 1) post(ctx, front.u, front.v, 0.06, 0, top, '#c9302c');
};

const lamp: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.15);
  cylinder(ctx, 0.5, 0.5, 0.07, 0, 3, '#2b2f36', '#3d434c');
  post(ctx, 0.5, 0.5, 0.025, 3, 20, '#2b2f36');
  // Scroll bracket and a small park sign on the facing side.
  const f = faceVec(o.facing);
  const bu = 0.5 + f.du * 0.16;
  const bv = 0.5 + f.dv * 0.16;
  line2(ctx, CX, sy(0.5, 0.5, 18), sx(bu, bv), sy(bu, bv, 16), '#2b2f36', 1.4);
  poly3(ctx, [bu - f.dv * 0.06, bv - f.du * 0.06, 9, bu + f.dv * 0.06, bv + f.du * 0.06, 9, bu + f.dv * 0.06, bv + f.du * 0.06, 14, bu - f.dv * 0.06, bv - f.du * 0.06, 14], '#2f8f5a', '#1d5a38', 0.6);
  glow(ctx, CX, sy(0.5, 0.5, 24), 4.2, '#ffe9a0');
};

const bandstand: SceneryArtFn = (ctx, o) => {
  const cu = o.ex / 2;
  const cv = o.ey / 2;
  shadow(ctx, cu, cv, 0.95, 0.2);
  cylinder(ctx, cu, cv, 0.85, 0, 5, '#d8cbb0', '#efe4cd');
  const posts: Array<{ u: number; v: number; d: number }> = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3 + o.facing * 0.2;
    const u = cu + Math.cos(a) * 0.72;
    const v = cv + Math.sin(a) * 0.72;
    posts.push({ u, v, d: u + v });
  }
  posts.sort((a, b) => a.d - b.d);
  const back = posts.slice(0, 3);
  const front = posts.slice(3);
  for (const p of back) post(ctx, p.u, p.v, 0.035, 5, 24, '#f4efe4');
  // A music stand and a drum on the stage.
  cylinder(ctx, cu - 0.15, cv - 0.1, 0.13, 5, 10, '#c9302c', '#f2f2f2');
  line2(ctx, sx(cu + 0.2, cv), sy(cu + 0.2, cv, 5), sx(cu + 0.2, cv), sy(cu + 0.2, cv, 14), '#3a3a3a', 1);
  for (const p of front) post(ctx, p.u, p.v, 0.035, 5, 24, '#f4efe4');
  cone(ctx, cu, cv, 0.95, 24, 36, ['#2f8f5a', '#f4efe4'], 12);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const u = cu + Math.cos(a) * 0.9;
    const v = cv + Math.sin(a) * 0.9;
    if (Math.cos(a) + Math.sin(a) < -0.2) continue;
    glow(ctx, sx(u, v), sy(u, v, 23), 1.3, '#fff0a0');
  }
  dot(ctx, sx(cu, cv), sy(cu, cv, 37), 2.4, '#f5d03b');
};

const picnicTable: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.36, 0.16);
  const along = o.facing % 2 === 0;
  const [a0, a1, b0, b1] = along ? [0.18, 0.82, 0.36, 0.64] : [0.36, 0.64, 0.18, 0.82];
  // Benches on both long sides.
  if (along) {
    box(ctx, 0.2, 0.2, 0.8, 0.28, 3, 5, '#b5875a', '#9a6e44', '#7c5634');
    box(ctx, 0.2, 0.72, 0.8, 0.8, 3, 5, '#b5875a', '#9a6e44', '#7c5634');
  } else {
    box(ctx, 0.2, 0.2, 0.28, 0.8, 3, 5, '#b5875a', '#9a6e44', '#7c5634');
    box(ctx, 0.72, 0.2, 0.8, 0.8, 3, 5, '#b5875a', '#9a6e44', '#7c5634');
  }
  box(ctx, (a0 + a1) / 2 - 0.03, (b0 + b1) / 2 - 0.03, (a0 + a1) / 2 + 0.03, (b0 + b1) / 2 + 0.03, 0, 8, '#8a6038', '#7c5634', '#6a4a2c');
  box(ctx, a0, b0, a1, b1, 8, 10, '#e8503a', '#c9302c', '#a8281f');
  // Checked cloth: 4 cells along the table, 2 across.
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 2; j++) {
      if ((i + j) % 2) continue;
      const [na, nb] = along ? [4, 2] : [2, 4];
      const ia = along ? i : j;
      const ib = along ? j : i;
      const u0 = a0 + ((a1 - a0) * ia) / na;
      const u1 = a0 + ((a1 - a0) * (ia + 1)) / na;
      const v0 = b0 + ((b1 - b0) * ib) / nb;
      const v1 = b0 + ((b1 - b0) * (ib + 1)) / nb;
      poly3(ctx, [u0, v0, 10, u1, v0, 10, u1, v1, 10, u0, v1, 10], '#f7f2e8');
    }
  }
};

const balloonCluster: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.14);
  box(ctx, 0.43, 0.43, 0.57, 0.57, 0, 3, '#8a8f99', '#6a6f78', '#555a62');
  const cols = ['#e8503a', '#f5d03b', '#3d9be0', '#d457a8', '#7cc04b', '#f39a2b', '#8d5ad8'];
  const x = CX;
  const y = sy(0.5, 0.5, 3);
  const s = seedOf('balloon_cluster') + o.facing * 13;
  const pts: Array<[number, number, string]> = [];
  for (let k = 0; k < 7; k++) {
    const a = ((k + (s % 3)) / 7) * Math.PI * 2;
    const bx = x + Math.cos(a) * (6 + (k % 2) * 4);
    const by = sy(0.5, 0.5, 30) + Math.sin(a) * 5 - (k % 3) * 2;
    pts.push([bx, by, cols[k] as string]);
  }
  for (const [bx, by] of pts) line2(ctx, x, y, bx, by + 5, '#e6e6e6', 0.7);
  pts.sort((a, b) => a[1] - b[1]);
  for (const [bx, by, c] of pts) {
    ctx.beginPath();
    ctx.ellipse(bx, by, 4.6, 5.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
    dot(ctx, bx - 1.5, by - 2, 1.3, 'rgba(255,255,255,0.7)');
  }
};

const parkClock: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.2);
  box(ctx, 0.38, 0.38, 0.62, 0.62, 0, 4, '#4a5d4a', '#3a4d3a', '#2c3d2c');
  post(ctx, 0.5, 0.5, 0.05, 4, 24, '#2f5a3a');
  box(ctx, 0.36, 0.36, 0.64, 0.64, 24, 34, '#2f5a3a', '#26492f', '#1d3a25');
  pyramid(ctx, 0.34, 0.34, 0.66, 0.66, 34, 40, '#2f5a3a', '#3f7a4c', '#26492f');
  // Lit faces on the two visible sides; the hands turn with the rotation.
  const faces: Array<[number, number]> = [
    [0.5, 0.645],
    [0.645, 0.5],
  ];
  for (const [u, v] of faces) {
    const x = sx(u, v);
    const y = sy(u, v, 29);
    glow(ctx, x, y, 3.6, '#fff6d0', '#ffffff');
    const a = (o.facing / 4) * Math.PI * 2 - Math.PI / 2;
    line2(ctx, x, y, x + Math.cos(a) * 3, y + Math.sin(a) * 3, '#2a2a2a', 0.9);
    line2(ctx, x, y, x + 2, y - 0.5, '#2a2a2a', 0.9);
  }
  dot(ctx, CX, sy(0.5, 0.5, 41), 1.6, '#f5d03b');
};

const fencePainted: SceneryArtFn = (ctx, o) => {
  const e = edgeOf(o);
  const cols = ['#f2f2f2', '#9bd8f0', '#f2f2f2', '#ffd1e6', '#f2f2f2', '#c8f0b0', '#f2f2f2'];
  edgeBox(ctx, e, 0.03, 4, 5.5, '#f7f7f7', '#e2e2e2', '#cfcfcf', 0.02);
  for (let k = 0; k < 7; k++) {
    const p = edgePoint(e, 0.06 + k * 0.146, 0.04);
    const x = sx(p.u, p.v);
    poly2(ctx, [x - 2, sy(p.u, p.v, 0), x + 2, sy(p.u, p.v, 0), x + 2, sy(p.u, p.v, 9), x, sy(p.u, p.v, 11.5), x - 2, sy(p.u, p.v, 9)], cols[k] as string, '#b9b9b9', 0.5);
  }
};

export const FAIR_ART: Readonly<Record<string, SceneryArtFn>> = {
  tent_red: tentRed,
  tent_blue: tentBlue,
  bunting_pole: buntingPole,
  flower_tub: flowerTub,
  fountain_carved: fountainCarved,
  ticket_arch: ticketArch,
  lamp_globe: lamp,
  bandstand,
  picnic_table: picnicTable,
  balloon_cluster: balloonCluster,
  park_clock: parkClock,
  fence_painted: fencePainted,
};
