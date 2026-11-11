/** Phase 8 stage 0 prototype (never merged): the twins of the iso primitives `box`, `cylinder`, `cone`, `pyramid`, `head` (spec §8.1 items 2, 3). */
import { circlePt, ellipseRadii, sx, sy, type ArtCtx } from '../../sprites/shapes';
import { RAMPS, SLOT_NAMES, paletteStats, slotIndex, slotOf, tone, type RampId } from '../palette';
import { isPixelSurface } from '../surface';

/** Share of a cylinder's width that is lit, from the left (§8.1 item 3, §15). */
export const CYLINDER_LIT_SHARE = 0.6;
/** Segments of every cone (§8.1 item 3); the `segments` argument is ignored (Prototype decision 7). */
export const CONE_SEGMENTS = 16;

// The twins call no translate, scale, rotate or setTransform (§5.4 rule 6).

const SLOT_SET: ReadonlySet<string> = new Set(SLOT_NAMES.slice(1));

/**
 * The slot of a CSS colour. A miss also counts on the surface, as its own fill would.
 * A slot name selects its slot with no miss, as `fillStyle` does on a surface (the twins of rides pass slot names).
 */
function slotFor(ctx: ArtCtx, css: string): number {
  if (SLOT_SET.has(css)) return slotIndex(css);
  const before = paletteStats.misses;
  const slot = slotOf(css);
  if (isPixelSurface(ctx)) ctx.misses += paletteStats.misses - before;
  return slot;
}

const rampOf = (name: string): string => name.replace(/\d+$/, '');
const toneOf = (name: string): number => Number(name.slice(rampOf(name).length));

/** Fill style of a slot: its name on a surface, its colour on any other context. */
function setSlot(ctx: ArtCtx, name: string): void {
  if (isPixelSurface(ctx)) ctx.fillStyle = name;
  else ctx.fillStyle = RAMPS[rampOf(name) as RampId][toneOf(name) - 1] as string;
}

/** One tone darker on the same ramp. */
const darker = (name: string): string => tone(name, 1);

/** The right face is at least one tone darker than the left; a colour on another ramp is replaced. */
function rightOf(ctx: ArtCtx, left: string, right: string): { l: string; r: string } {
  const l = SLOT_NAMES[slotFor(ctx, left)] as string;
  const r = SLOT_NAMES[slotFor(ctx, right)] as string;
  if (rampOf(r) === rampOf(l) && toneOf(r) > toneOf(l)) return { l, r };
  return { l, r: SLOT_NAMES[slotIndex(darker(l))] as string };
}

