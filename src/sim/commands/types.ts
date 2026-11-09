/** Command contracts for Build 1 (Phases 1–3). Owner: integrator. Handlers live in each owner's folder. */
import type { Dir } from '../map';
import type { CommandContext } from '../economy/ledger';
import type { World } from '../types';
import type { Cents, EntityId } from '../units';
import type { Costume, ResearchCategory, StaffType } from '../../data/catalog/types';
import type { ResearchLevel } from '../management/types';

export type { CommandContext };
export type PathKind = 'footpath' | 'queue';

/** Phase 1 — building (owner W1-C). */
export type BuildCommand =
  | { type: 'buildPath'; x: number; y: number; kind: PathKind }
  | { type: 'buildPathLine'; x0: number; y0: number; x1: number; y1: number; kind: PathKind }
  | { type: 'placeRide'; defId: string; x: number; y: number; rotation: Dir }
  | { type: 'placeStall'; defId: string; x: number; y: number; rotation: Dir }
  | { type: 'demolish'; x: number; y: number };

/** Phase 1 — prices and park settings (owner W1-E). */
export type PriceCommand =
  | { type: 'setRidePrice'; rideId: EntityId; price: Cents }
  | { type: 'setStallPrice'; stallId: EntityId; price: Cents }
  | { type: 'setEntranceFee'; fee: Cents }
  | { type: 'setRideOpen'; rideId: EntityId; open: boolean }
  | { type: 'setParkOpen'; open: boolean }
  | { type: 'renamePark'; name: string };

/** Phase 2 — track rides (owner W1-G). phase-2-coasters.md §6. */
export type TrackCommand =
  | { type: 'placeStation'; typeId: string; x: number; y: number; dir: Dir }
  | { type: 'addTrackPiece'; rideId: EntityId; defId: string; chain?: boolean; brakeSpeed?: number }
  | { type: 'removeLastTrackPiece'; rideId: EntityId }
  | { type: 'setPieceOptions'; rideId: EntityId; index: number; chain?: boolean; brakeSpeed?: number }
  | { type: 'placeTrackGate'; rideId: EntityId; kind: 'entrance' | 'exit'; x: number; y: number }
  | { type: 'setTrainConfig'; rideId: EntityId; trains: number; carsPerTrain: number }
  | { type: 'setTrackOperation'; rideId: EntityId; minDwellS: number; maxDwellS: number; laps: number }
  | { type: 'setTrackColours'; rideId: EntityId; track: number; supports: number; cars: number }
  | { type: 'startTestRun'; rideId: EntityId }
  | { type: 'editTrack'; rideId: EntityId };

/** Phase 3 — staff, path items, repairs (owner W1-H). phase-3-management.md §6. */
export type StaffCommand =
  | { type: 'hireStaff'; staffType: StaffType }
  | { type: 'fireStaff'; staffId: EntityId }
  | { type: 'editPatrol'; staffId: EntityId; add: number[]; remove: number[] }
  | { type: 'clearPatrol'; staffId: EntityId }
  | { type: 'setCostume'; staffId: EntityId; costume: Costume }
  | { type: 'setInspectionInterval'; rideId: EntityId; intervalTicks: number }
  | { type: 'buildPathItem'; x: number; y: number; itemType: 'bench' | 'bin' | 'lamp' }
  | { type: 'removePathItem'; x: number; y: number }
  | { type: 'repairPathItem'; x: number; y: number }
  | { type: 'repairAllPathItems' }
  | { type: 'setAutoRepair'; on: boolean };

/** Phase 3 — research, marketing, loans, messages (owner W1-I). phase-3-management.md §6. */
export type ManagementCommand =
  | { type: 'setResearchBudget'; level: ResearchLevel }
  | { type: 'setResearchFocus'; category: ResearchCategory; on: boolean }
  | { type: 'startCampaign'; campaignType: string; targetId?: EntityId }
  | { type: 'borrow'; amount: Cents }
  | { type: 'repay'; amount: Cents }
  | { type: 'markMessagesRead'; upToId: number };

export type Command = BuildCommand | PriceCommand | TrackCommand | StaffCommand | ManagementCommand;

export type CommandResult =
  | { ok: true; cost: Cents; warnings: string[]; id?: EntityId }
  | { ok: false; reason: string };

export type Handler<C> = (world: World, cmd: C, ctx: CommandContext) => CommandResult;
export type HandlerMap<C extends { type: string }> = { [K in C['type']]: Handler<Extract<C, { type: K }>> };

export const NOT_IMPLEMENTED = 'Not implemented yet';
export const notImplemented = (): CommandResult => ({ ok: false, reason: NOT_IMPLEMENTED });

export function ok(cost: Cents = 0, warnings: string[] = [], id?: EntityId): CommandResult {
  return id === undefined ? { ok: true, cost, warnings } : { ok: true, cost, warnings, id };
}

export function fail(reason: string): CommandResult {
  return { ok: false, reason };
}
