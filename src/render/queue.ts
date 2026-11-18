/**
 * Queue drawing positions (queue clarity spec 2026-11-18 §4; first version Phase 1 §4.3). Owner: W1-A.
 * Queueing guests are drawn along their ride's queue line (`sim/pathing/queues.ts` `queueLine`: the queue flood fill
 * from the entrance, distance order, ties N, E, S, W), about 3 per tile, front guest at the entrance, independent of
 * their own `tile` field (the simulation keeps that where the guest joined, so no game rule reads these positions).
 * Guests past the line's room bunch on its far node. `createQueueEase` walks a guest to its slot when the line moves.
 */
import type { Dir } from '../sim/map';
import { nodeZOf } from '../sim/paths/nodes';
import { nodeTile, type QueueLine } from '../sim/pathing/queues';
import type { World } from '../sim/types';
import { nodeSurfaceHeight, type GuestPos } from './guestPos';
import { viewAffine, viewPointSX, viewPointSY } from './view';

export const QUEUE_SLOTS_PER_TILE = 3;

/** Walking speed in the line: the guests' own pace, 1 tile per 10 ticks (`GUEST_WALK_TICKS_PER_TILE`). */
export const QUEUE_WALK_TILES_PER_TICK = 0.1;

/** A larger jump (a new guest, a loaded park, a line rebuilt) is drawn at once instead of walked. */
const SNAP_TILES = 1.2;

/** Small sideways jitter so a line of guests does not look like one stroke. */
const SIDE_JITTER = 0.04;

/** Golden angle: overflow guests spread around the far node without two on one point. */
const GOLDEN = 2.399963229728653;

export interface QueueSlotPos extends GuestPos {
  /** Facing (map direction): toward the front of the line, or the way the guest walks. */
  dir: Dir;
}

/** Map direction of the unit step (ux, uy); `fallback` for no step. */
function dirOf(ux: number, uy: number, fallback: Dir): Dir {
  if (uy < 0) return 0;
  if (ux > 0) return 1;
  if (uy > 0) return 2;
  if (ux < 0) return 3;
  return fallback;
}

/**
 * Position of queue slot `k` (0 = front of the queue) on `line`. Slot k stands on node floor(k / 3); slots on a node
 * run from the edge nearest the front (the node toward the entrance, or `gateTile` for the entrance node) to the far
 * edge. Slots past 3 × nodes bunch on the last node. `out.tile` is −1 when the line has no node.
 */
export function queueSlot(world: World, line: QueueLine, gateTile: number, k: number, out: QueueSlotPos): QueueSlotPos {
  const n = line.nodes.length;
  if (n === 0) {
    out.tile = -1;
    return out;
  }
  const w = world.state.map.width;
  let j = Math.floor(k / QUEUE_SLOTS_PER_TILE);
  const over = j >= n ? k - n * QUEUE_SLOTS_PER_TILE : -1;
  if (over >= 0) j = n - 1;
  const node = line.nodes[j] as number;
  const tile = nodeTile(world, node);
  const toward = line.toward[j] as number;
  const front = toward >= 0 ? nodeTile(world, toward) : gateTile;
  const x = tile % w;
  const y = (tile - x) / w;
  let ux = 0;
  let uy = 0;
  if (front >= 0 && front !== tile) {
    const fx = front % w;
    ux = Math.sign(fx - x);
    uy = Math.sign((front - fx) / w - y);
  }
  if (over >= 0) {
    const r = 0.12 + 0.2 * ((over % 5) / 4);
    const a = over * GOLDEN;
    out.fx = x + 0.5 + r * Math.cos(a);
    out.fy = y + 0.5 + r * Math.sin(a);
  } else {
    const s = k - j * QUEUE_SLOTS_PER_TILE;
    // t: +1/3 (front edge side), 0, −1/3 (back edge side).
    const t = 0.5 - (s + 0.5) / QUEUE_SLOTS_PER_TILE;
    const side = (s & 1) === 0 ? SIDE_JITTER : -SIDE_JITTER;
    out.fx = x + 0.5 + ux * t + uy * side;
    out.fy = y + 0.5 + uy * t + ux * side;
  }
  out.z = nodeSurfaceHeight(world, tile, nodeZOf(world, node), out.fx, out.fy);
  out.tile = tile;
  out.dir = dirOf(ux, uy, out.dir);
  return out;
}

