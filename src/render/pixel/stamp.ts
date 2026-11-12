/** Phase 8 stage 0 prototype (never merged): the stamp format, rows of letters painted as art pixels (spec §8.3). */
import { ART_PX_WORLD } from '../../data/tuning/pixel';
import type { ArtCtx } from '../sprites/shapes';
import { INK_SLOT, SLOT_NAMES, SLOT_RGBA } from './palette';
import { isPixelSurface } from './surface';

/** A picture as rows of letters; `.` and space are transparent. Each `pairs` string holds two letters, "lit dark". */
export interface Stamp {
  rows: readonly string[];
  pairs?: readonly string[];
}

/** Letter → slot name or CSS colour. The letter `o` is ink unless the map says otherwise. */
export type StampMap = Readonly<Record<string, string>>;

const SLOT_SET: ReadonlySet<string> = new Set(SLOT_NAMES.slice(1));
const INK_NAME = SLOT_NAMES[INK_SLOT] as string;

/** `#rrggbb` of a slot (`SLOT_RGBA` is `0xAABBGGRR`). */
function slotCss(name: string): string {
  const v = SLOT_RGBA[SLOT_NAMES.indexOf(name)] as number;
  const rgb = ((v & 255) << 16) | (v & 0xff00) | ((v >>> 16) & 255);
  return `#${(rgb | (1 << 24)).toString(16).slice(1)}`;
}

/** The fill style of a map value: a slot name stays a name on a surface, else becomes its colour; CSS passes through. */
function styleOf(ctx: ArtCtx, colour: string): string {
  if (!SLOT_SET.has(colour)) return colour;
  return isPixelSurface(ctx) ? colour : slotCss(colour);
}

/** Width (the longest row) and height of a stamp, in art pixels. */
export function stampSize(s: Stamp): { w: number; h: number } {
  let w = 0;
  for (const r of s.rows) w = Math.max(w, r.length);
  return { w, h: s.rows.length };
}

/**
 * Paint a stamp with its bottom centre at the world point (x, y) (even world pixels). One `fillRect` per run of one
 * letter, as cut pixels: the stamp carries its own outline, so no layer ring lands on it and it makes none.
 * `mirror` flips the rows left to right and swaps the values of each `pairs` letter pair, so light stays on the left.
 */
export function stamp(ctx: ArtCtx, s: Stamp, x: number, y: number, map: StampMap, opts?: { mirror?: boolean }): void {
  const { w, h } = stampSize(s);
  const mirror = opts?.mirror === true;
  const values: Record<string, string> = { o: INK_NAME, ...map };
  if (mirror && s.pairs) {
    for (const p of s.pairs) {
      const a = p[0] as string;
      const b = p[1] as string;
      const va = values[a];
      const vb = values[b];
      if (vb !== undefined) values[a] = vb;
      else delete values[a];
      if (va !== undefined) values[b] = va;
      else delete values[b];
    }
  }
  const x0 = x - ART_PX_WORLD * Math.floor(w / 2);
  const y0 = y - ART_PX_WORLD * (h - 1);
  ctx.cut?.(true);
  for (let j = 0; j < h; j++) {
    const src = s.rows[j] as string;
    const row = mirror ? src.padEnd(w, '.').split('').reverse().join('') : src;
    let i = 0;
    while (i < row.length) {
      const c = row[i] as string;
      let e = i + 1;
      while (e < row.length && row[e] === c) e++;
      const colour = values[c];
      if (c !== '.' && c !== ' ' && colour !== undefined) {
        ctx.fillStyle = styleOf(ctx, colour);
        ctx.fillRect(x0 + ART_PX_WORLD * i, y0 + ART_PX_WORLD * j, ART_PX_WORLD * (e - i), ART_PX_WORLD);
      }
      i = e;
    }
  }
  ctx.cut?.(false);
}

/** One art pixel with its top-left corner at the world point (x, y), as a cut pixel (sparkle, bulbs, spray). */
export function px(ctx: ArtCtx, x: number, y: number, colour: string): void {
  ctx.cut?.(true);
  ctx.fillStyle = styleOf(ctx, colour);
  ctx.fillRect(x, y, ART_PX_WORLD, ART_PX_WORLD);
  ctx.cut?.(false);
}
