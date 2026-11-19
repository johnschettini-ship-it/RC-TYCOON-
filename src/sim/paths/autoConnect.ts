/**
 * Auto-connection and gate snapping for pathways and queue lines.
 * Enables automatic connection between a ride's entrance/exit gates and the park's path network.
 */
import { BUILD_STRINGS } from '../commands/build/strings';
import { groundPathBlock } from '../commands/build/paths';
import type { Command, CommandResult } from '../commands/types';
import { Content, DIR_DX, DIR_DY, isOwned, type MapState } from '../map';
import { firstElevatedOnTile, gateNode, nodeKindOf, nodeTileOf, nodeZOf } from './nodes';
import { queueOwner } from '../pathing';
import type { Ride } from '../rides/types';
import type { Camera, ToolState } from '../../render/types';
import { centerOnTile } from '../../input/camera';
import type { World } from '../types';

/** The path node kind outside a gate, or null when no node connects there. */
function outsideKind(world: World, inside: number, outside: number): { kind: string; tile: number; z: number } | null {
  if (inside < 0 || outside < 0) return null;
  const node = gateNode(world, inside, outside);
  if (node < 0) return null;
  return { kind: nodeKindOf(world, node), tile: nodeTileOf(world, node), z: nodeZOf(world, node) };
}

/** Check if the entrance needs a queue line. */
export function entranceNeedsQueue(world: World, ride: Ride): boolean {
  const e = ride.entrance;
  if (!e) return false;
  const en = outsideKind(world, e.gate, e.outside);
  return !en || en.kind !== 'queue' || queueOwner(world, en.tile, en.z) !== ride.id;
}

/** Check if the exit needs a footpath. */
export function exitNeedsFootpath(world: World, ride: Ride): boolean {
  const x = ride.exit;
  if (!x) return false;
  const ex = outsideKind(world, x.gate, x.outside);
  return !ex || ex.kind !== 'footpath';
}

/**
 * Snaps a target tile to a ride's entrance or exit outside tile when clicking/dragging
 * near or directly on a ride with the queue or footpath tool.
 */
export function snapPathGate(world: World, tool: ToolState['tool'], tile: number): number {
  if (tile < 0) return tile;
  const s = world.state;
  const map = s.map;
  if (tile >= map.content.length) return tile;
  const content = map.content[tile];
  if (content === Content.Building || content === Content.Track) {
    const ref = map.contentRef[tile] ?? -1;
    const ride = s.rides.find((r) => r.id === ref);
    if (ride) {
      if (tool === 'queue' && ride.entrance && ride.entrance.outside >= 0) {
        return ride.entrance.outside;
      }
      if (tool === 'footpath' && ride.exit && ride.exit.outside >= 0) {
        return ride.exit.outside;
      }
    }
  }
  return tile;
}

/** Activate queue tool directly positioned at ride entrance outside tile. */
export function activateQueueTool(tool: ToolState, camera: Camera, map: MapState, ride: Ride): boolean {
  if (!ride.entrance || ride.entrance.outside < 0) return false;
  tool.tool = 'queue';
  tool.defId = null;
  tool.drag = null;
  tool.ghost = null;
  tool.hoverTile = ride.entrance.outside;
  centerOnTile(camera, map, ride.entrance.outside);
  return true;
}

/** Activate footpath tool directly positioned at ride exit outside tile. */
export function activateFootpathTool(tool: ToolState, camera: Camera, map: MapState, ride: Ride): boolean {
  if (!ride.exit || ride.exit.outside < 0) return false;
  tool.tool = 'footpath';
  tool.defId = null;
  tool.drag = null;
  tool.ghost = null;
  tool.hoverTile = ride.exit.outside;
  centerOnTile(camera, map, ride.exit.outside);
  return true;
}

/**
 * Breadth-first search from `startTile` to find the shortest walkable path
 * to an existing footpath in the park.
 * Returns the path of tiles from startTile to the tile adjacent to the footpath,
 * or null if no connection can be found.
 */
