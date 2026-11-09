import type { Cents, EntityId } from '../units';
import type { Dir } from '../map';

/** Shared ride statuses (Phases 1–3). Flat rides never use `building` or `testing`. */
export type RideStatus = 'building' | 'testing' | 'closed' | 'open' | 'broken' | 'inspecting' | 'stormHold';

export type FlatCyclePhase = 'waiting' | 'loading' | 'running' | 'unloading';

export interface Gate {
  /** Gate tile (part of the ride). */
  gate: number;
  /** Tile directly outside the gate. Entrance: must be a queue tile. Exit: must be a footpath (the service tile). */
  outside: number;
}

/** Ratings in integer hundredths (0–1000). */
export interface RideStats {
  excitement: number;
  intensity: number;
  nausea: number;
}

export type BreakdownType = string;

/**
 * Common ride record for flat and track rides. Lives in `state.rides`.
 * Track-only data lives in `state.track` keyed by ride id (Phase 2, master R12).
 */
export interface Ride {
  id: EntityId;
  kind: 'flat' | 'track';
  defId: string;
  name: string;
  /** Footprint origin (flat) or station origin (track). */
  x: number;
  y: number;
  rotation: Dir;
  status: RideStatus;
  price: Cents;
  entrance: Gate | null;
  exit: Gate | null;
  /** Null until a track ride passes a test run. Flat rides copy catalog values. */
  stats: RideStats | null;
  /** Guest ids waiting, front first. */
  queue: EntityId[];
  /** Guest ids on the ride (flat rides). */
  riders: EntityId[];
  /** Flat ride cycle. */
  cycle: { phase: FlatCyclePhase; ticks: number };
  totals: { riders: number; income: Cents; ridersThisMonth: number; incomeThisMonth: Cents };
  builtTick: number;
  /** Hours this month the ride existed (hourly charge rule, Phase 3 §4.1). */
  hoursThisMonth: number;
  /** Phase 3 reliability fields. */
  reliability: number;
  lastInspectionTick: number;
  inspectionIntervalTicks: number;
  breakdownType: BreakdownType | null;
  statusBeforeBreakdown: RideStatus | null;
  breakdownsThisMonth: number;
  lastBreakdownTick: number;
  assignedMechanicId: EntityId | null;
  /** Total build cost so far (cents), for asset value (master R14). */
  totalBuildCost: Cents;
}
