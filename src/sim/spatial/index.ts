/**
 * Owner: W1-H. Guest-per-tile index (Phase 3 §4.1). Derived data: a WeakMap per world, never in GameState.
 * The index is a counting-sort layout (`start` offsets per tile, guest ids in ascending order per tile).
 * It is rebuilt lazily when the tick changes or when a system calls `invalidateGuestIndex` after guests
 * moved (the staff update does this at its start, because guests move before staff in the tick order).
 * Radius checks read only the tiles inside the radius.
 */
import type { World } from '../types';

interface GuestTileIndex {
  tick: number;
  guestCount: number;
  valid: boolean;
  /** start[t] … start[t + 1] − 1 index into `ids` for tile t. Length = tiles + 1. */
  start: Int32Array;
  ids: Int32Array;
}

const cache = new WeakMap<World, GuestTileIndex>();

function build(world: World, prev: GuestTileIndex | undefined): GuestTileIndex {
  const { map, guests } = world.state;
  const n = map.width * map.height;
  const start = prev && prev.start.length === n + 1 ? prev.start : new Int32Array(n + 1);
  start.fill(0);
  for (const g of guests) {
    if (g.tile >= 0 && g.tile < n) start[g.tile + 1] = (start[g.tile + 1] as number) + 1;
  }
  for (let t = 0; t < n; t++) start[t + 1] = (start[t + 1] as number) + (start[t] as number);
  const ids = prev && prev.ids.length >= guests.length ? prev.ids : new Int32Array(Math.max(16, guests.length * 2));
  const fill = new Int32Array(n);
  // Guests are sorted by id, so each tile's ids come out ascending.
  for (const g of guests) {
    if (g.tile < 0 || g.tile >= n) continue;
    const at = (start[g.tile] as number) + (fill[g.tile] as number);
    ids[at] = g.id;
    fill[g.tile] = (fill[g.tile] as number) + 1;
  }
  return { tick: world.state.tick, guestCount: guests.length, valid: true, start, ids };
}

function indexFor(world: World): GuestTileIndex {
  const cur = cache.get(world);
  if (cur && cur.valid && cur.tick === world.state.tick && cur.guestCount === world.state.guests.length) return cur;
  const next = build(world, cur);
  cache.set(world, next);
  return next;
}

/** Call after guests changed tiles within the same tick. */
export function invalidateGuestIndex(world: World): void {
  const cur = cache.get(world);
  if (cur) cur.valid = false;
}

export function guestCountOnTile(world: World, tile: number): number {
  const idx = indexFor(world);
  if (tile < 0 || tile + 1 >= idx.start.length) return 0;
  return (idx.start[tile + 1] as number) - (idx.start[tile] as number);
}

/** Guest ids on one tile, ascending. */
export function guestIdsOnTile(world: World, tile: number): number[] {
  const idx = indexFor(world);
  if (tile < 0 || tile + 1 >= idx.start.length) return [];
  return Array.from(idx.ids.subarray(idx.start[tile] as number, idx.start[tile + 1] as number));
}

/** Guests within Chebyshev radius `r` of `tile` (Phase 3 §4.1). */
export function countGuestsWithin(world: World, tile: number, r: number): number {
  const idx = indexFor(world);
  const map = world.state.map;
  const cx = tile % map.width;
  const cy = Math.floor(tile / map.width);
  const x0 = Math.max(0, cx - r);
  const x1 = Math.min(map.width - 1, cx + r);
  const y0 = Math.max(0, cy - r);
  const y1 = Math.min(map.height - 1, cy + r);
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    const row = y * map.width;
    n += (idx.start[row + x1 + 1] as number) - (idx.start[row + x0] as number);
  }
  return n;
}
