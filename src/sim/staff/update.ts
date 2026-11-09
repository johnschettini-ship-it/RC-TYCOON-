/** Owner: W1-H. Phase 3 §4.2 staff behaviour, wages, and auto-repair. Staff update in ascending id order. */
import { HOURS_PER_MONTH } from '../../data/tuning/core';
import { STAFF_MESSAGES } from '../../data/strings/staff';
import {
  BIN_EMPTY_TICKS,
  MESS_CLEAN_TICKS,
  PERFORMER_SHOW_TICKS,
  PERFORMER_WALK_TICKS_MAX,
  PERFORMER_WALK_TICKS_MIN,
  STAFF_RECHECK_TICKS,
  SWEEP_TICKS_PER_LITTER,
} from '../../data/tuning/staff';
import { hourlyShare, recordLedger } from '../economy/ledger';
import { isBroken, repairCost, setBroken } from '../litter/pathItems';
import { standUpFromBench } from '../litter/benches';
import { Content, neighbour, PathItem, type Dir, type MapState } from '../map';
import { notify } from '../notifications';
import { isWalkable } from '../pathing';
import { rngInt } from '../rng';
import { invalidateGuestIndex } from '../spatial';
import { dayIndexOf, hourOfMonth, isMonthStart } from '../time';
import type { World } from '../types';
import { staffSpawnTile } from './commands';
import { findRide, serviceTile, staffDef } from './lookup';
import { completeFix, fixDurationTicks, updateInspecting } from './mechanics';
import { inPatrol, patrolHas } from './patrol';
import { applyPlan, groundskeeperPriority, planFor } from './tasks';
import type { Staff, StaffStateName } from './types';

const DIRS: readonly Dir[] = [0, 1, 2, 3];

export function updateStaff(world: World): void {
  const st = world.state;
  if (isMonthStart(st.tick)) {
    for (const r of st.rides) r.breakdownsThisMonth = 0;
  }
  // Guests moved earlier this tick: radius counts must see their new tiles.
  invalidateGuestIndex(world);
  for (const s of st.staff.members.slice()) stepStaff(world, s);
}

function stepStaff(world: World, s: Staff): void {
  if (s.type === 'performer' && s.state === 'walking' && s.walkTicksLeft > 0) s.walkTicksLeft -= 1;
  if (s.state === 'walking') walk(world, s);
  else if (s.state === 'inspecting') updateInspecting(world, s);
  else timed(world, s);
}

function idle(s: Staff): void {
  s.state = 'walking';
  s.stateTicks = 0;
  s.task = 'none';
  s.targetTile = -1;
  s.targetRideId = -1;
  s.route = [];
}

function begin(s: Staff, state: StaffStateName, ticks: number): void {
  s.state = state;
  s.stateTicks = Math.max(1, ticks);
  s.route = [];
}

function timed(world: World, s: Staff): void {
  s.stateTicks -= 1;
  if (s.stateTicks > 0) return;
  const map = world.state.map;
  switch (s.state) {
    case 'sweeping':
      map.litter[s.tile] = 0;
      break;
    case 'cleaning':
      map.mess[s.tile] = 0;
      break;
    case 'emptying':
      map.binFill[s.tile] = 0;
      break;
    case 'fixing':
      completeFix(world, s);
      return;
    case 'performing':
      s.walkTicksLeft = rngInt(world.state, PERFORMER_WALK_TICKS_MIN, PERFORMER_WALK_TICKS_MAX);
      break;
    default:
      break;
  }
  idle(s);
}

function walk(world: World, s: Staff): void {
  if (s.nextTile !== -1) {
    s.progress += 1;
    if (s.progress < staffDef(s.type).ticksPerTile) return;
    s.prevTile = s.tile;
    s.tile = s.nextTile;
    s.nextTile = -1;
    s.progress = 0;
  }
  atTile(world, s);
}

function arrived(s: Staff): boolean {
  return s.task !== 'none' && s.task !== 'wander' && s.targetTile === s.tile && s.route.length === 0;
}

