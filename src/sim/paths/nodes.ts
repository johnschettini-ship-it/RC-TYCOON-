/**
 * Path nodes and their links (Phase 4 §4.2). Owner: W3-B.
 *
 * A node is a walkable surface `(tile, z)`:
 * - a ground node: `map.content` Footpath, Queue, or ParkEntrance on a dry tile, at the tile base height. A ground
 *   path follows the land: flat, or one of the 4 ramp masks (`RAMP_MASK`), rising 1 step over the tile;
 * - an elevated node: one entry of `state.elevatedPaths`, at its `z`, flat or rising toward `rampDir`.
 *
 * Node ids: a ground node has id = its tile index, the elevated path at index k of `state.elevatedPaths` has id
 * `tileCount + k`. Ids change when the elevated list changes, so walkers store `(tile, z)`, never an id.
 *
 * Everything here is computed from the map arrays and the elevated path list on every call (only the per-tile
 * elevated index is cached, and it checks itself against the list), so walkers, staff searches, and tests that
 * write the map by hand always agree with the map. The cached graph for distance fields is `../pathing/network`.
 */
import { PATH_HEADROOM } from '../../data/tuning/paths';
import { Content, DIR_DX, DIR_DY, type Dir, type MapState } from '../map';
import { edgeBlocked } from '../scenery/api';
import type { World } from '../types';
import type { ElevatedPath, RampDir } from './types';

/** Slope mask of a ground ramp by the `Dir` it rises toward: N+E (−y), E+S (+x), S+W (+y), W+N (−x). */
export const RAMP_MASK: readonly number[] = [0b0011, 0b0110, 0b1100, 0b1001];

/** Ramp value of a ground path on a slope that no path may use (no edge connects). */
export const BAD_SLOPE = -2;

/** −1 for flat land, the rising `Dir` for the 4 ramp masks, else `BAD_SLOPE`. */
export function rampDirOfMask(mask: number): number {
  if (mask === 0) return -1;
  for (let d = 0; d < 4; d++) if (RAMP_MASK[d] === mask) return d;
  return BAD_SLOPE;
}

/**
 * Height of edge `dir` of a node with base `z` and ramp `ramp` (−1 flat, 0–3 rising toward that `Dir`), or −1 when
 * that edge does not connect. Flat: every edge at `z`. Ramp: the high edge at `z + 1`, the low edge at `z`, the
 * side edges do not connect.
 */
export function edgeHeight(z: number, ramp: number, dir: number): number {
  if (ramp === -1) return z;
  if (ramp === dir) return z + 1;
  if (ramp >= 0 && ((ramp + 2) & 3) === dir) return z;
  return -1;
}

export function isGroundPathContent(c: number | undefined): boolean {
  return c === Content.Footpath || c === Content.Queue || c === Content.ParkEntrance;
}

/** A tile is wet when its water surface is above its lowest corner (Phase 4 §4.3). */
function wet(map: MapState, i: number): boolean {
  return (map.water[i] as number) > (map.heights[i] as number);
}

/** True when tile `i` holds a ground node (a ground path on dry land). Guests never stand on a wet tile. */
export function hasGroundNode(map: MapState, i: number): boolean {
  return isGroundPathContent(map.content[i]) && !wet(map, i);
}

/** Ramp of the ground path on tile `i` (from the slope mask). */
export function groundRamp(map: MapState, i: number): number {
  return rampDirOfMask(map.slope[i] as number);
}

// ---------------------------------------------------------------- elevated index

interface ElevatedIndex {
  list: ElevatedPath[];
  len: number;
  tiles: number;
  /** First elevated path index on each tile (lowest z first), or −1. */
  head: Int32Array;
  /** Next index on the same tile, or −1. */
  next: Int32Array;
  /** Tile of each elevated path (−1 when it lies outside the map). */
  tile: Int32Array;
}

const elevatedCache = new WeakMap<World, ElevatedIndex>();

/** Call after an elevated path changed in place (its z, kind, or ramp). Adding or removing one is noticed anyway. */
export function markElevatedDirty(world: World): void {
  elevatedCache.delete(world);
}

