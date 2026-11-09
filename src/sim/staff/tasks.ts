/**
 * Owner: W1-H. Task selection per staff type (Phase 3 §4.2 priority table).
 * Local searches are BFS over staff-walkable tiles inside the patrol (Phase 3 §4.1).
 */
import {
  BIN_EMPTY_AT,
  PERFORMER_RADIUS,
  PERFORMER_SEARCH_RADIUS,
  PERFORMER_SPOT_SAMPLES,
  SECURITY_ROAM_RADIUS,
  STAFF_RECHECK_TICKS,
  STAFF_SEARCH_RADIUS,
} from '../../data/tuning/staff';
import { PathItem } from '../map';
import { rngInt } from '../rng';
import { countGuestsWithin } from '../spatial';
import type { World } from '../types';
import type { EntityId } from '../units';
import { staffBfs, staffRoute } from './bfs';
import { findRide, serviceTile } from './lookup';
import { releaseFix } from './mechanics';
import { patrolHas } from './patrol';
import type { Staff, StaffTask } from './types';

export interface Plan {
  task: StaffTask;
  target: number;
  rideId: EntityId;
  route: number[];
}

const WANDER: Plan = { task: 'wander', target: -1, rideId: -1, route: [] };

function plan(task: StaffTask, target: number, route: number[] | null, rideId: EntityId = -1): Plan {
  return { task, target, rideId, route: route ?? [] };
}

export interface EffectivePatrol {
  /** The patrol to search in; null = whole park (also when the patrol is not connected). */
  patrol: Uint8Array | null;
  /** Route into the patrol when the staff member stands outside it. */
  toPatrol: number[] | null;
}

/**
 * §4.2 Patrol area. Outside the patrol, walk to the nearest reachable patrol tile.
 * If no patrol tile is reachable, work as if the patrol were empty.
 */
export function effectivePatrol(world: World, s: Staff): EffectivePatrol {
  if (s.patrol === null || patrolHas(s.patrol, s.tile)) return { patrol: s.patrol, toPatrol: null };
  const run = staffBfs(world, s.tile);
  for (const t of run.order) {
    if (patrolHas(s.patrol, t)) return { patrol: s.patrol, toPatrol: run.route(t) };
  }
  return { patrol: null, toPatrol: null };
}

/** For the staff panel: false shows "Patrol area is not connected". */
export function isPatrolConnected(world: World, s: Staff): boolean {
  if (s.patrol === null || patrolHas(s.patrol, s.tile)) return true;
  return effectivePatrol(world, s).toPatrol !== null;
}

/** Tiles other Groundskeepers already head for, so two do not chase the same job. */
function claimedTiles(world: World, self: Staff): Set<number> {
  const out = new Set<number>();
  for (const m of world.state.staff.members) {
    if (m.id !== self.id && m.type === 'groundskeeper' && m.targetTile >= 0 && (m.task === 'sweep' || m.task === 'mess' || m.task === 'bin')) {
      out.add(m.targetTile);
    }
  }
  return out;
}

/** Groundskeeper: mess in range → bin with fill ≥ BIN_EMPTY_AT → tile with most litter (tie: nearest) → wander. */
function groundskeeperPlan(world: World, s: Staff): Plan {
  const ep = effectivePatrol(world, s);
  if (ep.toPatrol) return plan('toPatrol', ep.toPatrol[ep.toPatrol.length - 1] ?? s.tile, ep.toPatrol);
  const map = world.state.map;
  const claimed = claimedTiles(world, s);
  const run = staffBfs(world, s.tile, { maxSteps: STAFF_SEARCH_RADIUS, patrol: ep.patrol });
  let mess = -1;
  let bin = -1;
  let litter = -1;
  let litterMax = 0;
  for (const t of run.order) {
    if (claimed.has(t)) continue;
    if ((map.mess[t] as number) > 0) {
      mess = t;
      break;
    }
    if (bin < 0 && map.pathItem[t] === PathItem.Bin && (map.binFill[t] as number) >= BIN_EMPTY_AT) bin = t;
    if ((map.litter[t] as number) > litterMax) {
      litterMax = map.litter[t] as number;
      litter = t;
    }
  }
  if (mess >= 0) return plan('mess', mess, run.route(mess));
  if (bin >= 0) return plan('bin', bin, run.route(bin));
  if (litter >= 0) return plan('sweep', litter, run.route(litter));
  return WANDER;
}

export function groundskeeperPriority(task: StaffTask): number {
  if (task === 'mess') return 1;
  if (task === 'bin') return 2;
  if (task === 'sweep') return 3;
  return 4;
}

