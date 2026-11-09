/**
 * Derived per-tile scenery index (Phase 4 §4.5). Owner: W3-D. Never saved: it lives in a module-level
 * WeakMap<World, …> like the pathing caches and is rebuilt from `state.scenery` on first use after a load
 * (or when the list no longer matches it). Placement and removal update it in place.
 *
 * - `centre[tile]`: id of the centre item whose footprint covers the tile (arches over paths included), or −1.
 * - `edge[tile × 4 + dir]`: id of the edge item standing on that edge of that tile, or −1.
 * - `edgeMask[tile]`: bit `dir` set when an edge item stands on the shared edge in direction `dir`, from either side.
 * - `spooky[tile]`: spooky items (flag K) whose origin tile is this tile.
 */
import { getSceneryDef, type SceneryDef } from '../../data/catalog';
import { neighbour, type Dir, type MapState } from '../map';
import type { GameState, World } from '../types';
import type { EntityId } from '../units';
import { sceneryExtent } from './extent';
import type { Scenery } from './types';

export interface SceneryIndex {
  state: GameState;
  map: MapState;
  list: Scenery[];
  /** List length and last id when the index was last brought up to date (detects outside edits). */
  count: number;
  lastId: EntityId;
  byId: Map<EntityId, Scenery>;
  centre: Int32Array;
  edge: Int32Array;
  edgeMask: Uint8Array;
  spooky: Uint16Array;
}

const caches = new WeakMap<World, SceneryIndex>();

const OPPOSITE: readonly Dir[] = [2, 3, 0, 1];

export function oppositeDir(d: Dir): Dir {
  return OPPOSITE[d] as Dir;
}

/** Footprint tile indices of a centre item (origin = minimum corner), or null when a tile is off the map. */
export function footprintOf(map: Pick<MapState, 'width' | 'height'>, def: Pick<SceneryDef, 'w' | 'd'>, x: number, y: number, rotation: Dir): number[] | null {
  const { w, d } = sceneryExtent(def, rotation);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + w > map.width || y + d > map.height) return null;
  const out: number[] = [];
  for (let dy = 0; dy < d; dy++) for (let dx = 0; dx < w; dx++) out.push((y + dy) * map.width + x + dx);
  return out;
}

/** Tiles an item touches (fields, light, occupancy): its footprint; an edge item its own tile. */
export function itemTiles(map: Pick<MapState, 'width' | 'height'>, item: Scenery, def: SceneryDef): number[] {
  if (def.edge) return item.x >= 0 && item.y >= 0 && item.x < map.width && item.y < map.height ? [item.y * map.width + item.x] : [];
  return footprintOf(map, def, item.x, item.y, item.rotation) ?? [];
}

function lastIdOf(list: readonly Scenery[]): EntityId {
  return list.length === 0 ? 0 : (list[list.length - 1] as Scenery).id;
}

function addItem(c: SceneryIndex, item: Scenery): void {
  const def = getSceneryDef(item.defId);
  c.byId.set(item.id, item);
  if (!def) return;
  const map = c.map;
  const origin = item.y * map.width + item.x;
  if (def.spooky && origin >= 0 && origin < c.spooky.length) c.spooky[origin] = (c.spooky[origin] as number) + 1;
  if (def.edge) {
    if (item.edge < 0 || origin < 0 || origin >= c.centre.length) return;
    const dir = item.edge as Dir;
    c.edge[origin * 4 + dir] = item.id;
    c.edgeMask[origin] = (c.edgeMask[origin] as number) | (1 << dir);
    const n = neighbour(map, origin, dir);
    if (n >= 0) c.edgeMask[n] = (c.edgeMask[n] as number) | (1 << oppositeDir(dir));
    return;
  }
  const tiles = footprintOf(map, def, item.x, item.y, item.rotation);
  if (tiles) for (const t of tiles) c.centre[t] = item.id;
}

function removeItem(c: SceneryIndex, item: Scenery): void {
  const def = getSceneryDef(item.defId);
  c.byId.delete(item.id);
  if (!def) return;
  const map = c.map;
  const origin = item.y * map.width + item.x;
  if (def.spooky && origin >= 0 && origin < c.spooky.length && (c.spooky[origin] as number) > 0) c.spooky[origin] = (c.spooky[origin] as number) - 1;
  if (def.edge) {
    if (item.edge < 0 || origin < 0 || origin >= c.centre.length) return;
    const dir = item.edge as Dir;
    if (c.edge[origin * 4 + dir] === item.id) c.edge[origin * 4 + dir] = -1;
    c.edgeMask[origin] = (c.edgeMask[origin] as number) & ~(1 << dir);
    const n = neighbour(map, origin, dir);
    if (n >= 0) c.edgeMask[n] = (c.edgeMask[n] as number) & ~(1 << oppositeDir(dir));
    return;
  }
  const tiles = footprintOf(map, def, item.x, item.y, item.rotation);
  if (tiles) for (const t of tiles) if (c.centre[t] === item.id) c.centre[t] = -1;
}

function rebuild(s: GameState): SceneryIndex {
  const map = s.map;
  const n = map.width * map.height;
  const c: SceneryIndex = {
    state: s,
    map,
    list: s.scenery,
    count: s.scenery.length,
    lastId: lastIdOf(s.scenery),
    byId: new Map(),
    centre: new Int32Array(n).fill(-1),
    edge: new Int32Array(n * 4).fill(-1),
    edgeMask: new Uint8Array(n),
    spooky: new Uint16Array(n),
  };
  for (const item of s.scenery) addItem(c, item);
  return c;
}

/** The index of this world, rebuilt when the state, the map, or the list changed outside the scenery commands. */
export function sceneryIndex(world: World): SceneryIndex {
  const s = world.state;
  const c = caches.get(world);
  if (c && c.state === s && c.map === s.map && c.list === s.scenery && c.count === s.scenery.length && c.lastId === lastIdOf(s.scenery)) return c;
  const fresh = rebuild(s);
  caches.set(world, fresh);
  return fresh;
}

/** Drop the index (a caller edited `state.scenery` directly); the next query rebuilds it. */
export function markSceneryDirty(world: World): void {
  caches.delete(world);
}

/** Record an item just inserted into `state.scenery`. */
export function indexAdd(world: World, item: Scenery): void {
  const c = caches.get(world);
  if (!c) return;
  if (c.state !== world.state || c.list !== world.state.scenery || c.count !== world.state.scenery.length - 1) {
    caches.delete(world);
    return;
  }
  addItem(c, item);
  c.count = world.state.scenery.length;
  c.lastId = lastIdOf(world.state.scenery);
}

/** Record an item just spliced out of `state.scenery`. */
export function indexRemove(world: World, item: Scenery): void {
  const c = caches.get(world);
  if (!c) return;
  if (c.state !== world.state || c.list !== world.state.scenery || c.count !== world.state.scenery.length + 1) {
    caches.delete(world);
    return;
  }
  removeItem(c, item);
  c.count = world.state.scenery.length;
  c.lastId = lastIdOf(world.state.scenery);
}
