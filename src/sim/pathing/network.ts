/**
 * Walkable network cache (Phase 1 §4.2, Phase 4 §4.2). Owners: W1-C (Build 1), W3-B (path nodes).
 * The network is a graph of path nodes `(tile, z)` (see `../paths/nodes.ts`): node id = tile for a ground path,
 * `tileCount + k` for the elevated path at index k. Queue ownership, node links, and distance fields are derived
 * data. They live in a module-level WeakMap keyed by World, never in GameState, and rebuild lazily after `markDirty`.
 * On a map without elevated paths, ramps, water, or edge scenery the graph is the Build 1 tile grid.
 */
import { STAFF_FIELD_CACHE_MAX } from '../../data/tuning/world';
import { Content, type MapState } from '../map';
import type { DestKey } from '../guests/types';
import type { ElevatedPath } from '../paths/types';
import { edgeBlocked } from '../scenery/api';
import { PATH_HEADROOM } from '../../data/tuning/paths';
import { elevatedIndex, gateNode, groundRamp, hasGroundNode, linkedNode } from '../paths/nodes';
import type { GameState, World } from '../types';

/** Field value for nodes that cannot reach the destination. */
export const UNREACHABLE = 0xffff;

/** Queue id that matches no owner (fields that may not enter queues). */
const NO_QUEUE = -3;

const KIND_NONE = 0;
const KIND_FOOT = 1;
const KIND_QUEUE = 2;
const KIND_ENTRANCE = 3;

export interface NetworkCache {
  world: World;
  state: GameState;
  map: MapState;
  content: Uint8Array;
  heights: Uint8Array;
  slope: Uint8Array;
  water: Uint8Array;
  elevated: ElevatedPath[];
  elevatedCount: number;
  rideCount: number;
  stallCount: number;
  dirty: boolean;
  /** Map tiles; ground node ids are 0 … tiles − 1. */
  tiles: number;
  /** tiles + elevated paths. */
  nodeCount: number;
  /** Node kind (KIND_*); KIND_NONE = no node with this id. */
  kind: Uint8Array;
  /** Tile of each node. */
  nodeTile: Int32Array;
  /** Linked node per node and `Dir` (`node × 4 + dir`), or −1. */
  adj: Int32Array;
  /** Ride id owning each queue node, or −1. */
  owner: Int32Array;
  /** 1 where guests may always walk: footpath or park entrance. */
  guestPass: Uint8Array;
  /** 1 where staff may walk: footpath, queue, or park entrance. */
  staffPass: Uint8Array;
  /** Guest fields by destination; null = no valid destination node. */
  fields: Map<DestKey, Uint16Array | null>;
  /** Staff fields by target tile; null = target not walkable. Oldest first (LRU order). */
  staffFields: Map<number, Uint16Array | null>;
  /** Field buffers from the last rebuild, reused to avoid garbage. */
  pool: Uint16Array[];
  /** BFS work queue (one slot per node). */
  work: Int32Array;
}

const caches = new WeakMap<World, NetworkCache>();

export function markDirty(world: World): void {
  const c = caches.get(world);
  if (c) c.dirty = true;
}

/** The current network cache, rebuilt when dirty or when the state no longer matches it. */
export function network(world: World): NetworkCache {
  const s = world.state;
  const map = s.map;
  const c = caches.get(world);
  if (
    c &&
    !c.dirty &&
    c.state === s &&
    c.map === map &&
    c.content === map.content &&
    c.heights === map.heights &&
    c.slope === map.slope &&
    c.water === map.water &&
    c.elevated === s.elevatedPaths &&
    c.elevatedCount === s.elevatedPaths.length &&
    c.rideCount === s.rides.length &&
    c.stallCount === s.stalls.length
  ) {
    return c;
  }
  const fresh = rebuild(world, c);
  caches.set(world, fresh);
  return fresh;
}

