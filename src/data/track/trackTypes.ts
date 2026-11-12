/**
 * Track ride types (phase-2-coasters.md §4.4, §4.10, §8). Owner: W1-G; water types (Phase 4 §4.4) added by W3-C;
 * the Phase 6 types (Inverted Coaster, Bobsled Run, Monorail) and the corkscrew and helix on the Steel Coaster by W4-D.
 * Seats, cars, max trains, max height, and drive speeds come from the catalog (content-catalog §2).
 */
import { getTrackRideDef } from '../catalog/trackRides';
import { FLUME_K, FLUME_V_CURRENT, RAPIDS_K, RAPIDS_V_CURRENT } from '../tuning/track';
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
  /** Pieces of the groups the type still cannot build (default none). */
  excludePieces?: string[];
  /** Station runs on the circuit (default 1). */
  maxStations?: number;
  ratings: { e: number; i: number; n: number; kAir: number; extra: RatingExtra };
  /** Dollars. */
  costs: { base: number; pieceFactorPermille: number; runBase: number; extraTrain: number };
  render: TrackTypeDef['render'];
}

const COASTER: PieceGroup[] = ['S', 'St', 'G', 'X', 'Ts', 'Tm', 'B', 'Br', 'BB'];

const EXTRAS: Extra[] = [
  {
    // Phase 6 §4.5 (W4-D): the corkscrew and the helix.
    id: 'steel_coaster', groups: [...COASTER, 'L', 'Cs', 'Hx'], chain: true, mu: 0.015, cd: 0.0008, chainSpeedMms: 3000, carLengthMm: 2500, defaultCars: 4,
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
    pieceSet: 'rail',
    stationPiece: 'station',
    groups: Object.freeze([...e.groups]),
    excludePieces: Object.freeze([...(e.excludePieces ?? [])]),
    chain: e.chain,
    maxStations: e.maxStations ?? 1,
    physics: { mu: e.mu, cd: e.cd, chainSpeedMms: e.chainSpeedMms, driveSpeedMms: cat.driveSpeedMms ?? 0 },
    water: null,
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
    intensityHeightM: cat.intensityHeightM,
    render: e.render,
  });
}

/** The 7 Build 1 track types (rail medium). */
export const TRACK_TYPES: readonly TrackTypeDef[] = Object.freeze(EXTRAS.map(build));

/**
 * The 3 Build 3 track types (Phase 6 §4.5; catalog §2). Not in the spec (tuning starting values, like the Phase 3
 * types): the type rating terms, costs, friction, chain speed, and car length.
 * - Inverted Coaster: the Steel set + corkscrew + helix; riders hang below the track (render: the rail runs above the
 *   cars, so the sample line stays the riders' line and the Phase 2 envelope holds the hanging train).
 * - Bobsled Run: flat, gentle and steep down, banked turns, helix; no loop, no unbanked turns, no steep climbs.
 * - Monorail: powered 8 m/s; flat, gentle slopes, turns; up to 4 stations (extra stations are stops, master R26).
 */
const PHASE6_EXTRAS: Extra[] = [
  {
    id: 'inverted_coaster', groups: [...COASTER, 'L', 'Cs', 'Hx'], chain: true, mu: 0.015, cd: 0.0008, chainSpeedMms: 3000, carLengthMm: 2500, defaultCars: 4,
    ratings: { e: 1.3, i: 0.5, n: 0.2, kAir: 0.8, extra: 'none' },
    costs: { base: 3500, pieceFactorPermille: 1100, runBase: 140, extraTrain: 900 },
    render: { rail: 'inverted', supports: 'arm', car: 'inverted', colours: { track: 6, supports: 9, cars: 0 } },
  },
  {
    id: 'bobsled_run', groups: ['S', 'St', 'G', 'X', 'B', 'Br', 'BB', 'Hx'], excludePieces: ['steep_up', 'gentle_to_steep_up', 'steep_to_gentle_up'],
    chain: true, mu: 0.012, cd: 0.0008, chainSpeedMms: 2500, carLengthMm: 2200, defaultCars: 2,
    ratings: { e: 1.4, i: 0.4, n: 0.4, kAir: 0.6, extra: 'none' },
    costs: { base: 2600, pieceFactorPermille: 900, runBase: 100, extraTrain: 400 },
    render: { rail: 'bobsled', supports: 'round', car: 'bobsled', colours: { track: 7, supports: 9, cars: 3 } },
  },
  {
    id: 'monorail', groups: ['S', 'St', 'G', 'Ts', 'Tm'], maxStations: 4, chain: false, mu: 0, cd: 0, chainSpeedMms: 0, carLengthMm: 3000, defaultCars: 3,
    ratings: { e: 1.6, i: 0.0, n: 0.0, kAir: 1.0, extra: 'scenic' },
    costs: { base: 2400, pieceFactorPermille: 800, runBase: 80, extraTrain: 600 },
    render: { rail: 'beam', supports: 'pillar', car: 'monorail', colours: { track: 9, supports: 9, cars: 5 } },
  },
];

