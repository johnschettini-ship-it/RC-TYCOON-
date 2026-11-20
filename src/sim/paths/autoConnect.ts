/**
 * Auto-connect (owner, 2026-11-19): plan and build the queue and the exit footpath that join a ride to the park's path
 * network, and the gate snap of the path tools.
 *
 * The plan is computed first, in full, with its total cost (`planAutoConnect`); nothing is built until the player
 * confirms it. Building (`applyAutoConnect`) sends the same `buildPath` commands as the step builder, `undoable`, so a
 * tile it built is refunded in full by `undoPath` (the step builder Undo rule, `./undo.ts`). Any failure while building
 * takes back what this action built, and so does `undoAutoConnect`.
 *
 * Walkability is the guest pathing's own (`./nodes.ts`): a planned ground path links to a neighbour when their facing
 * edges meet at the same height and no edge scenery blocks the shared edge. A route is a bounded breadth-first search
 * (shortest in tiles, so cheapest: every new ground tile of one kind costs the same) over empty owned land where a
 * ground path may go. Success is judged by the path clarity reach status (`../pathing/reach.ts`), not by the plan.
 *
 * Rules the plan keeps:
 * - it never converts or crosses an existing path: a queue that a footpath must reach is joined from the side;
 * - a queue tile never links to another queue (that would join two lines, queue clarity §3);
 * - the queue route and the exit route share no tile, and neither uses the other gate's outside tile.
 */
import { PATH_HEADROOM } from '../../data/tuning/paths';
import { canAfford } from '../economy/ledger';
import { Content, isOwned, type Dir, type MapState } from '../map';
import { groundPathBlock, pathCost } from '../commands/build/paths';
import type { Command, CommandResult, PathKind } from '../commands/types';
import { network } from '../pathing/network';
import { footpathReached, rideReach } from '../pathing/reach';
import { queueOwner } from '../pathing';
import { edgeBlocked } from '../scenery/api';
import { unlimitedMoney } from '../scenario/api';
import type { Ride } from '../rides/types';
import type { World } from '../types';
import type { Cents } from '../units';
import {
  dirTo,
  edgeHeight,
  firstElevatedOnTile,
  gateNode,
  groundRamp,
  nodeIdsOn,
  nodeKindOf,
  nodeTileOf,
  nodeZOf,
  rampDirOfMask,
  stepTile,
} from './nodes';
import type { ElevatedPath } from './types';
import { undoablePathCost } from './undo';

/** Longest route the search tries, in tiles (each route: the queue, the joining footpath, the exit footpath). */
export const AUTO_CONNECT_MAX_TILES = 40;

/** Why a plan or a build failed. The UI shows `ui.ride.connect.<code>`. */
export type AutoConnectFail =
  /** The ride has no entrance or exit gate. */
  | 'noGates'
  /** No route within `AUTO_CONNECT_MAX_TILES` over free, owned, buildable land, at matching heights. */
  | 'noRoute'
  /** The tile outside the entrance holds a footpath; the plan never turns a footpath into queue. */
  | 'entranceOnPath'
  /** The tile outside the exit holds a queue. */
  | 'exitOnQueue'
  /** The entrance is above or below the ground outside it: a deck is needed (the queue builder). */
  | 'entranceRaised'
  /** The exit is above or below the ground outside it. */
  | 'exitRaised'
  /** The park cannot pay the whole plan. */
  | 'noCash';

/** One tile to build. */
export interface ConnectStep {
  tile: number;
  kind: PathKind;
}

export interface ConnectPlan {
  rideId: number;
  /** Queue tiles from the entrance outward. */
  queue: number[];
  /** Footpath tiles that join an existing, unreached queue line to the park's footpaths. */
  join: number[];
  /** Footpath tiles from the exit outward. */
  exit: number[];
  /** Every tile in build order. */
  steps: ConnectStep[];
  cost: Cents;
}

export type PlanResult = { ok: true; plan: ConnectPlan } | { ok: false; code: AutoConnectFail };

/** What a build made, for Undo. */
export interface ConnectBuilt {
  rideId: number;
  tiles: number[];
  cost: Cents;
}

export type ApplyResult = { ok: true; built: ConnectBuilt } | { ok: false; code: AutoConnectFail | 'failed'; reason?: string };

