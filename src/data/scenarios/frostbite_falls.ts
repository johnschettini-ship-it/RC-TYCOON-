/** Scenario 3 (Phase 5 §4.7): Frostbite Falls. Heights are relative to `baseHeight` (master R19). Owner: W3-H. */
import type { ScenarioDef } from './types';

export const FROSTBITE_FALLS: ScenarioDef = {
  id: 'frostbite_falls',
  defVersion: 1,
  nameKey: 'Frostbite Falls',
  description: 'A cold valley below a snowy cliff, split by a waterfall river. Bring the crowds across the bridge',
  stars: 2,
  map: {
    width: 64,
    height: 64,
    seed: 3301,
    baseHeight: 8,
    noise: { amplitude: 2, scale: 16, octaves: 2 },
    waterLevel: 0,
    // Snow above height 6.
    terrainRules: [{ minHeight: 7, terrain: 'snow' }, { nearWater: 1, terrain: 'dirt' }],
    features: [
      // 8-step cliff across the north.
      { kind: 'cliff', from: { x: 0, y: 14 }, to: { x: 64, y: 14 }, height: 8 },
      // The waterfall river: over the cliff, through the park, out at the south-west edge.
      { kind: 'river', points: [{ x: 44, y: 0 }, { x: 44, y: 32 }, { x: 36, y: 40 }, { x: 12, y: 40 }, { x: 0, y: 52 }], width: 3, depth: 2 },
      // Bridge site: flat banks, and the channel under the bridge cut 2 steps down with straight walls.
      { kind: 'flatten', rect: { x0: 24, y0: 30, x1: 28, y1: 47 }, height: 0 },
      { kind: 'lower', area: { rect: { x0: 24, y0: 38, x1: 28, y1: 41 } }, by: 2, falloff: 0 },
      // Entrance plaza and the path south of the river.
      { kind: 'flatten', rect: { x0: 24, y0: 48, x1: 34, y1: 63 }, height: 0 },
      {
        kind: 'prebuilt',
        commands: [
          { type: 'buildPathLine', x0: 32, y0: 62, x1: 32, y1: 50, kind: 'footpath' },
          { type: 'buildPathLine', x0: 31, y0: 50, x1: 27, y1: 50, kind: 'footpath' },
          { type: 'buildPathLine', x0: 26, y0: 50, x1: 26, y1: 42, kind: 'footpath' },
          // The bridge: an elevated footpath at bank height over the river (Phase 4 §4.2).
          { type: 'buildPathLine', x0: 26, y0: 41, x1: 26, y1: 38, kind: 'footpath', z: 0 },
          { type: 'buildPathLine', x0: 26, y0: 37, x1: 26, y1: 32, kind: 'footpath' },
        ],
      },
    ],
    park: {
      // Owned 44 × 36 on both banks.
      owned: [{ x0: 10, y0: 27, x1: 53, y1: 62 }],
      forSale: [],
      rightsForSale: [],
      entrance: { x: 32, y: 63, side: 'S' },
    },
  },
  start: { cash: 1_800_000, loan: 1_000_000, maxLoan: 3_000_000, entranceFee: 600, parkName: 'Frostbite Falls' },
  research: { unlocked: ['cocoa_hut'], allowed: 'all' },
  climate: 'cold',
  afterDark: 'off',
  objectives: [
    { type: 'guestsInPark', count: 400 },
    { type: 'monthlyRideIncome', amount: 400_000, months: 1 },
  ],
  timeLimitMonths: 24,
};
