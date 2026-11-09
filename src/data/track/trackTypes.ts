/**
 * Track ride types (phase-2-coasters.md §4.4, §4.10, §8). Owner: W1-G.
 * Seats, cars, max trains, max height, and drive speeds come from the catalog (content-catalog §2).
 */
import { getTrackRideDef } from '../catalog/trackRides';
import type { PieceGroup, RatingExtra, TrackDriveMode, TrackTypeDef } from './types';

interface Extra {
  id: string;
  groups: PieceGroup[];
  chain: boolean;
  mu: number;
  cd: number;
  chainSpeedMms: number;
  carLengthMm: number;
  defaultCars: number;
  spins?: boolean;
  ratings: { e: number; i: number; n: number; kAir: number; extra: RatingExtra };
  /** Dollars. */
  costs: { base: number; pieceFactorPermille: number; runBase: number; extraTrain: number };
  render: TrackTypeDef['render'];
}

const COASTER: PieceGroup[] = ['S', 'St', 'G', 'X', 'Ts', 'Tm', 'B', 'Br', 'BB'];

const EXTRAS: Extra[] = [
  {
    id: 'steel_coaster', groups: [...COASTER, 'L'], chain: true, mu: 0.015, cd: 0.0008, chainSpeedMms: 3000, carLengthMm: 2500, defaultCars: 4,
    ratings: { e: 1.0, i: 0.3, n: 0.0, kAir: 1.0, extra: 'none' },
    costs: { base: 3000, pieceFactorPermille: 1000, runBase: 120, extraTrain: 800 },
    render: { rail: 'steel', supports: 'round', car: 'coaster', colours: { track: 0, supports: 9, cars: 1 } },
  },
  {
    id: 'junior_coaster', groups: ['S', 'St', 'G', 'Ts', 'Tm', 'B', 'Br', 'BB'], chain: true, mu: 0.02, cd: 0.001, chainSpeedMms: 2000, carLengthMm: 2000, defaultCars: 4,
    ratings: { e: 1.2, i: 0.0, n: 0.0, kAir: 1.0, extra: 'none' },
    costs: { base: 1500, pieceFactorPermille: 700, runBase: 60, extraTrain: 400 },
    render: { rail: 'steel', supports: 'round', car: 'junior', colours: { track: 3, supports: 9, cars: 4 } },
  },
  {
    id: 'mini_railway', groups: ['S', 'St', 'G', 'Ts', 'Tm'], chain: false, mu: 0, cd: 0, chainSpeedMms: 0, carLengthMm: 3000, defaultCars: 3,
    ratings: { e: 2.0, i: 0.0, n: 0.0, kAir: 1.0, extra: 'scenic' },
    costs: { base: 1200, pieceFactorPermille: 600, runBase: 50, extraTrain: 500 },
    render: { rail: 'narrow', supports: 'pillar', car: 'loco', colours: { track: 10, supports: 9, cars: 6 } },
  },
  {
    id: 'wooden_coaster', groups: COASTER, chain: true, mu: 0.025, cd: 0.001, chainSpeedMms: 2500, carLengthMm: 2500, defaultCars: 4,
    ratings: { e: 1.0, i: 0.8, n: 0.2, kAir: 1.5, extra: 'none' },
    costs: { base: 2800, pieceFactorPermille: 1200, runBase: 130, extraTrain: 700 },
    render: { rail: 'wood', supports: 'lattice', car: 'coaster', colours: { track: 11, supports: 11, cars: 0 } },
  },
  {
    id: 'spinning_mouse', groups: ['S', 'St', 'G', 'X', 'Ts', 'Br', 'BB'], chain: true, mu: 0.02, cd: 0.001, chainSpeedMms: 2000, carLengthMm: 2000, defaultCars: 1, spins: true,
    ratings: { e: 1.2, i: 0.5, n: 1.5, kAir: 1.0, extra: 'smallTurns' },
    costs: { base: 2500, pieceFactorPermille: 900, runBase: 90, extraTrain: 300 },
    render: { rail: 'steel', supports: 'round', car: 'mouse', colours: { track: 2, supports: 9, cars: 5 } },
  },
  {
    id: 'ghost_train', groups: ['S', 'St', 'G', 'Ts', 'Tm', 'Sp'], chain: false, mu: 0, cd: 0, chainSpeedMms: 0, carLengthMm: 2000, defaultCars: 2,
    ratings: { e: 2.0, i: 0.3, n: 0.0, kAir: 1.0, extra: 'spooky' },
    costs: { base: 2000, pieceFactorPermille: 800, runBase: 70, extraTrain: 300 },
    render: { rail: 'tunnel', supports: 'pillar', car: 'ghost', colours: { track: 7, supports: 9, cars: 8 } },
  },
  {
    id: 'go_karts', groups: ['S', 'St', 'G', 'Ts', 'Tm'], chain: false, mu: 0, cd: 0, chainSpeedMms: 0, carLengthMm: 2000, defaultCars: 1,
    ratings: { e: 1.5, i: 0.5, n: 0.0, kAir: 1.0, extra: 'laps' },
    costs: { base: 1800, pieceFactorPermille: 500, runBase: 60, extraTrain: 100 },
    render: { rail: 'kart', supports: 'pillar', car: 'kart', colours: { track: 9, supports: 9, cars: 1 } },
  },
];

function driveOf(d: string): TrackDriveMode {
  if (d === 'gravity' || d === 'powered' || d === 'guestDriven' || d === 'waterCurrent') return d;
  return 'gravity';
}

function build(e: Extra): TrackTypeDef {
  const cat = getTrackRideDef(e.id);
  if (!cat) throw new Error(`Track type ${e.id} is missing from the catalog`);
  return Object.freeze({
    id: e.id,
    drive: driveOf(cat.drive),
    medium: 'rail',
    groups: Object.freeze([...e.groups]),
    chain: e.chain,
    physics: { mu: e.mu, cd: e.cd, chainSpeedMms: e.chainSpeedMms, driveSpeedMms: cat.driveSpeedMms ?? 0 },
    vehicle: {
      seatsPerCar: cat.seatsPerCar,
      carLengthMm: e.carLengthMm,
      carsMin: cat.carsMin,
      carsMax: cat.carsMax,
      defaultCars: e.defaultCars,
      maxTrains: cat.maxTrains,
      spins: e.spins === true,
    },
    ratings: e.ratings,
    costs: {
      base: e.costs.base * 100,
      pieceFactorPermille: e.costs.pieceFactorPermille,
      runBase: e.costs.runBase * 100,
      extraTrain: e.costs.extraTrain * 100,
    },
    maxHeightM: cat.maxHeightM,
    render: e.render,
  });
}

/** The 7 Build 1 track types (rail medium). Water types arrive in Phase 4. */
export const TRACK_TYPES: readonly TrackTypeDef[] = Object.freeze(EXTRAS.map(build));

const BY_ID: ReadonlyMap<string, TrackTypeDef> = new Map(TRACK_TYPES.map((t) => [t.id, t]));

export function getTrackTypeDef(id: string): TrackTypeDef | undefined {
  return BY_ID.get(id);
}