// ---------------------------------------------------------------- the old helpers (warnings, banner)

/** The path node kind outside a gate, or null when no node connects there. */
function outsideNode(world: World, inside: number, outside: number): { kind: string; tile: number; z: number } | null {
  if (inside < 0 || outside < 0) return null;
  const node = gateNode(world, inside, outside);
  if (node < 0) return null;
  return { kind: nodeKindOf(world, node), tile: nodeTileOf(world, node), z: nodeZOf(world, node) };
}

/** The entrance has no queue of this ride at its gate. */
export function entranceNeedsQueue(world: World, ride: Ride): boolean {
  const e = ride.entrance;
  if (!e) return false;
  const en = outsideNode(world, e.gate, e.outside);
  return !en || en.kind !== 'queue' || queueOwner(world, en.tile, en.z) !== ride.id;
}

/** The exit has no footpath at its gate. */
export function exitNeedsFootpath(world: World, ride: Ride): boolean {
  const x = ride.exit;
  if (!x) return false;
  const ex = outsideNode(world, x.gate, x.outside);
  return !ex || ex.kind !== 'footpath';
}

// ---------------------------------------------------------------- gate snap

function near(map: MapState, a: number, b: number): boolean {
  if (a < 0 || b < 0) return false;
  const w = map.width;
  return Math.abs((a % w) - (b % w)) <= 1 && Math.abs(Math.floor(a / w) - Math.floor(b / w)) <= 1;
}

/**
 * A tap with the queue (footpath) tool on a ride tile at or next to the ride's entrance (exit) gate goes to the tile
 * outside that gate. Any other tile, a far tile of a long coaster track included, stays where it was tapped.
 */
export function snapPathGate(world: World, tool: string, tile: number): number {
  const s = world.state;
  const map = s.map;
  if (tile < 0 || tile >= map.content.length) return tile;
  const content = map.content[tile];
  if (content !== Content.Building && content !== Content.Track) return tile;
  const ref = map.contentRef[tile] ?? -1;
  const ride = s.rides.find((r) => r.id === ref);
  if (!ride) return tile;
  const gate = tool === 'queue' ? ride.entrance : tool === 'footpath' ? ride.exit : null;
  if (!gate || gate.outside < 0 || !near(map, tile, gate.gate)) return tile;
  return gate.outside;
}

// ---------------------------------------------------------------- planning

/** Edge `dir` height of a ground path on tile `t` (planned or built), or −1. */
function groundEdge(map: MapState, t: number, dir: number): number {
  const s = map.slope[t] as number;
  return edgeHeight(map.heights[t] as number, s === 0 ? -1 : rampDirOfMask(s), dir);
}

/** Edge `dir` height of an existing node, or −1. */
function nodeEdge(world: World, node: number, dir: number): number {
  const map = world.state.map;
  const n = map.width * map.height;
  if (node < n) return groundEdge(map, node, dir);
  const p = world.state.elevatedPaths[node - n] as ElevatedPath;
  return edgeHeight(p.z, p.rampDir, dir);
}

/** Edge scenery on either side of the edge between `t` and its neighbour toward `dir` blocks a link at height `h`. */
function blocked(world: World, t: number, dir: number, u: number, h: number): boolean {
  const map = world.state.map;
  const opp = ((dir + 2) & 3) as Dir;
  return (h < (map.heights[t] as number) + PATH_HEADROOM && edgeBlocked(world, t, dir as Dir)) ||
    (h < (map.heights[u] as number) + PATH_HEADROOM && edgeBlocked(world, u, opp));
}

/** A ground path on `t` would link to its neighbour tile `u` (toward `dir`) as a planned ground path. */
function groundLinks(world: World, t: number, dir: number, u: number): boolean {
  const map = world.state.map;
  const h = groundEdge(map, t, dir);
  return h >= 0 && groundEdge(map, u, (dir + 2) & 3) === h && !blocked(world, t, dir, u, h);
}

/** The existing nodes a ground path on `t` would link to across edge `dir`. */
function linkedExisting(world: World, t: number, dir: number): number[] {
  const map = world.state.map;
  const u = stepTile(map, t, dir);
  if (u < 0) return [];
  const h = groundEdge(map, t, dir);
  if (h < 0) return [];
  const out: number[] = [];
  for (const node of nodeIdsOn(world, u)) {
    if (nodeEdge(world, node, (dir + 2) & 3) === h && !blocked(world, t, dir, u, h)) out.push(node);
  }
  return out;
}