function rebuild(world: World, old: NetworkCache | undefined): NetworkCache {
  const s = world.state;
  const map = s.map;
  const tiles = map.width * map.height;
  const nodeCount = tiles + s.elevatedPaths.length;
  const sameSize = old !== undefined && old.nodeCount === nodeCount && old.tiles === tiles;
  const pool: Uint16Array[] = [];
  if (sameSize && old) {
    for (const f of old.fields.values()) if (f) pool.push(f);
    for (const f of old.staffFields.values()) if (f) pool.push(f);
  }
  const reuse = sameSize && old;
  const c: NetworkCache = {
    world,
    state: s,
    map,
    content: map.content,
    heights: map.heights,
    slope: map.slope,
    water: map.water,
    elevated: s.elevatedPaths,
    elevatedCount: s.elevatedPaths.length,
    rideCount: s.rides.length,
    stallCount: s.stalls.length,
    dirty: false,
    tiles,
    nodeCount,
    kind: reuse ? old.kind : new Uint8Array(nodeCount),
    nodeTile: reuse ? old.nodeTile : new Int32Array(nodeCount),
    adj: reuse ? old.adj : new Int32Array(nodeCount * 4),
    owner: reuse ? old.owner : new Int32Array(nodeCount),
    guestPass: reuse ? old.guestPass : new Uint8Array(nodeCount),
    staffPass: reuse ? old.staffPass : new Uint8Array(nodeCount),
    fields: new Map(),
    staffFields: new Map(),
    pool,
    work: reuse ? old.work : new Int32Array(nodeCount),
  };
  computeNodes(c);
  computeLinks(c);
  computeQueueOwners(c);
  return c;
}

function computeNodes(c: NetworkCache): void {
  const { map, kind, nodeTile, guestPass, staffPass, tiles } = c;
  const content = map.content;
  for (let i = 0; i < tiles; i++) {
    nodeTile[i] = i;
    const t = content[i];
    let k = KIND_NONE;
    if (hasGroundNode(map, i)) k = t === Content.Queue ? KIND_QUEUE : t === Content.ParkEntrance ? KIND_ENTRANCE : KIND_FOOT;
    kind[i] = k;
    guestPass[i] = k === KIND_FOOT || k === KIND_ENTRANCE ? 1 : 0;
    staffPass[i] = k !== KIND_NONE ? 1 : 0;
  }
  if (c.nodeCount === tiles) return;
  const idx = elevatedIndex(c.world);
  const list = c.state.elevatedPaths;
  for (let e = 0; e < list.length; e++) {
    const node = tiles + e;
    const t = idx.tile[e] as number;
    nodeTile[node] = t;
    const k = t < 0 ? KIND_NONE : (list[e] as ElevatedPath).kind === 'queue' ? KIND_QUEUE : KIND_FOOT;
    kind[node] = k;
    guestPass[node] = k === KIND_FOOT ? 1 : 0;
    staffPass[node] = k !== KIND_NONE ? 1 : 0;
  }
}

/**
 * Links of every node in order N, E, S, W. Ground-to-ground links on flat dry land are the Build 1 grid; the rest
 * goes through `linkedNode` (ramps, cliffs, elevated paths, edge scenery).
 */
function computeLinks(c: NetworkCache): void {
  const { map, kind, adj, tiles, nodeCount, world } = c;
  const w = map.width;
  const h = map.height;
  const heights = map.heights;
  const slope = map.slope;
  const simple = nodeCount === tiles;
  adj.fill(-1);
  for (let i = 0; i < tiles; i++) {
    if (kind[i] === KIND_NONE) continue;
    if (!simple || slope[i] !== 0) {
      for (let d = 0; d < 4; d++) adj[i * 4 + d] = linkedNode(world, i, d);
      continue;
    }
    // Flat ground node, no elevated paths anywhere: link to flat-or-matching ground neighbours.
    const z = heights[i] as number;
    const x = i % w;
    const y = (i - x) / w;
    const base = i * 4;
    if (y > 0) adj[base] = groundLink(c, i, i - w, 0, z);
    if (x < w - 1) adj[base + 1] = groundLink(c, i, i + 1, 1, z);
    if (y < h - 1) adj[base + 2] = groundLink(c, i, i + w, 2, z);
    if (x > 0) adj[base + 3] = groundLink(c, i, i - 1, 3, z);
  }
  for (let node = tiles; node < nodeCount; node++) {
    if (kind[node] === KIND_NONE) continue;
    for (let d = 0; d < 4; d++) adj[node * 4 + d] = linkedNode(world, node, d);
  }
}

