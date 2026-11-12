/** Phase 8 stage 0 prototype (never merged): the carousel twin, drawn from the draft `carousel` (`pixel3.py:454-482`). */
import type { RideArtState } from '../../sprites/rides';
import { circlePt, sx, sy, type ArtCtx } from '../../sprites/shapes';
import { px, stamp, type Stamp } from '../stamp';
import { pixelCone, pixelCylinder } from './shapes';

// Draft art pixels become world pixels × 2; radii × 0.8 (R) and heights × 0.75 (Z) of the draft values.
// Colours are slot names. The twin calls no translate, scale, rotate or setTransform (§5.4 rule 6).

const R = 0.8;
/** World pixels of height per draft art pixel of height (2 × 0.75). */
const Z = 1.5;
const TAU = Math.PI * 2;

/** The draft horse (`pixel3.py:267`); used only here, so the carousel drop build loses it. */
const HORSE: Stamp = {
  rows: ['.....oo..', '....oWWo.', '.oooWWWo.', 'oWWWWWo..', 'oWSSWWo..', 'oWWWWWo..', '.oWoWo...', '.oo.oo...'],
};
const SADDLES = ['o4', 'b2', 'v2', 'p2'] as const;

/** The nearest even world pixel (stamps and single pixels sit on the art grid). */
const even = (v: number): number => 2 * Math.round(v / 2);

/** A stroke between two map points at two heights, one art pixel wide (no ink). */
function pole(ctx: ArtCtx, u: number, v: number, h0: number, h1: number, slot: string): void {
  ctx.beginPath();
  ctx.moveTo(sx(u, v), sy(u, v, h0));
  ctx.lineTo(sx(u, v), sy(u, v, h1));
  ctx.strokeStyle = slot;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** One horse: its pole, then its stamp (the draft map: `W` c1 or o1, `S` o4, b2, v2, p2). */
function horse(ctx: ArtCtx, u: number, v: number, k: number): void {
  pole(ctx, u, v, 5 * Z, 35 * Z, 'o1');
  const x = even(sx(u, v));
  const y = even(sy(u, v, (8 + (k % 2) * 4) * Z) + 4);
  stamp(ctx, HORSE, x, y, { W: k % 2 ? 'c1' : 'o1', S: SADDLES[k % 4] as string });
}

/** The carousel: the body layer (platform, drum, horses, poles, centre pole) and the roof layer (valance, cone, flag). */
function pixelCarousel(ctx: ArtCtx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  // Body: platform and drum.
  pixelCylinder(ctx, cu, cv, 1.62 * R, 0, 3 * Z, 'c2', 'c1');
  pixelCylinder(ctx, cu, cv, 1.46 * R, 3 * Z, 5 * Z, 't2', 't1');
  const x0 = sx(cu, cv);
  const y5 = sy(cu, cv, 5 * Z);
  ctx.beginPath();
  ctx.ellipse(x0, y5, 27 * 2 * R, 13 * 2 * R, 0, 0, TAU);
  ctx.strokeStyle = 't2';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Horses turn with the angle; the back half before the centre pole, the front half after.
  const horses: Array<{ u: number; v: number; k: number }> = [];
  for (let k = 0; k < 8; k++) {
    const p = circlePt(cu, cv, 1.06 * R, TAU * (k / 8 + st.angle));
    horses.push({ u: p.u, v: p.v, k });
  }
  horses.sort((a, b) => a.u + a.v - (b.u + b.v));
  for (const h of horses) if (h.u + h.v < cu + cv) horse(ctx, h.u, h.v, h.k);
  pixelCylinder(ctx, cu, cv, 0.28 * R, 5 * Z, 35 * Z, 'c1', 'c1');
  // Garlands on the centre pole (lower half ellipses).
  for (const z of [11, 19, 27, 33]) {
    ctx.beginPath();
    ctx.ellipse(x0, sy(cu, cv, z * Z), 6 * 2 * R, 3 * 2 * R, 0, 0, Math.PI);
    ctx.strokeStyle = 'o3';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  for (const h of horses) if (h.u + h.v >= cu + cv) horse(ctx, h.u, h.v, h.k);
  // Roof: a new layer, so its ink ring lies over the body.
  ctx.layer?.();
  const rv = 1.7 * R;
  pixelCylinder(ctx, cu, cv, rv, 35 * Z, 39 * Z, 'c1', 'c1');
  // Scalloped valance on the visible rim.
  for (let k = 0; k < 24; k += 2) {
    const a0 = -Math.PI / 4 + (k * Math.PI) / 24;
    const a1 = -Math.PI / 4 + ((k + 1) * Math.PI) / 24;
    const p0 = circlePt(cu, cv, rv, a0);
    const p1 = circlePt(cu, cv, rv, a1);
    ctx.beginPath();
    ctx.moveTo(sx(p0.u, p0.v), sy(p0.u, p0.v, 39 * Z));
    ctx.lineTo(sx(p1.u, p1.v), sy(p1.u, p1.v, 39 * Z));
    ctx.lineTo(sx(p1.u, p1.v), sy(p1.u, p1.v, 35 * Z));
    ctx.lineTo(sx(p0.u, p0.v), sy(p0.u, p0.v, 35 * Z));
    ctx.closePath();
    ctx.fillStyle = k < 14 ? 't3' : 't4';
    ctx.fill();
  }
  // The cone: 1.4 tiles, the Classic roof radius.
  pixelCone(ctx, cu, cv, 1.4, 39 * Z, 56 * Z, ['t2', 'c1'], 16);
  // Finial, flag pole and flag; the flag top is 98 world pixels, the Classic flag top.
  const ya = sy(cu, cv, 56 * Z);
  ctx.fillStyle = 'o1';
  ctx.fillRect(x0 - 2, ya - 6, 6, 6);
  ctx.beginPath();
  ctx.moveTo(x0, ya - 6);
  ctx.lineTo(x0, sy(cu, cv, 98));
  ctx.strokeStyle = 'w3';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x0 + 2, sy(cu, cv, 98));
  ctx.lineTo(x0 + 12, sy(cu, cv, 63 * Z));
  ctx.lineTo(x0 + 2, sy(cu, cv, 62 * Z));
  ctx.closePath();
  ctx.fillStyle = 'o4';
  ctx.fill();
  // Bulbs on the front rim.
  for (let k = 0; k < 13; k++) {
    const p = circlePt(cu, cv, 1.72 * R, -Math.PI / 4 + (k * Math.PI) / 12);
    px(ctx, even(sx(p.u, p.v)), even(sy(p.u, p.v, 36 * Z)), 'o1');
  }
}

/** Pixel twins of flat rides, read at call time by `drawRideArt`. Not frozen: a test spies on an entry. */
export const PIXEL_RIDE_ART: Readonly<Record<string, (ctx: ArtCtx, ex: number, ey: number, st: RideArtState) => void>> =
  import.meta.env.VITE_PROTO_DROP === 'carousel' ? {} : { carousel: pixelCarousel };