/** A new ground path may go on `t`: owned, empty, buildable (the `buildPath` checks), no deck over it. */
function free(world: World, t: number): boolean {
  const map = world.state.map;
  return isOwned(map, t) && map.content[t] === Content.Empty && groundPathBlock(world, t) === null && firstElevatedOnTile(world, t) < 0;
}

/** A guest-walkable node joined to the park entrance (a footpath or the park entrance). */
function reachedFoot(world: World, node: number): boolean {
  const k = nodeKindOf(world, node);
  return k !== 'queue' && footpathReached(world, node);
}

interface RouteOpts {
  kind: PathKind;
  /** Tiles the route may not use. */
  avoid: ReadonlySet<number>;
  /** Existing nodes the route starts from (built already; not part of the route). */
  fromNodes?: readonly number[];
  /** A new tile the route starts with (built as part of it). */
  fromTile?: number;
}

/**
 * Bounded breadth-first search for the shortest route of new `kind` tiles from the start to a tile linked to a footpath
 * the park reaches. Returns the new tiles in order from the start (empty when an existing start node already links to
 * one), or null when there is none within `AUTO_CONNECT_MAX_TILES` new tiles.
 */
function route(world: World, o: RouteOpts): number[] | null {
  const map = world.state.map;
  const total = map.width * map.height;
  const dist = new Int32Array(total).fill(-1);
  const prev = new Int32Array(total).fill(-1);
  const work = new Int32Array(total);
  let head = 0;
  let tail = 0;

  /** A new tile may join the route: free, not avoided, and (queue) linked to no other queue. */
  const usable = (t: number): boolean => {
    if (o.avoid.has(t) || !free(world, t)) return false;
    if (o.kind !== 'queue') return true;
    for (let d = 0; d < 4; d++) for (const node of linkedExisting(world, t, d)) if (nodeKindOf(world, node) === 'queue') return false;
    return true;
  };
  const isGoal = (t: number): boolean => {
    for (let d = 0; d < 4; d++) for (const node of linkedExisting(world, t, d)) if (reachedFoot(world, node)) return true;
    return false;
  };
  const path = (end: number): number[] => {
    const out: number[] = [];
    for (let t = end; t >= 0; t = prev[t] as number) out.push(t);
    return out.reverse();
  };

  if (o.fromTile !== undefined) {
    const t = o.fromTile;
    if (!usable(t)) return null;
    dist[t] = 1;
    if (isGoal(t)) return [t];
    work[tail++] = t;
  }
  for (const node of o.fromNodes ?? []) {
    // Elevated start nodes: a ground tile beside a deck joins it when the edge heights meet.
    const t = nodeTileOf(world, node);
    for (let d = 0; d < 4; d++) {
      const h = nodeEdge(world, node, d);
      const u = stepTile(map, t, d);
      if (h < 0 || u < 0 || (dist[u] as number) >= 0 || !usable(u)) continue;
      if (groundEdge(map, u, (d + 2) & 3) !== h || blocked(world, t, d, u, h)) continue;
      dist[u] = 1;
      if (isGoal(u)) return [u];
      work[tail++] = u;
    }
  }
  while (head < tail) {
    const cur = work[head++] as number;
    const dc = dist[cur] as number;
    if (dc >= AUTO_CONNECT_MAX_TILES) continue;
    for (let d = 0; d < 4; d++) {
      const u = stepTile(map, cur, d);
      if (u < 0 || (dist[u] as number) >= 0 || !groundLinks(world, cur, d, u) || !usable(u)) continue;
      dist[u] = dc + 1;
      prev[u] = cur;
      if (isGoal(u)) return path(u);
      work[tail++] = u;
    }
  }
  return null;
}

/** The ground tile outside a gate can hold a path that meets the gate (its edge toward the gate is at gate height). */
function meetsGate(map: MapState, gate: number, outside: number): boolean {
  const d = dirTo(map, outside, gate);
  return d >= 0 && groundEdge(map, outside, d) === (map.heights[gate] as number);
}

