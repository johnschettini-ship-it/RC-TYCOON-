/** Shared format of the baked realistic-art index (written by the bake, read by the game). */
export type RealKind =
  | 'ground' | 'shadow' | 'ride' | 'stall' | 'scenery'
  | 'guest' | 'rail' | 'support' | 'car' | 'facade'
  /** Card pictures: one set `preview:cards:d2:rall`, frames keyed by item id (src/render/real/cards.ts). */
  | 'preview';

/** `${kind}:${item}:d${density}:r${rot|'all'}`, plus `:c<colour>` for a ride set in a chosen colour (`setKey`). */
export type SetKey = string;

/**
 * ox/oy: offset from the object's game anchor (the screen point tileToScreen gives for the
 * same world point today's sprite uses) to the frame's top-left, in density pixels.
 */
export interface RealFrame { sheet: string; sx: number; sy: number; w: number; h: number; ox: number; oy: number }

export interface RealSetEntry {
  key: SetKey;
  kind: RealKind;
  item: string;
  density: 2 | 4;
  rot: 0 | 1 | 2 | 3 | 'all';
  /**
   * `mask`: the sheet's tint mask (same size; red channel = how much of the colour each pixel takes). Every ride sheet
   * has one: its colour part (ride colour choice), white on the part, black elsewhere, soft only at edges.
   * `tint: 'alpha'` (track rails that take the track colour everywhere, batch 5): the sheet has no mask file; its own
   * alpha is the mask, so it tints like a full-white mask clipped to the picture.
   */
  sheets: { file: string; w: number; h: number; mask?: string; tint?: 'alpha' }[];
  frames: Record<string, RealFrame>;
  /**
   * Rides: the designed colour (`#rrggbb`) of the ride's colour part, the part its masks cover. A chosen colour maps
   * this colour to the target and keeps each pixel's shading relative to it. Same for every set of the ride.
   */
  baseColour?: string;
}

export interface RealIndex {
  format: 'real/1';
  pxPerMetreZoom1: 11.31;
  stepPxPerMetre: 9.8;
  /** Densities this bake holds; checkIndex requires every item at each of them (a full bake: [2, 4]). */
  densities: (2 | 4)[];
  sets: RealSetEntry[];
  bytes: { compressed: number; decodedByDensity: Record<'2' | '4', number> };
}

/**
 * A set's key. `colour` (a ride colour, a `TRACK_PALETTE` index; ride colours Task 5) names the coloured copy of the
 * ride's set: its own set, made at load from the Original entry's sheets and masks (`SetManager`); the index lists
 * only Original keys.
 */
export function setKey(kind: RealKind, item: string, density: 2 | 4, rot: 0 | 1 | 2 | 3 | 'all', colour?: number | null): SetKey {
  const k = `${kind}:${item}:d${density}:r${rot}`;
  return colour === undefined || colour === null ? k : `${k}:c${colour}`;
}

/** The coloured copy of set `key` (`setKey` with a colour). */
export function withColour(key: SetKey, colour: number): SetKey {
  return `${key}:c${colour}`;
}

/** A coloured set key's Original key and colour, or null for a key without a colour. */
export function colourOfKey(key: SetKey): { base: SetKey; colour: number } | null {
  const m = /^(.*):c(\d+)$/.exec(key);
  return m ? { base: m[1] as string, colour: Number(m[2]) } : null;
}

export function frameKey(parts: (string | number)[]): string {
  return parts.join(':');
}
