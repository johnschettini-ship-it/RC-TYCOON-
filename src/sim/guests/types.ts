import type { EntityId, Cents } from '../units';
import type { Dir } from '../map';

/**
 * Destinations for walking guests and staff. `show:N` (Phase 6 §4.4): the viewing tiles of show site N (the pathing
 * field starts from every viewing node; `sim/shows/api.ts` `viewingTiles`, W4-C).
 */
export type DestKey = `ride:${number}` | `stall:${number}` | `show:${number}` | 'exit';

export type GuestStateName =
  | 'arriving'
  | 'walking'
  | 'queueing'
  | 'riding'
  | 'buying'
  | 'sitting'
  | 'leaving'
  /** Phase 6 §4.4: standing on a viewing tile of `showTarget` until the show ends (`sim/shows/guests.ts`, W4-C). */
  | 'watchingShow';

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
  /** Phase 6 §4.5, §5: a Photo Booth photo. */
  photo: boolean;
}

export interface Guest {
  id: EntityId;
  /** Current tile index. */
  tile: number;
  /**
   * Phase 4 §4.2: height (absolute steps) of the walking surface of the path node the guest stands on, `(tile, z)`.
   * The ground height of `tile` on ground paths. Maintained by the walking code (W3-B).
   */
  z: number;
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
  /** Phase 3 §4.10: Cash Machine withdrawals this visit. */
  withdrawals: number;
  /** Phase 3 §4.10: steps in a row without getting closer to `lostTarget`. Lost at LOST_STEPS. */
  lostSteps: number;
  /** Phase 3 §4.10: best path distance to `lostTarget` so far, or −1. */
  bestDistance: number;
  /** Phase 3 §4.10: the target that `lostSteps` and `bestDistance` measure, or null. */
  lostTarget: DestKey | null;
  /** Phase 4 §4.4: wet from a water ride until this tick (1 game hour), or −1 when dry (W3-C). */
  wetUntilTick: number;
  /**
   * Phase 6 §4.4, §5: the show site this guest walks to (target `show:N`) or watches (`watchingShow`), else −1.
   * Set and cleared by W4-C only.
   */
  showTarget: EntityId;
}
