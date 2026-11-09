/** Terrain and water editing tuning (Phase 4 §8). Owner: W3-A. Money is integer cents. */
import { MAX_HEIGHT_STEPS } from './core';

export const MAX_CORNER_HEIGHT = MAX_HEIGHT_STEPS; // 63 m
export const TERRAIN_TILE_FEE = 400; // $4 per changed tile
export const TERRAIN_STEP_COST = 600; // $6 per corner step
export const PAINT_COST = 200; // $2 per changed tile
export const WATER_STEP_COST = 1_000; // $10 per tile per step
export const BRUSH_SIZES = [1, 3, 5, 7] as const;
/** Land tool: hold the button to repeat every 300 ms (client). */
export const LAND_REPEAT_MS = 300;
