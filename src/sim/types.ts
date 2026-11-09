/** GameState and World contracts (master spec 5 and 6). Owner: integrator. */
import type { MapState } from './map';
import type { Modifiers, ParkState } from './park/types';
import type { Guest } from './guests/types';
import type { Ride } from './rides/types';
import type { Stall } from './stalls/types';
import type { EconomyState } from './economy/types';
import type { TrackSlice } from './rides/track/types';
import type { StaffSlice } from './staff/types';
import type { ManagementSlice, MessageCategory } from './management/types';
import type { ElevatedPath } from './paths/types';
import type { Scenery } from './scenery/types';
import type { AwardId, MonthMetrics, ScenarioEndReason, ScenarioState } from './scenario/types';
import type { ShowSite } from './shows/types';
import type { SoundCue } from './sound';
import type { EntityId } from './units';

/** Save schema of this build: Build 1 = 1, Build 2 = 2, Build 3 = 3 (master §7). */
export const STATE_SCHEMA_VERSION = 3;

export interface GameState {
  schemaVersion: 3;
  seed: number;
  /** mulberry32 state. Only `sim/rng.ts` touches it. */
  rng: number;
  tick: number;
  nextId: number;
  map: MapState;
  park: ParkState;
  modifiers: Modifiers;
  /** Sorted by id. */
  rides: Ride[];
  /** Sorted by id. */
  stalls: Stall[];
  /** Sorted by id. */
  guests: Guest[];
  economy: EconomyState;
  track: TrackSlice;
  staff: StaffSlice;
  management: ManagementSlice;
  /** Phase 4 §4.2: elevated path tiles, sorted by id (W3-B). */
  elevatedPaths: ElevatedPath[];
  /** Phase 4 §4.5: scenery items, sorted by id (W3-D). */
  scenery: Scenery[];
  /** Phase 5 §5: free play, sandbox, tutorial, or a scenario run (W3-H; awards and tutorial fields W3-I). */
  scenario: ScenarioState;
  /** Phase 5 §5: samples and counters of the current month (W3-H). */
  monthMetrics: MonthMetrics;
  /** Phase 6 §5: After Dark show sites, sorted by id (W4-C). */
  shows: ShowSite[];
}

/** Events for the client. Systems push; the client drains once per frame (master 5.3). */
export type SimEvent =
  | { type: 'message'; category: MessageCategory; textId: string; params?: Record<string, string | number>; tile: number; entityId: EntityId }
  | { type: 'monthEnded'; monthIndex: number }
  | { type: 'researchUnlocked'; itemId: string }
  | { type: 'guestsChanged' }
  /** Phase 5 §4.4: a scenario was won or lost. The client pauses the loop (pausing is UI state). W3-H. */
  | { type: 'scenarioEnded'; status: 'won' | 'lost'; reason: ScenarioEndReason | null; monthIndex: number }
  /** Phase 5 §4.10: an award was won at this month end (toast and park panel). W3-I. */
  | { type: 'award'; id: AwardId; positive: boolean; monthIndex: number }
  /** Phase 5 §4.11: the tutorial moved to step `stepIndex` (or finished when `done`). W3-I. */
  | { type: 'tutorialStep'; stepIndex: number; done: boolean }
  /**
   * Phase 6 §2, §4.1: a sim fact the audio module turns into a sound (`./sound.ts`). Pushed with `emitSound`, which
   * drops sound events while too many are pending (headless runs never drain). `tile` −1 = not placed on the map;
   * `value` depends on the cue (cents for sales, metres for drops). Never read by the sim.
   */
  | { type: 'sound'; cue: SoundCue; tile: number; entityId: EntityId; value: number }
  /**
   * Phase 6 §4.4: a show site changed phase (W4-C). `cancelled` = not enough cash at the start (the UI shows
   * "Not enough cash for the show"); `ended` carries the watcher count.
   */
  | { type: 'show'; siteId: EntityId; phase: 'announced' | 'started' | 'ended' | 'cancelled'; watchers: number };

export interface World {
  state: GameState;
  events: SimEvent[];
}
