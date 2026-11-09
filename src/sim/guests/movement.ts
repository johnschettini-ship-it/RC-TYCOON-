/**
 * Guest movement helpers (Phase 1 §4.2–4.3, Phase 4 §4.2; Review Focus 1–2). Owners: W1-D, W3-B (path nodes).
 * Walking: 10 ticks per tile toward `nextTile` from `nextStep`. Wandering: random linked neighbour without an
 * immediate reversal. Safety: a guest never stays off a path node (a ground path on dry land or an elevated path).
 * A guest's `z` is the height of the node it stands on; every place that moves a guest to a new tile sets it.
 */
import { RELOCATE_RADIUS } from '../../data/tuning/guests';
import { Content, neighbour, type Dir } from '../map';
import { isWalkable, queueOwner } from '../pathing';
import { dirTo, gateNode, hasGroundNode, linkedNode, nodeIdAt, nodeIdsOn, nodeKindOf, nodeTileOf, nodeZOf, stepTile } from '../paths/nodes';
import type { Ride } from '../rides/types';
import { rngInt } from '../rng';
import type { World } from '../types';
import type { Guest } from './types';

const DIRS: readonly Dir[] = [0, 1, 2, 3];
const FOOTPATH = Content.Footpath;
const QUEUE = Content.Queue;
const ENTRANCE = Content.ParkEntrance;

function isQueueTile(world: World, tile: number): boolean {
  return world.state.map.content[tile] === Content.Queue || (world.state.elevatedPaths.length > 0 && hasNodeOfKind(world, tile, 'queue'));
}

function hasNodeOfKind(world: World, tile: number, kind: string): boolean {
  for (const node of nodeIdsOn(world, tile)) if (nodeKindOf(world, node) === kind) return true;
  return false;
}

/**
 * A tile a guest may stand on: a guest-walkable tile (footpath, park entrance) or a queue tile.
 * `isWalkable(…, 'guest')` excludes queue tiles because guests enter a queue only on their ride's route,
 * but a guest standing in a queue line is fine. The park entrance always counts.
 * With `z` (Phase 4): the node at that height must exist.
 */
export function tileOk(world: World, tile: number, z?: number): boolean {
  if (tile < 0 || tile >= world.state.map.content.length) return false;
  if (tile === world.state.map.entranceTile) return true;
  if (z !== undefined) return nodeIdAt(world, tile, z) >= 0;
  return isWalkable(world, tile, 'guest') || isQueueTile(world, tile);
}

/**
 * Keep the guest on a node of its tile. When `(tile, z)` is no node but the tile has one (the path under the guest
 * changed height, or a hook moved the guest), the guest takes the node nearest in height (the lower on a tie).
 * Returns false when the tile has no node at all (the caller relocates). The park entrance tile always counts.
 */
export function keepOnNode(world: World, guest: Guest): boolean {
  const tile = guest.tile;
  const map = world.state.map;
  // Fast path (every guest, every tick): a dry ground path at the guest's height.
  if (tile >= 0 && tile < map.content.length) {
    const c = map.content[tile];
    const h = map.heights[tile] as number;
    if ((c === FOOTPATH || c === QUEUE || c === ENTRANCE) && h === guest.z && (map.water[tile] as number) <= h) return true;
  }
  if (!tileOk(world, tile)) return false;
  if (nodeIdAt(world, tile, guest.z) >= 0) return true;
  let best = -1;
  let bestGap = Infinity;
  for (const node of nodeIdsOn(world, tile)) {
    const gap = Math.abs(nodeZOf(world, node) - guest.z);
    if (gap < bestGap) {
      best = node;
      bestGap = gap;
    }
  }
  if (best >= 0) guest.z = nodeZOf(world, best);
  else if (tile === world.state.map.entranceTile) guest.z = world.state.map.heights[tile] as number;
  return true;
}

/** Direction of a 4-neighbour step, or the guest's current direction for anything else. */
export function dirBetween(world: World, from: number, to: number, fallback: Dir): Dir {
  for (const d of DIRS) if (neighbour(world.state.map, from, d) === to) return d;
  return fallback;
}

