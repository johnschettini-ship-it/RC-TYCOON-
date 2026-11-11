/** Phase 8 stage 0 prototype (never merged): the pixel surface, a slot grid at art resolution behind Canvas calls (spec §5.3). */
import { OPAQUE_ALPHA } from '../../data/tuning/pixel';
import type { ArtBounds } from '../sprites/rides';
import type { ArtCtx, Ctx } from '../sprites/shapes';
import { INK_SLOT, SLOT_NAMES, SLOT_RGBA, nearestInFamily, paletteStats, slotOf } from './palette';

/** Image pixels per world pixel. */
export const ART_SCALE = 0.5;
/** Art pixels around the art on every side: room for the ink ring (as `PAD` in `canvas.ts`). */
export const SURFACE_PAD = 2;
/** 4 × 4 ordered dither, row-major, index `(y & 3) × 4 + (x & 3)` (`BAYER`, `pixel3.py:88`). */
export const BAYER4: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export interface SurfaceOptions {
  /** The ink value of the first layer (default true). */
  ink?: boolean;
}

/** True only for a real surface. Recorders and fakes answer every member name, so no member test. */
export function isPixelSurface(ctx: unknown): ctx is PixelSurface {
  return ctx instanceof PixelSurface;
}

// Pixel flags.
const CUT = 1;
const STROKE = 2;

const SLOT_SET = new Set(SLOT_NAMES.slice(1));
/** The two orders of two scanline crossings (tuning round, Task 19c). */
const PAIR_01: readonly number[] = [0, 1];
const PAIR_10: readonly number[] = [1, 0];
/** `0xRRGGBB` of each slot. */
const SLOT_RGB: Int32Array = Int32Array.from(SLOT_RGBA, (v) => ((v & 255) << 16) | (v & 0xff00) | ((v >>> 16) & 255));
/** `#rrggbb` of each slot (index 0 unused). */
const SLOT_CSS: readonly string[] = Array.from(SLOT_RGB, (v) => `#${(v | (1 << 24)).toString(16).slice(1)}`);

interface Paint {
  slot: number;
  rgb: number;
  alpha: number;
}

// CSS colour → rgb and alpha, or null. Takes `#rgb`, `#rrggbb`, `rgb(…)`, `rgba(…)` and `transparent`.
function parseColour(css: string): { rgb: number; alpha: number } | null {
  const t = css.trim().toLowerCase();
  if (t === 'transparent') return { rgb: 0, alpha: 0 };
  let m = /^#([0-9a-f]{6})$/.exec(t);
  if (m) return { rgb: parseInt(m[1] as string, 16), alpha: 1 };
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
  if (m) return { rgb: parseInt(`${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`, 16), alpha: 1 };
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)(%?)\s*)?\)$/.exec(t);
  if (!m) return null;
  const ch = (v: string): number => Math.max(0, Math.min(255, Math.round(Number(v))));
  let alpha = m[4] === undefined ? 1 : Number(m[4]) / (m[5] === '%' ? 100 : 1);
  alpha = Math.max(0, Math.min(1, alpha));
  return { rgb: (ch(m[1] as string) << 16) | (ch(m[2] as string) << 8) | ch(m[3] as string), alpha };
}

interface SubPath {
  pts: number[];
  closed: boolean;
}

interface State {
  m: [number, number, number, number, number, number];
  fillCss: string;
  fill: Paint;
  strokeCss: string;
  stroke: Paint;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
}

/**
 * A grid of slot indices at art resolution that accepts Canvas calls (§5.3). Coordinates are world pixels
 * around the anchor; one image pixel is one art pixel (2 × 2 world pixels).
 */
export class PixelSurface {
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
  /** Colours that `slotOf` resolved by the fallback rule while this surface painted (§6.5). */
  misses = 0;

  private readonly slots: Uint8Array;
  private readonly layers: Int32Array;
  private readonly flags: Uint8Array;
  /** Ink on or off for each layer id; id 0 is the ink ring. */
  private readonly layerInk: boolean[];
  private readonly defaultInk: boolean;
  private cur = 1;
  private cutOn = false;
  private finished = false;
  // Box of the pixels of the open layer.
  private bx0 = Infinity;
  private by0 = Infinity;
  private bx1 = -Infinity;
  private by1 = -Infinity;
  // Pixel set of one paint call: a stamp per pixel, so each pixel is painted once per call.
  private readonly mark: Uint32Array;
  private gen = 0;
  private list: number[] = [];