/** Link from the flat ground node `i` (height z) to the ground node `j` across edge `dir`, or −1. */
function groundLink(c: NetworkCache, i: number, j: number, dir: number, z: number): number {
  if (c.kind[j] === KIND_NONE) return -1;
  const map = c.map;
  const zj = map.heights[j] as number;
  const r = (map.slope[j] as number) === 0 ? -1 : groundRamp(map, j);
  const opp = (dir + 2) & 3;
  const hj = r === -1 ? zj : r === opp ? zj + 1 : r >= 0 && ((r + 2) & 3) === opp ? zj : -1;
  if (hj !== z) return -1;
  if (z < (map.heights[i] as number) + PATH_HEADROOM && edgeBlocked(c.world, i, dir as 0 | 1 | 2 | 3)) return -1;
  return j;
}

/** Flood fill each queue from its ride's entrance node. Rides in ascending id order; the first claim wins. */
function computeQueueOwners(c: NetworkCache): void {
  const { owner, work, kind, adj } = c;
  owner.fill(-1);
  const rides = c.state.rides.slice().sort((a, b) => a.id - b.id);
  for (const ride of rides) {
    const seed = ride.entrance ? gateNode(c.world, ride.entrance.gate, ride.entrance.outside) : -1;
    if (seed < 0 || kind[seed] !== KIND_QUEUE || owner[seed] !== -1) continue;
    owner[seed] = ride.id;
    let head = 0;
    let tail = 0;
    work[tail++] = seed;
    while (head < tail) {
      const i = work[head++] as number;
      for (let d = 0; d < 4; d++) {
        const j = adj[i * 4 + d] as number;
        if (j < 0 || kind[j] !== KIND_QUEUE || owner[j] !== -1) continue;
        owner[j] = ride.id;
        work[tail++] = j;
      }
    }
  }
}

function takeBuffer(c: NetworkCache): Uint16Array {
  return c.pool.pop() ?? new Uint16Array(c.nodeCount);
}

/**
 * BFS from the seed nodes `work[0 … seeds − 1]` over nodes where `pass` is 1, plus the queue nodes owned by
 * `queueId` (a ride id, or NO_QUEUE). Links are visited in order N, E, S, W.
 */
function bfs(c: NetworkCache, seeds: number, pass: Uint8Array, queueId: number, out: Uint16Array): void {
  const { owner, work, adj } = c;
  out.fill(UNREACHABLE);
  for (let k = 0; k < seeds; k++) out[work[k] as number] = 0;
  let head = 0;
  let tail = seeds;
  while (head < tail) {
    const i = work[head++] as number;
    const dist = (out[i] as number) + 1;
    const base = i * 4;
    for (let d = 0; d < 4; d++) {
      const j = adj[base + d] as number;
      if (j >= 0 && out[j] === UNREACHABLE && (pass[j] === 1 || owner[j] === queueId)) {
        out[j] = dist;
        work[tail++] = j;
      }
    }
  }
}

function parseId(dest: string, prefix: string): number {
  const v = Number(dest.slice(prefix.length));
  return Number.isInteger(v) ? v : -1;
}

