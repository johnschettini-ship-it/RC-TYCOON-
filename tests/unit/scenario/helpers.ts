/** Test helpers for the scenario card (W3-H). */
import { TICKS_PER_MONTH } from '../../../src/data/tuning/core';
import type { MapState } from '../../../src/sim/map';
import { stepTick } from '../../../src/sim/tick';
import type { World } from '../../../src/sim/types';

/** FNV-1a over the terrain layers the generator owns: heights, slopes, water, terrain types, ownership, entrance. */
export function terrainHash(map: MapState): string {
  let h = 0x811c9dc5;
  const feed = (v: number): void => {
    h ^= v & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
  };
  feed(map.width);
  feed(map.height);
  for (const arr of [map.heights, map.slope, map.water, map.terrain, map.owned]) for (const v of arr) feed(v);
  feed(map.entranceTile);
  feed(map.entranceTile >>> 16);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Corner heights [N, E, S, W] of tile (x, y). */
export function cornersAt(map: Pick<MapState, 'width' | 'heights' | 'slope'>, x: number, y: number): number[] {
  const i = y * map.width + x;
  const h = map.heights[i] as number;
  const s = map.slope[i] as number;
  return [h + (s & 1 ? 1 : 0), h + (s & 2 ? 1 : 0), h + (s & 4 ? 1 : 0), h + (s & 8 ? 1 : 0)];
}

export function isWetAt(map: MapState, x: number, y: number): boolean {
  const i = y * map.width + x;
  return (map.water[i] as number) > (map.heights[i] as number);
}

/** Step ticks until the month-start tick that closes month `monthIndex` is next (tick = (m + 1) × 3,600). */
export function runToMonthEnd(world: World, monthIndex: number): void {
  const target = (monthIndex + 1) * TICKS_PER_MONTH;
  while (world.state.tick < target) stepTick(world);
}

/** Run the month-start tick that closes month `monthIndex` (the world must be right before it). */
export function closeMonth(world: World): void {
  stepTick(world);
}
