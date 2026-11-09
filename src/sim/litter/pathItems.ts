/** Owner: W1-H. Path item helpers (Phase 3 §4.3–4.4). Items live in per-tile map arrays. */
import { BIN_CAPACITY, PATH_ITEMS } from '../../data/catalog/people';
import type { PathItemDef } from '../../data/catalog/types';
import { BENCH_SEATS, REPAIR_COST_PERCENT } from '../../data/tuning/staff';
import { PathItem, type MapState } from '../map';
import type { World } from '../types';

export const BROKEN_FLAG = 1;

export type PathItemId = PathItemDef['id'];

const CODE_BY_ID: Record<PathItemId, number> = { bench: PathItem.Bench, bin: PathItem.Bin, lamp: PathItem.Lamp };

export function pathItemCode(id: PathItemId): number {
  return CODE_BY_ID[id];
}

export function pathItemDefByCode(code: number): PathItemDef | undefined {
  return PATH_ITEMS.find((d) => CODE_BY_ID[d.id] === code);
}

export function pathItemDefById(id: string): PathItemDef | undefined {
  return PATH_ITEMS.find((d) => d.id === id);
}

export function isBroken(map: MapState, tile: number): boolean {
  return ((map.pathItemFlags[tile] ?? 0) & BROKEN_FLAG) !== 0;
}

export function setBroken(map: MapState, tile: number, broken: boolean): void {
  const f = map.pathItemFlags[tile] ?? 0;
  map.pathItemFlags[tile] = broken ? f | BROKEN_FLAG : f & ~BROKEN_FLAG;
}

/** Repair cost = REPAIR_COST_PERCENT of the item's build cost, in whole cents. */
export function repairCost(code: number): number {
  const def = pathItemDefByCode(code);
  return def ? Math.floor((def.buildCost * REPAIR_COST_PERCENT) / 100) : 0;
}

/** A bin that is not broken and not full. */
export function isUsableBin(map: MapState, tile: number): boolean {
  return map.pathItem[tile] === PathItem.Bin && !isBroken(map, tile) && (map.binFill[tile] ?? 0) < BIN_CAPACITY;
}

export function benchSittersOn(world: World, tile: number): number {
  let n = 0;
  for (const s of world.state.staff.benchSitters) if (s.tile === tile) n++;
  return n;
}

/** A bench that is not broken and has a free seat. */
export function hasFreeBenchSeat(world: World, tile: number): boolean {
  const map = world.state.map;
  return map.pathItem[tile] === PathItem.Bench && !isBroken(map, tile) && benchSittersOn(world, tile) < BENCH_SEATS;
}
