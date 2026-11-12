/**
 * Iso drawing primitives for procedural sprites. Owner: W1-A.
 * Local coordinates: (u, v) in tiles from the anchor tile's top corner, `h` in world pixels above
 * the base height (8 px = 1 m). Screen: x = (u − v) × 32, y = (u + v) × 16 − h.
 */
import { surfaceArt } from '../artHook';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Phase 8: the Canvas members that art uses (§5.2). A real 2D context and a `PixelSurface` both satisfy it.
 * Twins take it and call `layer?.()` and `cut?.()`, so they also run on a real context and on a recorder.
 */
export interface ArtCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  fill(fillRule?: CanvasFillRule): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(angle: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  layer?(ink?: boolean): void;
  cut?(on: boolean): void;
}

const HW = 32;
const HH = 16;
const SQ2 = Math.SQRT2;

export function sx(u: number, v: number): number {
  return (u - v) * HW;
}

export function sy(u: number, v: number, h: number): number {
  return (u + v) * HH - h;
}

/** Fill (and optionally stroke) a polygon of 3D points [u, v, h, u, v, h, …]. */
export function poly3(ctx: Ctx, pts: readonly number[], fill: string | null, stroke?: string, lineWidth = 1): void {
  ctx.beginPath();
  for (let k = 0; k < pts.length; k += 3) {
    const x = sx(pts[k] as number, pts[k + 1] as number);
    const y = sy(pts[k] as number, pts[k + 1] as number, pts[k + 2] as number);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/** A line between two 3D points. */
export function line3(ctx: Ctx, u0: number, v0: number, h0: number, u1: number, v1: number, h1: number, colour: string, width: number): void {
  ctx.beginPath();
  ctx.moveTo(sx(u0, v0), sy(u0, v0, h0));
  ctx.lineTo(sx(u1, v1), sy(u1, v1, h1));
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Flat quad from (u0, v0) to (u1, v1) at height h. */
export function flat(ctx: Ctx, u0: number, v0: number, u1: number, v1: number, h: number, fill: string, stroke?: string): void {
  poly3(ctx, [u0, v0, h, u1, v0, h, u1, v1, h, u0, v1, h], fill, stroke);
}

/** Box with its two front faces and its top. Faces: +y face appears front-left, +x face front-right. */
export function box(
  ctx: Ctx,
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
  const sa = __TC_APP__ ? surfaceArt.on : null;
  if (__TC_APP__ && sa?.is(ctx)) return sa.box(ctx, u0, v0, u1, v1, h0, h1, top, left, right);
  poly3(ctx, [u0, v1, h0, u1, v1, h0, u1, v1, h1, u0, v1, h1], left);
  poly3(ctx, [u1, v0, h0, u1, v1, h0, u1, v1, h1, u1, v0, h1], right);
  poly3(ctx, [u0, v0, h1, u1, v0, h1, u1, v1, h1, u0, v1, h1], top);
}

/** Screen radii of a ground circle of radius r tiles. */
export function ellipseRadii(r: number): { rx: number; ry: number } {
  return { rx: r * HW * SQ2, ry: r * HH * SQ2 };
}

/** Flat disc (ellipse on screen) of radius r tiles centred at (cu, cv), height h. */
export function disc(ctx: Ctx, cu: number, cv: number, r: number, h: number, fill: string, stroke?: string, lineWidth = 1): void {
  const { rx, ry } = ellipseRadii(r);
  ctx.beginPath();
  ctx.ellipse(sx(cu, cv), sy(cu, cv, h), rx, ry, 0, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/** Upright cylinder of radius r tiles from h0 to h1. */
export function cylinder(ctx: Ctx, cu: number, cv: number, r: number, h0: number, h1: number, side: string, top: string): void {
  const sa = __TC_APP__ ? surfaceArt.on : null;
  if (__TC_APP__ && sa?.is(ctx)) return sa.cylinder(ctx, cu, cv, r, h0, h1, side, top);
  const { rx, ry } = ellipseRadii(r);
  const x = sx(cu, cv);
  const yb = sy(cu, cv, h0);
  const yt = sy(cu, cv, h1);
  ctx.beginPath();
  ctx.moveTo(x - rx, yt);
  ctx.lineTo(x - rx, yb);
  ctx.ellipse(x, yb, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + rx, yt);
  ctx.closePath();
  ctx.fillStyle = side;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, yt, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = top;
  ctx.fill();
}

/** Point on a ground circle: angle θ in radians, map axes. */
export function circlePt(cu: number, cv: number, r: number, theta: number): { u: number; v: number } {
  return { u: cu + r * Math.cos(theta), v: cv + r * Math.sin(theta) };
}

/** Screen-depth of a map point (larger = nearer the viewer). */
export function nearness(u: number, v: number): number {
  return u + v;
}

/** Striped cone roof: base radius r tiles at h0, apex at h1. Segments drawn back to front. */
export function cone(ctx: Ctx, cu: number, cv: number, r: number, h0: number, h1: number, colours: readonly string[], segments = 12): void {
  const sa = __TC_APP__ ? surfaceArt.on : null;
  if (__TC_APP__ && sa?.is(ctx)) return sa.cone(ctx, cu, cv, r, h0, h1, colours, segments);
  const segs: Array<{ a0: number; a1: number; k: number; d: number }> = [];
  for (let k = 0; k < segments; k++) {
    const a0 = (k / segments) * Math.PI * 2;
    const a1 = ((k + 1) / segments) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    segs.push({ a0, a1, k, d: Math.cos(am) + Math.sin(am) });
  }
  segs.sort((a, b) => a.d - b.d);
  const ax = sx(cu, cv);
  const ay = sy(cu, cv, h1);
  for (const s of segs) {
    const p0 = circlePt(cu, cv, r, s.a0);
    const p1 = circlePt(cu, cv, r, s.a1);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(sx(p0.u, p0.v), sy(p0.u, p0.v, h0));
    // Follow the base rim with a few points for a round edge.
    for (let t = 1; t <= 4; t++) {
      const a = s.a0 + ((s.a1 - s.a0) * t) / 4;
      const p = circlePt(cu, cv, r, a);
      ctx.lineTo(sx(p.u, p.v), sy(p.u, p.v, h0));
    }
    ctx.lineTo(sx(p1.u, p1.v), sy(p1.u, p1.v, h0));
    ctx.closePath();
    // Light from the upper left: segments facing −x are lighter.
    ctx.fillStyle = colours[s.k % colours.length] as string;
    ctx.fill();
  }
}

/** Four-sided pyramid roof over [u0, u1] × [v0, v1] from h0 to apex h1. */
export function pyramid(ctx: Ctx, u0: number, v0: number, u1: number, v1: number, h0: number, h1: number, back: string, left: string, right: string): void {
  const sa = __TC_APP__ ? surfaceArt.on : null;
  if (__TC_APP__ && sa?.is(ctx)) return sa.pyramid(ctx, u0, v0, u1, v1, h0, h1, back, left, right);
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  // Back faces first (N and W), then front (S = left, E = right).
  poly3(ctx, [u0, v0, h0, u1, v0, h0, cu, cv, h1], back);
  poly3(ctx, [u0, v0, h0, u0, v1, h0, cu, cv, h1], back);
  poly3(ctx, [u0, v1, h0, u1, v1, h0, cu, cv, h1], left);
  poly3(ctx, [u1, v0, h0, u1, v1, h0, cu, cv, h1], right);
}

/** Small round head (riders, guests). */
export function head(ctx: Ctx, x: number, y: number, r: number, skin: string, hair: string): void {
  const sa = __TC_APP__ ? surfaceArt.on : null;
  if (__TC_APP__ && sa?.is(ctx)) return sa.head(ctx, x, y, r, skin, hair);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = skin;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - r * 0.25, r, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fillStyle = hair;
  ctx.fill();
}

/**
 * Add a rounded rectangle to the current path. Uses a manual path so older browsers without
 * `CanvasRenderingContext2D.roundRect` (iOS Safari 15) draw the same shape.
 */
export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, rTop: number, rBottom = rTop): void {
  const t = Math.min(rTop, w / 2, h / 2);
  const b = Math.min(rBottom, w / 2, h / 2);
  ctx.moveTo(x + t, y);
  ctx.lineTo(x + w - t, y);
  if (t > 0) ctx.arcTo(x + w, y, x + w, y + t, t);
  ctx.lineTo(x + w, y + h - b);
  if (b > 0) ctx.arcTo(x + w, y + h, x + w - b, y + h, b);
  ctx.lineTo(x + b, y + h);
  if (b > 0) ctx.arcTo(x, y + h, x, y + h - b, b);
  ctx.lineTo(x, y + t);
  if (t > 0) ctx.arcTo(x, y, x + t, y, t);
  ctx.closePath();
}

export const SKIN_TONES: readonly string[] = ['#f6d3b3', '#e0ac85', '#b97d55', '#7a4a2e'];
export const HAIR_COLOURS: readonly string[] = ['#3b2a1e', '#6b4226', '#d9b26a', '#1f1f24'];