/** The node a destination's field starts from, and the queue its field may use; seed −1 = no field. */
export function destinationSeed(c: NetworkCache, dest: DestKey): { seed: number; queue: number } {
  const s = c.state;
  const map = c.map;
  if (dest === 'exit') {
    const seed = map.entranceTile;
    if (seed < 0 || seed >= c.tiles || c.kind[seed] !== KIND_ENTRANCE) return { seed: -1, queue: NO_QUEUE };
    return { seed, queue: NO_QUEUE };
  }
  if (dest.startsWith('ride:')) {
    const id = parseId(dest, 'ride:');
    const ride = s.rides.find((r) => r.id === id);
    if (!ride || !ride.entrance) return { seed: -1, queue: NO_QUEUE };
    const seed = gateNode(c.world, ride.entrance.gate, ride.entrance.outside);
    if (seed < 0 || c.kind[seed] !== KIND_QUEUE || c.owner[seed] !== id) return { seed: -1, queue: NO_QUEUE };
    return { seed, queue: id };
  }
  if (dest.startsWith('stall:')) {
    const id = parseId(dest, 'stall:');
    const stall = s.stalls.find((st) => st.id === id);
    if (!stall) return { seed: -1, queue: NO_QUEUE };
    const inside = stall.y * map.width + stall.x;
    const seed = stall.serviceTile >= 0 ? gateNode(c.world, inside, stall.serviceTile) : -1;
    if (seed < 0 || c.kind[seed] !== KIND_FOOT) return { seed: -1, queue: NO_QUEUE };
    return { seed, queue: NO_QUEUE };
  }
  return { seed: -1, queue: NO_QUEUE };
}

function computeField(c: NetworkCache, dest: DestKey): Uint16Array | null {
  const { seed, queue } = destinationSeed(c, dest);
  if (seed < 0) return null;
  const out = takeBuffer(c);
  c.work[0] = seed;
  bfs(c, 1, c.guestPass, queue, out);
  return out;
}

/** Guest distance field for `dest`, or null when the destination is missing or has no valid node. */
export function guestField(c: NetworkCache, dest: DestKey): Uint16Array | null {
  const hit = c.fields.get(dest);
  if (hit !== undefined) return hit;
  const f = computeField(c, dest);
  c.fields.set(dest, f);
  return f;
}

export function isStaffWalkableContent(t: number | undefined): boolean {
  return t === Content.Footpath || t === Content.Queue || t === Content.ParkEntrance;
}

export function isGuestWalkableContent(t: number | undefined): boolean {
  return t === Content.Footpath || t === Content.ParkEntrance;
}

export function isQueueNode(c: NetworkCache, node: number): boolean {
  return node >= 0 && node < c.nodeCount && c.kind[node] === KIND_QUEUE;
}

export function isNode(c: NetworkCache, node: number): boolean {
  return node >= 0 && node < c.nodeCount && c.kind[node] !== KIND_NONE;
}

/** Staff distance field to every node on `target` (footpaths, every queue, park entrance). */
export function staffField(c: NetworkCache, target: number): Uint16Array | null {
  const hit = c.staffFields.get(target);
  if (hit !== undefined) {
    c.staffFields.delete(target);
    c.staffFields.set(target, hit);
    return hit;
  }
  let f: Uint16Array | null = null;
  if (Number.isInteger(target) && target >= 0 && target < c.tiles) {
    let seeds = 0;
    if (c.staffPass[target] === 1) c.work[seeds++] = target;
    for (let node = c.tiles; node < c.nodeCount; node++) {
      if (c.nodeTile[node] === target && c.staffPass[node] === 1) c.work[seeds++] = node;
    }
    if (seeds > 0) {
      f = takeBuffer(c);
      bfs(c, seeds, c.staffPass, NO_QUEUE, f);
    }
  }
  c.staffFields.set(target, f);
  while (c.staffFields.size > STAFF_FIELD_CACHE_MAX) {
    const oldest = c.staffFields.keys().next().value as number;
    const buf = c.staffFields.get(oldest);
    if (buf) c.pool.push(buf);
    c.staffFields.delete(oldest);
  }
  return f;
}

export interface Route {
  /** Next node, or −1 when already at the destination. */
  next: number;
  /** Path distance in steps. */
  dist: number;
}

/** Best in-field linked node of node `i` in order N, E, S, W (first minimum wins), or −1. */
function bestLinked(c: NetworkCache, field: Uint16Array, i: number): number {
  const adj = c.adj;
  const base = i * 4;
  let best = -1;
  let bestD = UNREACHABLE;
  for (let d = 0; d < 4; d++) {
    const j = adj[base + d] as number;
    if (j >= 0 && (field[j] as number) < bestD) {
      best = j;
      bestD = field[j] as number;
    }
  }
  return best;
}

