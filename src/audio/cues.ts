/**
 * What to play for the facts of one frame (Phase 6 §4.2). Owner: W4-A. Pure, so it is unit-tested without audio.
 *
 * Sources: sim `sound` events (`src/sim/sound.ts`: sale/tickets → `cash_in`, `rideCycleStart` → `ride_bell`,
 * `trainDrop` → `coaster_cheer`, `splash` → `splash`), `message` events of category `breakdown` → `breakdown`,
 * `award` events → `award` (up for positive, down for negative), and command results (`game.onCommand`: success →
 * `build_place`, `build_path` (max 8/s), `demolish`; failure → `ui_error`). Show sounds follow the render timeline of
 * W4-C (`./shows.ts`); panel opens and button presses → `ui_open`, `ui_click` (`./dom.ts`); loops come from the
 * state (`./loops.ts`).
 *
 * Placement: sim cues play at their tile (falloff and pan). Breakdowns and awards are alerts with a toast, so they play
 * everywhere (unplaced). Command sounds answer the player's own action, so they play unplaced too: a build at the
 * screen edge would otherwise be almost silent (`d / R` is about 0.83 at the edge of a 16:9 view at any zoom).
 */
import { CHEER_MIN_DROP_M } from '../data/tuning/audio';
import type { Command, CommandResult } from '../sim/commands';
import type { SoundCue } from '../sim/sound';
import type { SimEvent } from '../sim/types';
import type { RateLimiter } from './voices';
import type { SfxId, SoundRequest } from './types';

/** Sim sound cue → SFX (Phase 6 §4.2 "Trigger" column). */
export const SOUND_CUE_SFX: Readonly<Record<SoundCue, SfxId>> = Object.freeze({
  sale: 'cash_in',
  rideTicket: 'cash_in',
  entranceTicket: 'cash_in',
  rideCycleStart: 'ride_bell',
  trainDrop: 'coaster_cheer',
  splash: 'splash',
});

/**
 * Command kind → SFX on success (null = silent; the button press already clicked). Every command kind is listed, so a
 * new command fails to compile until it gets a sound decision. Any failed command plays `ui_error` (its toast shows the
 * reason, Phase 6 §4.7).
 */
export const COMMAND_SFX: Readonly<Record<Command['type'], SfxId | null>> = Object.freeze({
  // Placing things: rides, stalls, scenery, show sites, track stations, gates and pieces, path items.
  placeRide: 'build_place',
  placeStall: 'build_place',
  placeScenery: 'build_place',
  placeShowSite: 'build_place',
  placeStation: 'build_place',
  placeTrackGate: 'build_place',
  addTrackPiece: 'build_place',
  buildPathItem: 'build_place',
  // Path tiles, and the brush-like land tools (one tick per edit, limited with the paths).
  buildPath: 'build_path',
  buildPathLine: 'build_path',
  raiseCorner: 'build_path',
  lowerCorner: 'build_path',
  raiseLand: 'build_path',
  lowerLand: 'build_path',
  smoothLand: 'build_path',
  levelLand: 'build_path',
  paintTerrain: 'build_path',
  raiseWater: 'build_path',
  lowerWater: 'build_path',
  buyLand: 'build_path',
  // Removing things.
  demolish: 'demolish',
  removeScenery: 'demolish',
  removePathItem: 'demolish',
  removeLastTrackPiece: 'demolish',
  // Settings, prices, staff, finance, and flow commands: the UI click is the feedback.
  setRidePrice: null,
  setStallPrice: null,
  setEntranceFee: null,
  setRideOpen: null,
  setParkOpen: null,
  renamePark: null,
  setPieceOptions: null,
  setTrainConfig: null,
  setTrackOperation: null,
  setTrackColours: null,
  startTestRun: null,
  editTrack: null,
  hireStaff: null,
  fireStaff: null,
  editPatrol: null,
  clearPatrol: null,
  setCostume: null,
  setInspectionInterval: null,
  repairPathItem: null,
  repairAllPathItems: null,
  setAutoRepair: null,
  setResearchBudget: null,
  setResearchFocus: null,
  startCampaign: null,
  borrow: null,
  repay: null,
  markMessagesRead: null,
  setAfterDark: null,
  scenarioContinue: null,
  setSandboxOption: null,
  tutorialAdvance: null,
  tutorialSkipStep: null,
  tutorialSkipAll: null,
  setShowSchedule: null,
  setShowEnabled: null,
});

function forEvent(ev: SimEvent, out: SoundRequest[]): void {
  switch (ev.type) {
    case 'sound': {
      if (ev.tile < 0) return;
      if (ev.cue === 'trainDrop' && !(ev.value > CHEER_MIN_DROP_M)) return;
      out.push({ id: SOUND_CUE_SFX[ev.cue], place: { tile: ev.tile }, param: ev.value });
      return;
    }
    case 'message':
      if (ev.category === 'breakdown') out.push({ id: 'breakdown', place: null });
      return;
    case 'award':
      out.push({ id: 'award', place: null, param: ev.positive ? 1 : -1 });
      return;
    // Show phases: the fireworks and beam sounds follow the show timeline (`./shows.ts`); a cancelled show has its
    // toast (W4-C). The rest have no sound in Phase 6 §4.2.
    case 'show':
    case 'monthEnded':
    case 'researchUnlocked':
    case 'guestsChanged':
    case 'scenarioEnded':
    case 'tutorialStep':
      return;
    default: {
      const never: never = ev;
      void never;
    }
  }
}

/** One-shot requests for the events of one frame, in event order. */
export function requestsForEvents(events: readonly SimEvent[]): SoundRequest[] {
  const out: SoundRequest[] = [];
  for (const ev of events) forEvent(ev, out);
  return out;
}

export interface CommandCueOptions {
  nowMs: number;
  /** `build_path` limit (8 per second); shared by every command of the session. */
  pathLimiter: RateLimiter;
}

/** One-shot requests for a dispatched command and its result. */
export function requestsForCommand(cmd: Command, result: CommandResult, opts?: CommandCueOptions): SoundRequest[] {
  if (!result.ok) return [{ id: 'ui_error', place: null }];
  const id = COMMAND_SFX[cmd.type];
  if (id === null) return [];
  if (id === 'build_path' && opts && !opts.pathLimiter.allow(opts.nowMs)) return [];
  return [{ id, place: null }];
}