  private st: State;
  private readonly stack: State[] = [];
  private subs: SubPath[] = [];

  constructor(bounds: ArtBounds, opts?: SurfaceOptions) {
    const l = Math.floor(bounds.left * ART_SCALE);
    const t = Math.floor(bounds.top * ART_SCALE);
    this.w = Math.ceil(bounds.right * ART_SCALE) - l + 2 * SURFACE_PAD;
    this.h = Math.ceil(bounds.bottom * ART_SCALE) - t + 2 * SURFACE_PAD;
    this.ox = SURFACE_PAD - l;
    this.oy = SURFACE_PAD - t;
    const n = this.w * this.h;
    this.slots = new Uint8Array(n);
    this.layers = new Int32Array(n);
    this.flags = new Uint8Array(n);
    this.mark = new Uint32Array(n);
    this.defaultInk = opts?.ink ?? true;
    this.layerInk = [false, this.defaultInk];
    const black: Paint = { slot: slotOf('#000000'), rgb: 0, alpha: 1 };
    this.st = { m: [1, 0, 0, 1, 0, 0], fillCss: '#000000', fill: black, strokeCss: '#000000', stroke: black, lineWidth: 1, lineCap: 'butt', lineJoin: 'miter' };
  }

  // ------------------------------------------------------------------ state

  get fillStyle(): string {
    return this.st.fillCss;
  }
  set fillStyle(v: string) {
    this.st.fillCss = v;
    this.st.fill = this.resolve(v);
  }
  get strokeStyle(): string {
    return this.st.strokeCss;
  }
  set strokeStyle(v: string) {
    this.st.strokeCss = v;
    this.st.stroke = this.resolve(v);
  }
  get lineWidth(): number {
    return this.st.lineWidth;
  }
  set lineWidth(v: number) {
    if (Number.isFinite(v) && v > 0) this.st.lineWidth = v;
  }
  get lineCap(): string {
    return this.st.lineCap;
  }
  set lineCap(v: string) {
    this.st.lineCap = v;
  }
  get lineJoin(): string {
    return this.st.lineJoin;
  }
  set lineJoin(v: string) {
    this.st.lineJoin = v;
  }

  // A slot name selects its slot, opaque. Any other string resolves by `slotOf` (raster rule 5).
  private resolve(v: unknown): Paint {
    const css = String(v);
    if (SLOT_SET.has(css)) {
      const slot = SLOT_NAMES.indexOf(css);
      return { slot, rgb: SLOT_RGB[slot] as number, alpha: 1 };
    }
    const c = parseColour(css);
    if (c && c.alpha <= 0) return { slot: 0, rgb: 0, alpha: 0 };
    const before = paletteStats.misses;
    const slot = slotOf(css);
    this.misses += paletteStats.misses - before;
    return { slot, rgb: c ? c.rgb : (SLOT_RGB[slot] as number), alpha: c ? c.alpha : 1 };
  }

  save(): void {
    this.stack.push({ ...this.st, m: [...this.st.m] });
  }

  restore(): void {
    const s = this.stack.pop();
    if (s) this.st = s;
  }

  translate(x: number, y: number): void {
    const m = this.st.m;
    m[4] += m[0] * x + m[2] * y;
    m[5] += m[1] * x + m[3] * y;
  }

  scale(x: number, y: number): void {
    const m = this.st.m;
    m[0] *= x;
    m[1] *= x;
    m[2] *= y;
    m[3] *= y;
  }

  rotate(a: number): void {
    const m = this.st.m;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const [a0, b0, c0, d0] = m;
    m[0] = a0 * c + c0 * s;
    m[1] = b0 * c + d0 * s;
    m[2] = c0 * c - a0 * s;
    m[3] = d0 * c - b0 * s;
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.st.m = [a, b, c, d, e, f];
  }

