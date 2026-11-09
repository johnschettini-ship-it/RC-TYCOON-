/** Cue → SFX tables for every sim event and command kind (Phase 6 §4.2). W4-A. */
import { describe, expect, it } from 'vitest';
import { COMMAND_SFX, SOUND_CUE_SFX, requestsForCommand, requestsForEvents } from '../../../src/audio/cues';
import { RateLimiter } from '../../../src/audio/voices';
import { sfxInfo } from '../../../src/audio/types';
import type { Command, CommandResult } from '../../../src/sim/commands';
import { SOUND_CUES } from '../../../src/sim/sound';
import type { SimEvent } from '../../../src/sim/types';

const OK: CommandResult = { ok: true, cost: 0, warnings: [] };
const FAIL: CommandResult = { ok: false, reason: 'Not enough cash' };

describe('sim sound cues → SFX', () => {
  it('every cue has an SFX and the table matches Phase 6 §4.2', () => {
    for (const cue of SOUND_CUES) expect(SOUND_CUE_SFX[cue]).toBeDefined();
    expect(SOUND_CUE_SFX).toEqual({ sale: 'cash_in', rideTicket: 'cash_in', entranceTicket: 'cash_in', rideCycleStart: 'ride_bell', trainDrop: 'coaster_cheer', splash: 'splash' });
  });

  it('sales and tickets → `cash_in` at the tile; ride cycle → `ride_bell`; splash → `splash`', () => {
    const evs: SimEvent[] = [
      { type: 'sound', cue: 'sale', tile: 10, entityId: 3, value: 150 },
      { type: 'sound', cue: 'rideTicket', tile: 11, entityId: 4, value: 200 },
      { type: 'sound', cue: 'entranceTicket', tile: 12, entityId: -1, value: 500 },
      { type: 'sound', cue: 'rideCycleStart', tile: 13, entityId: 4, value: 0 },
      { type: 'sound', cue: 'splash', tile: 14, entityId: 5, value: 0 },
    ];
    expect(requestsForEvents(evs)).toEqual([
      { id: 'cash_in', place: { tile: 10 }, param: 150 },
      { id: 'cash_in', place: { tile: 11 }, param: 200 },
      { id: 'cash_in', place: { tile: 12 }, param: 500 },
      { id: 'ride_bell', place: { tile: 13 }, param: 0 },
      { id: 'splash', place: { tile: 14 }, param: 0 },
    ]);
  });

  it('`trainDrop` cheers only for a drop of more than 10 m; the drop is the parameter', () => {
    expect(requestsForEvents([{ type: 'sound', cue: 'trainDrop', tile: 9, entityId: 2, value: 18 }])).toEqual([{ id: 'coaster_cheer', place: { tile: 9 }, param: 18 }]);
    expect(requestsForEvents([{ type: 'sound', cue: 'trainDrop', tile: 9, entityId: 2, value: 10 }])).toEqual([]);
  });

  it('a cue with no map tile (−1) plays nothing', () => {
    expect(requestsForEvents([{ type: 'sound', cue: 'entranceTicket', tile: -1, entityId: -1, value: 500 }])).toEqual([]);
  });
});

describe('other sim events → SFX', () => {
  it('a breakdown message plays `breakdown` everywhere (an alert, like its toast)', () => {
    const ev: SimEvent = { type: 'message', category: 'breakdown', textId: 'msg.breakdown', tile: 40, entityId: 7 };
    expect(requestsForEvents([ev])).toEqual([{ id: 'breakdown', place: null }]);
  });

  it('other message categories are silent', () => {
    for (const category of ['research', 'weather', 'finance', 'staff', 'marketing', 'park'] as const) {
      expect(requestsForEvents([{ type: 'message', category, textId: 'x', tile: -1, entityId: -1 }])).toEqual([]);
    }
  });

  it('awards play `award` up (positive, +1) or down (negative, −1)', () => {
    expect(requestsForEvents([{ type: 'award', id: 'chillHaven', positive: true, monthIndex: 2 }])).toEqual([{ id: 'award', place: null, param: 1 }]);
    expect(requestsForEvents([{ type: 'award', id: 'chillHaven', positive: false, monthIndex: 2 }])).toEqual([{ id: 'award', place: null, param: -1 }]);
  });

  it('month end, research, guests changed, scenario end, tutorial, and show phase events play nothing here', () => {
    const evs: SimEvent[] = [
      { type: 'monthEnded', monthIndex: 1 },
      { type: 'researchUnlocked', itemId: 'big_wheel' },
      { type: 'guestsChanged' },
      { type: 'scenarioEnded', status: 'won', reason: null, monthIndex: 3 },
      { type: 'tutorialStep', stepIndex: 2, done: false },
      { type: 'show', siteId: 5, phase: 'started', watchers: 0 },
      { type: 'show', siteId: 5, phase: 'cancelled', watchers: 0 },
    ];
    expect(requestsForEvents(evs)).toEqual([]);
  });
});

