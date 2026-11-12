/** Track command handlers (phase-2-coasters.md §6; water types Phase 4 §4.4, §6). Owner: W1-G; water types W3-C. */
import { getTrackRideDef } from '../../../data/catalog/trackRides';
import { getTrackPieceDef, getTrackTypeDef } from '../../../data/track';
import {
  BLOCK_MARGIN_MM,
  BRAKE_SPEED,
  CHAIN_EXTRA_CENTS,
  COLOUR_COUNT,
  DEFAULT_MAX_DWELL_TICKS,
  DEFAULT_MIN_DWELL_TICKS,
  KART_MAX,
  KARTS_PER_STATION_TILE,
  LAPS_RANGE,
  MAX_DWELL_RANGE_S,
  MIN_DWELL_RANGE_S,
  TICKS_PER_S,
  TILE_MM,
} from '../../../data/tuning/track';
import { TRACK_ERR, TRACK_WARN, fillTrackString } from '../../../data/strings/track';
import { fail, ok, type CommandContext, type CommandResult, type HandlerMap, type TrackCommand } from '../../commands/types';
import { initRideReliability } from '../../breakdowns/api';
import { canAfford, pay, recordLedger } from '../../economy/ledger';
import { allocId } from '../../ids';
import { groundOwnershipBlock } from '../../land/api';
import { Content, inBounds, tileIndex, type Dir } from '../../map';
import { markNetworkDirty } from '../../pathing';
import { isUnlocked } from '../../research/api';
import type { World } from '../../types';
import type { Ride } from '../types';
import { applyPlan, clearGateTile, gateSide, planAppend, removeLast } from './build';
import { clearTest, editBlock, enterBuilding, isRunningStatus, refundShare, trackContext, trainsIdle } from './common';
import { TRACK_DX, TRACK_DY, trackDirFromMapDir } from './geometry';
import { getLayout } from './layout';
import { checkPieceTiles, pieceCost } from './placement';
import { dispatchedTestTrain, rememberTestLapDetail, runTestLapDetailed } from './testRun';
import type { TrackPieceInstance, TrackRideData } from './types';

type Cmd<K extends TrackCommand['type']> = Extract<TrackCommand, { type: K }>;

/** Status gate for train, option, and test commands: not open, not testing; a closed ride must be empty. */
function configBlock(ride: Ride, data: TrackRideData): string | null {
  if (isRunningStatus(ride.status)) return TRACK_ERR.closeFirst;
  if (ride.status === 'testing') return TRACK_ERR.waitForTest;
  if (ride.status !== 'building' && (!trainsIdle(data) || ride.riders.length > 0)) return TRACK_ERR.mustBeEmpty;
  return null;
}

function placeStation(world: World, cmd: Cmd<'placeStation'>, ctx: CommandContext): CommandResult {
  const type = getTrackTypeDef(cmd.typeId);
  if (!type) return fail(TRACK_ERR.unknownType);
  const stationDef = getTrackPieceDef(type.stationPiece);
  if (!stationDef) return fail(TRACK_ERR.unknownType);
  if (!ctx.setup && !isUnlocked(world, cmd.typeId)) return fail(TRACK_ERR.notResearched);
  const s = world.state;
  const map = s.map;
  if (!inBounds(map, cmd.x, cmd.y)) return fail(TRACK_ERR.outsidePark);
  // The command takes a map `Dir` (0 = N, 1 = E, 2 = S, 3 = W, like every command); pieces use `TrackDir`.
  const mapDir = (((cmd.dir % 4) + 4) % 4) as Dir;
  const piece: TrackPieceInstance = {
    defId: stationDef.id,
    x: cmd.x,
    y: cmd.y,
    z: map.heights[tileIndex(map, cmd.x, cmd.y)] as number,
    dir: trackDirFromMapDir(mapDir),
    chain: false,
    brakeSpeed: null,
    cost: 0,
  };
  const chk = checkPieceTiles(world, s.nextId, 0, piece, type, []);
  if (!chk.ok) return fail(chk.reason);
  const pc = pieceCost(type, stationDef, false, chk.heightAboveGround);
  const cost = type.costs.base + pc;
  if (!canAfford(world, cost, ctx)) return fail(TRACK_ERR.notEnoughCash);

  const id = allocId(s);
  piece.cost = pc;
  const n = s.rides.filter((r) => r.defId === type.id).length + 1;
  const name = `${getNameOf(type.id)} ${n}`;
  const ride: Ride = {
    id,
    kind: 'track',
    defId: type.id,
    name,
    x: cmd.x,
    y: cmd.y,
    rotation: mapDir,
    status: 'building',
    price: defaultPrice(type.id),
    entrance: null,
    exit: null,
    stats: null,
    queue: [],
    riders: [],
    cycle: { phase: 'waiting', ticks: 0 },
    totals: { riders: 0, income: 0, ridersThisMonth: 0, incomeThisMonth: 0 },
    builtTick: s.tick,
    hoursThisMonth: 0,
    // Placeholders: `initRideReliability` (W1-H owns the values) sets the reliability fields below.
    reliability: 0,
    lastInspectionTick: s.tick,
    inspectionIntervalTicks: 0,
    breakdownType: null,
    statusBeforeBreakdown: null,
    breakdownsThisMonth: 0,
    lastBreakdownTick: -1,
    assignedMechanicId: null,
    totalBuildCost: type.costs.base,
  };
  initRideReliability(world, ride);
  const data: TrackRideData = {
    rideId: id,
    typeId: type.id,
    pieces: [],
    circuitClosed: false,
    trainConfig: { trains: 1, carsPerTrain: type.vehicle.defaultCars },
    operation: { minDwellTicks: DEFAULT_MIN_DWELL_TICKS, maxDwellTicks: DEFAULT_MAX_DWELL_TICKS, laps: LAPS_RANGE.default },
    trains: [],
    test: null,
    colours: { ...type.render.colours },
    openedOnce: false,
    testRun: null,
    lastDispatchTick: -1,
    bestLapTicks: null,
  };
  s.rides.push(ride);
  s.track.rides[String(id)] = data;
  pay(world, type.costs.base, 'construction', ctx);
  applyPlan(world, ride, data, { piece, def: stationDef, tiles: chk.tiles, cost: pc, closes: false }, ctx);
  return ok(cost, [], id);
}

