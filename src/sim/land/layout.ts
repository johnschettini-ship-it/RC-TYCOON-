/**
 * Free-play map layout (Phase 4 §4.9). Owner: W3-G.
 *
 * A flat grass map of `size` × `size` (default `MAP_SIZE_DEFAULT` = 96) at ground level 8 with an owned centre
 * square of `min(48, size − 8)` tiles, a ring around it for sale (state 2), and the outer 4 tiles not owned.
 * The park entrance sits just south of the owned square in the gap of the border (owned, like Build 1's entrance
 * on the map edge), with the 3-tile footpath stub leading north into the square; guests spawn on the entrance tile.
 * On 64 × 64 the entrance column is 31, as in Build 1. Deterministic; no RNG.
 */
import { ENTRANCE_STUB_LENGTH, GROUND_LEVEL } from '../../data/tuning/core';
import { FREE_PLAY_BORDER, FREE_PLAY_OWNED_MAX, MAP_SIZE_DEFAULT } from '../../data/tuning/land';
import { Content, Owned, tileIndex, type MapState } from '../map';

/** Smallest map the layout supports (the square, the stub, and the border must fit). */
export const FREE_PLAY_MIN_SIZE = 16;

/** Owned square of a free-play map: origin `o` (x and y) and side `s`. */
export function freePlaySquare(size: number): { o: number; s: number } {
  const s = Math.min(FREE_PLAY_OWNED_MAX, size - 2 * FREE_PLAY_BORDER);
  return { o: Math.floor((size - s) / 2), s };
}

export function generateFreePlayMap(size: number = MAP_SIZE_DEFAULT): MapState {
  if (!Number.isInteger(size) || size < FREE_PLAY_MIN_SIZE) throw new Error(`Map size must be an integer of at least ${FREE_PLAY_MIN_SIZE}, got ${size}`);
  const n = size * size;
  const map: MapState = {
    width: size,
    height: size,
    terrain: new Uint8Array(n),
    heights: new Uint8Array(n).fill(GROUND_LEVEL),
    slope: new Uint8Array(n),
    water: new Uint8Array(n),
    content: new Uint8Array(n),
    contentRef: new Int32Array(n).fill(-1),
    owned: new Uint8Array(n),
    pathItem: new Uint8Array(n),
    pathItemFlags: new Uint8Array(n),
    binFill: new Uint8Array(n),
    litter: new Uint8Array(n),
    mess: new Uint8Array(n),
    pathItemLevel: new Int32Array(n),
    entranceTile: -1,
  };
  const b = FREE_PLAY_BORDER;
  for (let y = b; y < size - b; y++) {
    for (let x = b; x < size - b; x++) map.owned[y * size + x] = Owned.LandForSale;
  }
  const { o, s } = freePlaySquare(size);
  for (let y = o; y < o + s; y++) {
    for (let x = o; x < o + s; x++) map.owned[y * size + x] = Owned.Owned;
  }
  const ex = o + Math.floor((s - 1) / 2);
  const ey = o + s;
  const entrance = tileIndex(map, ex, ey);
  map.entranceTile = entrance;
  map.content[entrance] = Content.ParkEntrance;
  map.owned[entrance] = Owned.Owned;
  for (let k = 1; k <= ENTRANCE_STUB_LENGTH; k++) map.content[tileIndex(map, ex, ey - k)] = Content.Footpath;
  return map;
}
