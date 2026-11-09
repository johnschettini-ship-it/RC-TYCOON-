/**
 * Track slice (Phase 2). Owner: W1-G. Shapes follow phase-2-coasters.md §5.
 * The common ride record lives in `state.rides` (kind 'track'); this slice keeps track-only data by ride id.
 *
 * Directions on track data use the phase-2 convention: 0 = +x, 1 = +y, 2 = −x, 3 = −y
 * (see `TRACK_DX` / `TRACK_DY` in geometry.ts). This differs from `DIR_DX` in map.ts.
 */
import type { EntityId } from '../../units';
import type { Dir } from '../../map';

export interface TrackPieceInstance {
  defId: string;
  /** Entry tile. */
  x: number;
  y: number;
  /** Entry rail height (absolute metres; ground is 8 on new maps). */
  z: number;
  dir: Dir;
  chain: boolean;
  /** Brakes only: target speed in m/s. */
  brakeSpeed: number | null;
  /** Cents paid for this piece (piece × factor, chain extra, height). Refunds use it. */
  cost: number;
}

export type TrainStateName = 'loading' | 'running' | 'held' | 'unloading' | 'waiting';

export interface TrainState {
  id: number;
  /** Centre position along the circuit in millimetres, 0 ≤ s < circuit length. */
  s: number;
  /** Speed in mm/s (≥ 0). */
  v: number;
  state: TrainStateName;
  dwellTicks: number;
  /** Laps completed since dispatch (go-kart time trial). */
  lap: number;
  /** Guest id per seat (car-major, front car first), or −1. */
  seats: number[];
  /** Millimetres travelled since dispatch. */
  dist: number;
  /** In the storage shed, not on the circuit (enters the station when it is free). */
  parked: boolean;
  /** After a dispatch or a block-brake hold: accelerate to station speed before gravity takes over. */
  release: boolean;
  /** Guest-driven target speed (mm/s), set at dispatch. 0 for other drives. */
  driveMms: number;
  /** Tick the current lap started (go-kart lap times). */
  lapStartTick: number;
}

/** Measured values (§4.9) and ratings (§4.10). Integers: mm, mm/s, ticks, G in hundredths, ratings in hundredths. */
export interface TestResult {
  passed: boolean;
  /** 1-based piece number where the test train stopped, or null. */
  failPiece: number | null;
  failKind: 'stop' | 'loop' | null;
  /** Ticks from dispatch to the station stop (passed) or to the failure. */
  ticks: number;
  vMaxMms: number;
  vAvgMms: number;
  rideTimeTicks: number;
  lengthMm: number;
  drops: number;
  dropMaxMm: number;
  posGMax: number;
  vertGMin: number;
  airtimeTicks: number;
  latMax: number;
  inversions: number;
  highestM: number;
  turnPieces: number;
  smallTurns: number;
  spookyTunnels: number;
  laps: number;
  excitement: number;
  intensity: number;
  nausea: number;
  /** A §4.10 penalty lowered excitement. */
  penalty: boolean;
  /** Test tab chart, one point every `every` ticks: speed (cm/s), vertical and lateral G (hundredths). */
  chart: { every: number; speedCms: number[]; gv: number[]; gl: number[] };
}

export interface TrackRideData {
  rideId: EntityId;
  typeId: string;
  /** Ordered from the station entry joint. */
  pieces: TrackPieceInstance[];
  circuitClosed: boolean;
  trainConfig: { trains: number; carsPerTrain: number };
  operation: { minDwellTicks: number; maxDwellTicks: number; laps: number };
  trains: TrainState[];
  /** Last test (passed or failed); null until tested or after a change that clears it. */
  test: TestResult | null;
  colours: { track: number; supports: number; cars: number };
  openedOnce: boolean;
  /** A test in progress: the precomputed result is published when `ticksLeft` reaches 0. */
  testRun: { ticksLeft: number; result: TestResult } | null;
  /** Tick of the last station dispatch (go-kart spacing), −1 when none. */
  lastDispatchTick: number;
  /** Fastest go-kart lap in ticks, or null. */
  bestLapTicks: number | null;
}

export interface TrackSlice {
  /** Keyed by ride id (string keys keep JSON saves simple). */
  rides: Record<string, TrackRideData>;
}

export function createTrackSlice(): TrackSlice {
  return { rides: {} };
}
