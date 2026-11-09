import { ENTRANCE_STUB_LENGTH, GROUND_LEVEL, MAP_SIZE_BUILD1, PARK_ENTRANCE_X } from '../data/tuning/core';
import type { EntityId } from './units';

/** Terrain types (master 6.3). */
export const Terrain = { Grass: 0, Sand: 1, Dirt: 2, Rock: 3, Snow: 4 } as const;
export type TerrainCode = (typeof Terrain)[keyof typeof Terrain];

/** Tile content (master 6.3). There is no fence value: the fence is derived from `owned` (master R3). */
export const Content = {
  Empty: 0,
  Footpath: 1,
  Queue: 2,
  Building: 3,
  Track: 4,
  ParkEntrance: 5,
  Scenery: 6,
} as const;
export type ContentCode = (typeof Content)[keyof typeof Content];

/** Ownership states (master 6.3). */
export const Owned = {
  NotOwned: 0,
  Owned: 1,
  LandForSale: 2,
  RightsOwned: 3,
  RightsForSale: 4,
} as const;

/** Path items (Phase 3 §5). */
export const PathItem = { None: 0, Bench: 1, Bin: 2, Lamp: 3 } as const;

/** Directions: 0 = N (y − 1), 1 = E (x + 1), 2 = S (y + 1), 3 = W (x − 1). Tie-break order is N, E, S, W. */
export type Dir = 0 | 1 | 2 | 3;
export const DIR_DX: readonly number[] = [0, 1, 0, -1];
export const DIR_DY: readonly number[] = [-1, 0, 1, 0];

export interface MapState {
  width: number;
  height: number;
  terrain: Uint8Array;
  /** Base height in steps (1 step = 1 m). Ground level is 8. */
  heights: Uint8Array;
  /** 4-bit mask of raised corners (N, E, S, W). */
  slope: Uint8Array;
  /** Water surface height, 0 = none. */
  water: Uint8Array;
  content: Uint8Array;
  /** Entity id on this tile, or −1. */
  contentRef: Int32Array;
  owned: Uint8Array;
  /** Phase 3 per-tile arrays. */
  pathItem: Uint8Array;
  /** Bit 0 = broken. */
  pathItemFlags: Uint8Array;
  binFill: Uint8Array;
  litter: Uint8Array;
  mess: Uint8Array;
  /** Park entrance tile index. */
  entranceTile: number;
}

export function tileIndex(map: Pick<MapState, 'width'>, x: number, y: number): number {
  return y * map.width + x;
}

export function tileX(map: Pick<MapState, 'width'>, i: number): number {
  return i % map.width;
}

export function tileY(map: Pick<MapState, 'width'>, i: number): number {
  return Math.floor(i / map.width);
}

export function inBounds(map: Pick<MapState, 'width' | 'height'>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

/** Neighbour tile index in direction `dir`, or −1 outside the map. */
export function neighbour(map: Pick<MapState, 'width' | 'height'>, i: number, dir: Dir): number {
  const x = (i % map.width) + (DIR_DX[dir] as number);
  const y = Math.floor(i / map.width) + (DIR_DY[dir] as number);
  return inBounds(map, x, y) ? y * map.width + x : -1;
}

export function isOwned(map: MapState, i: number): boolean {
  return map.owned[i] === Owned.Owned;
}

/**
 * Phase 0 generator: flat grass at ground level 8. The outer ring is not owned.
 * The park entrance is (31, height − 1) and is owned. A 3-tile footpath stub leads north.
 */
export function generateMap(opts: { width?: number; height?: number } = {}): MapState {
  const width = opts.width ?? MAP_SIZE_BUILD1;
  const height = opts.height ?? MAP_SIZE_BUILD1;
  const n = width * height;
  const map: MapState = {
    width,
    height,
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
    entranceTile: -1,
  };
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) map.owned[y * width + x] = Owned.Owned;
  }
  const ex = Math.min(PARK_ENTRANCE_X, width - 2);
  const entrance = tileIndex(map, ex, height - 1);
  map.entranceTile = entrance;
  map.content[entrance] = Content.ParkEntrance;
  map.owned[entrance] = Owned.Owned;
  for (let k = 1; k <= ENTRANCE_STUB_LENGTH; k++) {
    map.content[tileIndex(map, ex, height - 1 - k)] = Content.Footpath;
  }
  return map;
}

export type { EntityId };
