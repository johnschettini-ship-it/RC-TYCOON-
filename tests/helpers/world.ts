/**
 * Shared test helpers (Wave 0). Owner: integrator.
 * "Direct" helpers write state without commands so tests of one system do not depend on another.
 */
import { createWorld } from '../../src/sim/world';
import { GROUND_LEVEL } from '../../src/data/tuning/core';
import { Content, tileIndex } from '../../src/sim/map';
import { allocId } from '../../src/sim/ids';
import { stepTick } from '../../src/sim/tick';
import { getFlatRideDef, getStallDef } from '../../src/data/catalog';
import { flatRideGates, footprintTiles, stallServiceTile } from '../../src/sim/footprint';
import { INSPECT_DEFAULT, REL_MAX } from '../../src/data/tuning/staff';
import { getTrackPieceDef, getTrackTypeDef } from '../../src/data/track';
import {
  BRAKE_SPEED,
  DEFAULT_MAX_DWELL_TICKS,
  DEFAULT_MIN_DWELL_TICKS,
  LAPS_RANGE,
  TEST_CHART_EVERY_TICKS,
} from '../../src/data/tuning/track';
import { jointsEqual, pieceEntryJoint, pieceExitJoint, trackDirFromMapDir } from '../../src/sim/rides/track/geometry';
import type { TestResult, TrackDir, TrackPieceInstance, TrackRideData } from '../../src/sim/rides/track/types';
import type { World } from '../../src/sim/types';
import type { Ride } from '../../src/sim/rides/types';
import type { Stall } from '../../src/sim/stalls/types';
import type { Guest } from '../../src/sim/guests/types';
import type { Dir } from '../../src/sim/map';

export function makeTestWorld(seed = 12345, parkName = 'Test Park'): World {
  return createWorld({ seed, parkName });
}

export function placeFootpath(world: World, x: number, y: number): number {
  const i = tileIndex(world.state.map, x, y);
  world.state.map.content[i] = Content.Footpath;
  return i;
}

export function placeQueue(world: World, x: number, y: number): number {
  const i = tileIndex(world.state.map, x, y);
  world.state.map.content[i] = Content.Queue;
  return i;
}

/**
 * Place a flat ride without a command (geometry from src/sim/footprint.ts; rotation 0 = front faces south).
 * Marks footprint tiles as Building and sets gates per the catalog legend rule.
 */
export function placeRideDirect(world: World, defId: string, x: number, y: number, rotation: Dir = 0): Ride {
  const def = getFlatRideDef(defId);
  if (!def) throw new Error(`Unknown flat ride ${defId}`);
  const s = world.state;
  const map = s.map;
  const id = allocId(s);
  const tiles = footprintTiles(map, x, y, def.w, def.d, rotation);
  if (!tiles) throw new Error('Footprint outside the map');
  for (const i of tiles) {
    map.content[i] = Content.Building;
    map.contentRef[i] = id;
  }
  const gates = flatRideGates(map, x, y, def.w, def.d, rotation);
  const ride: Ride = {
    id,
    kind: 'flat',
    defId,
    name: def.name,
    x,
    y,
    rotation,
    status: 'closed',
    price: def.defaultPrice,
    entrance: gates.entrance,
    exit: gates.exit,
    stats: { excitement: def.excitement, intensity: def.intensity, nausea: def.nausea },
    queue: [],
    riders: [],
    cycle: { phase: 'waiting', ticks: 0 },
    totals: { riders: 0, income: 0, ridersThisMonth: 0, incomeThisMonth: 0 },
    builtTick: s.tick,
    hoursThisMonth: 0,
    reliability: REL_MAX,
    lastInspectionTick: s.tick,
    inspectionIntervalTicks: INSPECT_DEFAULT,
    breakdownType: null,
    statusBeforeBreakdown: null,
    breakdownsThisMonth: 0,
    lastBreakdownTick: -1,
    assignedMechanicId: null,
    totalBuildCost: def.buildCost,
  };
  s.rides.push(ride);
  return ride;
}

/** Place a 1×1 stall whose service side faces `rotation` (0 = north), without a command. */
export function placeStallDirect(world: World, defId: string, x: number, y: number, rotation: Dir = 2): Stall {
  const def = getStallDef(defId);
  if (!def) throw new Error(`Unknown stall ${defId}`);
  const s = world.state;
  const map = s.map;
  const id = allocId(s);
  const i = tileIndex(map, x, y);
  map.content[i] = Content.Building;
  map.contentRef[i] = id;
  const stall: Stall = {
    id,
    defId,
    name: def.name,
    x,
    y,
    rotation,
    serviceTile: stallServiceTile(map, x, y, rotation),
    price: def.defaultPrice,
    open: true,
    servingGuest: -1,
    totals: { sales: 0, income: 0, salesThisMonth: 0, incomeThisMonth: 0 },
    builtTick: s.tick,
    hoursThisMonth: 0,
    totalBuildCost: def.buildCost,
  };
  s.stalls.push(stall);
  return stall;
}

/**
 * Track pieces laid joint to joint with the track module's own geometry (`pieceExitJoint`): the first piece enters
 * at tile (x, y), rail height z (absolute m), heading `dir` (a `TrackDir`: 0 = +x, 1 = +y, 2 = −x, 3 = −y).
 * Brakes get the default brake speed; costs are 0. The map is not changed.
 */
