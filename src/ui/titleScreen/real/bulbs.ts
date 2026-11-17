/**
 * The poster's light bulbs, found once per decoded poster by brightness (VITE_ART=real build only): small warm spots
 * clearly brighter than their surroundings, inside the index's `lights` box. `view.ts` lays a soft additive glow that
 * pulses over each one (none with reduced motion). Pure: takes RGBA pixels, no DOM.
 */

export interface Bulb {
  /** Centre, in the pixels given. */
  x: number;
  y: number;
  /** Pulse phase, 0..1 (fixed per bulb, so the pulse is the same on every load). */
  phase: number;
}
export interface BulbOptions {
  /** Look only inside this box (pixels given). */
  box?: { x: number; y: number; w: number; h: number };
  /** Most bulbs kept (the strongest). */
  max?: number;
}

/** A bulb: luminance at least this, red at least this, blue at most this share of red (warm), and this much above the 9 x 9 mean. */
const MIN_LUM = 205;
const MIN_RED = 225;
const BLUE_SHARE = 0.8;
const MIN_LIFT = 40;
/** The spot is the brightest pixel within this radius. */
const PEAK_R = 3;
const MEAN_R = 4;
/** A bulb is small: at most this many pixels of the 9 x 9 window are bright (the edge of a bright band is not a bulb). */
const BRIGHT_LUM = MIN_LUM - 15;
const MAX_BRIGHT = 24;

export function findBulbs(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, opts: BulbOptions = {}): Bulb[] {
  const L = new Float32Array(w * h);
  for (let i = 0, p = 0; i < L.length; i++, p += 4) L[i] = 0.2126 * (rgba[p] ?? 0) + 0.7152 * (rgba[p + 1] ?? 0) + 0.0722 * (rgba[p + 2] ?? 0);
  // Summed-area tables: luminance (the local mean) and bright pixels (the spot's size).
  const sat = (v: (i: number) => number): Float64Array => {
    const S = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += v(y * w + x);
        S[(y + 1) * (w + 1) + x + 1] = (S[y * (w + 1) + x + 1] ?? 0) + row;
      }
    }
    return S;
  };
  const SL = sat((i) => L[i] ?? 0);
  const SB = sat((i) => ((L[i] ?? 0) >= BRIGHT_LUM ? 1 : 0));
  /** Sum of a table over the (2 MEAN_R + 1)² window round (x, y), and the window's pixel count. */
  const around = (S: Float64Array, x: number, y: number): [number, number] => {
    const x0 = Math.max(0, x - MEAN_R);
    const y0 = Math.max(0, y - MEAN_R);
    const x1 = Math.min(w, x + MEAN_R + 1);
    const y1 = Math.min(h, y + MEAN_R + 1);
    const sum = (S[y1 * (w + 1) + x1] ?? 0) - (S[y0 * (w + 1) + x1] ?? 0) - (S[y1 * (w + 1) + x0] ?? 0) + (S[y0 * (w + 1) + x0] ?? 0);
    return [sum, (x1 - x0) * (y1 - y0)];
  };
  const mean = (x: number, y: number): number => {
    const [sum, n] = around(SL, x, y);
    return sum / n;
  };
  const b = opts.box ?? { x: 0, y: 0, w, h };
  const bx0 = Math.max(0, Math.floor(b.x));
  const by0 = Math.max(0, Math.floor(b.y));
  const bx1 = Math.min(w, Math.ceil(b.x + b.w));
  const by1 = Math.min(h, Math.ceil(b.y + b.h));
  const found: Array<{ x: number; y: number; lift: number }> = [];
  for (let y = by0; y < by1; y++) {
    for (let x = bx0; x < bx1; x++) {
      const i = y * w + x;
      const l = L[i] ?? 0;
      const r = rgba[i * 4] ?? 0;
      if (l < MIN_LUM || r < MIN_RED || (rgba[i * 4 + 2] ?? 0) > BLUE_SHARE * r) continue;
      const lift = l - mean(x, y);
      if (lift < MIN_LIFT || around(SB, x, y)[0] > MAX_BRIGHT) continue;
      // The brightest pixel around (ties: the first in reading order).
      let peak = true;
      for (let dy = -PEAK_R; dy <= PEAK_R && peak; dy++) {
        for (let dx = -PEAK_R; dx <= PEAK_R; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if ((dx === 0 && dy === 0) || xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const o = L[yy * w + xx] ?? 0;
          if (o > l || (o === l && (dy < 0 || (dy === 0 && dx < 0)))) {
            peak = false;
            break;
          }
        }
      }
      if (peak) found.push({ x, y, lift });
    }
  }
  found.sort((p, q) => q.lift - p.lift || p.y - q.y || p.x - q.x);
  const kept = found.slice(0, opts.max ?? 240);
  // A fixed, scattered phase per bulb (golden-ratio steps over its place).
  return kept.map((p) => ({ x: p.x, y: p.y, phase: ((p.x * 0.618034 + p.y * 0.381966) % 1 + 1) % 1 }));
}
