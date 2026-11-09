/**
 * Shared test helpers (Wave 0). Owner: integrator.
 * "Direct" helpers write state without commands so tests of one system do not depend on another.
 */
import { createWorld } from '../../src/sim/world';
import { Content, tileIndex } from '../../src/sim/map';
import { allocId } from '../../src/sim/ids';
import { stepTick } from '../../src/sim/tick';
import { getFlatRideDef, getStallDef } from '../../src/data/catalog';
import { flatRideGates, footprintTiles, stallServiceTile } from '../../src/sim/footprint';
import { INSPECT_DEFAULT, REL_MAX } from '../../src/data/tuning/staff';
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

/** Add a guest standing on `tile` with neutral needs. Override any field with `patch`. */
export function addGuestDirect(world: World, tile: number, patch: Partial<Guest> = {}): Guest {
  const s = world.state;
  const id = allocId(s);
  const guest: Guest = {
    id,
    tile,
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