export function findPathToFootpath(
  world: World,
  startTile: number,
  avoidTiles: ReadonlySet<number> = new Set(),
  maxDist = 35,
): number[] | null {
  const map = world.state.map;
  const w = map.width;
  const h = map.height;
  const total = w * h;
  if (startTile < 0 || startTile >= total) return null;

  // Check if startTile is already adjacent to an existing Footpath
  for (let d = 0; d < 4; d++) {
    const nx = (startTile % w) + (DIR_DX[d] as number);
    const ny = Math.floor(startTile / w) + (DIR_DY[d] as number);
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) {
      const nTile = ny * w + nx;
      if (map.content[nTile] === Content.Footpath) {
        return [startTile];
      }
    }
  }

  const prev = new Int32Array(total).fill(-1);
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  queue[tail++] = startTile;
  visited[startTile] = 1;

  let foundTile = -1;

  while (head < tail) {
    const cur = queue[head++] as number;
    const cx = cur % w;
    const cy = Math.floor(cur / w);

    for (let d = 0; d < 4; d++) {
      const nx = cx + (DIR_DX[d] as number);
      const ny = cy + (DIR_DY[d] as number);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nTile = ny * w + nx;
      if (visited[nTile] || avoidTiles.has(nTile)) continue;

      // If nTile is a footpath, cur is the connection end
      if (map.content[nTile] === Content.Footpath) {
        foundTile = cur;
        break;
      }

      // Check if we can build a ground path on nTile
      if (
        isOwned(map, nTile) &&
        map.content[nTile] === Content.Empty &&
        groundPathBlock(world, nTile) === null &&
        firstElevatedOnTile(world, nTile) < 0
      ) {
        visited[nTile] = 1;
        prev[nTile] = cur;
        queue[tail++] = nTile;
        if (tail >= maxDist * 4) break;
      }
    }
    if (foundTile >= 0) break;
  }

  if (foundTile < 0) return null;

  const path: number[] = [];
  let curr = foundTile;
  while (curr !== -1) {
    path.push(curr);
    if (curr === startTile) break;
    curr = prev[curr] as number;
  }
  path.reverse();
  return path;
}

export interface AutoConnectResult {
  ok: boolean;
  cost: number;
  reason?: string;
  connectedQueue: boolean;
  connectedExit: boolean;
  queueTiles: number[];
  exitTiles: number[];
  alreadyConnected?: boolean;
}

/**
 * Automatically builds queue line and exit footpath connecting a ride's gates
 * to the nearest park footpaths.
 */
export function autoConnectRidePaths(
  world: World,
  ride: Ride,
  dispatch: (cmd: Command) => CommandResult,
): AutoConnectResult {
  const map = world.state.map;
  const w = map.width;
  const needsQ = entranceNeedsQueue(world, ride);
  const needsE = exitNeedsFootpath(world, ride);

  if (!needsQ && !needsE) {
    return { ok: true, cost: 0, connectedQueue: false, connectedExit: false, queueTiles: [], exitTiles: [], alreadyConnected: true };
  }

  const queueTiles: number[] = [];
  const exitTiles: number[] = [];

  // 1. Find queue path from entrance
  let qPath: number[] | null = null;
  if (needsQ && ride.entrance) {
    qPath = findPathToFootpath(world, ride.entrance.outside);
    if (!qPath) {
      return { ok: false, cost: 0, reason: BUILD_STRINGS.entranceNeedsQueue, connectedQueue: false, connectedExit: false, queueTiles: [], exitTiles: [] };
    }
  }

  // 2. Find exit path from exit, avoiding queue path tiles
  const avoid = new Set<number>(qPath ?? []);
  let ePath: number[] | null = null;
  if (needsE && ride.exit) {
    ePath = findPathToFootpath(world, ride.exit.outside, avoid);
    if (!ePath) {
      return { ok: false, cost: 0, reason: BUILD_STRINGS.exitNeedsFootpath, connectedQueue: false, connectedExit: false, queueTiles: [], exitTiles: [] };
    }
  }

  let totalCost = 0;

  // Build queue path
  if (qPath) {
    for (const tile of qPath) {
      if (map.content[tile] !== Content.Queue) {
        const x = tile % w;
        const y = Math.floor(tile / w);
        const res = dispatch({ type: 'buildPath', x, y, kind: 'queue' });
        if (!res.ok) {
          return { ok: false, cost: totalCost, reason: res.reason, connectedQueue: queueTiles.length > 0, connectedExit: false, queueTiles, exitTiles };
        }
        totalCost += res.cost;
        queueTiles.push(tile);
      }
    }
  }

  // Build exit path
  if (ePath) {
    for (const tile of ePath) {
      if (map.content[tile] !== Content.Footpath) {
        const x = tile % w;
        const y = Math.floor(tile / w);
        const res = dispatch({ type: 'buildPath', x, y, kind: 'footpath' });
        if (!res.ok) {
          return { ok: false, cost: totalCost, reason: res.reason, connectedQueue: queueTiles.length > 0, connectedExit: exitTiles.length > 0, queueTiles, exitTiles };
        }
        totalCost += res.cost;
        exitTiles.push(tile);
      }
    }
  }

  return {
    ok: true,
    cost: totalCost,
    connectedQueue: queueTiles.length > 0,
    connectedExit: exitTiles.length > 0,
    queueTiles,
    exitTiles,
  };
}