/** Off the network (a tile with no node at the walker's height): the best in-field ground neighbour (Build 1 rule). */
function bestGroundNeighbour(map: MapState, field: Uint16Array, i: number): number {
  const w = map.width;
  const x = i % w;
  const y = (i - x) / w;
  let best = -1;
  let bestD = UNREACHABLE;
  if (y > 0 && (field[i - w] as number) < bestD) {
    best = i - w;
    bestD = field[best] as number;
  }
  if (x < w - 1 && (field[i + 1] as number) < bestD) {
    best = i + 1;
    bestD = field[best] as number;
  }
  if (y < map.height - 1 && (field[i + w] as number) < bestD) {
    best = i + w;
    bestD = field[best] as number;
  }
  if (x > 0 && (field[i - 1] as number) < bestD) {
    best = i - 1;
  }
  return best;
}

/**
 * Route from node `from` using `field` (`from` = −1 with `fromTile`: the walker is off the network on that tile).
 * - In the field: step to the linked node with the smallest distance (ties N, E, S, W).
 * - Not in the field: step to the best in-field linked node. A walker inside a queue may first walk along that
 *   queue (its linked queue nodes) to the queue node with the shortest total route out.
 * - Off the network: step to the best in-field ground node of a neighbour tile.
 * - Null when there is no route.
 */
export function route(c: NetworkCache, field: Uint16Array, from: number, fromTile: number): Route | null {
  if (from < 0) {
    if (!Number.isInteger(fromTile) || fromTile < 0 || fromTile >= c.tiles) return null;
    const b = bestGroundNeighbour(c.map, field, fromTile);
    return b < 0 ? null : { next: b, dist: (field[b] as number) + 1 };
  }
  const d = field[from] as number;
  if (d !== UNREACHABLE) {
    if (d === 0) return { next: -1, dist: 0 };
    return { next: bestLinked(c, field, from), dist: d };
  }
  if (c.kind[from] !== KIND_QUEUE) {
    const b = bestLinked(c, field, from);
    return b < 0 ? null : { next: b, dist: (field[b] as number) + 1 };
  }
  return routeOutOfQueue(c, field, from);
}

/** BFS over the queue component of `from` (order N, E, S, W); pick the node with the shortest total route. */
function routeOutOfQueue(c: NetworkCache, field: Uint16Array, from: number): Route | null {
  const parent = new Map<number, number>([[from, -1]]);
  const depth = new Map<number, number>([[from, 0]]);
  const order: number[] = [from];
  let bestNode = -1;
  let bestTotal = Infinity;
  for (let head = 0; head < order.length; head++) {
    const i = order[head] as number;
    const di = depth.get(i) as number;
    const b = bestLinked(c, field, i);
    if (b >= 0) {
      const total = di + 1 + (field[b] as number);
      if (total < bestTotal) {
        bestTotal = total;
        bestNode = i;
      }
    }
    for (let d = 0; d < 4; d++) {
      const j = c.adj[i * 4 + d] as number;
      if (j < 0 || parent.has(j) || c.kind[j] !== KIND_QUEUE) continue;
      parent.set(j, i);
      depth.set(j, di + 1);
      order.push(j);
    }
  }
  if (bestNode < 0) return null;
  if (bestNode === from) return { next: bestLinked(c, field, from), dist: bestTotal };
  let step = bestNode;
  while (parent.get(step) !== from) step = parent.get(step) as number;
  return { next: step, dist: bestTotal };
}

/** Node ids on `tile`, lowest first, written into `out`; returns the count (ground node, then elevated by z). */
export function nodesOnTile(c: NetworkCache, tile: number, out: number[]): number {
  out.length = 0;
  if (!Number.isInteger(tile) || tile < 0 || tile >= c.tiles) return 0;
  if (c.kind[tile] !== KIND_NONE) out.push(tile);
  if (c.nodeCount > c.tiles) {
    const idx = elevatedIndex(c.world);
    for (let k = idx.head[tile] as number; k >= 0; k = idx.next[k] as number) {
      if (c.kind[c.tiles + k] !== KIND_NONE) out.push(c.tiles + k);
    }
  }
  return out.length;
}
