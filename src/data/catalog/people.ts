/** content-catalog.md §4–5. */
import type { CostumeDef, PathItemDef, StaffDef } from './types';

export const PATH_ITEMS: readonly PathItemDef[] = Object.freeze([
  { id: 'bench', name: 'Bench', phase: 3, unlock: 'start', buildCost: 4000 },
  { id: 'bin', name: 'Litter Bin', phase: 3, unlock: 'start', buildCost: 3000 },
  { id: 'lamp', name: 'Path Lamp', phase: 4, unlock: 'start', buildCost: 5000 },
]);

export const BIN_CAPACITY = 24;
export const BENCH_ENERGY = 60;

export const STAFF: readonly StaffDef[] = Object.freeze([
  { id: 'groundskeeper', name: 'Groundskeeper', hireCost: 10000, wageMonthly: 5000, ticksPerTile: 12 },
  { id: 'mechanic', name: 'Mechanic', hireCost: 15000, wageMonthly: 8000, ticksPerTile: 10 },
  { id: 'security', name: 'Security Guard', hireCost: 12000, wageMonthly: 6000, ticksPerTile: 10 },
  { id: 'performer', name: 'Performer', hireCost: 12000, wageMonthly: 5500, ticksPerTile: 14 },
]);

/**
 * Performer costumes. The Frost and Spark costumes (Chill ≤ 35, Thrill ≥ 65) were removed with the mascots (Task 24,
 * owner decision 2026-11-12); an older save's performer in one of them wears Boo (`src/save/migrations/retired.ts`).
 */
export const COSTUMES: readonly CostumeDef[] = Object.freeze([
  { id: 'boo', mascot: 'Small ghost', bonus: 1.5, temperament: null },
]);
