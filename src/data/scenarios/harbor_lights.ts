/** Scenario 6 (Phase 5 §4.7): Harbor Lights. Heights are relative to `baseHeight` (master R19). Owner: W3-H. */
import type { ScenarioDef } from './types';

export const HARBOR_LIGHTS: ScenarioDef = {
  id: 'harbor_lights',
  defVersion: 1,
  nameKey: 'Harbor Lights',
  description: 'A harbour town on a rocky coast. Light up the piers and keep the night busy',
  stars: 3,
  map: {
    width: 96,
    height: 64,
    seed: 6607,
    baseHeight: 8,
    noise: { amplitude: 1, scale: 16, octaves: 2 },
    waterLevel: 0,
    terrainRules: [{ nearWater: 1, terrain: 'sand' }],
    features: [
      // Sea on the south (surface 4).
      { kind: 'sea', edge: 'S', depthTiles: 16, surface: 4 },
      // The coastal strip and the road from the entrance, flat before the land rises.
      { kind: 'flatten', rect: { x0: 14, y0: 38, x1: 82, y1: 47 }, height: 0 },
      { kind: 'flatten', rect: { x0: 46, y0: 14, x1: 50, y1: 37 }, height: 0 },
      // The harbour basin.
      { kind: 'lake', cx: 31, cy: 46, radius: 5, surface: 4 },
      // The land stands 6 steps above its base with a rocky coast; the basin stays low.
      { kind: 'raise', area: { rect: { x0: 0, y0: 0, x1: 25, y1: 47 } }, by: 6, falloff: 0 },
      { kind: 'raise', area: { rect: { x0: 37, y0: 0, x1: 95, y1: 47 } }, by: 6, falloff: 0 },
      { kind: 'raise', area: { rect: { x0: 26, y0: 0, x1: 36, y1: 40 } }, by: 6, falloff: 0 },
      // A headland out into the sea with the lighthouse at its tip.
      { kind: 'flatten', rect: { x0: 66, y0: 48, x1: 71, y1: 58 }, height: 0 },
      { kind: 'raise', area: { rect: { x0: 66, y0: 48, x1: 71, y1: 58 } }, by: 6, falloff: 0 },
      // Lighthouse stand-in: the catalog has no lighthouse item yet, so a Star Beacon (a tall light) marks the tip.
      { kind: 'scatterScenery', rect: { x0: 68, y0: 57, x1: 68, y1: 57 }, defIds: ['star_beacon'], density: 1 },
      {
        kind: 'prebuilt',
        commands: [
          { type: 'buildPathLine', x0: 48, y0: 16, x1: 48, y1: 47, kind: 'footpath' },
          { type: 'buildPathLine', x0: 49, y0: 47, x1: 62, y1: 47, kind: 'footpath' },
          // Two piers: elevated footpaths at the height of the coast (Phase 4 §4.2).
          { type: 'buildPathLine', x0: 50, y0: 48, x1: 50, y1: 54, kind: 'footpath', z: 6 },
          { type: 'buildPathLine', x0: 62, y0: 48, x1: 62, y1: 54, kind: 'footpath', z: 6 },
        ],
      },
    ],
    park: {
      // Owned 70 × 40: the coast and the water in front of it.
      owned: [{ x0: 13, y0: 16, x1: 82, y1: 55 }],
      forSale: [],
      rightsForSale: [],
      entrance: { x: 48, y: 15, side: 'N' },
    },
  },
  start: { cash: 2_500_000, loan: 0, maxLoan: 5_000_000, entranceFee: 600, parkName: 'Harbor Lights' },
  research: { unlocked: ['log_flume'], allowed: 'all' },
  climate: 'coastal',
  afterDark: 'forced',
  objectives: [
    { type: 'guestsInPark', count: 600 },
    { type: 'afterDarkHappiness', minGuests: 200, minHappiness: 170, months: 1 },
    { type: 'parkValue', value: 12_000_000 },
  ],
  timeLimitMonths: 30,
};