/** One sample command per kind (the table must cover every `Command['type']`). */
const SAMPLE: { [K in Command['type']]: Extract<Command, { type: K }> } = {
  buildPath: { type: 'buildPath', x: 3, y: 4, kind: 'footpath' },
  buildPathLine: { type: 'buildPathLine', x0: 1, y0: 1, x1: 5, y1: 1, kind: 'footpath' },
  placeRide: { type: 'placeRide', defId: 'carousel', x: 1, y: 1, rotation: 0 },
  placeStall: { type: 'placeStall', defId: 'snack_shack', x: 1, y: 1, rotation: 0 },
  demolish: { type: 'demolish', x: 1, y: 1 },
  setRidePrice: { type: 'setRidePrice', rideId: 1, price: 100 },
  setStallPrice: { type: 'setStallPrice', stallId: 1, price: 100 },
  setEntranceFee: { type: 'setEntranceFee', fee: 100 },
  setRideOpen: { type: 'setRideOpen', rideId: 1, open: true },
  setParkOpen: { type: 'setParkOpen', open: true },
  renamePark: { type: 'renamePark', name: 'P' },
  placeStation: { type: 'placeStation', typeId: 'steel_coaster', x: 1, y: 1, dir: 1 },
  addTrackPiece: { type: 'addTrackPiece', rideId: 1, defId: 'straight' },
  removeLastTrackPiece: { type: 'removeLastTrackPiece', rideId: 1 },
  setPieceOptions: { type: 'setPieceOptions', rideId: 1, index: 0, chain: true },
  placeTrackGate: { type: 'placeTrackGate', rideId: 1, kind: 'entrance', x: 1, y: 1 },
  setTrainConfig: { type: 'setTrainConfig', rideId: 1, trains: 1, carsPerTrain: 2 },
  setTrackOperation: { type: 'setTrackOperation', rideId: 1, minDwellS: 1, maxDwellS: 5, laps: 1 },
  setTrackColours: { type: 'setTrackColours', rideId: 1, track: 0, supports: 0, cars: 0 },
  startTestRun: { type: 'startTestRun', rideId: 1 },
  editTrack: { type: 'editTrack', rideId: 1 },
  hireStaff: { type: 'hireStaff', staffType: 'mechanic' },
  fireStaff: { type: 'fireStaff', staffId: 1 },
  editPatrol: { type: 'editPatrol', staffId: 1, add: [], remove: [] },
  clearPatrol: { type: 'clearPatrol', staffId: 1 },
  setCostume: { type: 'setCostume', staffId: 1, costume: 'frost' },
  setInspectionInterval: { type: 'setInspectionInterval', rideId: 1, intervalTicks: 100 },
  buildPathItem: { type: 'buildPathItem', x: 1, y: 1, itemType: 'bench' },
  removePathItem: { type: 'removePathItem', x: 1, y: 1 },
  repairPathItem: { type: 'repairPathItem', x: 1, y: 1 },
  repairAllPathItems: { type: 'repairAllPathItems' },
  setAutoRepair: { type: 'setAutoRepair', on: true },
  setResearchBudget: { type: 'setResearchBudget', level: 'medium' },
  setResearchFocus: { type: 'setResearchFocus', category: 'gentle', on: true },
  startCampaign: { type: 'startCampaign', campaignType: 'poster' },
  borrow: { type: 'borrow', amount: 100 },
  repay: { type: 'repay', amount: 100 },
  markMessagesRead: { type: 'markMessagesRead', upToId: 1 },
  raiseCorner: { type: 'raiseCorner', x: 1, y: 1, corner: 0 },
  lowerCorner: { type: 'lowerCorner', x: 1, y: 1, corner: 0 },
  raiseLand: { type: 'raiseLand', x: 1, y: 1, size: 1 },
  lowerLand: { type: 'lowerLand', x: 1, y: 1, size: 1 },
  smoothLand: { type: 'smoothLand', x: 1, y: 1, size: 1 },
  levelLand: { type: 'levelLand', x0: 1, y0: 1, x1: 2, y1: 2, targetHeight: 8 },
  paintTerrain: { type: 'paintTerrain', x: 1, y: 1, size: 1, terrain: 0 },
  raiseWater: { type: 'raiseWater', x: 1, y: 1, size: 1 },
  lowerWater: { type: 'lowerWater', x: 1, y: 1, size: 1 },
  buyLand: { type: 'buyLand', x0: 1, y0: 1, x1: 2, y1: 2 },
  placeScenery: { type: 'placeScenery', defId: 'oak', x: 1, y: 1, rotation: 0, edge: -1 },
  removeScenery: { type: 'removeScenery', id: 1 },
  setAfterDark: { type: 'setAfterDark', on: true },
  scenarioContinue: { type: 'scenarioContinue' },
  setSandboxOption: { type: 'setSandboxOption', key: 'unlimitedMoney', value: true },
  tutorialAdvance: { type: 'tutorialAdvance', stepId: 'x' },
  tutorialSkipStep: { type: 'tutorialSkipStep' },
  tutorialSkipAll: { type: 'tutorialSkipAll' },
  placeShowSite: { type: 'placeShowSite', defId: 'fireworks_launcher', x: 1, y: 1, rotation: 0 },
  setShowSchedule: { type: 'setShowSchedule', id: 1, hour: 21, minute: 0, everyNDays: 1 },
  setShowEnabled: { type: 'setShowEnabled', id: 1, enabled: true },
} as { [K in Command['type']]: Extract<Command, { type: K }> };