/** Inspections already claimed by another Mechanic. */
function inspectionClaimed(world: World, self: Staff, rideId: EntityId): boolean {
  return world.state.staff.members.some((m) => m.id !== self.id && m.type === 'mechanic' && m.task === 'inspect' && m.targetRideId === rideId);
}

/** Mechanic: assigned breakdown → most overdue inspection in range (tie: lower ride id) → wander. */
function mechanicPlan(world: World, s: Staff): Plan {
  if (s.fixRideId !== -1) {
    const ride = findRide(world, s.fixRideId);
    if (ride && ride.status === 'broken') {
      const service = serviceTile(ride);
      const route = service >= 0 ? staffRoute(world, s.tile, service) : null;
      if (route) return plan('fix', service, route, ride.id);
    }
    releaseFix(world, s, true);
  }
  const ep = effectivePatrol(world, s);
  if (ep.toPatrol) return plan('toPatrol', ep.toPatrol[ep.toPatrol.length - 1] ?? s.tile, ep.toPatrol);
  const run = staffBfs(world, s.tile, { maxSteps: STAFF_SEARCH_RADIUS, patrol: ep.patrol });
  const now = world.state.tick;
  let best = -1;
  let bestElapsed = 0;
  let bestInterval = 1;
  let bestTile = -1;
  for (const ride of world.state.rides) {
    if (ride.status !== 'open' && ride.status !== 'closed') continue;
    const interval = ride.inspectionIntervalTicks;
    if (interval <= 0) continue;
    const elapsed = now - ride.lastInspectionTick;
    if (elapsed < interval) continue;
    const st = serviceTile(ride);
    if (run.dist(st) < 0 || inspectionClaimed(world, s, ride.id)) continue;
    // elapsed / interval > bestElapsed / bestInterval, compared exactly in integers.
    if (best < 0 || elapsed * bestInterval > bestElapsed * interval) {
      best = ride.id;
      bestElapsed = elapsed;
      bestInterval = interval;
      bestTile = st;
    }
  }
  if (best >= 0) return plan('inspect', bestTile, run.route(bestTile), best);
  return WANDER;
}

/** Security Guard: walk to a random reachable patrol tile within SECURITY_ROAM_RADIUS; repeat. */
function securityPlan(world: World, s: Staff): Plan {
  const ep = effectivePatrol(world, s);
  if (ep.toPatrol) return plan('toPatrol', ep.toPatrol[ep.toPatrol.length - 1] ?? s.tile, ep.toPatrol);
  const run = staffBfs(world, s.tile, { box: SECURITY_ROAM_RADIUS, patrol: ep.patrol });
  if (run.order.length <= 1) return WANDER;
  const t = run.order[rngInt(world.state, 1, run.order.length - 1)] as number;
  return plan('roam', t, run.route(t));
}

/** Performer: pick the busiest of PERFORMER_SPOT_SAMPLES random reachable spots, perform, then walk. */
function performerPlan(world: World, s: Staff): Plan {
  if (s.walkTicksLeft > 0) return WANDER;
  const ep = effectivePatrol(world, s);
  if (ep.toPatrol) return plan('toPatrol', ep.toPatrol[ep.toPatrol.length - 1] ?? s.tile, ep.toPatrol);
  const run = staffBfs(world, s.tile, { box: PERFORMER_SEARCH_RADIUS, patrol: ep.patrol });
  const tiles = run.order;
  let best = s.tile;
  let bestCount = -1;
  for (let k = 0; k < PERFORMER_SPOT_SAMPLES; k++) {
    const t = tiles[rngInt(world.state, 0, tiles.length - 1)] as number;
    const c = countGuestsWithin(world, t, PERFORMER_RADIUS);
    if (c > bestCount) {
      bestCount = c;
      best = t;
    }
  }
  return plan('perform', best, run.route(best));
}

export function planFor(world: World, s: Staff): Plan {
  switch (s.type) {
    case 'groundskeeper':
      return groundskeeperPlan(world, s);
    case 'mechanic':
      return mechanicPlan(world, s);
    case 'security':
      return securityPlan(world, s);
    default:
      return performerPlan(world, s);
  }
}

export function applyPlan(world: World, s: Staff, p: Plan): void {
  s.task = p.task;
  s.targetTile = p.target;
  s.targetRideId = p.rideId;
  s.route = p.route.slice();
  s.nextRecheckTick = world.state.tick + STAFF_RECHECK_TICKS;
}