function shouldRecheck(s: Staff): boolean {
  if (s.task === 'wander') return true;
  return s.type === 'groundskeeper' && (s.task === 'sweep' || s.task === 'bin');
}

/** At a tile boundary: start work on arrival, re-plan when needed, then take the next step. */
function atTile(world: World, s: Staff): void {
  const now = world.state.tick;
  if (!isWalkable(world, s.tile, 'staff')) {
    recover(world, s);
    return;
  }
  if (arrived(s)) {
    if (startWork(world, s)) return;
    s.task = 'none';
  }
  const performerReady = s.type === 'performer' && s.task === 'wander' && s.walkTicksLeft === 0;
  if (s.task === 'none' || (s.task !== 'wander' && s.route.length === 0) || performerReady) {
    applyPlan(world, s, planFor(world, s));
  } else if (now >= s.nextRecheckTick && shouldRecheck(s)) {
    const p = planFor(world, s);
    if (s.task === 'wander' || groundskeeperPriority(p.task) < groundskeeperPriority(s.task)) applyPlan(world, s, p);
    else s.nextRecheckTick = now + STAFF_RECHECK_TICKS;
  }
  if (arrived(s)) {
    if (!startWork(world, s)) idle(s);
    return;
  }
  stepNext(world, s);
}

function dirBetween(map: MapState, from: number, to: number): Dir {
  for (const d of DIRS) if (neighbour(map, from, d) === to) return d;
  return 0;
}

function stepNext(world: World, s: Staff): void {
  const map = world.state.map;
  let next = -1;
  if (s.route.length > 0) {
    next = s.route[0] as number;
    if (!isWalkable(world, next, 'staff') || !DIRS.some((d) => neighbour(map, s.tile, d) === next)) {
      // The path changed under the route: plan again at the next tick.
      s.route = [];
      s.task = 'none';
      return;
    }
    s.route.shift();
  } else if (s.task === 'wander') {
    next = wanderStep(world, s);
  }
  if (next < 0) return;
  s.dir = dirBetween(map, s.tile, next);
  s.nextTile = next;
  s.progress = 0;
}

/** §4.2 Wandering: a random walkable neighbour inside the patrol, not the tile it came from unless at a dead end. */
function wanderStep(world: World, s: Staff): number {
  const map = world.state.map;
  const area = s.patrol !== null && patrolHas(s.patrol, s.tile) ? s.patrol : null;
  const opts: number[] = [];
  for (const d of DIRS) {
    const n = neighbour(map, s.tile, d);
    if (n >= 0 && inPatrol(area, n) && isWalkable(world, n, 'staff')) opts.push(n);
  }
  if (opts.length === 0) return -1;
  const forward = opts.filter((t) => t !== s.prevTile);
  const pool = forward.length > 0 ? forward : opts;
  return pool.length === 1 ? (pool[0] as number) : (pool[rngInt(world.state, 0, pool.length - 1)] as number);
}

/** The tile under the staff member is no longer walkable: step off it, or return to the entrance. */
function recover(world: World, s: Staff): void {
  const map = world.state.map;
  s.route = [];
  if (s.task !== 'fix') s.task = 'none';
  for (const d of DIRS) {
    const n = neighbour(map, s.tile, d);
    if (n >= 0 && isWalkable(world, n, 'staff')) {
      s.dir = d;
      s.nextTile = n;
      s.progress = 0;
      return;
    }
  }
  s.prevTile = -1;
  s.tile = staffSpawnTile(world);
}

