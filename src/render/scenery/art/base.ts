/** Base Set art (13 items): trees, shrubs, flower beds, a boulder, a garden fountain, and 3 edge items. Owner: W3-D. */
import {
  canopy,
  cluster,
  dot,
  edgeBox,
  edgeOf,
  edgePoint,
  flowers,
  line2,
  poly2,
  post,
  rock,
  screenSide,
  seedOf,
  shade,
  shadow,
  sx,
  sy,
  tier,
  trunk,
  wilt,
  type Ctx,
  type SceneryArtFn,
  type SceneryArtOpts,
} from './kit';
import { box, cylinder, disc } from '../../sprites/shapes';

const CX = sx(0.5, 0.5);

function seed(id: string, o: SceneryArtOpts): number {
  return seedOf(id) + o.facing * 101;
}

/** Bordered soil bed (flat, 1 tile) for flower beds. */
export function soilBed(ctx: Ctx, rim: string, soil: string, h = 4, inset = 0.12): void {
  box(ctx, inset, inset, 1 - inset, 1 - inset, 0, h, soil, rim, shade(rim, 0.8));
  poly2(ctx, [sx(inset + 0.06, inset + 0.06), sy(inset + 0.06, inset + 0.06, h), sx(1 - inset - 0.06, inset + 0.06), sy(1 - inset - 0.06, inset + 0.06, h), sx(1 - inset - 0.06, 1 - inset - 0.06), sy(1 - inset - 0.06, 1 - inset - 0.06, h), sx(inset + 0.06, 1 - inset - 0.06), sy(inset + 0.06, 1 - inset - 0.06, h)], shade(soil, 0.85));
}

const oak: SceneryArtFn = (ctx, o) => {
  const s = seed('oak_round', o);
  shadow(ctx, 0.5, 0.5, 0.42);
  trunk(ctx, 0.5, 0.5, 0, 26, 4, 3, '#7a5233', screenSide(o.facing) * 1.5);
  canopy(ctx, CX + screenSide(o.facing), sy(0.5, 0.5, 38), 19, '#2f7a34', '#4a9a3c', '#7cc45a', s);
};

const pine: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.32);
  trunk(ctx, 0.5, 0.5, 0, 12, 3, 2.5, '#6a4128');
  const yb = sy(0.5, 0.5, 8);
  const tones = ['#1f5a37', '#25693f', '#2c7848', '#358a52'];
  for (let k = 0; k < 4; k++) tier(ctx, CX + (o.facing % 2 ? 0.5 : -0.5) * k * 0.4, yb - k * 14, 17 - k * 3.3, 26, tones[k] as string);
};

const birch: SceneryArtFn = (ctx, o) => {
  const s = seed('birch_silver', o);
  const side = screenSide(o.facing);
  shadow(ctx, 0.5, 0.5, 0.3);
  trunk(ctx, 0.5, 0.5, 0, 34, 2.6, 1.6, '#eeeae0', side * 2);
  for (let k = 0; k < 4; k++) line2(ctx, CX - 2 + side * k * 0.4, sy(0.5, 0.5, 6 + k * 7), CX + 1 + side * k * 0.4, sy(0.5, 0.5, 6 + k * 7), '#3b3833', 1.2);
  cluster(ctx, CX + side * 3, sy(0.5, 0.5, 40), 13, 11, 8, ['#8fb34a', '#a9c95a', '#cfe38a'], s, 9);
};

const willow: SceneryArtFn = (ctx, o) => {
  const s = seed('willow', o);
  const side = screenSide(o.facing);
  shadow(ctx, 0.5, 0.5, 0.45);
  trunk(ctx, 0.5, 0.5, 0, 28, 4.5, 3, '#6e5034', side * 2);
  const top = sy(0.5, 0.5, 44);
  canopy(ctx, CX + side * 2, top, 16, '#4f8a3a', '#6aa548', '#9ccd6a', s);
  // Hanging strands.
  for (let k = 0; k < 11; k++) {
    const x = CX + side * 2 - 20 + k * 4;
    const len = 18 + 10 * Math.sin(k * 1.7 + o.facing);
    line2(ctx, x, top - 2 + Math.abs(k - 5) * 0.8, x + side * 1.5, top + len, k % 2 ? '#7fb85a' : '#5f9a44', 2);
  }
};

const shrubRound: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.32);
  canopy(ctx, CX, sy(0.5, 0.5, 9), 12, '#2f6f35', '#4b9440', '#80c35c', seed('shrub_round', o));
};

const shrubFlowering: SceneryArtFn = (ctx, o) => {
  const s = seed('shrub_flowering', o);
  shadow(ctx, 0.5, 0.5, 0.32);
  canopy(ctx, CX, sy(0.5, 0.5, o.wilted ? 7 : 9), o.wilted ? 10.5 : 12, wilt('#2f6f35', o.wilted), wilt('#4b9440', o.wilted), wilt('#80c35c', o.wilted), s);
  flowers(ctx, 0.5, 0.5, 0.22, o.wilted ? 10 : 14, ['#f27fb2', '#ffd1e6', '#e85597'], s, 9, o.wilted, 2);
};

