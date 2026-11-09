/**
 * Shared drawing pieces for the scenery art (Phase 4 §4.5; master §2.5: flat colours, chunky shapes, clear
 * silhouettes). Owner: W3-D. Local coordinates as `../../sprites/shapes.ts`: (u, v) in tiles from the anchor (the top
 * corner of the item's view-origin tile), h in world px above the item's base (8 px = 1 m). No transforms, no
 * randomness, no time: the same inputs give the same pixels. "Random" variation comes from `frac(seed)`.
 */
import type { Dir } from '../../../sim/map';
import { mix32, shade } from '../../palette';
import { box, poly3, sx, sy, type Ctx } from '../../sprites/shapes';
import { TAU, dot, line2, oval, poly2, star } from '../../sprites/content/kit';

export { TAU, dot, line2, oval, poly2, star };
export { box, poly3, sx, sy, shade };
export type { Ctx };

/** What the art of one item needs. All directions are in view terms (the view rotation is already applied). */
export interface SceneryArtOpts {
  /** Sprite rotation `(rotation + viewRotation) mod 4`: 0 = faces −v (back right), 1 = +u, 2 = +v, 3 = −u. */
  facing: Dir;
  /** View footprint (tiles along u and v). Edge items: 1 × 1. */
  ex: number;
  ey: number;
  /** Gardens below the wilt line. */
  wilted: boolean;
  /** Arches: 0 = whole, 1 = back post and beam, 2 = front post (they sort at different depths so guests pass under). */
  part: 0 | 1 | 2;
  /** Edge items: the view edge 0–3 (N, E, S, W in view terms). Centre items: −1. */
  edge: -1 | Dir;
}

export type SceneryArtFn = (ctx: Ctx, o: SceneryArtOpts) => void;

/** The view edge of an edge item (N when the opts carry none). */
export function edgeOf(o: SceneryArtOpts): Dir {
  return o.edge < 0 ? 0 : (o.edge as Dir);
}

/** Unit vector (du, dv) of a facing. */
export function faceVec(f: Dir): { du: number; dv: number } {
  switch (f) {
    case 0:
      return { du: 0, dv: -1 };
    case 1:
      return { du: 1, dv: 0 };
    case 2:
      return { du: 0, dv: 1 };
    default:
      return { du: -1, dv: 0 };
  }
}

/** Faces the viewer (S or E): the front of a figure is visible. */
export function facesViewer(f: Dir): boolean {
  return f === 1 || f === 2;
}

/** Screen-x sign of a facing: +1 looks to the screen right (E, N), −1 to the left (S, W). */
export function screenSide(f: Dir): 1 | -1 {
  return f === 1 || f === 0 ? 1 : -1;
}

/** Deterministic fraction in [0, 1) from an integer seed. */
export function frac(seed: number): number {
  return (mix32(seed) % 10_000) / 10_000;
}

/** FNV-1a of a string (seeds per item). */
export function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Linear mix of two #rrggbb colours. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number): number => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/** Wilted colour: faded toward dry brown. */
export function wilt(colour: string, wilted: boolean): string {
  return wilted ? mixHex(colour, '#8b6b3e', 0.65) : colour;
}

/** Soft ground shadow (ellipse) under a point. */
export function shadow(ctx: Ctx, cu: number, cv: number, r: number, alpha = 0.2): void {
  oval(ctx, sx(cu, cv), sy(cu, cv, 0), r * 45, r * 22.5, `rgba(20,30,20,${alpha})`);
}

/** Tapered trunk from h0 to h1 at (cu, cv); `lean` moves the top in screen px. */
export function trunk(ctx: Ctx, cu: number, cv: number, h0: number, h1: number, w0: number, w1: number, fill: string, lean = 0): void {
  const x = sx(cu, cv);
  const y0 = sy(cu, cv, h0);
  const y1 = sy(cu, cv, h1);
  poly2(ctx, [x - w0, y0, x + w0, y0, x + lean + w1, y1, x + lean - w1, y1], fill);
  // Shaded right side.
  poly2(ctx, [x + w0 * 0.2, y0, x + w0, y0, x + lean + w1, y1, x + lean + w1 * 0.2, y1], shade(fill, 0.78));
}