/** Per-tile index of `state.elevatedPaths`, rebuilt when the list, its length, or the map size changed. */
export function elevatedIndex(world: World): ElevatedIndex {
  const s = world.state;
  const list = s.elevatedPaths;
  const map = s.map;
  const tiles = map.width * map.height;
  const c = elevatedCache.get(world);
  if (c && c.list === list && c.len === list.length && c.tiles === tiles) return c;
  const head = c && c.tiles === tiles ? c.head : new Int32Array(tiles);
  head.fill(-1);
  const next = new Int32Array(list.length).fill(-1);
  const tile = new Int32Array(list.length).fill(-1);
  for (let k = 0; k < list.length; k++) {
    const p = list[k] as ElevatedPath;
    if (p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height) continue;
    const t = p.y * map.width + p.x;
    tile[k] = t;
    // Insert sorted by z, then by id (the list is in id order, so the earlier entry stays first on a tie).
    let prev = -1;
    let cur = head[t] as number;
    while (cur >= 0 && (list[cur] as ElevatedPath).z <= p.z) {
      prev = cur;
      cur = next[cur] as number;
    }
    next[k] = cur;
    if (prev < 0) head[t] = k;
    else next[prev] = k;
  }
  const fresh: ElevatedIndex = { list, len: list.length, tiles, head, next, tile };
  elevatedCache.set(world, fresh);
  return fresh;
}

/** First elevated path index on `tile` (lowest z), or −1. Follow with `nextElevatedOnTile`. */
export function firstElevatedOnTile(world: World, tile: number): number {
  if (world.state.elevatedPaths.length === 0) return -1;
  const idx = elevatedIndex(world);
  return tile >= 0 && tile < idx.tiles ? (idx.head[tile] as number) : -1;
}

export function nextElevatedOnTile(world: World, k: number): number {
  return elevatedIndex(world).next[k] as number;
}

// ---------------------------------------------------------------- nodes

function tileCount(world: World): number {
  return world.state.map.width * world.state.map.height;
}

/** Node id of the walking surface `(tile, z)`, or −1 when there is none. */
export function nodeIdAt(world: World, tile: number, z: number): number {
  const map = world.state.map;
  const n = map.width * map.height;
  if (!Number.isInteger(tile) || tile < 0 || tile >= n) return -1;
  if (hasGroundNode(map, tile) && map.heights[tile] === z) return tile;
  for (let k = firstElevatedOnTile(world, tile); k >= 0; k = nextElevatedOnTile(world, k)) {
    if ((world.state.elevatedPaths[k] as ElevatedPath).z === z) return n + k;
  }
  return -1;
}

/** Every node id on `tile`, lowest first (ground node, then elevated paths by z). Allocates; not for hot loops. */
export function nodeIdsOn(world: World, tile: number): number[] {
  const map = world.state.map;
  const n = map.width * map.height;
  const out: number[] = [];
  if (!Number.isInteger(tile) || tile < 0 || tile >= n) return out;
  if (hasGroundNode(map, tile)) out.push(tile);
  for (let k = firstElevatedOnTile(world, tile); k >= 0; k = nextElevatedOnTile(world, k)) out.push(n + k);
  return out;
}

/** The lowest node on `tile` (the ground node when there is one), or −1. */
export function lowestNodeOn(world: World, tile: number): number {
  const map = world.state.map;
  const n = map.width * map.height;
  if (!Number.isInteger(tile) || tile < 0 || tile >= n) return -1;
  if (hasGroundNode(map, tile)) return tile;
  const k = firstElevatedOnTile(world, tile);
  return k >= 0 ? n + k : -1;
}

export function nodeTileOf(world: World, node: number): number {
  const n = tileCount(world);
  return node < n ? node : (elevatedIndex(world).tile[node - n] as number);
}

export function nodeZOf(world: World, node: number): number {
  const n = tileCount(world);
  return node < n ? (world.state.map.heights[node] as number) : (world.state.elevatedPaths[node - n] as ElevatedPath).z;
}

/** −1 flat, 0–3 ramp rising toward that `Dir`, or `BAD_SLOPE`. */
export function nodeRampOf(world: World, node: number): number {
  const n = tileCount(world);
  return node < n ? groundRamp(world.state.map, node) : (world.state.elevatedPaths[node - n] as ElevatedPath).rampDir;
}

export type NodeKind = 'footpath' | 'queue' | 'entrance';

