/**
 * Track slice (Phase 2). Owner: W1-G. Shapes follow phase-2-coasters.md §5.
 * The common ride record lives in `state.rides` (kind 'track'); this slice keeps track-only data by ride id.
 */
import type { EntityId } from '../../units';
import type { Dir } from '../../map';

export interface TrackPieceInstance {
  defId: string;
  x: number;
  y: number;
  z: number;
  dir: Dir;
  chain: boolean;
  brakeSpeed: number | null;
}

export interface TrainState {
  id: number;
  /** Distance along the circuit in millimetres. */
  s: number;
  /** Speed in mm/s. */
  v: number;
  state: 'loading' | 'running' | 'held' | 'unloading' | 'waiting';
  dwellTicks: number;
  lap: number;
  /** Guest id per seat, or −1. */
  seats: number[];
}

export interface TrackRideData {
  rideId: EntityId;
  typeId: string;
  pieces: TrackPieceInstance[];
  circuitClosed: boolean;
  trainConfig: { trains: number; carsPerTrain: number };
  operation: { minDwellTicks: number; maxDwellTicks: number; laps: number };
  trains: TrainState[];
  /** Measured values and ratings (hundredths); null until a test run passes. W1-G defines the full shape. */
  test: Record<string, number> | null;
  colours: { track: number; supports: number; cars: number };
  openedOnce: boolean;
}

export interface TrackSlice {
  /** Keyed by ride id (string keys keep JSON saves simple). */
  rides: Record<string, TrackRideData>;
}

export function createTrackSlice(): TrackSlice {
  return { rides: {} };
}