function getNameOf(id: string): string {
  return getTrackRideDef(id)?.name ?? id;
}
function defaultPrice(id: string): number {
  return getTrackRideDef(id)?.defaultPrice ?? 0;
}

function addTrackPiece(world: World, cmd: Cmd<'addTrackPiece'>, ctx: CommandContext): CommandResult {
  const tc = trackContext(world, cmd.rideId);
  if (!tc) return fail(TRACK_ERR.noRide);
  const { ride, data, type } = tc;
  const block = editBlock(ride, data);
  if (block) return fail(block);
  const r = planAppend(world, ride, data, type, cmd.defId, cmd.chain === true, cmd.brakeSpeed, ctx);
  if (!r.ok) return fail(r.reason);
  if (ride.status !== 'building') enterBuilding(ride, data);
  applyPlan(world, ride, data, r.plan, ctx);
  return ok(r.plan.cost, r.plan.closes ? [TRACK_WARN.circuitComplete] : []);
}

function removeLastTrackPiece(world: World, cmd: Cmd<'removeLastTrackPiece'>, ctx: CommandContext): CommandResult {
  const tc = trackContext(world, cmd.rideId);
  if (!tc) return fail(TRACK_ERR.noRide);
  const { ride, data } = tc;
  const block = editBlock(ride, data);
  if (block) return fail(block);
  if (data.pieces.length <= 1) return fail(TRACK_ERR.firstStation);
  if (ride.status !== 'building') enterBuilding(ride, data);
  const refund = removeLast(world, ride, data, ctx);
  return ok(-refund);
}

function setPieceOptions(world: World, cmd: Cmd<'setPieceOptions'>, ctx: CommandContext): CommandResult {
  const tc = trackContext(world, cmd.rideId);
  if (!tc) return fail(TRACK_ERR.noRide);
  const { ride, data, type } = tc;
  const block = configBlock(ride, data);
  if (block) return fail(block);
  const piece = Number.isInteger(cmd.index) ? data.pieces[cmd.index] : undefined;
  const def = piece ? getTrackPieceDef(piece.defId) : undefined;
  if (!piece || !def) return fail(TRACK_ERR.noSuchPiece);
  let cost = 0;
  let chainOff = false;
  if (cmd.chain !== undefined && cmd.chain !== piece.chain) {
    if (cmd.chain) {
      if (!type.chain || !def.chainable) return fail(TRACK_ERR.typeCannotUse);
      cost = CHAIN_EXTRA_CENTS;
    } else {
      chainOff = true;
    }
  }
  if (cmd.brakeSpeed !== undefined) {
    if (def.special !== 'brakes') return fail(TRACK_ERR.typeCannotUse);
    if (!Number.isInteger(cmd.brakeSpeed) || cmd.brakeSpeed < BRAKE_SPEED.min || cmd.brakeSpeed > BRAKE_SPEED.max) {
      return fail(TRACK_ERR.brakeSpeedRange);
    }
  }
  if (!canAfford(world, cost, ctx)) return fail(TRACK_ERR.notEnoughCash);
  let refund = 0;
  if (cost > 0) {
    pay(world, cost, 'construction', ctx);
    piece.cost += cost;
    ride.totalBuildCost += cost;
    piece.chain = true;
  } else if (chainOff) {
    refund = Math.floor(CHAIN_EXTRA_CENTS * refundShare(data));
    if (!ctx.setup && refund > 0) recordLedger(world, 'demolitionRefunds', refund);
    piece.cost -= CHAIN_EXTRA_CENTS;
    ride.totalBuildCost -= CHAIN_EXTRA_CENTS;
    piece.chain = false;
  }
  if (cmd.brakeSpeed !== undefined) piece.brakeSpeed = cmd.brakeSpeed;
  clearTest(ride, data);
  return ok(cost - refund);
}

