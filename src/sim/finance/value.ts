/** Owner: W1-I. Park value from asset values (Phase 3 §4.12, master R14), updated at hour start. */
import { TICKS_PER_MONTH } from '../../data/tuning/core';
import { DEP_FLOOR, DEP_MONTHS, PATH_VALUE_COST, PATH_VALUE_SHARE, QUEUE_VALUE_COST } from '../../data/tuning/management';
import { PATH_ITEMS } from '../../data/catalog';
import { Content, PathItem } from '../map';
import type { World } from '../types';
import type { Cents } from '../units';

const SCALE = 1000;
const FLOOR_SCALED = Math.round(DEP_FLOOR * SCALE);
const LOSS_SCALED = SCALE - FLOOR_SCALED;

/**
 * `buildCost × max(DEP_FLOOR, 1 − (1 − DEP_FLOOR) × ageMonths / DEP_MONTHS)`, floored to whole cents.
 * Integer arithmetic, so the result is exact and deterministic.
 */
export function assetValue(buildCost: Cents, ageMonths: number): Cents {
  const age = Math.max(0, Math.floor(ageMonths));
  const factorScaled = Math.max(FLOOR_SCALED * DEP_MONTHS, SCALE * DEP_MONTHS - LOSS_SCALED * age);
  return Math.floor((buildCost * factorScaled) / (SCALE * DEP_MONTHS));
}

/** Whole months since `builtTick`. */
export function ageMonthsOf(world: World, builtTick: number): number {
  return Math.max(0, Math.floor((world.state.tick - builtTick) / TICKS_PER_MONTH));
}

/** Build cost by path item code (index = PathItem code; None = 0). A flat lookup keeps the hourly scan cheap. */
const PATH_ITEM_COST: readonly Cents[] = (() => {
  const costs: Cents[] = [0, 0, 0, 0];
  costs[PathItem.Bench] = PATH_ITEMS.find((p) => p.id === 'bench')?.buildCost ?? 0;
  costs[PathItem.Bin] = PATH_ITEMS.find((p) => p.id === 'bin')?.buildCost ?? 0;
  costs[PathItem.Lamp] = PATH_ITEMS.find((p) => p.id === 'lamp')?.buildCost ?? 0;
  return Object.freeze(costs);
})();

/** Σ ride and stall asset values + Σ paths and path items × 0.5 + land value (Phase 4 hook, 0). */
export function computeParkValue(world: World): Cents {
  const s = world.state;
  let total = 0;
  for (const r of s.rides) total += assetValue(r.totalBuildCost, ageMonthsOf(world, r.builtTick));
  for (const st of s.stalls) total += assetValue(st.totalBuildCost, ageMonthsOf(world, st.builtTick));

  const { content, pathItem } = s.map;
  // Local copies keep the hourly 4,096-tile scan tight (master §10 hour-start budget).
  const footpath = Content.Footpath;
  const queue = Content.Queue;
  const none = PathItem.None;
  const pathValue = PATH_VALUE_COST;
  const queueValue = QUEUE_VALUE_COST;
  const itemCost = PATH_ITEM_COST;
  const n = content.length;
  let pathCost = 0;
  for (let i = 0; i < n; i++) {
    const c = content[i];
    if (c === footpath) pathCost += pathValue;
    else if (c === queue) pathCost += queueValue;
    const item = pathItem[i] as number;
    if (item !== none) pathCost += itemCost[item] ?? 0;
  }
  total += Math.floor(pathCost * PATH_VALUE_SHARE);
  return total;
}

export function updateParkValue(world: World): void {
  world.state.management.parkValue = computeParkValue(world);
}
