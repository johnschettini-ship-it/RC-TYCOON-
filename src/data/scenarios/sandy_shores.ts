/** Scenario 2 (Phase 5 §4.7): Sandy Shores. Heights are relative to `baseHeight` (master R19). Owner: W3-H. */
import type { ScenarioDef } from './types';

export const SANDY_SHORES: ScenarioDef = {
  id: 'sandy_shores',
  defVersion: 1,
  nameKey: 'Sandy Shores',
  description: 'A hot beach by the sea. Please Thrill and Chill guests alike and turn a profit',
  stars: 2,
  map: {
    width: 96,
    height: 48,
    seed: 2207,
    baseHeight: 8,
    // Low dunes.
    noise: { amplitude: 3, scale: 12, octaves: 3 },
    waterLevel: 0,
    // Sand within 8 tiles of water.
    terrainRules: [{ nearWater: 8, terrain: 'sand' }],
    features: [
      // Sea on the east edge, 10 tiles deep.
      { kind: 'sea', edge: 'E', depthTiles: 10, surface: 0 },
      // Entrance plaza, promenade, and the boardwalk strip along the beach.
      { kind: 'flatten', rect: { x0: 52, y0: 41, x1: 60, y1: 47 }, height: 0 },
      { kind: 'flatten', rect: { x0: 52, y0: 41, x1: 83, y1: 43 }, height: 0 },
      { kind: 'flatten', rect: { x0: 80, y0: 8, x1: 83, y1: 43 }, height: 0 },
      {
        kind: 'prebuilt',
        commands: [
          { type: 'buildPathLine', x0: 56, y0: 46, x1: 56, y1: 42, kind: 'footpath' },
          { type: 'buildPathLine', x0: 57, y0: 42, x1: 81, y1: 42, kind: 'footpath' },
          // The boardwalk along the beach.
          { type: 'buildPathLine', x0: 82, y0: 42, x1: 82, y1: 9, kind: 'footpath' },
        ],
      },
    ],
    park: {
      owned: [{ x0: 30, y0: 7, x1: 85, y1: 46 }],
      forSale: [],
      rightsForSale: [],
      entrance: { x: 56, y: 47, side: 'S' },
    },
  },
  start: { cash: 2_200_000, loan: 500_000, maxLoan: 3_000_000, entranceFee: 600, parkName: 'Sandy Shores' },
  research: { unlocked: ['ice_cream_cart'], allowed: 'all' },
  climate: 'hot',
  afterDark: 'on',
  objectives: [
    { type: 'temperamentBalance', minGuests: 400, minShare: 30, minHappiness: 170, months: 2 },
    { type: 'monthlyProfit', amount: 500_000, months: 1 },
  ],
  timeLimitMonths: 18,
};