function placeTrackGate(world: World, cmd: Cmd<'placeTrackGate'>, _ctx: CommandContext): CommandResult {
  const tc = trackContext(world, cmd.rideId);
  if (!tc) return fail(TRACK_ERR.noRide);
  const { ride, data } = tc;
  if (isRunningStatus(ride.status)) return fail(TRACK_ERR.closeFirst);
  const map = world.state.map;
  if (!inBounds(map, cmd.x, cmd.y)) return fail(TRACK_ERR.outsidePark);
  // A gate stands on the ground: owned land only ("You only have construction rights here" on state 3).
  const own = groundOwnershipBlock(map, tileIndex(map, cmd.x, cmd.y));
  if (own) return fail(own);
  const side = gateSide(data, cmd.x, cmd.y);
  if (side === null) return fail(TRACK_ERR.gateBesideStation);
  const gate = tileIndex(map, cmd.x, cmd.y);
  if (map.content[gate] !== Content.Empty) return fail(TRACK_ERR.tileNotEmpty);
  const ox = cmd.x + (TRACK_DX[side] as number);
  const oy = cmd.y + (TRACK_DY[side] as number);
  const outside = inBounds(map, ox, oy) ? tileIndex(map, ox, oy) : -1;
  const old = ride[cmd.kind];
  if (old) clearGateTile(world, ride, old.gate);
  map.content[gate] = Content.Building;
  map.contentRef[gate] = ride.id;
  ride[cmd.kind] = { gate, outside };
  const warnings: string[] = [];
  if (cmd.kind === 'entrance' && (outside < 0 || map.content[outside] !== Content.Queue)) warnings.push(TRACK_WARN.entranceNeedsQueue);
  if (cmd.kind === 'exit' && (outside < 0 || map.content[outside] !== Content.Footpath)) warnings.push(TRACK_WARN.exitNeedsFootpath);
  markNetworkDirty(world);
  return ok(0, warnings);
}

function setTrainConfig(world: World, cmd: Cmd<'setTrainConfig'>, ctx: CommandContext): CommandResult {
  const tc = trackContext(world, cmd.rideId);
  if (!tc) return fail(TRACK_ERR.noRide);
  const { ride, data, type } = tc;
  const block = configBlock(ride, data);
  if (block) return fail(block);
  const v = type.vehicle;
  if (!Number.isInteger(cmd.carsPerTrain) || cmd.carsPerTrain < v.carsMin || cmd.carsPerTrain > v.carsMax) {
    return fail(fillTrackString(TRACK_ERR.carsRange, { min: v.carsMin, max: v.carsMax }));
  }
  if (!Number.isInteger(cmd.trains) || cmd.trains < 1 || cmd.trains > v.maxTrains) {
    return fail(fillTrackString(TRACK_ERR.trainsRange, { n: v.maxTrains }));
  }
  const delta = (cmd.trains - data.trainConfig.trains) * type.costs.extraTrain;
  if (delta > 0 && !canAfford(world, delta, ctx)) return fail(TRACK_ERR.notEnoughCash);
  let refund = 0;
  if (delta > 0) pay(world, delta, 'construction', ctx);
  else if (delta < 0) {
    refund = Math.floor(-delta * refundShare(data));
    if (!ctx.setup && refund > 0) recordLedger(world, 'demolitionRefunds', refund);
  }
  ride.totalBuildCost += delta;
  data.trainConfig = { trains: cmd.trains, carsPerTrain: cmd.carsPerTrain };
  clearTest(ride, data);
  if (ride.status !== 'building') data.trains = [];
  return ok(delta > 0 ? delta : -refund);
}

function setTrackOperation(world: World, cmd: Cmd<'setTrackOperation'>, _ctx: CommandContext): CommandResult {
  const tc = trackContext(world, cmd.rideId);
  if (!tc) return fail(TRACK_ERR.noRide);
  const inRange = (x: number, r: { min: number; max: number }): boolean => Number.isInteger(x) && x >= r.min && x <= r.max;
  if (!inRange(cmd.minDwellS, MIN_DWELL_RANGE_S) || !inRange(cmd.maxDwellS, MAX_DWELL_RANGE_S) || !inRange(cmd.laps, LAPS_RANGE)) {
    return fail(TRACK_ERR.operationRange);
  }
  tc.data.operation = { minDwellTicks: cmd.minDwellS * TICKS_PER_S, maxDwellTicks: cmd.maxDwellS * TICKS_PER_S, laps: cmd.laps };
  return ok(0);
}