function startWork(world: World, s: Staff): boolean {
  const map = world.state.map;
  const t = s.tile;
  switch (s.task) {
    case 'sweep': {
      const n = map.litter[t] as number;
      if (n <= 0) return false;
      begin(s, 'sweeping', n * SWEEP_TICKS_PER_LITTER);
      return true;
    }
    case 'mess':
      if ((map.mess[t] as number) <= 0) return false;
      begin(s, 'cleaning', MESS_CLEAN_TICKS);
      return true;
    case 'bin':
      if (map.pathItem[t] !== PathItem.Bin || (map.binFill[t] as number) <= 0) return false;
      begin(s, 'emptying', BIN_EMPTY_TICKS);
      return true;
    case 'fix': {
      const ride = findRide(world, s.fixRideId);
      if (!ride || ride.status !== 'broken' || ride.assignedMechanicId !== s.id || serviceTile(ride) !== t) return false;
      s.targetRideId = ride.id;
      begin(s, 'fixing', fixDurationTicks(ride));
      return true;
    }
    case 'inspect': {
      const ride = findRide(world, s.targetRideId);
      if (!ride || serviceTile(ride) !== t || (ride.status !== 'open' && ride.status !== 'closed')) return false;
      s.state = 'inspecting';
      s.stateTicks = 0;
      s.savedRideStatus = null;
      s.route = [];
      return true;
    }
    case 'perform':
      begin(s, 'performing', PERFORMER_SHOW_TICKS);
      return true;
    default:
      return false;
  }
}

/** Hour start: wages (hourly charge rule, R9/R20), orphan cleanup, and auto-repair (§4.4). */
export function hourlyStaff(world: World): void {
  chargeWages(world);
  clearOrphans(world);
  if (world.state.staff.autoRepair) autoRepair(world);
}

/**
 * Path items live only on footpaths, litter and mess only on footpaths and queues (§4.3).
 * When a path is demolished or turned into a queue, what can no longer be there is removed.
 */
function clearOrphans(world: World): void {
  const map = world.state.map;
  const { content, pathItem, pathItemFlags, binFill, litter, mess } = map;
  // Local copies keep the hourly 4,096-tile scan tight (master §10 hour-start budget).
  const footpath = Content.Footpath;
  const queue = Content.Queue;
  const none = PathItem.None;
  const n = content.length;
  for (let i = 0; i < n; i++) {
    const c = content[i];
    if (c === footpath) continue; // every item, litter and mess may stay on a footpath
    if (pathItem[i] !== none) {
      if (pathItem[i] === PathItem.Bench) standUpFromBench(world, i);
      pathItem[i] = none;
      pathItemFlags[i] = 0;
      binFill[i] = 0;
    }
    if (c !== queue && ((litter[i] as number) > 0 || (mess[i] as number) > 0)) {
      litter[i] = 0;
      mess[i] = 0;
    }
  }
}

function chargeWages(world: World): void {
  const h = hourOfMonth(world.state.tick);
  for (const s of world.state.staff.members) {
    if (h === 0) s.hoursThisMonth = 0;
    const allMonth = h === HOURS_PER_MONTH - 1 && s.hoursThisMonth === HOURS_PER_MONTH - 1;
    const amount = hourlyShare(staffDef(s.type).wageMonthly, h, allMonth);
    if (amount > 0) recordLedger(world, 'wages', -amount);
    s.hoursThisMonth += 1;
  }
}

function autoRepair(world: World): void {
  const map = world.state.map;
  let short = false;
  const { pathItem, pathItemFlags } = map;
  const n = pathItem.length;
  for (let i = 0; i < n; i++) {
    // Only items with the broken flag cost anything; most tiles fail the first test (hourly scan).
    if (pathItemFlags[i] === 0 || pathItem[i] === PathItem.None || !isBroken(map, i)) continue;
    const cost = repairCost(map.pathItem[i] as number);
    if (world.state.park.cash >= cost) {
      if (cost > 0) recordLedger(world, 'repairs', -cost);
      setBroken(map, i, false);
    } else {
      short = true;
    }
  }
  if (!short) return;
  const day = dayIndexOf(world.state.tick);
  if (world.state.staff.repairNoticeDay === day) return;
  world.state.staff.repairNoticeDay = day;
  notify(world, 'park', STAFF_MESSAGES.repairNoCash);
}
