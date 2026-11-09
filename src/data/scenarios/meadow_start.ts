/** Scenario 1 (Phase 5 §4.7): Meadow Start. Heights are relative to `baseHeight` (master R19). Owner: W3-H. */
import type { ScenarioDef } from './types';

export const MEADOW_START: ScenarioDef = {
  id: 'meadow_start',
  defVersion: 1,
  nameKey: 'Meadow Start',
  description: 'A gentle meadow with a round pond. Build a friendly park and fill it with happy guests',
  stars: 1,
  map: {
    width: 64,
    height: 64,
    seed: 1101,
    baseHeight: 8,
    noise: { amplitude: 2, scale: 16, octaves: 2 },
    waterLevel: 0,
    terrainRules: [{ nearWater: 0, terrain: 'sand' }],
    features: [
      // Round pond (r 4) in the north-east of the park.
      { kind: 'lake', cx: 45, cy: 29, radius: 4, surface: 0 },
      // Entrance plaza.
      { kind: 'flatten', rect: { x0: 26, y0: 56, x1: 36, y1: 63 }, height: 0 },
      // Prebuilt 5-tile plaza path from the entrance.
      { kind: 'prebuilt', commands: [{ type: 'buildPathLine', x0: 31, y0: 62, x1: 31, y1: 58, kind: 'footpath' }] },
    ],
    park: {
      // Owned 40 × 40 at the south centre; a 12-tile strip east of it is for sale.
      owned: [{ x0: 12, y0: 23, x1: 51, y1: 62 }],
      forSale: [{ x0: 52, y0: 23, x1: 63, y1: 62 }],
      rightsForSale: [],
      entrance: { x: 31, y: 63, side: 'S' },
    },
  },
  start: { cash: 2_000_000, loan: 0, maxLoan: 2_000_000, entranceFee: 600, parkName: 'Meadow Start' },
  research: { unlocked: ['bumper_cars', 'spiral_slide'], allowed: 'all' },
  climate: 'temperate',
  afterDark: 'off',
  objectives: [{ type: 'guestsInPark', count: 250, minRating: 500 }],
  timeLimitMonths: 12,
};
