/**
 * Queue drawing positions (Phase 1 §4.3 "spaced 4 per tile"). Owner: W1-A.
 * Queueing guests are drawn along their ride's queue tiles in queue order, starting at
 * `ride.entrance.outside`, independent of their own `tile` field.
 */
import { Content, DIR_DX, DIR_DY, type MapState } from '../sim/map';
import type { GuestPos } from './guestPos';

export const QUEUE_SLOTS_PER_TILE = 4;

export interface QueueWalker {
  /** Ordered queue tiles from `start` (must be a queue tile), following the first unvisited queue neighbour in N, E, S, W order. */
  chain(map: MapState, start: number, out?: number[]): number[];
}

/** A walker with its own visit stamps, so repeated walks do not allocate. */
export function createQueueWalker(tileCount: number): QueueWalker {
  let stamps = new Uint32Array(tileCount);
  let stamp = 0;
  return {
    chain(map, start, out = []) {
      out.length = 0;
      const n = map.width * map.height;
      if (start < 0 || start >= n || map.content[start] !== Content.Queue) return out;
      if (stamps.length < n) stamps = new Uint32Array(n);
      stamp++;
      if (stamp === 0xffffffff) {
        stamps.fill(0);
        stamp = 1;
      }
      let cur = start;
      const w = map.width;
      while (cur >= 0) {
        out.push(cur);
        stamps[cur] = stamp;
        const x = cur % w;
        const y = (cur - x) / w;
        let next = -1;
        for (let d = 0; d < 4; d++) {
          const nx = x + (DIR_DX[d] as number);
          const ny = y + (DIR_DY[d] as number);
          if (nx < 0 || ny < 0 || nx >= w || ny >= map.height) continue;
          const j = ny * w + nx;
          if (map.content[j] === Content.Queue && stamps[j] !== stamp) {
            next = j;
            break;
          }
        }
        cur = next;
      }
      return out;
    },
  };
}

/** Small sideways jitter so a line of guests does not look like one stroke. */
const SIDE_JITTER = 0.04;

/**
 * Position of queue slot `k` (0 = front of the queue). Slot k stands on chain tile floor(k / 4);
 * slots on a tile run from the edge nearest the front (the previous tile, or `gateTile` for the
 * first tile) to the far edge. Guests past the chain's capacity stand on the last tile.
 */
export function queueSlot(map: MapState, chain: readonly number[], gateTile: number, k: number, out: GuestPos): GuestPos {
  const w = map.width;
  if (chain.length === 0) {
    out.tile = -1;
    return out;
  }
  let j = Math.floor(k / QUEUE_SLOTS_PER_TILE);
  let s = k - j * QUEUE_SLOTS_PER_TILE;
  if (j >= chain.length) {
    j = chain.length - 1;
    s = QUEUE_SLOTS_PER_TILE - 1;
  }
  const tile = chain[j] as number;
  const front = j === 0 ? gateTile : (chain[j - 1] as number);
  const x = tile % w;
  const y = (tile - x) / w;
  let ux = 0;
  let uy = 0;
  if (front >= 0) {
    const fx = front % w;
    const fy = (front - fx) / w;
    ux = Math.sign(fx - x);
    uy = Math.sign(fy - y);
  }
  // t runs from +0.375 (front edge side) to −0.375 (back edge side).
  const t = 0.5 - (s + 0.5) / QUEUE_SLOTS_PER_TILE;
  const side = (s & 1) === 0 ? SIDE_JITTER : -SIDE_JITTER;
  out.fx = x + 0.5 + ux * t + uy * side;
  out.fy = y + 0.5 + uy * t + ux * side;
  out.z = map.heights[tile] as number;
  out.tile = tile;
  return out;
}