/** The ride's exit has a footpath at its gate that the park reaches. */
function exitReached(world: World, ride: Ride): boolean {
  const x = ride.exit;
  if (!x) return true;
  const node = gateNode(world, x.gate, x.outside);
  return node >= 0 && reachedFoot(world, node);
}

/**
 * The whole plan for ride `rideId`: what to build so guests reach its queue from the park entrance and its exit leads
 * back to the park's footpaths, with its total cost. An empty plan (no steps) means nothing is missing.
 */
export function planAutoConnect(world: World, rideId: number): PlanResult {
  const ride = world.state.rides.find((r) => r.id === rideId);
  const e = ride?.entrance;
  const x = ride?.exit;
  if (!ride || !e || !x || e.outside < 0 || x.outside < 0) return { ok: false, code: 'noGates' };
  const map = world.state.map;
  const reach = rideReach(world, rideId);
  const used = new Set<number>([x.outside]);
  let queue: number[] = [];
  let join: number[] = [];

  if (reach?.status === 'noQueue') {
    const c = map.content[e.outside];
    if (c === Content.Footpath) return { ok: false, code: 'entranceOnPath' };
    if (c !== Content.Empty || firstElevatedOnTile(world, e.outside) >= 0) return { ok: false, code: 'noRoute' };
    if (!meetsGate(map, e.gate, e.outside)) return { ok: false, code: 'entranceRaised' };
    const r = route(world, { kind: 'queue', avoid: used, fromTile: e.outside });
    if (!r) return { ok: false, code: 'noRoute' };
    queue = r;
  } else if (reach?.status === 'noFootpath') {
    // A queue line no footpath reaches: a footpath from its side (never through it) to the park's footpaths.
    const line = network(world).queueLines.get(rideId);
    const r = route(world, { kind: 'footpath', avoid: used, fromNodes: line?.nodes ?? [] });
    if (!r) return { ok: false, code: 'noRoute' };
    join = r;
  }
  for (const t of [...queue, ...join]) used.add(t);
  used.add(e.outside);

  let exit: number[] = [];
  if (!exitReached(world, ride)) {
    const node = gateNode(world, x.gate, x.outside);
    if (node >= 0) {
      if (nodeKindOf(world, node) === 'queue') return { ok: false, code: 'exitOnQueue' };
      // A footpath at the exit that the park does not reach yet: continue it.
      used.delete(x.outside);
      const r = route(world, { kind: 'footpath', avoid: used, fromNodes: [node] });
      if (!r) return { ok: false, code: 'noRoute' };
      exit = r;
    } else {
      const c = map.content[x.outside];
      if (c === Content.Queue) return { ok: false, code: 'exitOnQueue' };
      if (c !== Content.Empty || firstElevatedOnTile(world, x.outside) >= 0) return { ok: false, code: 'noRoute' };
      if (!meetsGate(map, x.gate, x.outside)) return { ok: false, code: 'exitRaised' };
      used.delete(x.outside);
      // The exit path may not touch the new queue as its first tile only by chance; the routes stay tile-disjoint.
      const r = route(world, { kind: 'footpath', avoid: used, fromTile: x.outside });
      if (!r) return { ok: false, code: 'noRoute' };
      exit = r;
    }
  }

  const steps: ConnectStep[] = [
    ...queue.map((tile) => ({ tile, kind: 'queue' as const })),
    ...join.map((tile) => ({ tile, kind: 'footpath' as const })),
    ...exit.map((tile) => ({ tile, kind: 'footpath' as const })),
  ];
  const cost = steps.reduce((sum, st) => sum + pathCost(st.kind), 0);
  return { ok: true, plan: { rideId, queue, join, exit, steps, cost } };
}

/** The park can pay the whole plan now. */
export function canPayPlan(world: World, plan: ConnectPlan): boolean {
  return plan.cost === 0 || unlimitedMoney(world.state) || canAfford(world, plan.cost, { setup: false });
}

/** Take back the tiles of `built` (last first) with `undoPath`: a tile this action built is refunded in full. */
export function undoAutoConnect(world: World, built: ConnectBuilt, dispatch: (cmd: Command) => CommandResult): boolean {
  const w = world.state.map.width;
  let all = true;
  for (let k = built.tiles.length - 1; k >= 0; k--) {
    const t = built.tiles[k] as number;
    const c = world.state.map.content[t];
    if (c !== Content.Footpath && c !== Content.Queue) continue;
    if (!dispatch({ type: 'undoPath', x: t % w, y: Math.floor(t / w) }).ok) all = false;
  }
  return all;
}