/** A cluster of overlapping circles (foliage, smoke, snow) around screen point (x, y). */
export function cluster(ctx: Ctx, x: number, y: number, rx: number, ry: number, r: number, colours: readonly string[], seed: number, n = 7): void {
  for (let k = 0; k < n; k++) {
    const a = frac(seed + k * 31) * TAU;
    const d = 0.35 + 0.65 * frac(seed + k * 57);
    const px = x + Math.cos(a) * rx * d;
    const py = y + Math.sin(a) * ry * d;
    // Back (upper) puffs dark, front (lower) puffs light.
    const c = colours[Math.min(colours.length - 1, Math.floor(((py - (y - ry)) / (2 * ry + 0.001)) * colours.length))] as string;
    dot(ctx, px, py, r * (0.75 + 0.35 * frac(seed + k * 13)), c);
  }
}

/** Round tree canopy: dark base blob, mid cluster, light highlights. */
export function canopy(ctx: Ctx, x: number, y: number, r: number, dark: string, mid: string, light: string, seed: number): void {
  dot(ctx, x, y, r, dark);
  cluster(ctx, x - r * 0.1, y - r * 0.12, r * 0.55, r * 0.5, r * 0.55, [mid, mid, light], seed, 6);
  dot(ctx, x - r * 0.35, y - r * 0.4, r * 0.3, light);
}

/** One triangular conifer tier: base width `w`, from screen y `yb` up by `ht`. */
export function tier(ctx: Ctx, x: number, yb: number, w: number, ht: number, fill: string): void {
  poly2(ctx, [x - w, yb, x, yb - ht, x + w, yb, x, yb + w * 0.18], fill);
  poly2(ctx, [x, yb - ht, x + w, yb, x, yb + w * 0.18], shade(fill, 0.8));
}

/** Faceted rock lump centred at (cu, cv), radius r tiles, height h px. */
export function rock(ctx: Ctx, cu: number, cv: number, r: number, h: number, colour: string, seed: number): void {
  const n = 7;
  const pts: number[] = [];
  const top: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + frac(seed) * 0.6;
    const rr = r * (0.75 + 0.3 * frac(seed + k * 7));
    const u = cu + Math.cos(a) * rr;
    const v = cv + Math.sin(a) * rr;
    pts.push(sx(u, v), sy(u, v, 0));
    top.push(sx(cu + (u - cu) * 0.55, cv + (v - cv) * 0.55), sy(cu + (u - cu) * 0.55, cv + (v - cv) * 0.55, h * (0.85 + 0.15 * frac(seed + k))));
  }
  // Silhouette: the base ring joined to the raised top ring.
  const hull: number[] = [];
  for (let k = 0; k < n; k++) hull.push(pts[k * 2] as number, Math.min(pts[k * 2 + 1] as number, (top[k * 2 + 1] as number) + h * 0.4));
  poly2(ctx, hull, shade(colour, 0.72));
  poly2(ctx, top, colour);
  const x = sx(cu, cv);
  const y = sy(cu, cv, h);
  poly2(ctx, [x - r * 18, y + 2, x - r * 4, y - h * 0.15, x + r * 6, y + 3], shade(colour, 1.18));
}

/** Upright post (thin box) of half-width r tiles. */
export function post(ctx: Ctx, cu: number, cv: number, r: number, h0: number, h1: number, colour: string): void {
  box(ctx, cu - r, cv - r, cu + r, cv + r, h0, h1, shade(colour, 1.15), colour, shade(colour, 0.75));
}

/** Glowing bulb: soft halo and a bright core. */
export function glow(ctx: Ctx, x: number, y: number, r: number, colour: string, core = '#fffbe6'): void {
  dot(ctx, x, y, r * 2.1, withAlpha(colour, 0.22));
  dot(ctx, x, y, r * 1.35, withAlpha(colour, 0.45));
  dot(ctx, x, y, r, colour);
  dot(ctx, x - r * 0.25, y - r * 0.25, r * 0.45, core);
}