function setTrackColours(world: World, cmd: Cmd<'setTrackColours'>, _ctx: CommandContext): CommandResult {
  const tc = trackContext(world, cmd.rideId);
  if (!tc) return fail(TRACK_ERR.noRide);
  const okColour = (c: number): boolean => Number.isInteger(c) && c >= 0 && c < COLOUR_COUNT;
  if (!okColour(cmd.track) || !okColour(cmd.supports) || !okColour(cmd.cars)) return fail(TRACK_ERR.colourRange);
  tc.data.colours = { track: cmd.track, supports: cmd.supports, cars: cmd.cars };
  return ok(0);
}

/** Why a test (or opening) is not possible because of the station or train count, or null. */
export function trainCountBlock(data: TrackRideData, typeId: string): string | null {
  const type = getTrackTypeDef(typeId);
  if (!type) return TRACK_ERR.unknownType;
  const layout = getLayout(data);
  const need = Math.ceil((data.trainConfig.carsPerTrain * type.vehicle.carLengthMm) / TILE_MM);
  if (layout.stationCount < need) return fillTrackString(TRACK_ERR.stationTooShort, { n: need });
  // Phase 6 stops (Monorail): every stop holds the whole train too.
  for (const r of layout.stopRuns) if (r.end - r.start < need) return fillTrackString(TRACK_ERR.stationTooShort, { n: need });
  if (type.drive === 'guestDriven') {
    const maxKarts = Math.min(KART_MAX, layout.stationCount * KARTS_PER_STATION_TILE);
    if (data.trainConfig.trains > maxKarts) {
      return fillTrackString(TRACK_ERR.stationTooShort, { n: Math.ceil(data.trainConfig.trains / KARTS_PER_STATION_TILE) });
    }
  }
  // Water rides (Phase 4 §4.4): 1 boat per station tile.
  if (type.medium === 'water' && data.trainConfig.trains > layout.stationCount) {
    return fillTrackString(TRACK_ERR.stationTooShort, { n: data.trainConfig.trains });
  }
  if (type.drive === 'gravity' && data.trainConfig.trains > 1) {
    if (data.trainConfig.trains > layout.blockBrakeCount) return TRACK_ERR.tooManyTrains;
    // Each block section must hold a whole train (plus the 1 m margin), or a held train would sit in two
    // blocks at once and the trains could block each other for good.
    const P = layout.blockPoints;
    const need = data.trainConfig.carsPerTrain * type.vehicle.carLengthMm + BLOCK_MARGIN_MM + 1;
    for (let k = 0; k < P.length; k++) {
      const a = P[k] as number;
      const b = P[(k + 1) % P.length] as number;
      const blen = (((b - a) % layout.lengthMm) + layout.lengthMm) % layout.lengthMm || layout.lengthMm;
      if (blen < need) return TRACK_ERR.tooManyTrains;
    }
  }
  return null;
}

function startTestRun(world: World, cmd: Cmd<'startTestRun'>, _ctx: CommandContext): CommandResult {
  const tc = trackContext(world, cmd.rideId);
  if (!tc) return fail(TRACK_ERR.noRide);
  const { ride, data, type } = tc;
  const block = configBlock(ride, data);
  if (block) return fail(block);
  if (!data.circuitClosed) return fail(TRACK_ERR.circuitNotComplete);
  const tb = trainCountBlock(data, type.id);
  if (tb) return fail(tb);
  // R7: the lap's safety findings are kept with its result (derived, never saved), so publishing needs no re-run.
  const detail = runTestLapDetailed(world.state.map, data, type);
  rememberTestLapDetail(detail);
  const result = detail.result;
  ride.status = 'testing';
  ride.stats = null;
  data.test = null;
  data.testRun = { ticksLeft: result.ticks, result };
  data.trains = [dispatchedTestTrain(getLayout(data), type, data.trainConfig.carsPerTrain)];
  return ok(0);
}

function editTrack(world: World, cmd: Cmd<'editTrack'>, _ctx: CommandContext): CommandResult {
  const tc = trackContext(world, cmd.rideId);
  if (!tc) return fail(TRACK_ERR.noRide);
  const { ride, data } = tc;
  const block = editBlock(ride, data);
  if (block) return fail(block);
  if (ride.status !== 'building') enterBuilding(ride, data);
  return ok(0);
}

export const trackHandlers: HandlerMap<TrackCommand> = {
  placeStation,
  addTrackPiece,
  removeLastTrackPiece,
  setPieceOptions,
  placeTrackGate,
  setTrainConfig,
  setTrackOperation,
  setTrackColours,
  startTestRun,
  editTrack,
};
