/**
 * Command contracts for Build 1 (Phases 1–3), Build 2 (Phases 4–5), and Build 3 (Phase 6). Owner: integrator.
 * Handlers live in each owner's folder and are registered in `./index.ts`.
 */
import type { Dir, TerrainCode } from '../map';
import type { CommandContext } from '../economy/ledger';
import type { World } from '../types';
import type { Cents, EntityId } from '../units';
import type { Costume, ResearchCategory, StaffType } from '../../data/catalog/types';
import type { ResearchLevel } from '../management/types';
import type { PathKind, RampDir } from '../paths/types';
import type { SceneryEdge } from '../scenery/types';
import type { BrushSize, Corner } from '../terrain/types';
import type { SandboxLiveOption } from '../scenario/types';

export type { CommandContext, PathKind };

/** Path line ramp toggle (Phase 4 §4.2): flat, or rising / falling one step per tile along the drag direction. */
export type RampMode = 'flat' | 'up' | 'down';

/**
 * Phase 1 — building (owner W1-C; Phase 4 extensions owner W3-B).
 * Phase 4 §6: `buildPath` / `buildPathLine` take an optional `z` (absolute height of the walking surface) for
 * elevated paths; absent = a ground path at the tile base height. `demolish` takes an optional `z` to pick an
 * elevated path on the tile; absent = the Build 1 behaviour.
 */
export type BuildCommand =
  | { type: 'buildPath'; x: number; y: number; kind: PathKind; z?: number; rampDir?: RampDir }
  | { type: 'buildPathLine'; x0: number; y0: number; x1: number; y1: number; kind: PathKind; z?: number; ramp?: RampMode }
  | { type: 'placeRide'; defId: string; x: number; y: number; rotation: Dir }
  | { type: 'placeStall'; defId: string; x: number; y: number; rotation: Dir }
  | { type: 'demolish'; x: number; y: number; z?: number };

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
  /** `dir` is a map `Dir` (0 = N, 1 = E, 2 = S, 3 = W): the station heading. E builds the station along +x. */
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
  /** Phase 4 §4.2: `level` = the elevated path id that holds the item; absent or 0 = the ground path (W3-B). */
  | { type: 'buildPathItem'; x: number; y: number; itemType: 'bench' | 'bin' | 'lamp'; level?: EntityId }
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

/** Phase 4 §6 — terrain and water shaping (owner W3-A). `size` is the brush size; heights are absolute steps. */
export type TerrainCommand =
  | { type: 'raiseCorner'; x: number; y: number; corner: Corner }
  | { type: 'lowerCorner'; x: number; y: number; corner: Corner }
  | { type: 'raiseLand'; x: number; y: number; size: BrushSize }
  | { type: 'lowerLand'; x: number; y: number; size: BrushSize }
  | { type: 'smoothLand'; x: number; y: number; size: BrushSize }
  | { type: 'levelLand'; x0: number; y0: number; x1: number; y1: number; targetHeight: number }
  | { type: 'paintTerrain'; x: number; y: number; size: BrushSize; terrain: TerrainCode }
  | { type: 'raiseWater'; x: number; y: number; size: BrushSize }
  | { type: 'lowerWater'; x: number; y: number; size: BrushSize };

/** Phase 4 §6 — land purchase (owner W3-G). */
export type LandCommand = { type: 'buyLand'; x0: number; y0: number; x1: number; y1: number };

/** Phase 4 §6 — scenery (owner W3-D). `edge` −1 = centre slot, 0–3 = tile edge (map `Dir`). */
export type SceneryCommand =
  | { type: 'placeScenery'; defId: string; x: number; y: number; rotation: Dir; edge: SceneryEdge }
  | { type: 'removeScenery'; id: EntityId };

/** Phase 4 §6 — After Dark park setting (owner W3-F). */
export type AfterDarkCommand = { type: 'setAfterDark'; on: boolean };

/** Phase 5 §6 — scenario and sandbox (owner W3-H). */
export type ScenarioCommand =
  | { type: 'scenarioContinue' }
  | { type: 'setSandboxOption'; key: SandboxLiveOption; value: boolean | 'normal' | 'alwaysSunny' };

/** Phase 5 §6 — tutorial (owner W3-I). `stepId` names a step with a `ui` check. */
export type TutorialCommand =
  | { type: 'tutorialAdvance'; stepId: string }
  | { type: 'tutorialSkipStep' }
  | { type: 'tutorialSkipAll' };

/**
 * Phase 6 §6 — After Dark show sites (owner W4-C). Demolish uses `demolish` (it calls W4-C's `demolishShowSite`).
 * `placeShowSite`: unlocked, tiles valid, cash enough; the schedule starts disabled at 21:00, every day.
 * `setShowSchedule`: hour 20–23, minute 0 or 30, everyNDays 1–3. `setShowEnabled`: the site exists.
 */
export type ShowCommand =
  | { type: 'placeShowSite'; defId: string; x: number; y: number; rotation: Dir }
  | { type: 'setShowSchedule'; id: EntityId; hour: number; minute: number; everyNDays: number }
  | { type: 'setShowEnabled'; id: EntityId; enabled: boolean };

export type Command =
  | BuildCommand
  | PriceCommand
  | TrackCommand
  | StaffCommand
  | ManagementCommand
  | TerrainCommand
  | LandCommand
  | SceneryCommand
  | AfterDarkCommand
  | ScenarioCommand
  | TutorialCommand
  | ShowCommand;

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
