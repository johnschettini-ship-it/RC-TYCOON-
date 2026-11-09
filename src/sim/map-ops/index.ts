/** Map and reference helpers for building and demolishing (Phase 1 §4.1). Owner: W1-C. */
import { Content, inBounds, isOwned, PathItem, type MapState } from '../map';
import type { World } from '../types';
import type { EntityId } from '../units';

/** Tile index of (x, y), or −1 when the coordinates are not integers or lie outside the map. */
export function tileAt(map: MapState, x: number, y: number): number {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(map, x, y)) return -1;
  return y * map.width + x;
}

/** Tile index of (x, y) when the park owns it, else −1. */
export function ownedTileAt(map: MapState, x: number, y: number): number {
  const i = tileAt(map, x, y);
  return i >= 0 && isOwned(map, i) ? i : -1;
}

/**
 * Straight path line (Phase 1 §4.1): along the x or y axis, whichever has the larger distance from the
 * start tile (x on a tie). Returns the tiles from start to end, or null when the end tile is outside the map
 * or a coordinate is not an integer.
 */
export function lineTiles(map: MapState, x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] | null {
  if (![x0, y0, x1, y1].every(Number.isInteger)) return null;
  const alongX = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  const ex = alongX ? x1 : x0;
  const ey = alongX ? y0 : y1;
  if (!inBounds(map, x0, y0) || !inBounds(map, ex, ey)) return null;
  const n = Math.max(Math.abs(ex - x0), Math.abs(ey - y0));
  const sx = Math.sign(ex - x0);
  const sy = Math.sign(ey - y0);
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k <= n; k++) out.push({ x: x0 + k * sx, y: y0 + k * sy });
  return out;
}

/** Make tile `i` a footpath or queue. Queues hold no path items, so a conversion to queue removes the item. */
export function setPathTile(map: MapState, i: number, content: typeof Content.Footpath | typeof Content.Queue): void {
  map.content[i] = content;
  map.contentRef[i] = -1;
  if (content === Content.Queue) clearPathItem(map, i);
}

/** Remove a footpath or queue tile with its path item, litter, and mess. */
export function clearPathTile(map: MapState, i: number): void {
  map.content[i] = Content.Empty;
  map.contentRef[i] = -1;
  clearPathItem(map, i);
  map.litter[i] = 0;
  map.mess[i] = 0;
}

function clearPathItem(map: MapState, i: number): void {
  map.pathItem[i] = PathItem.None;
  map.pathItemFlags[i] = 0;
  map.binFill[i] = 0;
}

/** Clear every tile that references entity `id`. Returns the number of tiles cleared. */
export function clearEntityTiles(map: MapState, id: EntityId): number {
  const ref = map.contentRef;
  let count = 0;
  for (let i = 0; i < ref.length; i++) {
    if (ref[i] !== id) continue;
    map.content[i] = Content.Empty;
    ref[i] = -1;
    count++;
  }
  return count;
}

/** Insert into an id-sorted array, keeping ascending id order. */
export function insertById<T extends { id: EntityId }>(list: T[], item: T): void {
  let k = list.length;
  while (k > 0 && (list[k - 1] as T).id > item.id) k--;
  list.splice(k, 0, item);
}

/**
 * Clear references to a removed ride or stall outside the guest system (Phase 3 §5 integrity rule):
 * pending breakdowns, staff task targets, and message locate targets.
 * Guests are handled by `stopRide` and `forgetDestination`; campaigns end through their owner (Phase 3 §4.8).
 */
export function forgetEntityReferences(world: World, id: EntityId): void {
  const staff = world.state.staff;
  const pending = staff.pendingBreakdowns;
  for (let k = pending.length - 1; k >= 0; k--) if (pending[k] === id) pending.splice(k, 1);
  for (const m of staff.members) {
    if (m.targetRideId !== id) continue;
    m.targetRideId = -1;
    m.targetTile = -1;
    if (m.state === 'inspecting' || m.state === 'fixing') {
      m.state = 'walking';
      m.stateTicks = 0;
    }
  }
  for (const msg of world.state.management.messages) if (msg.entityId === id) msg.entityId = -1;
}