/** Fill a polygon of 3D points [u, v, h, …] in one slot. */
function face(ctx: ArtCtx, pts: readonly number[], slot: string): void {
  ctx.beginPath();
  for (let k = 0; k < pts.length; k += 3) {
    const x = sx(pts[k] as number, pts[k + 1] as number);
    const y = sy(pts[k] as number, pts[k + 1] as number, pts[k + 2] as number);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  setSlot(ctx, slot);
  ctx.fill();
}

/** Twin of `box`: left face lit, right face at least one tone darker, top in its own colour. */
export function pixelBox(
  ctx: ArtCtx,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  h0: number,
  h1: number,
  top: string,
  left: string,
  right: string,
): void {
  const { l, r } = rightOf(ctx, left, right);
  const t = SLOT_NAMES[slotFor(ctx, top)] as string;
  face(ctx, [u0, v1, h0, u1, v1, h0, u1, v1, h1, u0, v1, h1], l);
  face(ctx, [u1, v0, h0, u1, v1, h0, u1, v1, h1, u1, v0, h1], r);
  face(ctx, [u0, v0, h1, u1, v0, h1, u1, v1, h1, u0, v1, h1], t);
}

/** Twin of `cylinder`: the side lit to `CYLINDER_LIT_SHARE` of its width, then one tone darker; the top ellipse on top. */
export function pixelCylinder(ctx: ArtCtx, cu: number, cv: number, r: number, h0: number, h1: number, side: string, top: string): void {
  const { rx, ry } = ellipseRadii(r);
  const x = sx(cu, cv);
  const yb = sy(cu, cv, h0);
  const yt = sy(cu, cv, h1);
  const lit = SLOT_NAMES[slotFor(ctx, side)] as string;
  const t = SLOT_NAMES[slotFor(ctx, top)] as string;
  // The whole side, lit.
  ctx.beginPath();
  ctx.moveTo(x - rx, yt);
  ctx.lineTo(x - rx, yb);
  ctx.ellipse(x, yb, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + rx, yt);
  ctx.closePath();
  setSlot(ctx, lit);
  ctx.fill();
  // The dark part: from the split to the right edge.
  const xs = x - rx + 2 * rx * CYLINDER_LIT_SHARE;
  const as = Math.acos(Math.max(-1, Math.min(1, (xs - x) / rx)));
  ctx.beginPath();
  ctx.moveTo(xs, yt);
  ctx.lineTo(xs, yb + ry * Math.sin(as));
  ctx.ellipse(x, yb, rx, ry, 0, as, 0, true);
  ctx.lineTo(x + rx, yt);
  ctx.closePath();
  setSlot(ctx, darker(lit));
  ctx.fill();
  // The top.
  ctx.beginPath();
  ctx.ellipse(x, yt, rx, ry, 0, 0, Math.PI * 2);
  setSlot(ctx, t);
  ctx.fill();
}

/** Twin of `cone`: `CONE_SEGMENTS` segments, lit on the screen left, one tone darker on the right; back to front. */
export function pixelCone(ctx: ArtCtx, cu: number, cv: number, r: number, h0: number, h1: number, colours: readonly string[], _segments = 12): void {
  const n = CONE_SEGMENTS;
  const slots = colours.map((c) => SLOT_NAMES[slotFor(ctx, c)] as string);
  const segs: Array<{ a0: number; a1: number; k: number; d: number; side: number }> = [];
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    segs.push({ a0, a1, k, d: Math.cos(am) + Math.sin(am), side: Math.cos(am) - Math.sin(am) });
  }
  segs.sort((a, b) => a.d - b.d);
  const ax = sx(cu, cv);
  const ay = sy(cu, cv, h1);
  for (const s of segs) {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    for (let t = 0; t <= 4; t++) {
      const p = circlePt(cu, cv, r, s.a0 + ((s.a1 - s.a0) * t) / 4);
      ctx.lineTo(sx(p.u, p.v), sy(p.u, p.v, h0));
    }
    ctx.closePath();
    const lit = slots[s.k % slots.length] as string;
    setSlot(ctx, s.side < 0.25 ? lit : darker(lit));
    ctx.fill();
  }
}

/** Twin of `pyramid`: back faces in `back`, the left and right faces by the rule of `pixelBox`. */
export function pixelPyramid(
  ctx: ArtCtx,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  h0: number,
  h1: number,
  back: string,
  left: string,
  right: string,
): void {
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  const b = SLOT_NAMES[slotFor(ctx, back)] as string;
  const { l, r } = rightOf(ctx, left, right);
  face(ctx, [u0, v0, h0, u1, v0, h0, cu, cv, h1], b);
  face(ctx, [u0, v0, h0, u0, v1, h0, cu, cv, h1], b);
  face(ctx, [u0, v1, h0, u1, v1, h0, cu, cv, h1], l);
  face(ctx, [u1, v0, h0, u1, v1, h0, cu, cv, h1], r);
}

/** Twin of `head`: a skin disc, hair on the upper half, the right third of the disc one tone darker. */
export function pixelHead(ctx: ArtCtx, x: number, y: number, r: number, skin: string, hair: string): void {
  const sk = SLOT_NAMES[slotFor(ctx, skin)] as string;
  const hr = SLOT_NAMES[slotFor(ctx, hair)] as string;
  const half = (slot: string, a0: number, a1: number): void => {
    ctx.beginPath();
    ctx.arc(x, y, r, a0, a1);
    ctx.closePath();
    setSlot(ctx, slot);
    ctx.fill();
  };
  // Lower half skin, upper half hair.
  half(sk, 0, Math.PI);
  half(hr, Math.PI, Math.PI * 2);
  // The right third: the circle segment right of x + r / 3, split at the middle row.
  const a = Math.acos(1 / 3);
  const xc = x + r / 3;
  ctx.beginPath();
  ctx.moveTo(xc, y);
  ctx.lineTo(xc, y - r * Math.sin(a));
  ctx.arc(x, y, r, -a, 0);
  ctx.closePath();
  setSlot(ctx, darker(hr));
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(xc, y);
  ctx.arc(x, y, r, 0, a);
  ctx.closePath();
  setSlot(ctx, darker(sk));
  ctx.fill();
}
