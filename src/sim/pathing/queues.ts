/**
 * Queue clarity (spec 2026-11-18): read-only views of the queue flood fill for the sign, the tap card, the warnings
 * and where queueing guests are drawn. Derived from the network cache (`./network.ts`), rebuilt only with it, never
 * saved, and never read by a game rule: ownership stays `computeQueueOwners`'s.
 */
import { nodeIdAt } from '../paths/nodes';
import type { World } from '../types';
import { isQueueNode, network, nodesOnTile, type NetworkCache, type QueueComponentData } from './network';

export interface QueueLine {
  rideId: number;
  /** Queue nodes in flood-fill order from the entrance node (distance, ties N, E, S, W). */
  nodes: readonly number[];
  /** Per node: the node one step nearer the entrance, −1 for the entrance node. */
  toward: readonly number[];
}

export interface QueueConflict {
  /** The ride whose entrance sits on a queue it does not own. */
  rideId: number;
  /** The ride that claimed that queue first (lower id). */
  ownerId: number;
}

const scratch: number[] = [];
const NONE: QueueComponentData = { owner: null, nodes: [] };

/** The queue line of `rideId`, or null when its entrance has no queue it owns. */
export function queueLine(world: World, rideId: number): QueueLine | null {
  return network(world).queueLines.get(rideId) ?? null;
}

/** The queue node on `tile`: with `z` the node at that height, else the ground node, else the lowest elevated one; −1. */
export function queueNodeAt(world: World, tile: number, z?: number): number {
  const c = network(world);
  if (z !== undefined) {
    const n = nodeIdAt(world, tile, z);
    return isQueueNode(c, n) ? n : -1;
  }
  const count = nodesOnTile(c, tile, scratch);
  for (let k = 0; k < count; k++) if (isQueueNode(c, scratch[k] as number)) return scratch[k] as number;
  return -1;
}

/** Tile of path node `node`. */
export function nodeTile(world: World, node: number): number {
  return network(world).nodeTile[node] ?? -1;
}

/** BFS over linked queue nodes from `start` (order N, E, S, W). */
function component(c: NetworkCache, start: number): QueueComponentData {
  const nodes: number[] = [start];
  const seen = new Set<number>(nodes);
  for (let head = 0; head < nodes.length; head++) {
    const i = nodes[head] as number;
    for (let d = 0; d < 4; d++) {
      const j = c.adj[i * 4 + d] as number;
      if (j < 0 || seen.has(j) || !isQueueNode(c, j)) continue;
      seen.add(j);
      nodes.push(j);
    }
  }
  const id = c.owner[start] as number;
  const data: QueueComponentData = { owner: id >= 0 ? id : null, nodes };
  for (const n of nodes) c.components.set(n, data);
  return data;
}

/** The linked queue nodes of `node` and the ride that owns them (null: the queue reaches no ride). */
export function queueComponent(world: World, node: number): { owner: number | null; nodes: readonly number[] } {
  const c = network(world);
  if (!isQueueNode(c, node)) return NONE;
  return c.components.get(node) ?? component(c, node);
}

/** Linked groups of queue nodes that no ride owns, ordered by their lowest node id; each group's nodes ascending. */
export function unlinkedQueueGroups(world: World): readonly (readonly number[])[] {
  const c = network(world);
  if (c.unlinked) return c.unlinked;
  const out: number[][] = [];
  const listed = new Set<QueueComponentData>();
  for (let n = 0; n < c.nodeCount; n++) {
    if (!isQueueNode(c, n) || (c.owner[n] as number) >= 0) continue;
    const data = c.components.get(n) ?? component(c, n);
    if (listed.has(data)) continue;
    listed.add(data);
    out.push(data.nodes.slice().sort((a, b) => a - b));
  }
  c.unlinked = out;
  return out;
}

/** Rides whose entrance is on another ride's queue, ascending ride id. The same array until the network rebuilds. */
export function queueConflicts(world: World): readonly QueueConflict[] {
  return network(world).queueConflicts;
}
