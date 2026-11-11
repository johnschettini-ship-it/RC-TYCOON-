/** Phase 8 stage 0 prototype (never merged): ramps, slots, signal slots and colour resolution (spec §5.2, §6). */
import { SAFE_PALETTE } from '../../data/tuning/a11y';
import {
  GHOST_DARK_INVALID,
  GHOST_DARK_VALID,
  GHOST_INVALID,
  GHOST_LIGHT_INVALID,
  GHOST_LIGHT_VALID,
  GHOST_VALID,
  TINT_STEPS,
  shade,
  tintStepRgb,
} from '../palette';
import { COLOUR_MAP } from './colourMap';

export type RampId = 'g' | 's' | 'o' | 't' | 'b' | 'v' | 'c' | 'l' | 'w' | 'k' | 'a' | 'p' | 'i' | 'n' | 'e' | 'x' | 'y' | 'q' | 'u';

const RAMP_ORDER: readonly RampId[] = ['g', 's', 'o', 't', 'b', 'v', 'c', 'l', 'w', 'k', 'a', 'p', 'i', 'n', 'e', 'x', 'y', 'q', 'u'];

const hex6 = (r: number, g: number, b: number): string => `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;

/** Ramps, light to dark, lower case. Draft ramps §6.1, added ramps §6.2, signal ramps §6.3. */
export const RAMPS: Readonly<Record<RampId, readonly string[]>> = {
  g: ['#f0e07a', '#d6c85a', '#bdb24b', '#98993f', '#6f7f3a', '#4d6238'],
  s: ['#ffe9bf', '#fbd08e', '#f0ae62', '#cf8444', '#9c5a36', '#6e3d2e'],
  o: ['#ffd76a', '#ffab33', '#f47a1c', '#d9501a', '#a8301f', '#6e2330'],
  t: ['#b4f0e0', '#62d1c0', '#2fa89c', '#207a80', '#1a5266'],
  b: ['#a9d8ff', '#5aa2ee', '#356cc4', '#27468c'],
  v: ['#c9a4f0', '#9a6bd6', '#6b45a8', '#472d78'],
  c: ['#fff8e6', '#f3e0be', '#d3b894', '#a48a78', '#75606a'],
  l: ['#c2de62', '#8fc04a', '#5a9a44', '#3a7748', '#28554a'],
  w: ['#d99a5a', '#b06a34', '#7a4426', '#4f2c22'],
  k: ['#f8d2a6', '#d99a66', '#9a5e38', '#5e3a26'],
  a: ['#8fe3d6', '#52c4bd', '#35a0aa', '#27788c'],
  p: ['#ffb0c0', '#ff7a9a', '#d94a78'],
  i: ['#6e4470', '#4a2c52', '#2a1a36'],
  n: ['#f4f1ea', '#dcd6cc', '#bdb5ab', '#958d8a', '#6d6670', '#4d4856'],
  e: ['#ffffff', '#eef6ff', '#dbe9f7', '#bcd2ea', '#93b0d2', '#6f8fb8'],
  x: SAFE_PALETTE.map((c) => c.toLowerCase()),
  y: Array.from({ length: TINT_STEPS }, (_, k) => hex6(...tintStepRgb(k))),
  q: [GHOST_LIGHT_VALID, shade(GHOST_VALID, 1.4), GHOST_VALID, GHOST_DARK_VALID].map((c) => c.toLowerCase()),
  u: [GHOST_LIGHT_INVALID, shade(GHOST_INVALID, 1.4), GHOST_INVALID, GHOST_DARK_INVALID].map((c) => c.toLowerCase()),
};

/** Index → slot name. Index 0 is the empty slot; then the ramps in `RampId` order, tones 1 up. */
export const SLOT_NAMES: readonly string[] = [''].concat(RAMP_ORDER.flatMap((r) => RAMPS[r].map((_, k) => `${r}${k + 1}`)));

const rgbOfSlot: number[] = [0];
for (const r of RAMP_ORDER) for (const c of RAMPS[r]) rgbOfSlot.push(parseInt(c.slice(1), 16));

/** Slot colour as `0xAABBGGRR` (the byte order of `ImageData` on little-endian), alpha 255. Index 0 is 0. */
export const SLOT_RGBA: Uint32Array = (() => {
  const out = new Uint32Array(SLOT_NAMES.length);
  for (let s = 1; s < out.length; s++) {
    const v = rgbOfSlot[s] as number;
    out[s] = ((255 << 24) | ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255)) >>> 0;
  }
  return out;
})();

const INDEX = new Map<string, number>(SLOT_NAMES.map((n, k) => [n, k]));

/** The index of a slot name. Throws on an unknown name. */
export function slotIndex(name: string): number {
  const s = name === '' ? undefined : INDEX.get(name);
  if (s === undefined) throw new Error(`unknown slot ${JSON.stringify(name)}`);
  return s;
}

/** The ink slot: the outline tone, in no family. */
export const INK_SLOT: number = slotIndex('i3');

/** Misses of the colour map (rule 2). `missed` is a prototype member: the CSS strings that went to the fallback. */
export const paletteStats: { misses: number; missed: Set<string> } = { misses: 0, missed: new Set() };

// HSL of a 0xRRGGBB colour: hue in degrees [0, 360), saturation and lightness in [0, 1].
function hsl(rgb: number): { h: number; s: number; l: number } {
  const r = ((rgb >> 16) & 255) / 255;
  const g = ((rgb >> 8) & 255) / 255;
  const b = (rgb & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  return { h, s, l };
}

const hueGap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Grey family (rule a). */
const GREY_RAMPS: readonly RampId[] = ['n', 'e', 'c'];
/** Ramps of the hue rules b and c: no grey, no `i`, no signal ramp (rule e). */
const HUE_RAMPS: readonly RampId[] = ['g', 's', 'o', 't', 'b', 'v', 'l', 'w', 'k', 'a', 'p'];
/** Mid tone hue of each hue ramp: tone `ceil(t / 2)`. */
const MID_HUE = new Map<RampId, number>(
  HUE_RAMPS.map((r) => [r, hsl(parseInt((RAMPS[r][Math.ceil(RAMPS[r].length / 2) - 1] as string).slice(1), 16)).h]),
);
const slotsOf = (r: RampId): number[] => RAMPS[r].map((_, k) => slotIndex(`${r}${k + 1}`));

/** The nearest slot by RGB distance inside the family of `rgb` (`0xRRGGBB`), by the family rules a to e of §6.5. */
export function nearestInFamily(rgb: number): number {
  const c = hsl(rgb);
  const fam: number[] = [];
  if (c.s < 0.15) {
    for (const r of GREY_RAMPS) fam.push(...slotsOf(r)); // a
  } else {
    const near = HUE_RAMPS.filter((r) => hueGap(MID_HUE.get(r) as number, c.h) <= 30); // b
    if (near.length === 0) {
      let best = HUE_RAMPS[0] as RampId;
      for (const r of HUE_RAMPS) if (hueGap(MID_HUE.get(r) as number, c.h) < hueGap(MID_HUE.get(best) as number, c.h)) best = r;
      near.push(best); // c
    }
    for (const r of near) fam.push(...slotsOf(r));
  }
  if (c.l < 0.2) fam.push(slotIndex('i1'), slotIndex('i2')); // d: dark plum, never i3
  const r0 = (rgb >> 16) & 255;
  const g0 = (rgb >> 8) & 255;
  const b0 = rgb & 255;
  let best = fam[0] as number;
  let bestD = Infinity;
  for (const s of fam) {
    const v = rgbOfSlot[s] as number;
    const dr = ((v >> 16) & 255) - r0;
    const dg = ((v >> 8) & 255) - g0;
    const db = (v & 255) - b0;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

// Rule 0: signal colour → slot; on a shared colour the first in x, y, q, u order wins. `#56b4e9` skips rule 0.
const SIGNAL = new Map<string, number>();
for (const r of ['x', 'y', 'q', 'u'] as const) {
  RAMPS[r].forEach((c, k) => {
    if (c !== '#56b4e9' && !SIGNAL.has(c)) SIGNAL.set(c, slotIndex(`${r}${k + 1}`));
  });
}

