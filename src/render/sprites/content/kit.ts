/**
 * Owner: W2-C. Shared pieces for the Phase 3 content sprites (master §2.5: flat colours, chunky shapes).
 * Same local coordinates as `../shapes.ts`: (u, v) in tiles from the anchor, h in world px (8 px = 1 m).
 * Nothing here uses canvas transforms, randomness, or time: same inputs, same pixels.
 */
import { mix32, shade } from '../../palette';
import { box, head, sx, sy, HAIR_COLOURS, SKIN_TONES, type Ctx } from '../shapes';

export const TAU = Math.PI * 2;

/** A drawable with a depth (larger = nearer the viewer); draw in ascending order. */
export interface Item {
  n: number;
  draw: () => void;
}

export function drawSorted(items: Item[]): void {
  items.sort((a, b) => a.n - b.n);
  for (const it of items) it.draw();
}

/** Riders shown for `seats` seats at occupancy 0 (empty) … 4 (full). */
export function seatsFilled(seats: number, occupancy: number): number {
  if (occupancy <= 0) return 0;
  return Math.max(1, Math.round((seats * occupancy) / 4));
}

/** A rider's head at screen point (x, y); look k picks skin and hair. */
export function rider(ctx: Ctx, x: number, y: number, k: number, r = 2.3): void {
  const m = mix32(k * 7919 + 13);
  head(ctx, x, y, r, SKIN_TONES[m % SKIN_TONES.length] as string, HAIR_COLOURS[(m >>> 4) % HAIR_COLOURS.length] as string);
}

/** Low platform over the footprint. */
export function platform(ctx: Ctx, ex: number, ey: number, top: string, side: string, h = 3): void {
  box(ctx, 0.05, 0.05, ex - 0.05, ey - 0.05, 0, h, top, side, shade(side, 0.8));
}

/** Filled circle in screen px. */
export function dot(ctx: Ctx, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Filled circle at a 3D point. */
export function dot3(ctx: Ctx, u: number, v: number, h: number, r: number, fill: string): void {
  dot(ctx, sx(u, v), sy(u, v, h), r, fill);
}

/** n-pointed star in screen px, turned by `spin` radians. */
export function star(ctx: Ctx, x: number, y: number, outer: number, inner: number, points: number, fill: string, spin = 0): void {
  ctx.beginPath();
  for (let k = 0; k < points * 2; k++) {
    const r = k % 2 ? inner : outer;
    const a = (k / (points * 2)) * TAU - Math.PI / 2 + spin;
    const px = x + r * Math.cos(a);
    const py = y + r * Math.sin(a);
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Polygon in screen px from [x, y, x, y, …]. */
export function poly2(ctx: Ctx, pts: readonly number[], fill: string, stroke?: string, lineWidth = 1): void {
  ctx.beginPath();
  for (let k = 0; k < pts.length; k += 2) {
    if (k === 0) ctx.moveTo(pts[k] as number, pts[k + 1] as number);
    else ctx.lineTo(pts[k] as number, pts[k + 1] as number);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/** Line in screen px. */
export function line2(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, colour: string, width: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Ellipse in screen px. */
export function oval(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, rotation = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * The two map axes of a footprint: `along` is the long axis (ties: along u for even rotations, v for
 * odd), `across` the other one. Unit vectors in (u, v).
 */
export function axes(ex: number, ey: number, rotation: number): { au: number; av: number; cu: number; cv: number } {
  const alongU = ex > ey || (ex === ey && rotation % 2 === 0);
  return alongU ? { au: 1, av: 0, cu: 0, cv: 1 } : { au: 0, av: 1, cu: 1, cv: 0 };
}

/** Smooth 0 → 1 → 0 over one turn (0 at turn 0 and 1). */
export function wave(t: number): number {
  return 0.5 - 0.5 * Math.cos(TAU * t);
}
