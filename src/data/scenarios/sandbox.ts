/**
 * Sandbox terrain style presets (Phase 5 §4.5 table). Owner: W3-H. Heights are relative to the base height (R19).
 * The generator (`sim/scenario/sandbox.ts`) places the random features from the sandbox seed.
 */
import type { TerrainRule, TerrainStyle } from './types';

export interface TerrainStylePreset {
  noise: { amplitude: number; scale: number; octaves: number };
  waterLevel: number;
  /** Random lakes, cones, and rivers across the map; `seaAllEdges` puts the sea on all 4 edges. */
  lakes: number;
  cones: number;
  rivers: number;
  seaAllEdges: boolean;
  /** Relative height of the flat entrance plaza (above the water level on islands). */
  plazaHeight: number;
}

export const TERRAIN_STYLE_PRESETS: Readonly<Record<TerrainStyle, TerrainStylePreset>> = {
  flat: { noise: { amplitude: 0, scale: 16, octaves: 1 }, waterLevel: 0, lakes: 0, cones: 0, rivers: 0, seaAllEdges: false, plazaHeight: 0 },
  rollingHills: { noise: { amplitude: 4, scale: 24, octaves: 3 }, waterLevel: 0, lakes: 2, cones: 0, rivers: 0, seaAllEdges: false, plazaHeight: 0 },
  mountains: { noise: { amplitude: 14, scale: 32, octaves: 4 }, waterLevel: 0, lakes: 0, cones: 2, rivers: 0, seaAllEdges: false, plazaHeight: 0 },
  islands: { noise: { amplitude: 6, scale: 20, octaves: 3 }, waterLevel: 3, lakes: 0, cones: 0, rivers: 0, seaAllEdges: true, plazaHeight: 4 },
  riverValley: { noise: { amplitude: 6, scale: 28, octaves: 3 }, waterLevel: 0, lakes: 0, cones: 0, rivers: 1, seaAllEdges: false, plazaHeight: 0 },
};

export const TERRAIN_STYLES: readonly TerrainStyle[] = ['flat', 'rollingHills', 'mountains', 'islands', 'riverValley'];

/** Terrain types for every sandbox map: sand by the water, snow and rock up high. */
export const SANDBOX_TERRAIN_RULES: readonly TerrainRule[] = [
  { nearWater: 1, terrain: 'sand' },
  { minHeight: 12, terrain: 'snow' },
  { minHeight: 8, terrain: 'rock' },
];
