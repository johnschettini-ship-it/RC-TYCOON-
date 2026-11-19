/**
 * Path clarity (spec 2026-11-18 §2, §4): can guests reach a ride, and if not, what is missing. The chain is park
 * entrance → footpath → queue → ride entrance. Read-only: derived from the network cache (`./network.ts`) with one
 * BFS from the park entrance over guest-walkable nodes (the nodes and links the `exit` field uses), computed on the
 * first query after a rebuild and dropped with the network. It has its own buffers (never the field pool or `work`),
 * is never saved, and no game rule reads it.
 */
import { Content } from '../map';
import { dirTo, edgeHeight, groundRamp } from '../paths/nodes';
import type { Ride } from '../rides/types';
import type { World } from '../types';
import { isEntranceNode, isFootNode, network, type NetworkCache, type ReachData, type ReachMarks } from './network';

export type ReachStatus = 'noQueue' | 'noFootpath' | 'closed' | 'ok';

export interface RideReach {
  status: ReachStatus;
  /**
   * The tile to show (Show me): outside the entrance gate (noQueue) or the queue tile where a footpath could join
   * (noFootpath, see `joinNode`); −1 else.
   */
  tile: number;
  /**
   * Height of that spot: the outside tile's own ground when a ground queue there would meet the gate, else the gate
   * height (a queue deck); the join node's height. 0 when `tile` is −1.
   */
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
  return { reached, lineReached, marks: null, dist: null };
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
  if (!line || line.nodes.length === 0) return { status: 'noQueue', tile: e.outside, z: outsideHeight(c, e.gate, e.outside) };
  if (r.lineReached.get(ride.id) === true) return null;
  const end = joinNode(c, r, line.nodes, line.toward);
  return { status: 'noFootpath', tile: c.nodeTile[end] as number, z: nodeHeight(c, end) };
}

/**
 * Where a queue at the entrance would stand: the outside tile's ground when its ground edge meets the gate height
 * (a flat or sloped ground queue), else the gate height (a deck, e.g. by a cliff or a raised station).
 */
function outsideHeight(c: NetworkCache, gate: number, outside: number): number {
  const map = c.map;
  const h = map.heights[gate] as number;
  const dir = dirTo(map, outside, gate);
  const ground = map.heights[outside] as number;
  if (dir >= 0 && edgeHeight(ground, (map.slope[outside] as number) === 0 ? -1 : groundRamp(map, outside), dir) === h) return ground;
  return h;
}

/** A neighbour tile of node `n` where a footpath could join: empty land or a footpath (not a queue, ride or other). */
function hasFreeNeighbour(c: NetworkCache, n: number): boolean {
  const map = c.map;
  const w = map.width;
  const t = c.nodeTile[n] as number;
  const x = t % w;
  const y = (t - x) / w;
  const near = [y > 0 ? t - w : -1, x < w - 1 ? t + 1 : -1, y < map.height - 1 ? t + w : -1, x > 0 ? t - 1 : -1];
  for (const j of near) {
    if (j < 0) continue;
    const k = map.content[j];
    if (k === Content.Empty || k === Content.Footpath) return true;
  }
  return false;
}

/** Grid steps from every tile to the nearest tile holding a reached node (Manhattan, BFS); max int where none. */
function distances(c: NetworkCache, r: ReachData): Int32Array {
  if (r.dist) return r.dist;
  const map = c.map;
  const w = map.width;
  const dist = new Int32Array(c.tiles).fill(0x7fffffff);
  const queue = new Int32Array(c.tiles);
  let tail = 0;
  for (let n = 0; n < c.nodeCount; n++) {
    if (r.reached[n] !== 1) continue;
    const t = c.nodeTile[n] as number;
    if (dist[t] !== 0) {
      dist[t] = 0;
      queue[tail++] = t;
    }
  }
  for (let head = 0; head < tail; head++) {
    const t = queue[head] as number;
    const x = t % w;
    const y = (t - x) / w;
    const d = (dist[t] as number) + 1;
    for (const j of [y > 0 ? t - w : -1, x < w - 1 ? t + 1 : -1, y < map.height - 1 ? t + w : -1, x > 0 ? t - 1 : -1]) {
      if (j >= 0 && (dist[j] as number) > d) {
        dist[j] = d;
        queue[tail++] = j;
      }
    }
  }
  r.dist = dist;
  return dist;
}

/**
 * The queue node a footpath should join (Show me and the glow, §3–4). Candidates: line nodes with a free neighbour
 * (`hasFreeNeighbour`). A line with one end: the candidate farthest from the entrance. A branching line (several
 * ends): among the ends that are candidates (else all candidates), the one nearest a footpath the park reaches; ties go
 * to the one farther from the entrance (flood-fill order, itself deterministic). No candidate: the farthest node.
 */
function joinNode(c: NetworkCache, r: ReachData, nodes: readonly number[], toward: readonly number[]): number {
  const children = new Map<number, number>();
  for (const p of toward) if (p >= 0) children.set(p, (children.get(p) ?? 0) + 1);
  const ends: number[] = [];
  for (let k = 1; k < nodes.length; k++) if (!children.has(nodes[k] as number)) ends.push(k);
  const cands: number[] = [];
  for (let k = 0; k < nodes.length; k++) if (hasFreeNeighbour(c, nodes[k] as number)) cands.push(k);
  if (cands.length === 0) return nodes[nodes.length - 1] as number;
  if (ends.length <= 1) return nodes[cands[cands.length - 1] as number] as number;
  const endCands = cands.filter((k) => ends.includes(k));
  const pool = endCands.length > 0 ? endCands : cands;
  const dist = distances(c, r);
  let best = pool[0] as number;
  for (const k of pool) {
    const dk = dist[c.nodeTile[nodes[k] as number] as number] as number;
    const db = dist[c.nodeTile[nodes[best] as number] as number] as number;
    // `pool` ascends in flood-fill order, so on a tie the later (farther) end wins; the order itself is fixed.
    if (dk <= db) best = k;
  }
  return nodes[best] as number;
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
      if (line) queueEnds.push({ rideId: ride.id, node: joinNode(c, r, line.nodes, line.toward) });
    }
  }
  const dimmed: number[] = [];
  for (let n = 0; n < c.nodeCount; n++) if (isFootNode(c, n) && r.reached[n] !== 1) dimmed.push(n);
  r.marks = { entrances, queueEnds, dimmed };
  return r.marks;
}
