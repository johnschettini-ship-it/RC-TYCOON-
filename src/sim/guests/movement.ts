/**
 * Guest movement helpers (Phase 1 §4.2–4.3; Review Focus 1–2). Owner: W1-D.
 * Walking: 10 ticks per tile toward `nextTile` from `nextStep`. Wandering: random walkable
 * neighbour without an immediate reversal. Safety: a guest never stays on a non-walkable tile.
 */
import { RELOCATE_RADIUS } from '../../data/tuning/guests';
import { Content, neighbour, type Dir } from '../map';
import { isWalkable, queueOwner } from '../pathing';
import { rngInt } from '../rng';
import type { World } from '../types';
import type { Guest } from './types';

const DIRS: readonly Dir[] = [0, 1, 2, 3];

function isQueueTile(world: World, tile: number): boolean {
  return world.state.map.content[tile] === Content.Queue;
}

/**
 * A tile a guest may stand on: a guest-walkable tile (footpath, park entrance) or a queue tile.
 * `isWalkable(…, 'guest')` excludes queue tiles because guests enter a queue only on their ride's route,
 * but a guest standing in a queue line is fine. The park entrance always counts.
 */
export function tileOk(world: World, tile: number): boolean {
  if (tile < 0 || tile >= world.state.map.content.length) return false;
  if (tile === world.state.map.entranceTile) return true;
  return isWalkable(world, tile, 'guest') || isQueueTile(world, tile);
}

/** Direction of a 4-neighbour step, or the guest's current direction for anything else. */
export function dirBetween(world: World, from: number, to: number, fallback: Dir): Dir {
  for (const d of DIRS) if (neighbour(world.state.map, from, d) === to) return d;
  return fallback;
}

export function beginStep(world: World, guest: Guest, next: number): void {
  guest.dir = dirBetween(world, guest.tile, next, guest.dir);
  guest.nextTile = next;
  guest.progress = 0;
}

export function stopWalking(guest: Guest): void {
  guest.nextTile = -1;
  guest.progress = 0;
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

/** Move a stranded guest to the nearest walkable tile (≤ 10 tiles), else to the park entrance. */
export function relocate(world: World, guest: Guest): void {
  guest.tile = nearestWalkable(world, guest.tile) ?? world.state.map.entranceTile;
  stopWalking(guest);
}

/**
 * A guest standing in a queue line steps out of it: along the queue tiles to the nearest
 * walkable non-queue tile. No change when the guest is not on a queue tile or no exit is found.
 */
export function stepOffQueue(world: World, guest: Guest): void {
  if (guest.tile < 0 || !isQueueTile(world, guest.tile)) return;
  const out = searchTiles(
    world,
    guest.tile,
    world.state.map.width * world.state.map.height,
    (t) => tileOk(world, t) && !isQueueTile(world, t),
    (t) => isQueueTile(world, t) && tileOk(world, t),
  );
  if (out !== null) guest.tile = out;
  stopWalking(guest);
}

/**
 * Pick a random walkable neighbour without reversing (unless it is a dead end).
 * Queue tiles are off limits, except along the queue the guest already stands on.
 * The park entrance is used only by leaving guests. Returns −1 when there is nowhere to go.
 */
export function wanderStep(world: World, guest: Guest): number {
  const map = world.state.map;
  const here = guest.tile;
  const onQueue = isQueueTile(world, here);
  const owner = onQueue ? queueOwner(world, here) : null;
  const back = neighbour(map, here, ((guest.dir + 2) % 4) as Dir);
  const options: number[] = [];
  for (const d of DIRS) {
    const n = neighbour(map, here, d);
    if (n < 0 || !tileOk(world, n)) continue;
    if (n === map.entranceTile && guest.state !== 'leaving') continue;
    if (isQueueTile(world, n) && !(onQueue && queueOwner(world, n) === owner)) continue;
    options.push(n);
  }
  if (options.length > 1) {
    const i = options.indexOf(back);
    if (i >= 0) options.splice(i, 1);
  }
  if (options.length === 0) return -1;
  return options[rngInt(world.state, 0, options.length - 1)] as number;
}
