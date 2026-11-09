/**
 * Ride animation driven by `ride.cycle` (Phase 1 §4.4). Owner: W1-A.
 * `cycle.ticks` is read as ticks spent in the current phase.
 */
import type { FlatRideDef } from '../data/catalog/types';
import type { FlatCyclePhase, Ride } from '../sim/rides/types';

/** Angle frames per revolution in the sprite cache. */
export const ANGLE_FRAMES = 32;

/** Revolutions per running cycle (whole numbers so a ride stops where it started). */
const REVOLUTIONS: Readonly<Record<string, number>> = {
  carousel: 4,
  big_wheel: 1,
  swing_tower: 6,
  teacup_twirl: 3,
};
const DEFAULT_REVOLUTIONS = 2;
/** Share of the run spent speeding up and slowing down. */
const RAMP = 0.2;

/** Trapezoid speed profile: position 0 → 1 over p in [0, 1]. */
function eased(p: number): number {
  const vmax = 1 / (1 - RAMP);
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  if (p < RAMP) return (vmax * p * p) / (2 * RAMP);
  if (p > 1 - RAMP) {
    const q = 1 - p;
    return 1 - (vmax * q * q) / (2 * RAMP);
  }
  return vmax * (p - RAMP / 2);
}

export interface RideAnim {
  /** Revolutions turned so far in this run (fractional). */
  turn: number;
  /** 0–1: how far swings or arms are thrown out. */
  swing: number;
}

export function rideAnimation(defId: string, cycle: { phase: FlatCyclePhase; ticks: number }, cycleTicks: number): RideAnim {
  if (cycle.phase !== 'running' || cycleTicks <= 0) return { turn: 0, swing: 0 };
  const p = Math.min(1, Math.max(0, cycle.ticks / cycleTicks));
  const revs = REVOLUTIONS[defId] ?? DEFAULT_REVOLUTIONS;
  const swing = Math.max(0, Math.min(1, p / RAMP, (1 - p) / RAMP));
  return { turn: revs * eased(p), swing };
}

/** Rider count → 0 (empty), 1–3 (partly full), 4 (full). */
export function occupancyLevel(riders: number, capacity: number): number {
  if (riders <= 0) return 0;
  if (riders >= capacity) return 4;
  return Math.min(3, 1 + Math.floor((3 * riders) / capacity));
}

/** Frame layout: angle (5 bits) | swing level 0–4 (3 bits) | occupancy 0–4 (3 bits). */
export function encodeRideFrame(angle: number, swing: number, occupancy: number): number {
  return (angle & 31) | ((swing & 7) << 5) | ((occupancy & 7) << 8);
}

export function decodeRideFrame(frame: number): { angle: number; swing: number; occupancy: number } {
  return { angle: frame & 31, swing: (frame >> 5) & 7, occupancy: (frame >> 8) & 7 };
}

/**
 * Phase 6 §4.6: the ride frame for a device with the 64 MB sprite budget (phones, `low` quality). A running ride
 * cycles through 32 angles × 5 occupancy levels of large sprites, more than that budget holds, so the LRU rebuilt
 * one every few ticks. Here: 16 angles (the even ones) and 3 occupancy levels (empty, some riders, full).
 */
export function coarseRideFrame(frame: number): number {
  const f = decodeRideFrame(frame);
  const occupancy = f.occupancy === 0 || f.occupancy === 4 ? f.occupancy : 2;
  return encodeRideFrame(f.angle & ~1, f.swing, occupancy);
}

/** Ghost frames (outside the normal range). */
export const GHOST_FRAME_VALID = 4094;
export const GHOST_FRAME_INVALID = 4095;

/** Sprite frame for a ride record. Only rides with a swing pose (swing tower) use the swing bits. */
export function rideFrameFor(ride: Pick<Ride, 'defId' | 'cycle' | 'riders'>, def: Pick<FlatRideDef, 'cycleTicks' | 'capacity'>): number {
  const a = rideAnimation(ride.defId, ride.cycle, def.cycleTicks);
  const frac = a.turn - Math.floor(a.turn);
  const angle = Math.floor(frac * ANGLE_FRAMES) % ANGLE_FRAMES;
  const swing = ride.defId === 'swing_tower' ? Math.round(a.swing * 4) : 0;
  return encodeRideFrame(angle, swing, occupancyLevel(ride.riders.length, def.capacity));
}
