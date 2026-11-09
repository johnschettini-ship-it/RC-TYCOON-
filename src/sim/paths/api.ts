/**
 * Height-aware path queries (Phase 4 §4.2). Owner: W3-B. Signatures are a contract for every Wave 3 card.
 *
 * Path nodes are `(tile, z)`: a ground path (`map.content` Footpath / Queue / ParkEntrance on a dry tile) at the
 * tile base height, and each elevated path at its `z`. Ramp nodes run from `z` (low edge) to `z + 1` (high edge).
 * These read the map and the elevated list directly (see `./nodes.ts`), so they are right at any moment.
 */
import { RAMP_SPEED_DOWN, RAMP_SPEED_UP } from '../../data/tuning/paths';
import type { World } from '../types';
import {
  dirTo,
  firstElevatedOnTile,
  linkedNode,
  nextElevatedOnTile,
  nodeCentreHeight,
  nodeIdAt,
  nodeIdsOn,
  nodeZOf,
} from './nodes';
import type { ElevatedPath, PathNode } from './types';

/** Elevated paths on `tile`, lowest first. */
export function elevatedPathsOn(world: World, tile: number): ElevatedPath[] {
  const out: ElevatedPath[] = [];
  const map = world.state.map;
  if (!Number.isInteger(tile) || tile < 0 || tile >= map.width * map.height) return out;
  for (let k = firstElevatedOnTile(world, tile); k >= 0; k = nextElevatedOnTile(world, k)) out.push(world.state.elevatedPaths[k] as ElevatedPath);
  return out;
}

/** Every walkable node on `tile`, lowest first: the ground path (if any) at the tile base height, then elevated paths. */
export function pathNodesAt(world: World, tile: number): PathNode[] {
  return nodeIdsOn(world, tile).map((node) => ({ tile, z: nodeZOf(world, node) }));
}

/** The node a walker on `(fromTile, fromZ)` reaches on the neighbour `toTile`, or −1 when they do not link. */
function stepTarget(world: World, fromTile: number, fromZ: number, toTile: number): { from: number; to: number } {
  const from = nodeIdAt(world, fromTile, fromZ);
  if (from < 0) return { from, to: -1 };
  const dir = dirTo(world.state.map, fromTile, toTile);
  return { from, to: dir < 0 ? -1 : linkedNode(world, from, dir) };
}

/**
 * Walking speed factor for one step from node `(fromTile, fromZ)` to `toTile` (Phase 4 §4.2): up a ramp × 0.75,
 * down a ramp × 1.10, flat × 1.00. Guests and staff use the same factors. "Up" and "down" compare the height of
 * the walking surface at the two tile centres (a ramp's centre is half a step above its base).
 */
export function rampSpeedFactor(world: World, fromTile: number, fromZ: number, toTile: number): number {
  if (world.state.elevatedPaths.length === 0 && world.state.map.slope[fromTile] === 0 && world.state.map.slope[toTile] === 0) return 1;
  const { from, to } = stepTarget(world, fromTile, fromZ, toTile);
  if (from < 0 || to < 0) return 1;
  const a = nodeCentreHeight(world, from);
  const b = nodeCentreHeight(world, to);
  return b > a ? RAMP_SPEED_UP : b < a ? RAMP_SPEED_DOWN : 1;
}

/**
 * Height of the node a walker enters when it steps from `(fromTile, fromZ)` to the neighbour `toTile` (the node
 * whose facing edge height matches). The ground height of `toTile` when no node links there.
 */
export function nodeZAfterStep(world: World, fromTile: number, fromZ: number, toTile: number): number {
  const map = world.state.map;
  if (world.state.elevatedPaths.length === 0 && map.slope[fromTile] === 0 && map.slope[toTile] === 0) return map.heights[toTile] as number;
  const { to } = stepTarget(world, fromTile, fromZ, toTile);
  return to >= 0 ? nodeZOf(world, to) : (map.heights[toTile] as number);
}

/** True when a walker on `(fromTile, fromZ)` may step to the neighbour `toTile` (their nodes link). */
export function stepLinks(world: World, fromTile: number, fromZ: number, toTile: number): boolean {
  return stepTarget(world, fromTile, fromZ, toTile).to >= 0;
}