// CSS colour → `0xRRGGBB`, or -1 when it does not parse. Takes `#rrggbb`, `#rgb`, `rgb(…)` and `rgba(…)`.
function parseCss(css: string): number {
  const t = css.trim().toLowerCase();
  let m = /^#([0-9a-f]{6})$/.exec(t);
  if (m) return parseInt(m[1] as string, 16);
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
  if (m) return parseInt(`${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`, 16);
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+%?\s*)?\)$/.exec(t);
  if (m) {
    const ch = (v: string): number => Math.max(0, Math.min(255, Math.round(Number(v))));
    const r = ch(m[1] as string);
    const g = ch(m[2] as string);
    const b = ch(m[3] as string);
    return (r << 16) | (g << 8) | b;
  }
  return -1;
}

// Pure result per CSS string (the rules read no drawing state); a miss still counts on every call.
const resolved = new Map<string, { slot: number; miss: boolean }>();

/** The slot of a CSS colour: rule 0 (signal), rule 1 (`COLOUR_MAP`), rule 2 (family fallback, one miss) of §6.5. */
export function slotOf(css: string): number {
  let hit = resolved.get(css);
  if (!hit) {
    const rgb = parseCss(css);
    if (rgb < 0) {
      hit = { slot: slotIndex('i2'), miss: true };
    } else {
      const key = hex6((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255);
      const sig = SIGNAL.get(key);
      const mapped = COLOUR_MAP[key];
      if (sig !== undefined) hit = { slot: sig, miss: false };
      else if (mapped !== undefined) hit = { slot: slotIndex(mapped), miss: false };
      else hit = { slot: nearestInFamily(rgb), miss: true };
    }
    resolved.set(css, hit);
  }
  if (hit.miss) {
    paletteStats.misses++;
    paletteStats.missed.add(css);
  }
  return hit.slot;
}

/** The slot name `steps` tones darker (positive) or lighter (negative) on the same ramp, clamped; on `i` a dark move stops at `i2`. */
export function tone(name: string, steps: number): string {
  slotIndex(name);
  const r = name.replace(/\d+$/, '') as RampId;
  const cur = Number(name.slice(r.length));
  let t = Math.max(1, Math.min(RAMPS[r].length, cur + Math.round(steps)));
  if (r === 'i' && steps > 0) t = Math.min(t, Math.max(cur, 2));
  return `${r}${t}`;
}
