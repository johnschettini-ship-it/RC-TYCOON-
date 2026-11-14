/** Shared format of the baked realistic-art index (written by the bake, read by the game). */
export type RealKind =
  | 'ground' | 'shadow' | 'ride' | 'stall' | 'scenery'
  | 'guest' | 'rail' | 'support' | 'car' | 'facade';

/** `${kind}:${item}:d${density}:r${rot|'all'}` */
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
  sheets: { file: string; w: number; h: number; mask?: string }[];
  frames: Record<string, RealFrame>;
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

export function setKey(kind: RealKind, item: string, density: 2 | 4, rot: 0 | 1 | 2 | 3 | 'all'): SetKey {
  return `${kind}:${item}:d${density}:r${rot}`;
}

export function frameKey(parts: (string | number)[]): string {
  return parts.join(':');
}