/**
 * Guests whose step began in the current guest pass (`updateGuests`). Per-step work in the per-tick guest hooks (the
 * facilities' lost count, impulse buys, wrong turns — Phase 3 §4.10) asks `stepBeganThisPass`, so each step is
 * handled exactly once whatever the walking speed: a step's first tick no longer moves `progress` by exactly 1 once
 * ramps (× 0.75 / × 1.10, Phase 4 §4.2) or Calm and Buzz walking factors apply. Transient and never saved: the pass
 * clears the list before and after it runs, and a save happens between passes.
 */
const stepStarts = new WeakMap<World, Set<number>>();

/** Forget the step starts of the last pass (`updateGuests` calls it before and after the pass). */
export function clearStepStarts(world: World): void {
  stepStarts.get(world)?.clear();
}

/** True when `guest` began its current step in the running guest pass. */
export function stepBeganThisPass(world: World, guest: Guest): boolean {
  return stepStarts.get(world)?.has(guest.id) ?? false;
}

export function beginStep(world: World, guest: Guest, next: number): void {
  guest.dir = dirBetween(world, guest.tile, next, guest.dir);
  guest.nextTile = next;
  guest.progress = 0;
  let starts = stepStarts.get(world);
  if (!starts) {
    starts = new Set();
    stepStarts.set(world, starts);
  }
  starts.add(guest.id);
}

export function stopWalking(guest: Guest): void {
  guest.nextTile = -1;
  guest.progress = 0;
}

/**
 * True when the guest may take the step to `next`: from a path node, the two nodes must link (no cliff, no edge
 * scenery, matching heights); off the network (the park entrance tile), `next` must be a tile a guest may stand on.
 */
export function stepAllowed(world: World, guest: Guest, next: number): boolean {
  const map = world.state.map;
  const here = guest.tile;
  if (world.state.elevatedPaths.length === 0 && here >= 0 && next >= 0 && map.slope[here] === 0 && map.slope[next] === 0) {
    // Fast path (flat ground, no elevated paths): the Build 1 grid, minus cliffs, water, and edge scenery.
    if (map.heights[here] !== guest.z || !hasGroundNode(map, here)) return tileOk(world, next);
    if (map.heights[next] !== guest.z || !hasGroundNode(map, next)) return false;
    const d = dirTo(map, here, next);
    return d >= 0 && (linkedNode(world, here, d) >= 0);
  }
  const from = nodeIdAt(world, here, guest.z);
  if (from < 0) return tileOk(world, next);
  for (let d = 0; d < 4; d++) {
    if (stepTile(map, guest.tile, d) !== next) continue;
    const to = linkedNode(world, from, d);
    return to >= 0;
  }
  return false;
}

/**
 * Breadth-first search from `from` (N, E, S, W order) for the nearest tile that passes `accept`,
 * expanding only through tiles that pass `through`, at most `radius` steps. Null when none.
 */