/** The 3 Build 3 track types (rail medium). */
export const EXTRA_TRACK_TYPES: readonly TrackTypeDef[] = Object.freeze(PHASE6_EXTRAS.map(build));

interface WaterExtra {
  id: 'log_flume' | 'rapids_raft';
  pieceSet: 'flume' | 'rapids';
  currentMms: number;
  k: number;
  spins: boolean;
  ratings: { e: number; i: number; n: number; kAir: number; extra: RatingExtra };
  /** Dollars. */
  costs: { base: number; pieceFactorPermille: number; runBase: number; extraTrain: number };
  render: TrackTypeDef['render'];
}

/**
 * Water types (Phase 4 §4.4; catalog §2). Both use the `waterCurrent` drive (phase-2 §4.4) and the gap rule like
 * powered types (no block brakes in the water sets). A boat is one 4 m car: one boat per station tile.
 * Not in the spec (tuning starting values): the type rating terms, costs, channel friction for drops (μ, c_d).
 */
const WATER_EXTRAS: WaterExtra[] = [
  {
    id: 'log_flume', pieceSet: 'flume', currentMms: Math.round(FLUME_V_CURRENT * 1000), k: FLUME_K, spins: false,
    ratings: { e: 1.5, i: 0.8, n: 0.3, kAir: 1.0, extra: 'none' },
    costs: { base: 2400, pieceFactorPermille: 1000, runBase: 80, extraTrain: 200 },
    render: { rail: 'flume', supports: 'lattice', car: 'log', colours: { track: 11, supports: 11, cars: 11 } },
  },
  {
    id: 'rapids_raft', pieceSet: 'rapids', currentMms: Math.round(RAPIDS_V_CURRENT * 1000), k: RAPIDS_K, spins: true,
    ratings: { e: 1.6, i: 1.0, n: 0.5, kAir: 1.0, extra: 'none' },
    costs: { base: 2800, pieceFactorPermille: 1000, runBase: 90, extraTrain: 250 },
    render: { rail: 'rapids', supports: 'pillar', car: 'raft', colours: { track: 9, supports: 9, cars: 1 } },
  },
];

/** Boat length: one 4 m car fills one station tile ("1 boat per station tile"). */
const BOAT_LENGTH_MM = 4000;
/** Channel friction on gravity pieces (drops, waterfalls). */
const WATER_MU = 0.02;
const WATER_CD = 0.001;

function buildWater(e: WaterExtra): TrackTypeDef {
  const cat = getTrackRideDef(e.id);
  if (!cat) throw new Error(`Track type ${e.id} is missing from the catalog`);
  return Object.freeze({
    id: e.id,
    drive: 'waterCurrent',
    medium: 'water',
    pieceSet: e.pieceSet,
    stationPiece: `${e.pieceSet}_station`,
    groups: Object.freeze(['S', 'St', 'G', 'X', 'Ts', 'Tm', 'W'] as PieceGroup[]),
    excludePieces: Object.freeze([]),
    chain: false,
    maxStations: 1,
    physics: { mu: WATER_MU, cd: WATER_CD, chainSpeedMms: 0, driveSpeedMms: 0 },
    water: { currentMms: e.currentMms, k: e.k },
    vehicle: {
      seatsPerCar: cat.seatsPerCar,
      carLengthMm: BOAT_LENGTH_MM,
      carsMin: cat.carsMin,
      carsMax: cat.carsMax,
      defaultCars: cat.carsMin,
      maxTrains: cat.maxTrains,
      spins: e.spins,
    },
    ratings: e.ratings,
    costs: {
      base: e.costs.base * 100,
      pieceFactorPermille: e.costs.pieceFactorPermille,
      runBase: e.costs.runBase * 100,
      extraTrain: e.costs.extraTrain * 100,
    },
    maxHeightM: cat.maxHeightM,
    intensityHeightM: cat.intensityHeightM,
    render: e.render,
  } satisfies TrackTypeDef);
}

/** The 2 Build 2 water types: Log Flume and Rapids Raft. */
export const WATER_TRACK_TYPES: readonly TrackTypeDef[] = Object.freeze(WATER_EXTRAS.map(buildWater));

/** Every track type: Build 1 rail, Build 2 water, then Build 3 rail. */
export const ALL_TRACK_TYPES: readonly TrackTypeDef[] = Object.freeze([...TRACK_TYPES, ...WATER_TRACK_TYPES, ...EXTRA_TRACK_TYPES]);

const BY_ID: ReadonlyMap<string, TrackTypeDef> = new Map(ALL_TRACK_TYPES.map((t) => [t.id, t]));

export function getTrackTypeDef(id: string): TrackTypeDef | undefined {
  return BY_ID.get(id);
}
