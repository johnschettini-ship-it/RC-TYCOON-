/** Terrain type names for scenario data (data/ cannot import sim/). Same order as `Terrain` codes in `src/sim/map.ts`. */
export type TerrainName = 'grass' | 'sand' | 'dirt' | 'rock' | 'snow';

export const TERRAIN_NAMES: readonly TerrainName[] = ['grass', 'sand', 'dirt', 'rock', 'snow'];
