/** Scenario 8 (Phase 5 §4.7): Sky High. Heights are relative to `baseHeight` (master R19). Owner: W3-H. */
import type { Rect, ScenarioDef } from './types';

const PLATEAU: Rect = { x0: 22, y0: 22, x1: 41, y1: 41 };

export const SKY_HIGH: ScenarioDef = {
  id: 'sky_high',
  defVersion: 1,
  nameKey: 'Sky High',
  description: 'A park on top of a desert mesa. Buy construction rights and send coasters out over the edge',
  stars: 5,
  map: {
    width: 64,
    height: 64,
    seed: 8807,
    baseHeight: 8,
    noise: { amplitude: 3, scale: 16, octaves: 2 },
    waterLevel: 0,
    terrainRules: [{ maxHeight: 6, terrain: 'sand' }],
    features: [
      // A mesa: plateau 20 × 20 at height 20 with cliffs on all sides.
      { kind: 'flatten', rect: PLATEAU, height: 0 },
      { kind: 'raise', area: { rect: PLATEAU }, by: 20, falloff: 0 },
      { kind: 'prebuilt', commands: [{ type: 'buildPathLine', x0: 31, y0: 40, x1: 31, y1: 37, kind: 'footpath' }] },
    ],
    park: {
      // Owned = the plateau only; construction rights for sale on the land around it.
      owned: [PLATEAU],
      forSale: [],
      rightsForSale: [{ x0: 10, y0: 10, x1: 53, y1: 53 }],
      // The entrance sits in the plateau's south edge (the land below is not the park's).
      entrance: { x: 31, y: 41, side: 'S' },
    },
  },
  start: { cash: 3_000_000, loan: 0, maxLoan: 6_000_000, entranceFee: 600, parkName: 'Sky High' },
  research: { unlocked: [], allowed: 'all' },
  climate: 'hot',
  afterDark: 'on',
  objectives: [
    { type: 'guestsInPark', count: 500 },
    { type: 'coasterExcitement', count: 1, minExcitement: 700 },
    { type: 'parkValue', value: 15_000_000 },
  ],
  timeLimitMonths: 36,
};
