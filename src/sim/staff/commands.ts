/** Owner: W1-H. Staff and path-item commands (phase-3-management.md §6). */
import { STAFF_FIRST_NAMES, STAFF_INITIALS } from '../../data/names';
import { STAFF } from '../../data/catalog/people';
import { STAFF_ERRORS } from '../../data/strings/staff';
import { STAFF_MAX } from '../../data/tuning/staff';
import { fail, ok, type CommandResult, type HandlerMap, type StaffCommand } from '../commands/types';
import { canAfford, pay, type CommandContext } from '../economy/ledger';
import { allocId } from '../ids';
import { pathItemCode, pathItemDefById, isBroken, repairCost, setBroken } from '../litter/pathItems';
import { standUpFromBench } from '../litter/benches';
import { Content, inBounds, isOwned, neighbour, PathItem, tileIndex, type Dir } from '../map';
import { isWalkable } from '../pathing';
import { rngInt } from '../rng';
import type { World } from '../types';
import { findRide, findStaff, indexById } from './lookup';
import { abortInspection, releaseFix } from './mechanics';
import { createPatrol, patrolIsEmpty, patrolSet } from './patrol';
import type { Staff } from './types';
import { BUILD_MAX_PHASE } from '../../data/tuning/management';

/** Path items of later phases (the Phase 4 lamp) come with the build's content phase (W3-D raises it). */
const PHASE = BUILD_MAX_PHASE;
const err = STAFF_ERRORS;

/** The walkable tile next to the park entrance (N, E, S, W order), else the entrance tile. */
export function staffSpawnTile(world: World): number {
  const map = world.state.map;
  const e = map.entranceTile;
  for (const dir of [0, 1, 2, 3] as Dir[]) {
    const n = neighbour(map, e, dir);
    if (n >= 0 && isWalkable(world, n, 'staff')) return n;
  }
  return e;
}

export function staffName(world: World): string {
  const first = STAFF_FIRST_NAMES[rngInt(world.state, 0, STAFF_FIRST_NAMES.length - 1)] as string;
  const initial = STAFF_INITIALS.charAt(rngInt(world.state, 0, STAFF_INITIALS.length - 1));
  return `${first} ${initial}.`;
}

function charged(cost: number, ctx: CommandContext): number {
  return ctx.setup ? 0 : cost;
}

/** Remove a staff member: a Mechanic's breakdown goes back to the front of the queue (§4.2 Fire). */
export function removeStaff(world: World, s: Staff): void {
  if (s.type === 'mechanic') {
    if (s.state === 'inspecting') abortInspection(world, s);
    releaseFix(world, s, true);
  }
  const members = world.state.staff.members;
  const i = indexById(members, s.id);
  if (i >= 0) members.splice(i, 1);
}

function footpathTile(world: World, x: number, y: number): number {
  const map = world.state.map;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(map, x, y)) return -1;
  const i = tileIndex(map, x, y);
  return map.content[i] === Content.Footpath ? i : -1;
}

function itemTile(world: World, x: number, y: number): number {
  const map = world.state.map;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(map, x, y)) return -1;
  const i = tileIndex(map, x, y);
  return map.pathItem[i] !== PathItem.None ? i : -1;
}

function brokenItemTiles(world: World): number[] {
  const map = world.state.map;
  const out: number[] = [];
  for (let i = 0; i < map.pathItem.length; i++) {
    if (map.pathItem[i] !== PathItem.None && isBroken(map, i)) out.push(i);
  }
  return out;
}

/** Repair one broken item now: pay to `repairs` and clear the flag. */
export function repairItem(world: World, tile: number, ctx: CommandContext): number {
  const map = world.state.map;
  const cost = repairCost(map.pathItem[tile] ?? 0);
  pay(world, cost, 'repairs', ctx);
  setBroken(map, tile, false);
  return charged(cost, ctx);
}