export function searchTiles(
  world: World,
  from: number,
  radius: number,
  accept: (t: number) => boolean,
  through: (t: number) => boolean,
): number | null {
  const map = world.state.map;
  if (from < 0) return null;
  const seen = new Set<number>([from]);
  let frontier = [from];
  for (let depth = 1; depth <= radius && frontier.length > 0; depth++) {
    const next: number[] = [];
    for (const t of frontier) {
      for (const d of DIRS) {
        const n = neighbour(map, t, d);
        if (n < 0 || seen.has(n)) continue;
        seen.add(n);
        if (accept(n)) return n;
        if (through(n)) next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}

/** The lowest footpath or park entrance node on `tile` (a guest may stand there freely), or −1. */
function freeNodeOn(world: World, tile: number): number {
  for (const node of nodeIdsOn(world, tile)) if (nodeKindOf(world, node) !== 'queue') return node;
  return -1;
}

/** Nearest walkable, non-queue tile within RELOCATE_RADIUS (any tiles in between), or null. */
export function nearestWalkable(world: World, from: number): number | null {
  return searchTiles(
    world,
    from,
    RELOCATE_RADIUS,
    (t) => tileOk(world, t) && !isQueueTile(world, t),
    () => true,
  );
}

/** Move a stranded guest to the nearest walkable tile (≤ 10 tiles), else to the park entrance; `z` follows. */
export function relocate(world: World, guest: Guest): void {
  const map = world.state.map;
  const tile = nearestWalkable(world, guest.tile) ?? map.entranceTile;
  guest.tile = tile;
  const node = freeNodeOn(world, tile);
  guest.z = node >= 0 ? nodeZOf(world, node) : (map.heights[tile] ?? guest.z);
  stopWalking(guest);
}

/**
 * A guest standing in a queue line steps out of it: along the linked queue nodes to the nearest non-queue node.
 * No change when the guest is not on a queue node or no exit is found.
 */
export function stepOffQueue(world: World, guest: Guest): void {
  if (guest.tile < 0) return;
  let start = nodeIdAt(world, guest.tile, guest.z);
  if (start < 0 || nodeKindOf(world, start) !== 'queue') {
    // A guest whose height went stale still counts as standing in the queue of its tile.
    start = -1;
    for (const node of nodeIdsOn(world, guest.tile)) {
      if (nodeKindOf(world, node) === 'queue') {
        start = node;
        break;
      }
    }
    if (start < 0) return;
  }
  const seen = new Set<number>([start]);
  let frontier = [start];
  let out = -1;
  while (frontier.length > 0 && out < 0) {
    const next: number[] = [];
    for (const node of frontier) {
      for (const d of DIRS) {
        const j = linkedNode(world, node, d);
        if (j < 0 || seen.has(j)) continue;
        seen.add(j);
        if (nodeKindOf(world, j) !== 'queue') {
          out = j;
          break;
        }
        next.push(j);
      }
      if (out >= 0) break;
    }
    frontier = next;
  }
  if (out >= 0) {
    guest.tile = nodeTileOf(world, out);
    guest.z = nodeZOf(world, out);
  }
  stopWalking(guest);
}

/**
 * Pick a random linked neighbour without reversing (unless it is a dead end).
 * Queue nodes are off limits, except along the queue the guest already stands on.
 * The park entrance is used only by leaving guests. Returns −1 when there is nowhere to go.
 */
export function wanderStep(world: World, guest: Guest): number {
  const map = world.state.map;
  const here = guest.tile;
  const from = nodeIdAt(world, here, guest.z);
  const onQueue = from >= 0 ? nodeKindOf(world, from) === 'queue' : isQueueTile(world, here);
  const owner = onQueue ? queueOwner(world, here, from >= 0 ? guest.z : undefined) : null;
  const back = neighbour(map, here, ((guest.dir + 2) % 4) as Dir);
  const options: number[] = [];
  for (const d of DIRS) {
    let n: number;
    let queue: boolean;
    let nOwner: number | null = null;
    if (from >= 0) {
      const j = linkedNode(world, from, d);
      if (j < 0) continue;
      n = nodeTileOf(world, j);
      queue = nodeKindOf(world, j) === 'queue';
      if (queue) nOwner = queueOwner(world, n, nodeZOf(world, j));
    } else {
      n = neighbour(map, here, d);
      if (n < 0 || !tileOk(world, n)) continue;
      queue = isQueueTile(world, n);
      if (queue) nOwner = queueOwner(world, n);
    }
    if (n === map.entranceTile && guest.state !== 'leaving') continue;
    if (queue && !(onQueue && nOwner === owner)) continue;
    options.push(n);
  }
  if (options.length > 1) {
    const i = options.indexOf(back);
    if (i >= 0) options.splice(i, 1);
  }
  if (options.length === 0) return -1;
  return options[rngInt(world.state, 0, options.length - 1)] as number;
}

/**
 * Height of the node outside a ride gate the guest is put on (Phase 4 §4.2: gates connect at the ride height).
 * `tile` is the tile the guest was put on; the guest's `z` stays when it is not outside one of the gates.
 */
export function gateZ(world: World, ride: Ride, tile: number, fallback: number): number {
  for (const g of [ride.exit, ride.entrance]) {
    if (!g || g.outside !== tile) continue;
    const node = gateNode(world, g.gate, g.outside);
    if (node >= 0) return nodeZOf(world, node);
    return world.state.map.heights[tile] ?? fallback;
  }
  return fallback;
}
