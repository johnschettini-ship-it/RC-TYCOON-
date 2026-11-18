/**
 * Path clarity (spec 2026-11-18 §2, §4): can guests reach a ride, and if not, what is missing. The chain is park
 * entrance → footpath → queue → ride entrance. Read-only: derived from the network cache (`./network.ts`) with one
 * BFS from the park entrance over guest-walkable nodes (the nodes and links the `exit` field uses), computed on the
 * first query after a rebuild and dropped with the network. It has its own buffers (never the field pool or `work`),
 * is never saved, and no game rule reads it.
 */
import type { Ride } from '../rides/types';
import type { World } from '../types';
import { isEntranceNode, isFootNode, network, type NetworkCache, type ReachData, type ReachMarks } from './network';

export type ReachStatus = 'noQueue' | 'noFootpath' | 'closed' | 'ok';

export interface RideReach {
  status: ReachStatus;
  /** The tile to show (Show me): outside the entrance gate (noQueue) or the queue's open end (noFootpath); −1 else. */
  tile: number;
  /** Height of that spot (gate height, or the end node's height); 0 when `tile` is −1. */
  z: number;
}

export type PathMarks = ReachMarks;

function compute(c: NetworkCache): ReachData {
  const reached = new Uint8Array(c.nodeCount);
  const start = c.map.entranceTile;
  if (isEntranceNode(c, start)) {
    const queue = new Int32Array(c.nodeCount);
    let head = 0;
    let tail = 0;
    reached[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++] as number;
      for (let d = 0; d < 4; d++) {
        const j = c.adj[i * 4 + d] as number;
        if (j < 0 || reached[j] === 1 || c.guestPass[j] !== 1) continue;
        reached[j] = 1;
        queue[tail++] = j;
      }
    }
  }
  const lineReached = new Map<number, boolean>();
  for (const [rideId, line] of c.queueLines) {
    let ok = false;
    for (const n of line.nodes) {
      for (let d = 0; d < 4 && !ok; d++) {
        const j = c.adj[n * 4 + d] as number;
        if (j >= 0 && reached[j] === 1) ok = true;
      }
      if (ok) break;
    }
    lineReached.set(rideId, ok);
  }
  return { reached, lineReached, marks: null };
}

function reachOf(c: NetworkCache): ReachData {
  c.reach ??= compute(c);
  return c.reach;
}

/** Height of node `node` (ground: the tile's height; elevated: the deck's z). */
function nodeHeight(c: NetworkCache, node: number): number {
  if (node < c.tiles) return c.map.heights[node] as number;
  return (c.state.elevatedPaths[node - c.tiles]?.z ?? 0) as number;
}

/** The missing link of a ride with an entrance (not counting open/closed), or null when guests reach its queue. */
function missing(c: NetworkCache, r: ReachData, ride: Ride): RideReach | null {
  const e = ride.entrance as NonNullable<Ride['entrance']>;
  const line = c.queueLines.get(ride.id);
  if (!line || line.nodes.length === 0) return { status: 'noQueue', tile: e.outside, z: c.map.heights[e.gate] as number };
  if (r.lineReached.get(ride.id) === true) return null;
  const end = line.nodes[line.nodes.length - 1] as number;
  return { status: 'noFootpath', tile: c.nodeTile[end] as number, z: nodeHeight(c, end) };
}

/** Reach status of ride `rideId` (first failing step wins), or null when there is no such ride or it has no entrance. */
export function rideReach(world: World, rideId: number): RideReach | null {
  const ride = world.state.rides.find((r) => r.id === rideId);
  if (!ride || !ride.entrance) return null;
  const c = network(world);
  const gap = missing(c, reachOf(c), ride);
  if (gap) return gap;
  return { status: ride.status === 'open' ? 'ok' : 'closed', tile: -1, z: 0 };
}

/** True when footpath (or park entrance) node `node` is joined to the park entrance. */
export function footpathReached(world: World, node: number): boolean {
  const c = network(world);
  return node >= 0 && node < c.nodeCount && reachOf(c).reached[node] === 1;
}

/** What the path tools mark (§4). The same object until the network rebuilds. */
export function pathMarks(world: World): PathMarks {
  const c = network(world);
  const r = reachOf(c);
  if (r.marks) return r.marks;
  const entrances: { rideId: number; tile: number; z: number }[] = [];
  const queueEnds: { rideId: number; node: number }[] = [];
  const rides = c.state.rides.filter((x) => x.entrance).sort((a, b) => a.id - b.id);
  for (const ride of rides) {
    const gap = missing(c, r, ride);
    if (!gap) continue;
    if (gap.status === 'noQueue') entrances.push({ rideId: ride.id, tile: gap.tile, z: gap.z });
    else {
      const line = c.queueLines.get(ride.id);
      if (line) queueEnds.push({ rideId: ride.id, node: line.nodes[line.nodes.length - 1] as number });
    }
  }
  const dimmed: number[] = [];
  for (let n = 0; n < c.nodeCount; n++) if (isFootNode(c, n) && r.reached[n] !== 1) dimmed.push(n);
  r.marks = { entrances, queueEnds, dimmed };
  return r.marks;
}
