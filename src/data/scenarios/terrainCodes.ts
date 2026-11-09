/** Terrain type names for scenario data (data/ cannot import sim/). Same order as `Terrain` in `src/sim/map.ts`. */
export type TerrainCode = 'grass' | 'sand' | 'dirt' | 'rock' | 'snow';

export const TERRAIN_CODES: readonly TerrainCode[] = ['grass', 'sand', 'dirt', 'rock', 'snow'];