export const staffHandlers: HandlerMap<StaffCommand> = {
  hireStaff(world, cmd, ctx): CommandResult {
    const def = STAFF.find((d) => d.id === cmd.staffType);
    if (!def) return fail(err.staffNotFound);
    const s = world.state;
    if (s.staff.members.length >= STAFF_MAX) return fail(err.staffLimit);
    if (!canAfford(world, def.hireCost, ctx)) return fail(err.notEnoughCash);
    pay(world, def.hireCost, 'staffHiring', ctx);
    const id = allocId(s);
    const tile = staffSpawnTile(world);
    const member: Staff = {
      id,
      type: def.id,
      name: staffName(world),
      tile,
      z: s.map.heights[tile] as number,
      nextTile: -1,
      progress: 0,
      dir: 0,
      state: 'walking',
      stateTicks: 0,
      targetTile: -1,
      targetRideId: -1,
      patrol: null,
      costume: null,
      hiredTick: s.tick,
      hoursThisMonth: 0,
      task: 'none',
      route: [],
      prevTile: -1,
      nextRecheckTick: s.tick,
      fixRideId: -1,
      savedRideStatus: null,
      walkTicksLeft: 0,
    };
    s.staff.members.push(member);
    return ok(charged(def.hireCost, ctx), [], id);
  },

  fireStaff(world, cmd): CommandResult {
    const s = findStaff(world, cmd.staffId);
    if (!s) return fail(err.staffNotFound);
    removeStaff(world, s);
    return ok(0);
  },

  editPatrol(world, cmd): CommandResult {
    const s = findStaff(world, cmd.staffId);
    if (!s) return fail(err.staffNotFound);
    const map = world.state.map;
    const n = map.width * map.height;
    const valid = (t: number): boolean => Number.isInteger(t) && t >= 0 && t < n;
    for (const t of cmd.add) if (!valid(t) || !isOwned(map, t)) return fail(err.outsidePark);
    for (const t of cmd.remove) if (!valid(t)) return fail(err.outsidePark);
    const patrol = s.patrol ? s.patrol.slice() : createPatrol(map);
    for (const t of cmd.add) patrolSet(patrol, t, true);
    for (const t of cmd.remove) patrolSet(patrol, t, false);
    s.patrol = patrolIsEmpty(patrol) ? null : patrol;
    s.nextRecheckTick = world.state.tick;
    return ok(0);
  },

  clearPatrol(world, cmd): CommandResult {
    const s = findStaff(world, cmd.staffId);
    if (!s) return fail(err.staffNotFound);
    s.patrol = null;
    return ok(0);
  },

  setCostume(world, cmd): CommandResult {
    const s = findStaff(world, cmd.staffId);
    if (!s) return fail(err.staffNotFound);
    if (s.type !== 'performer') return fail(err.onlyPerformers);
    s.costume = cmd.costume;
    return ok(0);
  },

  setInspectionInterval(world, cmd): CommandResult {
    const ride = findRide(world, cmd.rideId);
    if (!ride) return fail(err.rideNotFound);
    const t = cmd.intervalTicks;
    ride.inspectionIntervalTicks = Number.isFinite(t) && t > 0 ? Math.floor(t) : 0;
    return ok(0);
  },

  buildPathItem(world, cmd, ctx): CommandResult {
    const def = pathItemDefById(cmd.itemType);
    if (!def || def.phase > PHASE) return fail(err.notUnlocked);
    // Phase 4 §4.2 (W3-B): `level` = the elevated footpath that holds the item; 0 or absent = the ground footpath.
    const level = cmd.level ?? 0;
    const map = world.state.map;
    const holder = level === 0 ? undefined : world.state.elevatedPaths.find((e) => e.id === level);
    const onHolder = !!holder && holder.x === cmd.x && holder.y === cmd.y && holder.kind === 'footpath';
    const tile = level === 0 ? footpathTile(world, cmd.x, cmd.y) : onHolder ? tileIndex(map, cmd.x, cmd.y) : -1;
    if (tile < 0) return fail(err.needsFootpath);
    if (map.pathItem[tile] !== PathItem.None) return fail(err.tileHasItem);
    if (!canAfford(world, def.buildCost, ctx)) return fail(err.notEnoughCash);
    pay(world, def.buildCost, 'construction', ctx);
    map.pathItem[tile] = pathItemCode(def.id);
    map.pathItemFlags[tile] = 0;
    map.binFill[tile] = 0;
    map.pathItemLevel[tile] = level;
    return ok(charged(def.buildCost, ctx));
  },

  removePathItem(world, cmd): CommandResult {
    const tile = itemTile(world, cmd.x, cmd.y);
    if (tile < 0) return fail(err.noItem);
    const map = world.state.map;
    if (map.pathItem[tile] === PathItem.Bench) standUpFromBench(world, tile);
    map.pathItem[tile] = PathItem.None;
    map.pathItemFlags[tile] = 0;
    map.binFill[tile] = 0;
    map.pathItemLevel[tile] = 0;
    return ok(0);
  },

  repairPathItem(world, cmd, ctx): CommandResult {
    const tile = itemTile(world, cmd.x, cmd.y);
    const map = world.state.map;
    if (tile < 0 || !isBroken(map, tile)) return fail(err.notBroken);
    if (!canAfford(world, repairCost(map.pathItem[tile] ?? 0), ctx)) return fail(err.notEnoughCash);
    return ok(repairItem(world, tile, ctx));
  },

  repairAllPathItems(world, _cmd, ctx): CommandResult {
    const tiles = brokenItemTiles(world);
    if (tiles.length === 0) return fail(err.nothingToRepair);
    const map = world.state.map;
    const total = tiles.reduce((sum, t) => sum + repairCost(map.pathItem[t] ?? 0), 0);
    if (!canAfford(world, total, ctx)) return fail(err.notEnoughCash);
    let paid = 0;
    for (const t of tiles) paid += repairItem(world, t, ctx);
    return ok(paid);
  },

  setAutoRepair(world, cmd): CommandResult {
    world.state.staff.autoRepair = cmd.on === true;
    return ok(0);
  },
};

export { brokenItemTiles };
