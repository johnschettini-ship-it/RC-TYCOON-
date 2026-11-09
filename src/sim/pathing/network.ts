/**
 * Walkable network cache (Phase 1 §4.2). Owner: W1-C.
 * Queue ownership and distance fields are derived data. They live in a module-level WeakMap keyed by World,
 * never in GameState, and rebuild lazily after `markDirty`.
 */
import { STAFF_FIELD_CACHE_MAX } from '../../data/tuning/world';
import { Content, type MapState } from '../map';
import type { DestKey } from '../guests/types';
import type { GameState, World } from '../types';

/** Field value for tiles that cannot reach the destination. */
export const UNREACHABLE = 0xffff;

/** Which tiles a BFS may enter besides footpaths and the park entrance. */
const NO_QUEUE = -1;
const ANY_QUEUE = -2;

export interface NetworkCache {
  state: GameState;
  map: MapState;
  content: Uint8Array;
  rideCount: number;
  stallCount: number;
  dirty: boolean;
  /** Ride id owning each queue tile, or −1. */
  owner: Int32Array;
  /** Guest fields by destination; null = no valid destination tile. */
  fields: Map<DestKey, Uint16Array | null>;
  /** Staff fields by target tile; null = target not walkable. Oldest first (LRU order). */
  staffFields: Map<number, Uint16Array | null>;
  /** Field buffers from the last rebuild, reused to avoid garbage. */
  pool: Uint16Array[];
  /** BFS work queue (one slot per tile). */
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
    c.rideCount === s.rides.length &&
    c.stallCount === s.stalls.length
  ) {
    return c;
  }
  const fresh = rebuild(s, c);
  caches.set(world, fresh);
  return fresh;
}

function rebuild(s: GameState, old: NetworkCache | undefined): NetworkCache {
  const map = s.map;
  const n = map.width * map.height;
  const sameSize = old !== undefined && old.owner.length === n;
  const pool: Uint16Array[] = [];
  if (sameSize && old) {
    for (const f of old.fields.values()) if (f) pool.push(f);
    for (const f of old.staffFields.values()) if (f) pool.push(f);
  }
  const c: NetworkCache = {
    state: s,
    map,
    content: map.content,
    rideCount: s.rides.length,
    stallCount: s.stalls.length,
    dirty: false,
    owner: sameSize && old ? old.owner : new Int32Array(n),
    fields: new Map(),
    staffFields: new Map(),
    pool,
    work: sameSize && old ? old.work : new Int32Array(n),
  };
  computeQueueOwners(s, c);
  return c;
}

/** Flood fill each queue from its ride's entrance outside tile. Rides in ascending id order; the first claim wins. */
function computeQueueOwners(s: GameState, c: NetworkCache): void {
  const { owner, work } = c;
  const map = s.map;
  const content = map.content;
  const w = map.width;
  const h = map.height;
  const n = w * h;
  owner.fill(-1);
  const rides = s.rides.slice().sort((a, b) => a.id - b.id);
  for (const ride of rides) {
    const seed = ride.entrance ? ride.entrance.outside : -1;
    if (seed < 0 || seed >= n || content[seed] !== Content.Queue || owner[seed] !== -1) continue;
    owner[seed] = ride.id;
    let head = 0;
    let tail = 0;
    work[tail++] = seed;
    while (head < tail) {
      const i = work[head++] as number;
      const x = i % w;
      const y = (i - x) / w;
      if (y > 0) tail = claim(i - w, ride.id, content, owner, work, tail);
      if (x < w - 1) tail = claim(i + 1, ride.id, content, owner, work, tail);
      if (y < h - 1) tail = claim(i + w, ride.id, content, owner, work, tail);
      if (x > 0) tail = claim(i - 1, ride.id, content, owner, work, tail);
    }
  }
}

function claim(j: number, id: number, content: Uint8Array, owner: Int32Array, work: Int32Array, tail: number): number {
  if (content[j] !== Content.Queue || owner[j] !== -1) return tail;
  owner[j] = id;
  work[tail] = j;
  return tail + 1;
}

function takeBuffer(c: NetworkCache): Uint16Array {
  return c.pool.pop() ?? new Uint16Array(c.owner.length);
}

/**
 * BFS from `seed`. Footpaths and the park entrance are always walkable.
 * `queue` = NO_QUEUE: no queue tiles; a ride id: only that ride's queue tiles; ANY_QUEUE: every queue tile (staff).
 */
function bfs(c: NetworkCache, seed: number, queue: number, out: Uint16Array): void {
  const content = c.map.content;
  const owner = c.owner;
  const work = c.work;
  const w = c.map.width;
  const h = c.map.height;
  out.fill(UNREACHABLE);
  out[seed] = 0;
  let head = 0;
  let tail = 0;
  work[tail++] = seed;
  while (head < tail) {
    const i = work[head++] as number;
    const d = (out[i] as number) + 1;
    const x = i % w;
    const y = (i - x) / w;
    for (let k = 0; k < 4; k++) {
      let j: number;
      if (k === 0) {
        if (y === 0) continue;
        j = i - w;
      } else if (k === 1) {
        if (x === w - 1) continue;
        j = i + 1;
      } else if (k === 2) {
        if (y === h - 1) continue;
        j = i + w;
      } else {
        if (x === 0) continue;
        j = i - 1;
      }
      if (out[j] !== UNREACHABLE) continue;
      const t = content[j];
      if (t === Content.Footpath || t === Content.ParkEntrance || (t === Content.Queue && (queue === ANY_QUEUE || (queue >= 0 && owner[j] === queue)))) {
        out[j] = d;
        work[tail++] = j;
      }
    }
  }
}