/** `rgba(...)` of a #rrggbb colour. */
export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Small flowers (petal dot + centre) scattered on a disc of radius r tiles at height h. */
export function flowers(ctx: Ctx, cu: number, cv: number, r: number, h: number, colours: readonly string[], seed: number, n: number, wilted: boolean, size = 2.2): void {
  const items: Array<{ x: number; y: number; c: string; k: number }> = [];
  for (let k = 0; k < n; k++) {
    const a = frac(seed + k * 17) * TAU;
    const d = Math.sqrt(frac(seed + k * 23)) * r;
    const u = cu + Math.cos(a) * d;
    const v = cv + Math.sin(a) * d;
    items.push({ x: sx(u, v), y: sy(u, v, h + (wilted ? 0 : 2 * frac(seed + k))), c: colours[k % colours.length] as string, k });
  }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    line2(ctx, it.x, it.y + (wilted ? 1 : 4), it.x + (wilted ? 2 : 0), it.y, wilted ? '#7d6a3a' : '#3f8a3a', 1);
    dot(ctx, it.x + (wilted ? 2 : 0), it.y + (wilted ? 2 : 0), wilted ? size * 0.7 : size, wilt(it.c, wilted));
    if (!wilted) dot(ctx, it.x, it.y, size * 0.4, '#fff1a8');
  }
}

/** The two ends (u, v) of view edge `e` of the unit tile. */
export function edgeEnds(e: Dir): [number, number, number, number] {
  switch (e) {
    case 0:
      return [0, 0, 1, 0];
    case 1:
      return [1, 0, 1, 1];
    case 2:
      return [0, 1, 1, 1];
    default:
      return [0, 0, 0, 1];
  }
}

/** Box hugging view edge `e`: thickness t tiles inside the tile, along the whole edge (inset `i` at both ends). */
export function edgeBox(ctx: Ctx, e: Dir, t: number, h0: number, h1: number, top: string, left: string, right: string, i = 0): void {
  switch (e) {
    case 0:
      box(ctx, i, 0, 1 - i, t, h0, h1, top, left, right);
      break;
    case 1:
      box(ctx, 1 - t, i, 1, 1 - i, h0, h1, top, left, right);
      break;
    case 2:
      box(ctx, i, 1 - t, 1 - i, 1, h0, h1, top, left, right);
      break;
    default:
      box(ctx, 0, i, t, 1 - i, h0, h1, top, left, right);
  }
}

/** Point at fraction s (0–1) along view edge e, pulled `inset` tiles into the tile. */
export function edgePoint(e: Dir, s: number, inset = 0.06): { u: number; v: number } {
  const [u0, v0, u1, v1] = edgeEnds(e);
  const u = u0 + (u1 - u0) * s;
  const v = v0 + (v1 - v0) * s;
  switch (e) {
    case 0:
      return { u, v: v + inset };
    case 1:
      return { u: u - inset, v };
    case 2:
      return { u, v: v - inset };
    default:
      return { u: u + inset, v };
  }
}

/** Vertical panel (a thin wall face) between two points at heights h0–h1. */
export function panel(ctx: Ctx, u0: number, v0: number, u1: number, v1: number, h0: number, h1: number, fill: string, stroke?: string): void {
  poly3(ctx, [u0, v0, h0, u1, v1, h0, u1, v1, h1, u0, v0, h1], fill, stroke);
}

/**
 * Arch post positions (view tiles) and which one is in front. Guests walk through an arch along its facing: facing
 * 0 or 2 puts the posts on the −u and +u sides (a walkway along v), facing 1 or 3 on the −v and +v sides.
 */
export function archPosts(facing: Dir): { back: { u: number; v: number }; front: { u: number; v: number } } {
  return facing % 2 === 0 ? { back: { u: 0.14, v: 0.5 }, front: { u: 0.86, v: 0.5 } } : { back: { u: 0.5, v: 0.14 }, front: { u: 0.5, v: 0.86 } };
}

/** Pedestal box centred on the tile: half-width r tiles, height h px. */
export function pedestal(ctx: Ctx, r: number, h: number, colour: string): void {
  box(ctx, 0.5 - r, 0.5 - r, 0.5 + r, 0.5 + r, 0, h, shade(colour, 1.18), colour, shade(colour, 0.78));
}

/** Two eyes looking toward the screen side `s` at (x, y). */
export function eyes(ctx: Ctx, x: number, y: number, gap: number, r: number, s: 1 | -1, white = '#ffffff', pupil = '#1b2433'): void {
  for (const k of [-1, 1]) {
    dot(ctx, x + k * gap + s * r * 0.15, y, r, white);
    dot(ctx, x + k * gap + s * r * 0.45, y + r * 0.1, r * 0.55, pupil);
  }
}