export function trackPiecesDirect(x: number, y: number, z: number, dir: TrackDir, defIds: readonly string[]): TrackPieceInstance[] {
  const pieces: TrackPieceInstance[] = [];
  let at = { x, y, z, dir };
  for (const defId of defIds) {
    const def = getTrackPieceDef(defId);
    if (!def) throw new Error(`Unknown track piece ${defId}`);
    const p: TrackPieceInstance = {
      defId,
      x: at.x,
      y: at.y,
      z: at.z,
      dir: at.dir,
      chain: false,
      brakeSpeed: def.special === 'brakes' ? BRAKE_SPEED.default : null,
      cost: 0,
    };
    pieces.push(p);
    at = pieceExitJoint(p);
  }
  return pieces;
}

/**
 * The track slice entry of a track ride, without commands, in the full W1-G shape. Default pieces: 3 station tiles
 * from the ride origin at ground height, heading `ride.rotation` (a map `Dir`). `circuitClosed` follows the
 * geometry; no trains, no test. Stores the entry in `world.state.track.rides` and returns it. Override with `patch`.
 */
export function makeTrackRideDataDirect(world: World, ride: Ride, patch: Partial<TrackRideData> = {}): TrackRideData {
  const type = getTrackTypeDef(ride.defId);
  if (!type) throw new Error(`Unknown track ride type ${ride.defId}`);
  const map = world.state.map;
  const ground = map.heights[tileIndex(map, ride.x, ride.y)] as number;
  const pieces = patch.pieces ?? trackPiecesDirect(ride.x, ride.y, ground, trackDirFromMapDir(ride.rotation), ['station', 'station', 'station']);
  const first = pieces[0];
  const last = pieces[pieces.length - 1];
  const data: TrackRideData = {
    rideId: ride.id,
    typeId: type.id,
    pieces,
    circuitClosed: !!first && !!last && jointsEqual(pieceExitJoint(last), pieceEntryJoint(first)),
    trainConfig: { trains: 1, carsPerTrain: type.vehicle.defaultCars },
    operation: { minDwellTicks: DEFAULT_MIN_DWELL_TICKS, maxDwellTicks: DEFAULT_MAX_DWELL_TICKS, laps: LAPS_RANGE.default },
    trains: [],
    test: null,
    colours: { ...type.render.colours },
    openedOnce: false,
    testRun: null,
    lastDispatchTick: -1,
    bestLapTicks: null,
    ...patch,
  };
  world.state.track.rides[String(ride.id)] = data;
  return data;
}

/**
 * A passed `TestResult` in the W1-G units (mm, mm/s, ticks, hundredths) with the measured values of reference
 * circuit R1 (phase-2 §4.10 worked example). Override any field with `patch`.
 */
export function testResultDirect(patch: Partial<TestResult> = {}): TestResult {
  return {
    passed: true,
    failPiece: null,
    failKind: null,
    ticks: 965,
    vMaxMms: 17_411,
    vAvgMms: 4_236,
    rideTimeTicks: 965,
    lengthMm: 204_374,
    drops: 1,
    dropMaxMm: 16_000,
    posGMax: 225,
    vertGMin: 23,
    airtimeTicks: 0,
    latMax: 65,
    inversions: 0,
    highestM: 16,
    turnPieces: 4,
    smallTurns: 0,
    spookyTunnels: 0,
    laps: 1,
    excitement: 500,
    intensity: 346,
    nausea: 142,
    penalty: false,
    chart: { every: TEST_CHART_EVERY_TICKS, speedCms: [200, 1741, 800], gv: [100, 225, 23], gl: [0, 65, 0] },
    ...patch,
  };
}

/** Add a guest standing on `tile` with neutral needs. Override any field with `patch`. */
export function addGuestDirect(world: World, tile: number, patch: Partial<Guest> = {}): Guest {
  const s = world.state;
  const id = allocId(s);
  const guest: Guest = {
    id,
    tile,
    z: tile >= 0 ? (s.map.heights[tile] as number) : GROUND_LEVEL,
    nextTile: -1,
    progress: 0,
    dir: 0,
    lane: id % 4,
    state: 'walking',
    stateTicks: 0,
    target: null,
    cash: 8000,
    needs: { hunger: 40, thirst: 40, bladder: 20, energy: 230, happiness: 180, nausea: 0 },
    temperament: 50,
    thoughts: [],
    thoughtCooldowns: {},
    ridden: {},
    spent: 0,
    items: { map: false, umbrella: false, balloon: false },
    nextDecisionTick: s.tick,
    lostSinceTick: -1,
    noRideStreak: 0,
    seat: null,
    activityId: -1,
    trashTimer: 0,
    withdrawals: 0,
    lostSteps: 0,
    bestDistance: -1,
    lostTarget: null,
    wetUntilTick: -1,
    ...patch,
  };
  s.guests.push(guest);
  return guest;
}

export function runTicks(world: World, n: number): void {
  for (let k = 0; k < n; k++) stepTick(world);
}

/** Stable 32-bit FNV-1a hash of the full game state (typed arrays included). */
export function stateHash(world: World): string {
  const json = JSON.stringify(world.state, (_k, v: unknown) => {
    if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>);
    return v;
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