function parseId(dest: string, prefix: string): number {
  const v = Number(dest.slice(prefix.length));
  return Number.isInteger(v) ? v : -1;
}

function computeField(c: NetworkCache, dest: DestKey): Uint16Array | null {
  const s = c.state;
  const content = c.map.content;
  const n = content.length;
  let seed = -1;
  let queue = NO_QUEUE;
  if (dest === 'exit') {
    seed = c.map.entranceTile;
    if (seed < 0 || seed >= n || content[seed] !== Content.ParkEntrance) return null;
  } else if (dest.startsWith('ride:')) {
    const id = parseId(dest, 'ride:');
    const ride = s.rides.find((r) => r.id === id);
    if (!ride || !ride.entrance) return null;
    seed = ride.entrance.outside;
    if (seed < 0 || seed >= n || content[seed] !== Content.Queue || c.owner[seed] !== id) return null;
    queue = id;
  } else if (dest.startsWith('stall:')) {
    const id = parseId(dest, 'stall:');
    const stall = s.stalls.find((st) => st.id === id);
    if (!stall) return null;
    seed = stall.serviceTile;
    if (seed < 0 || seed >= n || content[seed] !== Content.Footpath) return null;
  } else {
    return null;
  }
  const out = takeBuffer(c);
  bfs(c, seed, queue, out);
  return out;
}

/** Guest distance field for `dest`, or null when the destination is missing or has no valid tile. */
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

/** Staff distance field to `target` (footpaths, every queue, park entrance). */
export function staffField(c: NetworkCache, target: number): Uint16Array | null {
  const hit = c.staffFields.get(target);
  if (hit !== undefined) {
    c.staffFields.delete(target);
    c.staffFields.set(target, hit);
    return hit;
  }
  let f: Uint16Array | null = null;
  if (target >= 0 && target < c.owner.length && isStaffWalkableContent(c.map.content[target])) {
    f = takeBuffer(c);
    bfs(c, target, ANY_QUEUE, f);
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
  /** Next tile, or −1 when already at the destination. */
  next: number;
  /** Path distance in tiles. */
  dist: number;
}

/** Best in-field neighbour of `i` in order N, E, S, W (first minimum wins), or −1. */
function bestNeighbour(map: MapState, field: Uint16Array, i: number): number {
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
 * Route from `from` using `field`.
 * - In the field: step to the neighbour with the smallest distance (ties N, E, S, W).
 * - Not in the field: step to the best in-field neighbour. A guest inside a queue may first walk along
 *   that queue (its connected queue tiles) to the queue tile with the shortest total route out.
 * - Null when there is no route.
 */
export function route(map: MapState, field: Uint16Array, from: number): Route | null {
  if (!Number.isInteger(from) || from < 0 || from >= field.length) return null;
  const d = field[from] as number;
  if (d !== UNREACHABLE) {
    if (d === 0) return { next: -1, dist: 0 };
    return { next: bestNeighbour(map, field, from), dist: d };
  }
  if (map.content[from] !== Content.Queue) {
    const b = bestNeighbour(map, field, from);
    return b < 0 ? null : { next: b, dist: (field[b] as number) + 1 };
  }
  return routeOutOfQueue(map, field, from);
}

/** BFS over the queue component of `from` (order N, E, S, W); pick the tile with the shortest total route. */
function routeOutOfQueue(map: MapState, field: Uint16Array, from: number): Route | null {
  const content = map.content;
  const w = map.width;
  const h = map.height;
  const parent = new Map<number, number>([[from, -1]]);
  const depth = new Map<number, number>([[from, 0]]);
  const order: number[] = [from];
  let bestTile = -1;
  let bestTotal = Infinity;
  for (let head = 0; head < order.length; head++) {
    const i = order[head] as number;
    const di = depth.get(i) as number;
    const b = bestNeighbour(map, field, i);
    if (b >= 0) {
      const total = di + 1 + (field[b] as number);
      if (total < bestTotal) {
        bestTotal = total;
        bestTile = i;
      }
    }
    const x = i % w;
    const y = (i - x) / w;
    const ns = [y > 0 ? i - w : -1, x < w - 1 ? i + 1 : -1, y < h - 1 ? i + w : -1, x > 0 ? i - 1 : -1];
    for (const j of ns) {
      if (j < 0 || parent.has(j) || content[j] !== Content.Queue) continue;
      parent.set(j, i);
      depth.set(j, di + 1);
      order.push(j);
    }
  }
  if (bestTile < 0) return null;
  if (bestTile === from) return { next: bestNeighbour(map, field, from), dist: bestTotal };
  let step = bestTile;
  while (parent.get(step) !== from) step = parent.get(step) as number;
  return { next: step, dist: bestTotal };
}
