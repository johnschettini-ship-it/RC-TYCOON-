/** Scenario 5 (Phase 5 §4.7): Spooky Hollow. Heights are relative to `baseHeight` (master R19). Owner: W3-H. */
import type { ScenarioDef } from './types';

export const SPOOKY_HOLLOW: ScenarioDef = {
  id: 'spooky_hollow',
  defVersion: 1,
  nameKey: 'Spooky Hollow',
  description: 'A wooded valley where the fun starts after dark. Open spooky rides and keep the night crowd happy',
  stars: 3,
  map: {
    width: 64,
    height: 64,
    seed: 5503,
    baseHeight: 8,
    // Wooded valley.
    noise: { amplitude: 5, scale: 20, octaves: 3 },
    waterLevel: 0,
    terrainRules: [{ nearWater: 1, terrain: 'dirt' }],
    features: [
      // Ridges on both sides of the valley.
      { kind: 'raise', area: { rect: { x0: 0, y0: 0, x1: 6, y1: 63 } }, by: 5, falloff: 10 },
      { kind: 'raise', area: { rect: { x0: 57, y0: 0, x1: 63, y1: 63 } }, by: 5, falloff: 10 },
      // A creek runs north to south.
      { kind: 'river', points: [{ x: 34, y: 0 }, { x: 30, y: 20 }, { x: 35, y: 42 }, { x: 33, y: 64 }], width: 2, depth: 2 },
      // Entrance plaza.
      { kind: 'flatten', rect: { x0: 16, y0: 55, x1: 24, y1: 63 }, height: 0 },
      { kind: 'prebuilt', commands: [{ type: 'buildPathLine', x0: 20, y0: 62, x1: 20, y1: 57, kind: 'footpath' }] },
      // Dense bare trees (removable at the normal demolish cost) in the park and the woods north of it.
      { kind: 'scatterScenery', rect: { x0: 8, y0: 15, x1: 55, y1: 62 }, defIds: ['tree_bare', 'tree_twisted'], density: 0.22 },
      { kind: 'scatterScenery', rect: { x0: 0, y0: 0, x1: 63, y1: 14 }, defIds: ['tree_bare', 'tree_twisted', 'mossy_stones'], density: 0.45 },
    ],
    park: {
      owned: [{ x0: 8, y0: 15, x1: 55, y1: 62 }],
      forSale: [],
      rightsForSale: [],
      entrance: { x: 20, y: 63, side: 'S' },
    },
  },
  start: { cash: 2_000_000, loan: 0, maxLoan: 3_000_000, entranceFee: 600, parkName: 'Spooky Hollow' },
  research: { unlocked: ['haunted_manor', 'ghost_train'], allowed: 'all' },
  climate: 'temperate',
  afterDark: 'forced',
  objectives: [
    { type: 'ridesOpen', count: 3, flag: 'spooky' },
    { type: 'afterDarkHappiness', minGuests: 300, minHappiness: 180, months: 1 },
  ],
  timeLimitMonths: 24,
};
