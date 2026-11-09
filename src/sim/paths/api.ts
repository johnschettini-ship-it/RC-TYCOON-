/**
 * Height-aware path queries (Phase 4 §4.2). Owner: W3-B. Signatures are a contract for every Wave 3 card.
 *
 * Path nodes are `(tile, z)`: a ground path (`map.content` Footpath / Queue / ParkEntrance) at the tile base height,
 * and each elevated path at its `z`. Ramp nodes run from `z` (low edge) to `z + 1` (high edge).
 */
import { Content } from '../map';
import type { World } from '../types';
import type { ElevatedPath, PathNode } from './types';

/** Elevated paths on `tile`, lowest first. Real body (linear scan); W3-B may index it. */
export function elevatedPathsOn(world: World, tile: number): ElevatedPath[] {
  const map = world.state.map;
  const x = tile % map.width;
  const y = Math.floor(tile / map.width);
  return world.state.elevatedPaths.filter((p) => p.x === x && p.y === y).sort((a, b) => a.z - b.z || a.id - b.id);
}

/**
 * Every walkable node on `tile`, lowest first: the ground path (if any) at the tile base height, then elevated paths.
 * Stub: the ground node only (Build 1 storage); W3-B adds elevated nodes.
 */
export function pathNodesAt(world: World, tile: number): PathNode[] {
  const map = world.state.map;
  const c = map.content[tile];
  if (c === Content.Footpath || c === Content.Queue || c === Content.ParkEntrance) return [{ tile, z: map.heights[tile] as number }];
  return [];
}

/**
 * Walking speed factor for one step from node `(fromTile, fromZ)` to `toTile` (Phase 4 §4.2): up a ramp × 0.75,
 * down a ramp × 1.10, flat × 1.00. Guests and staff use the same factors. Stub: 1.
 */
export function rampSpeedFactor(_world: World, _fromTile: number, _fromZ: number, _toTile: number): number {
  return 1;
}

/**
 * Height of the node a walker enters when it steps from `(fromTile, fromZ)` to the neighbour `toTile` (the node
 * whose facing edge height matches). Stub: the ground height of `toTile`.
 */
export function nodeZAfterStep(world: World, _fromTile: number, _fromZ: number, toTile: number): number {
  return world.state.map.heights[toTile] as number;
}