interface EaseRec {
  fx: number;
  fy: number;
  z: number;
  t: number;
  dir: Dir;
  seen: boolean;
}

export interface QueueEase {
  /**
   * Drawn position of guest `id` whose slot is `target`, at sim time `t` (tick + alpha): walks toward the slot at
   * `QUEUE_WALK_TILES_PER_TICK`, or snaps on first sight and over a long jump. True while walking.
   */
  step(id: number, target: QueueSlotPos, t: number, out: QueueSlotPos): boolean;
  /** Forget the guests that `step` did not see since the last sweep (call once per frame, after placing). */
  sweep(): void;
}

export function createQueueEase(): QueueEase {
  const recs = new Map<number, EaseRec>();
  return {
    step(id, target, t, out) {
      let r = recs.get(id);
      out.tile = target.tile;
      if (!r) {
        r = { fx: target.fx, fy: target.fy, z: target.z, t, dir: target.dir, seen: true };
        recs.set(id, r);
      }
      r.seen = true;
      const dx = target.fx - r.fx;
      const dy = target.fy - r.fy;
      const dist = Math.hypot(dx, dy);
      const dt = t - r.t;
      r.t = t;
      let moving = false;
      if (dist > SNAP_TILES || dt < 0) {
        r.fx = target.fx;
        r.fy = target.fy;
      } else if (dist > 1e-6) {
        const step = dt * QUEUE_WALK_TILES_PER_TICK;
        if (step >= dist) {
          r.fx = target.fx;
          r.fy = target.fy;
        } else if (step > 0) {
          r.fx += (dx / dist) * step;
          r.fy += (dy / dist) * step;
        }
        moving = step < dist;
        if (moving) r.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
      }
      if (!moving) r.dir = target.dir;
      // Height follows the slot: the line's surface is continuous, and a step is a third of a tile.
      r.z = target.z;
      out.fx = r.fx;
      out.fy = r.fy;
      out.z = r.z;
      out.dir = r.dir;
      return moving;
    },
    sweep() {
      for (const [id, r] of recs) {
        if (!r.seen) recs.delete(id);
        else r.seen = false;
      }
    },
  };
}

/** A queueing guest where the renderer last drew it (map point and height), for tap hit tests. */
export interface DrawnQueueGuest {
  id: number;
  fx: number;
  fy: number;
  z: number;
  /** Renderer frame that drew it; older records are dropped. */
  frame: number;
}

/**
 * Queueing guests as last drawn, by guest id (queue clarity review fix 1). The renderer writes it each frame; the
 * input layer reads it so a tap on a guest in a line opens that guest even though its sim tile is elsewhere.
 */
export const drawnQueueGuests = new Map<number, DrawnQueueGuest>();

/** Guest sprite body around its feet (world px at zoom 1), a little inside `GUEST_BOUNDS` so gaps stay tappable. */
const HIT = { left: -6, right: 6, top: -20, bottom: 3 };

const hitAffine = viewAffine(0, 1, 1);

/** The queueing guest drawn under world point (wx, wy) (zoom-1 world px, view `rot`), front-most first; or null. */
export function queueGuestAtWorld(rot: Dir, mapW: number, mapH: number, wx: number, wy: number, guests: ReadonlyMap<number, DrawnQueueGuest> = drawnQueueGuests): number | null {
  const va = viewAffine(rot, mapW, mapH, hitAffine);
  let best: number | null = null;
  let bestY = -Infinity;
  for (const g of guests.values()) {
    const sx = viewPointSX(va, g.fx, g.fy);
    const sy = viewPointSY(va, g.fx, g.fy, g.z);
    if (wx < sx + HIT.left || wx > sx + HIT.right || wy < sy + HIT.top || wy > sy + HIT.bottom) continue;
    if (sy > bestY) {
      bestY = sy;
      best = g.id;
    }
  }
  return best;
}
