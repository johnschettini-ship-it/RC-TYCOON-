/**
 * Path step builder Undo with a refund (touch controls follow-up, 2026-11-18). A path tile built by the step builder
 * (`buildPath` / `buildPathLine` with `undoable: true`) is remembered with the price paid for it; `undoPath` on that
 * tile removes it and refunds that price in full, like the coaster builder's Undo of a never-opened piece. Any other
 * path (built before, by a drag, or by a script) keeps today's demolish rule (0%, master R15).
 *
 * The memory is session state, not park state: it lives beside the world (a new or loaded world starts empty), is never
 * saved, and an entry is dropped as soon as its tile is demolished, rebuilt by anything else, or undone.
 */
import type { World } from '../types';
import type { Cents } from '../units';

/** Most tiles remembered; the oldest go first (the builder's own history is shorter). */
const MAX_ENTRIES = 2000;

const store = new WeakMap<World, Map<string, Cents>>();

function keyOf(tile: number, z: number | null): string {
  return z === null ? `${tile}` : `${tile}@${z}`;
}

function mapOf(world: World): Map<string, Cents> {
  let m = store.get(world);
  if (!m) {
    m = new Map();
    store.set(world, m);
  }
  return m;
}

/** The step builder paid `cost` for the new path node on `tile` at `z` (null = ground). */
export function notePathBuilt(world: World, tile: number, z: number | null, cost: Cents): void {
  const m = mapOf(world);
  const k = keyOf(tile, z);
  m.delete(k);
  m.set(k, cost);
  while (m.size > MAX_ENTRIES) m.delete(m.keys().next().value as string);
}

/** The node on `tile` at `z` changed some other way: it is no longer an undoable builder tile. */
export function forgetPath(world: World, tile: number, z: number | null): void {
  store.get(world)?.delete(keyOf(tile, z));
}

/** The price the step builder paid for the node on `tile` at `z`, or 0 when it is not an undoable builder tile. */
export function undoablePathCost(world: World, tile: number, z: number | null): Cents {
  return store.get(world)?.get(keyOf(tile, z)) ?? 0;
}
