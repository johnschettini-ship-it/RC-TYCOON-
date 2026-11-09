import type { EntityId, Cents } from '../units';
import type { Dir } from '../map';

/** Destinations for walking guests and staff. */
export type DestKey = `ride:${number}` | `stall:${number}` | 'exit';

export type GuestStateName =
  | 'arriving'
  | 'walking'
  | 'queueing'
  | 'riding'
  | 'buying'
  | 'sitting'
  | 'leaving';

/** Needs on a 0–255 scale. Energy and happiness: high is good. Others: high is bad. */
export interface Needs {
  hunger: number;
  thirst: number;
  bladder: number;
  energy: number;
  happiness: number;
  nausea: number;
}

/** Master rule R5: thoughts are ids with optional params. Text lives in src/data/strings/. */
export interface Thought {
  id: string;
  tick: number;
  params?: Record<string, string | number>;
}

export interface GuestItems {
  map: boolean;
  umbrella: boolean;
  balloon: boolean;
}

export interface Guest {
  id: EntityId;
  /** Current tile index. */
  tile: number;
  /** Tile the guest walks toward, or −1 when standing. */
  nextTile: number;
  /** Ticks walked toward `nextTile`. */
  progress: number;
  dir: Dir;
  /** Sub-tile lane 0–3 (from id) so crowds spread out. */
  lane: number;
  state: GuestStateName;
  /** Ticks spent in the current state. */
  stateTicks: number;
  target: DestKey | null;
  cash: Cents;
  needs: Needs;
  /** 0 = pure Chill, 100 = pure Thrill. */
  temperament: number;
  /** Newest last, at most 5. */
  thoughts: Thought[];
  /** Last tick each thought id was shown (de-duplication, one game day). */
  thoughtCooldowns: Record<string, number>;
  /** Times ridden per ride id. */
  ridden: Record<string, number>;
  spent: Cents;
  items: GuestItems;
  /** Tick of the next decision. */
  nextDecisionTick: number;
  /** Tick the guest got lost, or −1. */
  lostSinceTick: number;
  /** Decisions in a row with no ride score above 0. */
  noRideStreak: number;
  /** Set only while riding a track ride (Phase 2). */
  seat: { rideId: EntityId; trainId: number; car: number; seat: number } | null;
  /** Ride or stall id while queueing, riding, or buying; else −1. */
  activityId: EntityId;
  /** Phase 3: ticks until trash is dropped, 0 = no trash. */
  trashTimer: number;
}