  // User point → image x, y (continuous; pixel i covers [i, i + 1)).
  private ix(x: number, y: number): number {
    const m = this.st.m;
    return (m[0] * x + m[2] * y + m[4]) * ART_SCALE + this.ox;
  }
  private iy(x: number, y: number): number {
    const m = this.st.m;
    return (m[1] * x + m[3] * y + m[5]) * ART_SCALE + this.oy;
  }
  /** Image pixels per user unit, the larger axis. */
  private unit(): number {
    const m = this.st.m;
    return Math.sqrt(Math.max(m[0] * m[0] + m[1] * m[1], m[2] * m[2] + m[3] * m[3])) * ART_SCALE;
  }
  // Image point → user point (for arcTo).
  private toUser(px: number, py: number): [number, number] {
    const [a, b, c, d, e, f] = this.st.m;
    const wx = (px - this.ox) / ART_SCALE - e;
    const wy = (py - this.oy) / ART_SCALE - f;
    const det = a * d - b * c || 1;
    return [(d * wx - c * wy) / det, (a * wy - b * wx) / det];
  }

  // ------------------------------------------------------------------ path

  beginPath(): void {
    this.subs = [];
  }

  private last(): SubPath | undefined {
    return this.subs[this.subs.length - 1];
  }

  private pushImage(px: number, py: number): void {
    const sp = this.last();
    if (!sp) this.subs.push({ pts: [px, py], closed: false });
    else sp.pts.push(px, py);
  }

  moveTo(x: number, y: number): void {
    this.subs.push({ pts: [this.ix(x, y), this.iy(x, y)], closed: false });
  }

  lineTo(x: number, y: number): void {
    this.pushImage(this.ix(x, y), this.iy(x, y));
  }

  closePath(): void {
    const sp = this.last();
    if (!sp || sp.pts.length === 0) return;
    sp.closed = true;
    this.subs.push({ pts: [sp.pts[0] as number, sp.pts[1] as number], closed: false });
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.subs.push({
      pts: [this.ix(x, y), this.iy(x, y), this.ix(x + w, y), this.iy(x + w, y), this.ix(x + w, y + h), this.iy(x + w, y + h), this.ix(x, y + h), this.iy(x, y + h)],
      closed: true,
    });
    this.moveTo(x, y);
  }

  // Canvas sweep of an arc from a0 to a1 (radians, signed).
  private static sweep(a0: number, a1: number, ccw: boolean): number {
    const TAU = Math.PI * 2;
    if (!ccw) {
      if (a1 - a0 >= TAU) return TAU;
      let s = (a1 - a0) % TAU;
      if (s < 0) s += TAU;
      return s;
    }
    if (a0 - a1 >= TAU) return -TAU;
    let s = (a0 - a1) % TAU;
    if (s < 0) s += TAU;
    return -s;
  }

