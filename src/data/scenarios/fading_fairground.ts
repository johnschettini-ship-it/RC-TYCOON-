/** Scenario 7 (Phase 5 §4.7): Fading Fairground. Heights are relative to `baseHeight` (master R19). Owner: W3-H. */
import type { Feature, PrebuiltCommand, ScenarioDef } from './types';

/** The six old rides (3 × 3, front facing south) between the two path rows; queues run south, exits north. */
const RIDES: ReadonlyArray<readonly [string, number]> = [
  ['carousel', 16],
  ['big_wheel', 21],
  ['swing_tower', 26],
  ['teacup_twirl', 34],
  ['rocket_rounds', 39],
  ['mirror_maze', 43],
];
const RIDE_Y = 51;
const BENCHES_X = [18, 25, 31, 38];

function line(x0: number, y0: number, x1: number, y1: number, kind: 'footpath' | 'queue' = 'footpath'): PrebuiltCommand {
  return { type: 'buildPathLine', x0, y0, x1, y1, kind };
}

const PARK: PrebuiltCommand[] = [
  line(31, 62, 31, 59),
  line(14, 58, 48, 58),
  line(14, 47, 48, 47),
  line(14, 48, 14, 57),
  line(48, 48, 48, 57),
  ...RIDES.flatMap(([defId, x]): PrebuiltCommand[] => [
    { type: 'placeRide', defId, x, y: RIDE_Y, rotation: 0 },
    line(x + 1, RIDE_Y + 3, x + 1, 57, 'queue'),
    line(x + 1, 48, x + 1, RIDE_Y - 1),
  ]),
  { type: 'placeStall', defId: 'snack_shack', x: 20, y: 59, rotation: 0 },
  { type: 'placeStall', defId: 'fizz_stand', x: 24, y: 59, rotation: 0 },
  { type: 'placeStall', defId: 'restrooms', x: 38, y: 59, rotation: 0 },
  ...BENCHES_X.map((x): PrebuiltCommand => ({ type: 'buildPathItem', x, y: 47, itemType: 'bench' })),
  { type: 'setParkOpen', open: true },
];

/** 6 flat rides aged 96 months at 45% reliability, still running. */
const OLD_RIDES: Feature[] = RIDES.map((_, rideIndex): Feature => ({ kind: 'rideCondition', rideIndex, ageMonths: 96, reliability: 45, open: true }));

export const FADING_FAIRGROUND: ScenarioDef = {
  id: 'fading_fairground',
  defVersion: 1,
  nameKey: 'Fading Fairground',
  description: 'An old fairground deep in debt, with tired rides and litter everywhere. Clean it up and pay back the bank',
  stars: 4,
  map: {
    width: 64,
    height: 64,
    seed: 7703,
    baseHeight: 8,
    noise: { amplitude: 0, scale: 16, octaves: 1 },
    waterLevel: 0,
    terrainRules: [],
    features: [
      { kind: 'prebuilt', commands: PARK },
      ...OLD_RIDES,
      // 4 broken benches.
      { kind: 'brokenPathItems', points: BENCHES_X.map((x) => ({ x, y: 47 })) },
      { kind: 'litter', rect: { x0: 8, y0: 15, x1: 55, y1: 62 }, density: 0.3 },
      { kind: 'startGuests', count: 120, happiness: 90 },
    ],
    park: {
      owned: [{ x0: 8, y0: 15, x1: 55, y1: 62 }],
      forSale: [],
      rightsForSale: [],
      entrance: { x: 31, y: 63, side: 'S' },
    },
  },
  start: { cash: 200_000, loan: 3_000_000, maxLoan: 3_500_000, entranceFee: 600, parkName: 'Fading Fairground' },
  research: { unlocked: [], allowed: 'all' },
  climate: 'temperate',
  afterDark: 'off',
  objectives: [{ type: 'repayLoan' }, { type: 'parkRatingHeld', rating: 650, months: 3 }],
  timeLimitMonths: 24,
};
