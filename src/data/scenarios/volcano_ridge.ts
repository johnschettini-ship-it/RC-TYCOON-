/** Scenario 4 (Phase 5 §4.7): Volcano Ridge. Heights are relative to `baseHeight` (master R19). Owner: W3-H. */
import type { ScenarioDef } from './types';

export const VOLCANO_RIDGE: ScenarioDef = {
  id: 'volcano_ridge',
  defVersion: 1,
  nameKey: 'Volcano Ridge',
  description: 'A sleeping volcano with a crater lake. Build two great coasters on its slopes',
  stars: 3,
  map: {
    width: 80,
    height: 80,
    seed: 4409,
    baseHeight: 8,
    noise: { amplitude: 2, scale: 16, octaves: 2 },
    waterLevel: 0,
    // Rock above height 18.
    terrainRules: [{ minHeight: 19, terrain: 'rock' }, { minHeight: 10, terrain: 'dirt' }],
    features: [
      // Central cone (r 22, peak 30, crater r 4) with a crater lake.
      { kind: 'cone', cx: 40, cy: 22, radius: 22, peak: 30, craterRadius: 4 },
      { kind: 'lake', cx: 40, cy: 22, radius: 3, surface: 28 },
      // Entrance plaza on the plain south of the volcano.
      { kind: 'flatten', rect: { x0: 35, y0: 72, x1: 45, y1: 79 }, height: 0 },
      { kind: 'prebuilt', commands: [{ type: 'buildPathLine', x0: 40, y0: 78, x1: 40, y1: 74, kind: 'footpath' }] },
      // Volcano Ridge scenery scattered over the mountain.
      {
        kind: 'scatterScenery',
        rect: { x0: 8, y0: 2, x1: 72, y1: 50 },
        defIds: ['lava_rock', 'basalt_columns', 'fire_fern', 'ash_palm', 'lava_crag', 'steam_vent'],
        density: 0.05,
      },
    ],
    park: {
      // Owned 50 × 50 on the south slope.
      owned: [{ x0: 15, y0: 29, x1: 64, y1: 78 }],
      forSale: [],
      rightsForSale: [],
      entrance: { x: 40, y: 79, side: 'S' },
    },
  },
  start: { cash: 2_500_000, loan: 1_000_000, maxLoan: 4_000_000, entranceFee: 600, parkName: 'Volcano Ridge' },
  research: { unlocked: ['drop_tower'], allowed: 'all' },
  climate: 'temperate',
  afterDark: 'on',
  objectives: [
    { type: 'coasterExcitement', count: 2, minExcitement: 650, maxIntensity: 850 },
    { type: 'guestsInPark', count: 500 },
  ],
  timeLimitMonths: 24,
};