  // Points of an ellipse arc in user space, as segments of at most 1 art pixel (raster rule 4).
  private ellipsePts(x: number, y: number, rx: number, ry: number, rot: number, a0: number, sweep: number): void {
    const n = Math.max(1, Math.ceil(Math.abs(sweep) * Math.max(Math.abs(rx), Math.abs(ry)) * this.unit()));
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    for (let k = 0; k <= n; k++) {
      const t = a0 + (sweep * k) / n;
      const ex = Math.abs(rx) * Math.cos(t);
      const ey = Math.abs(ry) * Math.sin(t);
      const ux = x + ex * cr - ey * sr;
      const uy = y + ex * sr + ey * cr;
      this.pushImage(this.ix(ux, uy), this.iy(ux, uy));
    }
  }

  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false): void {
    this.ellipsePts(x, y, r, r, 0, a0, PixelSurface.sweep(a0, a1, ccw));
  }

  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false): void {
    this.ellipsePts(x, y, rx, ry, rot, a0, PixelSurface.sweep(a0, a1, ccw));
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    if (!this.last()) this.moveTo(cpx, cpy);
    const sp = this.last() as SubPath;
    const x0 = sp.pts[sp.pts.length - 2] as number;
    const y0 = sp.pts[sp.pts.length - 1] as number;
    const x1 = this.ix(cpx, cpy);
    const y1 = this.iy(cpx, cpy);
    const x2 = this.ix(x, y);
    const y2 = this.iy(x, y);
    // A Bezier curve is affine-invariant, so it is cut in image space. Its speed is at most
    // 2 × the longest control leg, so n steps of even t give segments of at most 1 art pixel (rule 4).
    const n = Math.max(1, Math.ceil(2 * Math.max(Math.hypot(x1 - x0, y1 - y0), Math.hypot(x2 - x1, y2 - y1))));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      sp.pts.push(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2);
    }
  }

  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    if (!this.last()) this.moveTo(c1x, c1y);
    const sp = this.last() as SubPath;
    const x0 = sp.pts[sp.pts.length - 2] as number;
    const y0 = sp.pts[sp.pts.length - 1] as number;
    const x1 = this.ix(c1x, c1y);
    const y1 = this.iy(c1x, c1y);
    const x2 = this.ix(c2x, c2y);
    const y2 = this.iy(c2x, c2y);
    const x3 = this.ix(x, y);
    const y3 = this.iy(x, y);
    // Speed is at most 3 × the longest control leg, so each segment is at most 1 art pixel (rule 4).
    const n = Math.max(
      1,
      Math.ceil(3 * Math.max(Math.hypot(x1 - x0, y1 - y0), Math.hypot(x2 - x1, y2 - y1), Math.hypot(x3 - x2, y3 - y2))),
    );
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      sp.pts.push(a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3);
    }
  }

  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void {
    const sp = this.last();
    if (!sp || sp.pts.length === 0) {
      this.moveTo(x1, y1);
      return;
    }
    const [x0, y0] = this.toUser(sp.pts[sp.pts.length - 2] as number, sp.pts[sp.pts.length - 1] as number);
    const v1x = x0 - x1;
    const v1y = y0 - y1;
    const v2x = x2 - x1;
    const v2y = y2 - y1;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    const cross = v1x * v2y - v1y * v2x;
    if (r <= 0 || l1 === 0 || l2 === 0 || Math.abs(cross) < 1e-9 * l1 * l2) {
      this.lineTo(x1, y1);
      return;
    }
    const u1x = v1x / l1;
    const u1y = v1y / l1;
    const u2x = v2x / l2;
    const u2y = v2y / l2;
    const theta = Math.acos(Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y)));
    const t = r / Math.tan(theta / 2);
    const bx = u1x + u2x;
    const by = u1y + u2y;
    const bl = Math.hypot(bx, by);
    const dc = r / Math.sin(theta / 2);
    const cx = x1 + (bx / bl) * dc;
    const cy = y1 + (by / bl) * dc;
    const t1x = x1 + u1x * t;
    const t1y = y1 + u1y * t;
    const t2x = x1 + u2x * t;
    const t2y = y1 + u2y * t;
    this.lineTo(t1x, t1y);
    const a0 = Math.atan2(t1y - cy, t1x - cx);
    let sw = Math.atan2(t2y - cy, t2x - cx) - a0;
    if (sw > Math.PI) sw -= Math.PI * 2;
    if (sw < -Math.PI) sw += Math.PI * 2;
    this.ellipsePts(cx, cy, r, r, 0, a0, sw);
  }

  // ------------------------------------------------------------------ pixel sets

  private begin(): void {
    this.gen = (this.gen + 1) >>> 0;
    if (this.gen === 0) {
      this.mark.fill(0);
      this.gen = 1;
    }
    this.list = [];
  }

  private add(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const k = y * this.w + x;
    if (this.mark[k] === this.gen) return;
    this.mark[k] = this.gen;
    this.list.push(k);
  }

  // Bresenham line between the pixels that hold the two points, `width` pixels thick across its main axis.
  private line(xa: number, ya: number, xb: number, yb: number, width: number): void {
    let x0 = Math.floor(xa);
    let y0 = Math.floor(ya);
    const x1 = Math.floor(xb);
    const y1 = Math.floor(yb);
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    const xMajor = dx >= dy;
    const lo = -Math.floor((width - 1) / 2);
    const hi = lo + width - 1;
    const plot = (x: number, y: number): void => {
      for (let k = lo; k <= hi; k++) {
        if (xMajor) this.add(x, y + k);
        else this.add(x + k, y);
      }
    };
    if (xMajor) {
      let err = Math.floor(dx / 2);
      for (let i = 0; i <= dx; i++) {
        plot(x0, y0);
        x0 += sx;
        err -= dy;
        if (err < 0) {
          y0 += sy;
          err += dx;
        }
      }
    } else {
      let err = Math.floor(dy / 2);
      for (let i = 0; i <= dy; i++) {
        plot(x0, y0);
        y0 += sy;
        err -= dx;
        if (err < 0) {
          x0 += sx;
          err += dy;
        }
      }
    }
  }

  // Pixels whose centres are inside the polygons (`fill rule`), by scanlines (raster rules 1 and 2).
  private scan(polys: readonly (readonly number[])[], evenOdd: boolean): void {
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const p of polys) {
      for (let k = 1; k < p.length; k += 2) {
        yMin = Math.min(yMin, p[k] as number);
        yMax = Math.max(yMax, p[k] as number);
      }
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return;
    const r0 = Math.max(0, Math.ceil(yMin - 0.5));
    const r1 = Math.min(this.h - 1, Math.ceil(yMax - 0.5) - 1);
    const xs: number[] = [];
    const ds: number[] = [];
    for (let row = r0; row <= r1; row++) {
      const yc = row + 0.5;
      xs.length = 0;
      ds.length = 0;
      for (const p of polys) {
        const n = p.length >> 1;
        if (n < 3) continue;
        for (let k = 0; k < n; k++) {
          const xa = p[2 * k] as number;
          const ya = p[2 * k + 1] as number;
          const j = k + 1 === n ? 0 : k + 1;
          const xb = p[2 * j] as number;
          const yb = p[2 * j + 1] as number;
          let dir = 0;
          if (ya <= yc && yc < yb) dir = 1;
          else if (yb <= yc && yc < ya) dir = -1;
          if (dir === 0) continue;
          xs.push(xa + ((yc - ya) * (xb - xa)) / (yb - ya));
          ds.push(dir);
        }
      }
      if (xs.length < 2) continue;
      // Tuning round (Task 19c): two crossings need no sort (the stable sort keeps equal ones in order).
      const order = xs.length === 2 ? ((xs[1] as number) < (xs[0] as number) ? PAIR_10 : PAIR_01) : xs.map((_, k) => k).sort((a, b) => (xs[a] as number) - (xs[b] as number));
      let wind = 0;
      for (let q = 0; q < order.length - 1; q++) {
        const k = order[q] as number;
        wind += evenOdd ? 1 : (ds[k] as number);
        const inside = evenOdd ? (wind & 1) === 1 : wind !== 0;
        if (!inside) continue;
        const xl = xs[k] as number;
        const xr = xs[order[q + 1] as number] as number;
        const c0 = Math.max(0, Math.ceil(xl - 0.5));
        const c1 = Math.min(this.w - 1, Math.ceil(xr - 0.5) - 1);
        // `add` inlined: the row and the columns are already inside the surface.
        const { mark, gen, list } = this;
        for (let c = c0, k = row * this.w + c0; c <= c1; c++, k++) {
          if (mark[k] === gen) continue;
          mark[k] = gen;
          list.push(k);
        }
      }
    }
  }

  // ------------------------------------------------------------------ painting

  private set(k: number, slot: number, flags: number): void {
    this.slots[k] = slot;
    this.layers[k] = this.cur;
    this.flags[k] = flags | (this.cutOn ? CUT : 0);
    // Tuning round (Task 19c): the box serves only the ink ring of the open layer, so a layer without ink skips it.
    if (!this.layerInk[this.cur]) return;
    const y = (k / this.w) | 0;
    const x = k - y * this.w;
    if (x < this.bx0) this.bx0 = x;
    if (x > this.bx1) this.bx1 = x;
    if (y < this.by0) this.by0 = y;
    if (y > this.by1) this.by1 = y;
  }

  // Paint the pixel set with one colour (raster rules 5 and 6).
  private apply(p: Paint, stroke: boolean): void {
    if (p.alpha <= 0) return;
    const sf = stroke ? STROKE : 0;
    if (p.alpha >= OPAQUE_ALPHA) {
      for (const k of this.list) this.set(k, p.slot, sf);
      return;
    }
    const a = p.alpha;
    const nr = (p.rgb >> 16) & 255;
    const ng = (p.rgb >> 8) & 255;
    const nb = p.rgb & 255;
    for (const k of this.list) {
      const old = this.slots[k] as number;
      if (old !== 0) {
        // Mix and snap: the pixel keeps its layer and flags.
        const o = SLOT_RGB[old] as number;
        const r = Math.round(((o >> 16) & 255) * (1 - a) + nr * a);
        const g = Math.round(((o >> 8) & 255) * (1 - a) + ng * a);
        const b = Math.round((o & 255) * (1 - a) + nb * a);
        this.slots[k] = nearestInFamily((r << 16) | (g << 8) | b);
      } else {
        // Dither on nothing, in world-anchored art pixels; a dither pixel is a cut pixel.
        const ix = k % this.w;
        const x = ix - this.ox;
        const y = (k - ix) / this.w - this.oy;
        if (a > ((BAYER4[(y & 3) * 4 + (x & 3)] as number) + 0.5) / 16) this.set(k, p.slot, sf | CUT);
      }
    }
  }

  private polys(): number[][] {
    return this.subs.filter((sp) => sp.pts.length >= 2).map((sp) => sp.pts);
  }

  fill(rule?: string): void {
    const p = this.st.fill;
    const polys = this.polys();
    this.begin();
    this.scan(polys, rule === 'evenodd');
    if (p.alpha >= OPAQUE_ALPHA) {
      // An opaque fill also sets its edge pixels by a one-pixel line, so thin shapes never vanish.
      for (const q of polys) this.outline(q, true, 1);
    }
    this.apply(p, false);
  }

  private outline(q: readonly number[], closed: boolean, width: number): void {
    const n = q.length >> 1;
    if (n < 2) return;
    for (let k = 0; k < n - 1; k++) this.line(q[2 * k] as number, q[2 * k + 1] as number, q[2 * k + 2] as number, q[2 * k + 3] as number, width);
    if (closed) this.line(q[2 * n - 2] as number, q[2 * n - 1] as number, q[0] as number, q[1] as number, width);
  }

  private strokeWidth(): number {
    const m = this.st.m;
    const s = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    return Math.max(1, Math.round((this.st.lineWidth * s) / 2));
  }

  stroke(): void {
    const width = this.strokeWidth();
    this.begin();
    for (const sp of this.subs) if (sp.pts.length >= 4) this.outline(sp.pts, sp.closed, width);
    this.apply(this.st.stroke, true);
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    if (w === 0 || h === 0) return;
    const m = this.st.m;
    this.begin();
    if (m[1] === 0 && m[2] === 0) {
      const xa = Math.min(this.ix(x, y), this.ix(x + w, y));
      const xb = Math.max(this.ix(x, y), this.ix(x + w, y));
      const ya = Math.min(this.iy(x, y), this.iy(x, y + h));
      const yb = Math.max(this.iy(x, y), this.iy(x, y + h));
      let c0 = Math.ceil(xa - 0.5);
      let c1 = Math.ceil(xb - 0.5) - 1;
      let r0 = Math.ceil(ya - 0.5);
      let r1 = Math.ceil(yb - 0.5) - 1;
      // A rectangle thinner than one art pixel becomes one pixel wide.
      if (c1 < c0) c0 = c1 = Math.floor((xa + xb) / 2);
      if (r1 < r0) r0 = r1 = Math.floor((ya + yb) / 2);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.add(c, r);
    } else {
      const q = [this.ix(x, y), this.iy(x, y), this.ix(x + w, y), this.iy(x + w, y), this.ix(x + w, y + h), this.iy(x + w, y + h), this.ix(x, y + h), this.iy(x, y + h)];
      this.scan([q], false);
      const cx = (this.ix(x, y) + this.ix(x + w, y + h)) / 2;
      const cy = (this.iy(x, y) + this.iy(x + w, y + h)) / 2;
      if (this.list.length === 0) this.add(Math.floor(cx), Math.floor(cy));
    }
    this.apply(this.st.fill, false);
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    const q = [this.ix(x, y), this.iy(x, y), this.ix(x + w, y), this.iy(x + w, y), this.ix(x + w, y + h), this.iy(x + w, y + h), this.ix(x, y + h), this.iy(x, y + h)];
    const width = this.strokeWidth();
    this.begin();
    this.outline(q, true, width);
    this.apply(this.st.stroke, true);
  }

  /** Prototype only (not in §5.3): set one image pixel to `slot`, opaque, in the current layer; ink-making unless `cut` is on. */
  plot(x: number, y: number, slot: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !Number.isInteger(x) || !Number.isInteger(y)) return;
    this.set(y * this.w + x, slot, 0);
  }

  // ------------------------------------------------------------------ layers

  /** Close the current layer (its ink ring) and start a new one. `ink` defaults to `opts.ink`. */
  layer(ink?: boolean): void {
    this.closeLayer();
    this.cur++;
    this.layerInk[this.cur] = ink ?? this.defaultInk;
  }

  /** While on, painted pixels are cut pixels: part of the layer, but they make no ink ring. */
  cut(on: boolean): void {
    this.cutOn = on;
  }

  /** Close the last layer. */
  finish(): void {
    if (this.finished) return;
    this.closeLayer();
    this.finished = true;
  }

  // Every pixel 4-adjacent to an ink-making pixel of the closing layer, not of that layer and not cut, becomes ink.
  private closeLayer(): void {
    const L = this.cur;
    const has = this.bx0 <= this.bx1;
    const x0 = this.bx0;
    const x1 = this.bx1;
    const y0 = this.by0;
    const y1 = this.by1;
    this.bx0 = this.by0 = Infinity;
    this.bx1 = this.by1 = -Infinity;
    if (!has || !this.layerInk[L]) return;
    const { w, h, slots, layers, flags } = this;
    const mine = (k: number): boolean => slots[k] !== 0 && layers[k] === L;
    this.begin();
    const ring = (x: number, y: number): void => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const k = y * w + x;
      if (mine(k)) return;
      if (slots[k] !== 0 && ((flags[k] as number) & CUT) !== 0) return;
      this.add(x, y);
    };
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const k = y * w + x;
        if (!mine(k) || ((flags[k] as number) & (CUT | STROKE)) !== 0) continue;
        ring(x - 1, y);
        ring(x + 1, y);
        ring(x, y - 1);
        ring(x, y + 1);
      }
    }
    for (const k of this.list) {
      slots[k] = INK_SLOT;
      layers[k] = 0;
      flags[k] = 0;
    }
  }

  // ------------------------------------------------------------------ output

  /** Replace each slot index `i` with `table[i]`. */
  remap(table: Uint8Array): void {
    for (let k = 0; k < this.slots.length; k++) this.slots[k] = table[this.slots[k] as number] as number;
  }

  /** Write the pixels into `ctx`: `putImageData` when `ImageData` exists, else one `fillRect` per run. */
  blitTo(ctx: Ctx): void {
    if (typeof ImageData !== 'function') {
      this.emitRuns(ctx);
      return;
    }
    const img = ctx.createImageData(this.w, this.h);
    const px = new Uint32Array(img.data.buffer, img.data.byteOffset, this.w * this.h);
    for (let k = 0; k < px.length; k++) px[k] = SLOT_RGBA[this.slots[k] as number] as number;
    ctx.putImageData(img, 0, 0);
  }

  /** One `fillRect` per horizontal run of one slot, in image pixels. */
  emitRuns(ctx: ArtCtx): void {
    let style = '';
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < this.w) {
        const v = this.slots[y * this.w + x] as number;
        let e = x + 1;
        while (e < this.w && this.slots[y * this.w + e] === v) e++;
        if (v !== 0) {
          const css = SLOT_CSS[v] as string;
          if (css !== style) {
            ctx.fillStyle = css;
            style = css;
          }
          ctx.fillRect(x, y, e - x, 1);
        }
        x = e;
      }
    }
  }

  /** Slot index at an image pixel (0 outside). */
  pixel(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.slots[y * this.w + x] as number;
  }

  /** 1 for each ink-making pixel: an opaque fill pixel of a layer with ink on, not cut and not stroke. */
  inkMask(): Uint8Array {
    const out = new Uint8Array(this.slots.length);
    for (let k = 0; k < out.length; k++) {
      const L = this.layers[k] as number;
      if (this.slots[k] !== 0 && L > 0 && this.layerInk[L] && ((this.flags[k] as number) & (CUT | STROKE)) === 0) out[k] = 1;
    }
    return out;
  }

  /** FNV-1a over `w`, `h` (4 bytes each, little-endian) and the slot bytes. */
  hash(): number {
    let x = 0x811c9dc5;
    const byte = (b: number): void => {
      x = Math.imul(x ^ (b & 255), 0x01000193) >>> 0;
    };
    for (const v of [this.w, this.h]) for (let s = 0; s < 32; s += 8) byte(v >>> s);
    for (let k = 0; k < this.slots.length; k++) byte(this.slots[k] as number);
    return x >>> 0;
  }
}
