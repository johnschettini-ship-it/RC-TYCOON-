/**
 * Colours (master §2.5): flat colours, warm hues = thrill, cool hues = chill. Owner: W1-A.
 */

export const SKY = '#1d2b3a';

/** Guest shirt palette: a mix of warm and cool hues. */
export const SHIRT_COLOURS: readonly string[] = [
  '#e8503a', // tomato
  '#f39a2b', // orange
  '#f5d03b', // sun yellow
  '#7cc04b', // leaf green
  '#2fb39a', // teal
  '#3d9be0', // sky blue
  '#4f63d9', // cobalt
  '#8d5ad8', // violet
  '#d457a8', // pink
  '#f2f2f2', // white
  '#a0522d', // sienna
  '#30425a', // navy
];

/** murmur3 finalizer: a well-mixed 32-bit hash of an integer. */
export function mix32(n: number): number {
  let h = n | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Stable shirt colour index for a guest id. */
export function shirtIndex(id: number): number {
  return mix32(id) % SHIRT_COLOURS.length;
}

/** Temperament overlay: quantized steps from pure Chill (0) to pure Thrill (TINT_STEPS − 1). */
export const TINT_STEPS = 9;
const CHILL_RGB: readonly [number, number, number] = [52, 128, 235];
const THRILL_RGB: readonly [number, number, number] = [255, 138, 30];

/** Chill (T ≤ 35) → step 0; Thrill (T ≥ 65) → last step; linear between (master R6 group bounds). */
export function tintStep(t: number): number {
  if (t <= 35) return 0;
  if (t >= 65) return TINT_STEPS - 1;
  return Math.round(((t - 35) / 30) * (TINT_STEPS - 1));
}

export function tintStepRgb(step: number): [number, number, number] {
  const f = step / (TINT_STEPS - 1);
  return [
    Math.round(CHILL_RGB[0] + (THRILL_RGB[0] - CHILL_RGB[0]) * f),
    Math.round(CHILL_RGB[1] + (THRILL_RGB[1] - CHILL_RGB[1]) * f),
    Math.round(CHILL_RGB[2] + (THRILL_RGB[2] - CHILL_RGB[2]) * f),
  ];
}

/** Overlay tint for temperament `t` as [r, g, b]. */
export function temperamentTint(t: number): [number, number, number] {
  return tintStepRgb(tintStep(t));
}

export function rgbCss(c: readonly [number, number, number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Tag colours for rides (warm = thrill, cool = chill, green = family). */
export const TAG_COLOURS = {
  thrill: { main: '#f0643a', light: '#ffb36b', dark: '#a8321c' },
  family: { main: '#4fbf63', light: '#9be08f', dark: '#2a7c3c' },
  chill: { main: '#3fa7d6', light: '#9bd8f0', dark: '#20628a' },
} as const;

/** Darken (f < 1) or lighten (f > 1) a #rrggbb colour. */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const ch = (v: number): number => {
    const o = f >= 1 ? v + (255 - v) * (f - 1) : v * f;
    return Math.max(0, Math.min(255, Math.round(o)));
  };
  return `#${((1 << 24) | (ch(r) << 16) | (ch(g) << 8) | ch(b)).toString(16).slice(1)}`;
}