const bedMixed: SceneryArtFn = (ctx, o) => {
  soilBed(ctx, '#9b7a55', o.wilted ? '#7b5f3e' : '#6a4a30');
  flowers(ctx, 0.5, 0.5, 0.3, 5, ['#e8503a', '#f5d03b', '#8d5ad8', '#f2f2f2', '#d457a8'], seed('bed_mixed', o), 16, o.wilted);
};

const bedTulip: SceneryArtFn = (ctx, o) => {
  soilBed(ctx, '#a08a6a', o.wilted ? '#7b5f3e' : '#6a4a30');
  const rows: Array<[number, string]> = [
    [0.3, '#e8403a'],
    [0.5, '#f5c63b'],
    [0.7, '#e8403a'],
  ];
  const across = o.facing % 2 === 0;
  for (const [t, c] of rows) {
    for (let k = 0; k < 5; k++) {
      const a = 0.24 + k * 0.13;
      const u = across ? a : t;
      const v = across ? t : a;
      const x = sx(u, v);
      const y = sy(u, v, 4);
      line2(ctx, x, y, x + (o.wilted ? 2 : 0), y - (o.wilted ? 4 : 8), o.wilted ? '#7d6a3a' : '#3f8a3a', 1.3);
      if (o.wilted) dot(ctx, x + 3, y - 3, 1.6, wilt(c, true));
      else poly2(ctx, [x - 2.2, y - 8, x - 2.2, y - 12, x - 0.8, y - 10.5, x, y - 12.5, x + 0.8, y - 10.5, x + 2.2, y - 12, x + 2.2, y - 8, x, y - 6.5], c);
    }
  }
};

const boulder: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.38, 0.25);
  rock(ctx, 0.5, 0.52, 0.34, 16, '#9a9690', seedOf('boulder') + o.facing * 3);
  rock(ctx, 0.74, 0.7, 0.13, 6, '#8a8680', seedOf('pebble') + o.facing);
};

const fountainGarden: SceneryArtFn = (ctx, o) => {
  shadow(ctx, 0.5, 0.5, 0.42);
  cylinder(ctx, 0.5, 0.5, 0.36, 0, 6, '#b8b1a4', '#d7d0c2');
  disc(ctx, 0.5, 0.5, 0.29, 6, '#4aa6d6');
  cylinder(ctx, 0.5, 0.5, 0.06, 6, 15, '#c9c2b4', '#e2dccf');
  cylinder(ctx, 0.5, 0.5, 0.13, 15, 17, '#b8b1a4', '#d7d0c2');
  // Water arcs (the rotation turns which side splashes higher).
  const side = screenSide(o.facing);
  for (const k of [-1, 1]) {
    const x0 = CX;
    const y0 = sy(0.5, 0.5, 19);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x0 + k * 9, y0 - (k === side ? 10 : 6), x0 + k * 14, sy(0.5, 0.5, 7));
    ctx.strokeStyle = 'rgba(190,232,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  dot(ctx, CX, sy(0.5, 0.5, 21), 2.5, '#d8f2ff');
};

const hedgeLow: SceneryArtFn = (ctx, o) => {
  const e = edgeOf(o);
  edgeBox(ctx, e, 0.16, 0, 9, '#5aa64a', '#3f8a3a', '#2f6f35', 0.02);
  for (let k = 0; k < 5; k++) {
    const p = edgePoint(e, 0.1 + k * 0.2, 0.08);
    dot(ctx, sx(p.u, p.v), sy(p.u, p.v, 9), 3.2, k % 2 ? '#6cb85a' : '#4f9a44');
  }
};

const fenceWood: SceneryArtFn = (ctx, o) => {
  const e = edgeOf(o);
  for (let k = 0; k <= 4; k++) {
    const p = edgePoint(e, 0.04 + k * 0.23, 0.05);
    post(ctx, p.u, p.v, 0.025, 0, 10, '#8a6038');
  }
  edgeBox(ctx, e, 0.04, 6, 8, '#b5875a', '#9a6e44', '#7c5634', 0.02);
  edgeBox(ctx, e, 0.04, 2, 4, '#b5875a', '#9a6e44', '#7c5634', 0.02);
};

const railIron: SceneryArtFn = (ctx, o) => {
  const e = edgeOf(o);
  for (let k = 0; k <= 6; k++) {
    const p = edgePoint(e, 0.04 + k * 0.153, 0.05);
    line2(ctx, sx(p.u, p.v), sy(p.u, p.v, 0), sx(p.u, p.v), sy(p.u, p.v, 10), '#2b2f36', 1.4);
    dot(ctx, sx(p.u, p.v), sy(p.u, p.v, 11), 1.6, '#3d434c');
  }
  edgeBox(ctx, e, 0.03, 8, 9.5, '#4a515c', '#30353d', '#22262c', 0.02);
};

export const BASE_ART: Readonly<Record<string, SceneryArtFn>> = {
  oak_round: oak,
  pine_tall: pine,
  birch_silver: birch,
  willow,
  shrub_round: shrubRound,
  shrub_flowering: shrubFlowering,
  bed_mixed: bedMixed,
  bed_tulip: bedTulip,
  boulder,
  fountain_garden: fountainGarden,
  hedge_low: hedgeLow,
  fence_wood: fenceWood,
  rail_iron: railIron,
};