describe('command results → SFX (every command kind)', () => {
  it('the success table: placing → `build_place`, path and land shaping → `build_path`, removing → `demolish`, settings → silent', () => {
    const by = (sfx: string | null): string[] =>
      Object.entries(COMMAND_SFX)
        .filter(([, v]) => v === sfx)
        .map(([k]) => k)
        .sort();
    expect(by('build_place')).toEqual(['addTrackPiece', 'buildPathItem', 'placeRide', 'placeScenery', 'placeShowSite', 'placeStall', 'placeStation', 'placeTrackGate']);
    expect(by('build_path')).toEqual(['buildPath', 'buildPathLine', 'buyLand', 'levelLand', 'lowerCorner', 'lowerLand', 'lowerWater', 'paintTerrain', 'raiseCorner', 'raiseLand', 'raiseWater', 'smoothLand']);
    expect(by('demolish')).toEqual(['demolish', 'removeLastTrackPiece', 'removePathItem', 'removeScenery']);
    expect(Object.keys(COMMAND_SFX).sort()).toEqual(Object.keys(SAMPLE).sort());
  });

  it('every command kind: success plays its table SFX (UI-placed, centred); failure plays `ui_error`', () => {
    for (const cmd of Object.values(SAMPLE) as Command[]) {
      const sfx = COMMAND_SFX[cmd.type];
      expect(requestsForCommand(cmd, OK)).toEqual(sfx === null ? [] : [{ id: sfx, place: null }]);
      expect(requestsForCommand(cmd, FAIL)).toEqual([{ id: 'ui_error', place: null }]);
    }
    for (const id of ['build_place', 'build_path', 'demolish', 'ui_error'] as const) expect(sfxInfo(id).loop).toBe(false);
  });

  it('`build_path` plays at most 8 times per second (a path drag)', () => {
    const limiter = new RateLimiter(8, 1_000);
    let played = 0;
    for (let i = 0; i < 30; i++) played += requestsForCommand(SAMPLE.buildPath, OK, { nowMs: i * 33, pathLimiter: limiter }).length;
    expect(played).toBe(8);
    // Other sounds are not limited by it.
    expect(requestsForCommand(SAMPLE.placeRide, OK, { nowMs: 999, pathLimiter: limiter })).toHaveLength(1);
    expect(requestsForCommand(SAMPLE.buildPath, FAIL, { nowMs: 999, pathLimiter: limiter })).toEqual([{ id: 'ui_error', place: null }]);
  });

  it('a path line plays one `build_path`', () => {
    expect(requestsForCommand(SAMPLE.buildPathLine, OK)).toEqual([{ id: 'build_path', place: null }]);
  });
});
