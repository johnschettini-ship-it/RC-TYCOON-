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
import type { EntityId } from './units';

export interface GameState {
  schemaVersion: 1;
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
}

/** Events for the client. Systems push; the client drains once per frame (master 5.3). */
export type SimEvent =
  | { type: 'message'; category: MessageCategory; textId: string; params?: Record<string, string | number>; tile: number; entityId: EntityId }
  | { type: 'monthEnded'; monthIndex: number }
  | { type: 'researchUnlocked'; itemId: string }
  | { type: 'guestsChanged' };

export interface World {
  state: GameState;
  events: SimEvent[];
}