/**
 * Build `plan` (the player confirmed it): a fresh plan for the same ride must still match it (the park changed
 * meanwhile: refuse), the park must pay the whole cost, every tile is built with `undoable`, and the ride's reach is
 * checked at the end. On any failure every tile built here is taken back (full refund) and nothing is left half done.
 */
export function applyAutoConnect(world: World, plan: ConnectPlan, dispatch: (cmd: Command) => CommandResult): ApplyResult {
  const fresh = planAutoConnect(world, plan.rideId);
  if (!fresh.ok) return { ok: false, code: fresh.code };
  if (fresh.plan.steps.length !== plan.steps.length || fresh.plan.steps.some((s, k) => s.tile !== plan.steps[k]?.tile || s.kind !== plan.steps[k]?.kind)) {
    return { ok: false, code: 'noRoute' };
  }
  if (!canPayPlan(world, plan)) return { ok: false, code: 'noCash' };
  const w = world.state.map.width;
  const built: ConnectBuilt = { rideId: plan.rideId, tiles: [], cost: 0 };
  for (const st of plan.steps) {
    const r = dispatch({ type: 'buildPath', x: st.tile % w, y: Math.floor(st.tile / w), kind: st.kind, undoable: true });
    if (!r.ok) {
      undoAutoConnect(world, built, dispatch);
      return { ok: false, code: 'failed', reason: r.reason };
    }
    built.tiles.push(st.tile);
    built.cost += r.cost;
  }
  const ride = world.state.rides.find((r) => r.id === plan.rideId);
  const status = rideReach(world, plan.rideId)?.status;
  if (!ride || (status !== 'ok' && status !== 'closed') || !exitReached(world, ride)) {
    undoAutoConnect(world, built, dispatch);
    return { ok: false, code: 'noRoute' };
  }
  if (built.tiles.length > 0) lastOf(world).set(plan.rideId, built);
  return { ok: true, built };
}

// ---------------------------------------------------------------- Undo of the last connection, and the panel's plan

/** The last connection built per ride: session state beside the world, like the step builder's refunds. Never saved. */
const lastBuilt = new WeakMap<World, Map<number, ConnectBuilt>>();

function lastOf(world: World): Map<number, ConnectBuilt> {
  let m = lastBuilt.get(world);
  if (!m) {
    m = new Map();
    lastBuilt.set(world, m);
  }
  return m;
}

/**
 * The last connection built for ride `rideId` while Undo can still take it back: some tile of it is still a path that
 * the refund rule remembers (a tile demolished or rebuilt since is dropped from it). Null otherwise.
 */
export function lastAutoConnect(world: World, rideId: number): ConnectBuilt | null {
  const m = lastBuilt.get(world);
  const b = m?.get(rideId);
  if (!m || !b) return null;
  const map = world.state.map;
  const live = b.tiles.some((t) => (map.content[t] === Content.Footpath || map.content[t] === Content.Queue) && undoablePathCost(world, t, null) > 0);
  if (!live) {
    m.delete(rideId);
    return null;
  }
  return b;
}

/** Undo the last connection of ride `rideId` (full refund of what is left of it). False when there is none. */
export function undoLastAutoConnect(world: World, rideId: number, dispatch: (cmd: Command) => CommandResult): boolean {
  const b = lastAutoConnect(world, rideId);
  if (!b) return false;
  const kept = b.tiles.filter((t) => undoablePathCost(world, t, null) > 0);
  lastBuilt.get(world)?.delete(rideId);
  return undoAutoConnect(world, { ...b, tiles: kept }, dispatch);
}

const planCache = new WeakMap<object, Map<number, PlanResult>>();

/** `planAutoConnect`, kept with the path network until it rebuilds (the ride panel asks every frame). */
export function cachedAutoConnectPlan(world: World, rideId: number): PlanResult {
  const c = network(world);
  let m = planCache.get(c);
  if (!m) {
    m = new Map();
    planCache.set(c, m);
  }
  let p = m.get(rideId);
  if (!p) {
    p = planAutoConnect(world, rideId);
    m.set(rideId, p);
  }
  return p;
}