export function nodeKindOf(world: World, node: number): NodeKind {
  const n = tileCount(world);
  if (node >= n) return (world.state.elevatedPaths[node - n] as ElevatedPath).kind;
  const c = world.state.map.content[node];
  return c === Content.Queue ? 'queue' : c === Content.ParkEntrance ? 'entrance' : 'footpath';
}

/** Height of the walking surface at the tile centre (a ramp is half a step up). */
export function nodeCentreHeight(world: World, node: number): number {
  return nodeZOf(world, node) + (nodeRampOf(world, node) >= 0 ? 0.5 : 0);
}

/** Neighbour tile of `tile` toward `dir`, or −1 outside the map. */
export function stepTile(map: MapState, tile: number, dir: number): number {
  const w = map.width;
  const x = (tile % w) + (DIR_DX[dir] as number);
  const y = Math.floor(tile / w) + (DIR_DY[dir] as number);
  return x >= 0 && y >= 0 && x < w && y < map.height ? y * w + x : -1;
}

/** Map direction from `from` to its 4-neighbour `to`, or −1. */
export function dirTo(map: MapState, from: number, to: number): number {
  const w = map.width;
  const d = to - from;
  if (d === -w) return 0;
  if (d === w) return 2;
  if (d === 1 && to % w !== 0) return 1;
  if (d === -1 && from % w !== 0) return 3;
  return -1;
}

/**
 * The node on the neighbour tile that `node` links to across edge `dir`, or −1 (Phase 4 §4.2): both facing edges
 * connect, at the same height, and no edge scenery blocks the shared edge near the ground (W3-D `edgeBlocked`;
 * edge items stand on the ground, so they block links below ground + 3 m).
 */
export function linkedNode(world: World, node: number, dir: number): number {
  const map = world.state.map;
  const n = map.width * map.height;
  const list = world.state.elevatedPaths;
  let tile: number;
  let h: number;
  if (node < n) {
    tile = node;
    const s = map.slope[node] as number;
    h = edgeHeight(map.heights[node] as number, s === 0 ? -1 : rampDirOfMask(s), dir);
  } else {
    tile = nodeTileOf(world, node);
    if (tile < 0) return -1;
    const p = list[node - n] as ElevatedPath;
    h = edgeHeight(p.z, p.rampDir, dir);
  }
  if (h < 0) return -1;
  const u = stepTile(map, tile, dir);
  if (u < 0) return -1;
  const opp = (dir + 2) & 3;
  let found = -1;
  if (hasGroundNode(map, u)) {
    const s = map.slope[u] as number;
    if (edgeHeight(map.heights[u] as number, s === 0 ? -1 : rampDirOfMask(s), opp) === h) found = u;
  }
  if (found < 0 && list.length > 0) {
    for (let k = firstElevatedOnTile(world, u); k >= 0; k = nextElevatedOnTile(world, k)) {
      const p = list[k] as ElevatedPath;
      if (edgeHeight(p.z, p.rampDir, opp) === h) {
        found = n + k;
        break;
      }
    }
  }
  if (found < 0) return -1;
  if (h < (map.heights[tile] as number) + PATH_HEADROOM && edgeBlocked(world, tile, dir as Dir)) return -1;
  return found;
}

/**
 * The node on `outside` that a ride gate or stall service side on the neighbour `inside` connects to: its edge
 * toward `inside` is at the ride or stall height (the base height of `inside`). −1 when there is none.
 */
export function gateNode(world: World, inside: number, outside: number): number {
  const map = world.state.map;
  const n = map.width * map.height;
  if (inside < 0 || outside < 0 || inside >= n || outside >= n) return -1;
  const dir = dirTo(map, outside, inside);
  if (dir < 0) return -1;
  const h = map.heights[inside] as number;
  if (hasGroundNode(map, outside) && edgeHeight(map.heights[outside] as number, groundRamp(map, outside), dir) === h) return outside;
  for (let k = firstElevatedOnTile(world, outside); k >= 0; k = nextElevatedOnTile(world, k)) {
    const p = world.state.elevatedPaths[k] as ElevatedPath;
    if (edgeHeight(p.z, p.rampDir, dir) === h) return n + k;
  }
  return -1;
}

/** The elevated path that holds node `node`, or null for a ground node. */
export function elevatedOfNode(world: World, node: number): ElevatedPath | null {
  const n = tileCount(world);
  return node >= n ? (world.state.elevatedPaths[node - n] ?? null) : null;
}

export type { RampDir };
