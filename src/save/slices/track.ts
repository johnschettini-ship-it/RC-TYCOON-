/**
 * Save validator for the track slice (Phase 2 §5; Phase 4 §4.4 water pieces; Phase 6 test fail kind `corkscrew`).
 * Owner: W3-C, then W4-D, who may extend `TrackRideData` and update this file with it. Positions and speeds are integer mm and mm/s;
 * G values and ratings integer hundredths.
 */
import type { TestResult, TrackDir, TrackPieceInstance, TrackRideData, TrackSlice, TrainState } from '../../sim/rides/track/types';
import { arr, bool, every, int, nullable, obj, oneOf, record, str, type V } from '../validate';

const TRAIN_STATES = every<TrainState['state']>()(['loading', 'running', 'held', 'unloading', 'waiting']);
const TRACK_DIRS = every<TrackDir>()([0, 1, 2, 3]);
const TEST_FAIL_KINDS = every<NonNullable<TestResult['failKind']>>()(['stop', 'loop', 'corkscrew']);

const trackPieceShape = obj<TrackPieceInstance>({
  defId: str,
  x: int,
  y: int,
  z: int,
  dir: oneOf(TRACK_DIRS),
  chain: bool,
  brakeSpeed: nullable(int),
  cost: int,
});

const trainShape = obj<TrainState>({
  id: int,
  s: int,
  v: int,
  state: oneOf(TRAIN_STATES),
  dwellTicks: int,
  lap: int,
  seats: arr(int),
  dist: int,
  parked: bool,
  release: bool,
  driveMms: int,
  lapStartTick: int,
});

const testResultShape = obj<TestResult>({
  passed: bool,
  failPiece: nullable(int),
  failKind: nullable(oneOf(TEST_FAIL_KINDS)),
  ticks: int,
  vMaxMms: int,
  vAvgMms: int,
  rideTimeTicks: int,
  lengthMm: int,
  drops: int,
  dropMaxMm: int,
  posGMax: int,
  vertGMin: int,
  airtimeTicks: int,
  latMax: int,
  inversions: int,
  highestM: int,
  turnPieces: int,
  smallTurns: int,
  spookyTunnels: int,
  laps: int,
  excitement: int,
  intensity: int,
  nausea: int,
  penalty: bool,
  chart: obj<TestResult['chart']>({ every: int, speedCms: arr(int), gv: arr(int), gl: arr(int) }),
});

const trackRideShape = obj<TrackRideData>({
  rideId: int,
  typeId: str,
  pieces: arr(trackPieceShape),
  circuitClosed: bool,
  trainConfig: obj<TrackRideData['trainConfig']>({ trains: int, carsPerTrain: int }),
  operation: obj<TrackRideData['operation']>({ minDwellTicks: int, maxDwellTicks: int, laps: int }),
  trains: arr(trainShape),
  test: nullable(testResultShape),
  colours: obj<TrackRideData['colours']>({ track: int, supports: int, cars: int }),
  openedOnce: bool,
  testRun: nullable(obj<NonNullable<TrackRideData['testRun']>>({ ticksLeft: int, result: testResultShape })),
  lastDispatchTick: int,
  bestLapTicks: nullable(int),
});

export const trackShape: V<TrackSlice> = obj<TrackSlice>({ rides: record(trackRideShape) });
