/** Queue clarity (spec 2026-11-18 §4): queueing guests stand in flood-fill order, about 3 per tile, and step forward. */
import { describe, expect, it } from 'vitest';
import { QUEUE_SLOTS_PER_TILE, QUEUE_WALK_TILES_PER_TICK, createQueueEase, queueSlot, type QueueSlotPos } from '../../../src/render/queue';
import { nodeSurfaceHeight } from '../../../src/render/guestPos';
import { markNetworkDirty } from '../../../src/sim/pathing';
import { queueLine, type QueueLine } from '../../../src/sim/pathing/queues';
import { tileIndex } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeQueue, placeRideDirect } from '../../helpers/world';

const slotOut = (): QueueSlotPos => ({ fx: 0, fy: 0, z: 0, tile: -1, dir: 0 });

function straight(): { world: World; line: QueueLine; gate: number; q: number[] } {
  const world = makeTestWorld();
  const ride = placeRideDirect(world, 'carousel', 10, 10, 0); // entrance outside (11, 13), gate north of it
  const q = [placeQueue(world, 11, 13), placeQueue(world, 11, 14), placeQueue(world, 11, 15), placeQueue(world, 12, 15)];
  markNetworkDirty(world);
  return { world, line: queueLine(world, ride.id) as QueueLine, gate: ride.entrance!.gate, q };
}

describe('queue slots', () => {
  it('3 slots per tile from the entrance outward', () => {
    const { world, line, gate, q } = straight();
    expect(QUEUE_SLOTS_PER_TILE).toBe(3);
    const tiles: number[] = [];
    for (let k = 0; k < 12; k++) tiles.push(queueSlot(world, line, gate, k, slotOut()).tile);
    expect(tiles).toEqual([q[0], q[0], q[0], q[1], q[1], q[1], q[2], q[2], q[2], q[3], q[3], q[3]]);
  });

  it('slot 0 is nearest the gate; slots run along the line and face the front', () => {
    const { world, line, gate } = straight();
    const p = (k: number): QueueSlotPos => queueSlot(world, line, gate, k, slotOut());
    expect(p(0).fy).toBeLessThan(p(1).fy);
    expect(p(1).fy).toBeLessThan(p(2).fy);
    expect(p(0).fx).toBeCloseTo(11.5, 1);
    expect(p(0).dir).toBe(0); // facing north, toward the gate
    // Fourth tile (12, 15): the previous tile is west, so slots move east and face west.
    expect(p(9).fx).toBeLessThan(p(10).fx);
    expect(p(9).dir).toBe(3);
  });

  it('overflow guests bunch on the last node, distinct and inside it', () => {
    const { world, line, gate, q } = straight();
    const last = q[3] as number;
    const pts = new Set<string>();
    for (let k = 12; k <= 30; k++) {
      const s = queueSlot(world, line, gate, k, slotOut());
      expect(s.tile).toBe(last);
      expect(Math.hypot(s.fx - 12.5, s.fy - 15.5)).toBeLessThan(0.5);
      pts.add(`${s.fx.toFixed(4)},${s.fy.toFixed(4)}`);
    }
    expect(pts.size).toBe(19);
  });

  it('slot of a line with no nodes is -1', () => {
    const world = makeTestWorld();
    expect(queueSlot(world, { rideId: 1, nodes: [], toward: [] }, 0, 0, slotOut()).tile).toBe(-1);
  });

  it('slot height is the node surface height (ground slopes and decks alike)', () => {
    const { world, line, gate, q } = straight();
    const map = world.state.map;
    map.heights[q[1] as number] = 9;
    map.slope[q[1] as number] = 4; // south corner raised
    const s = queueSlot(world, line, gate, 4, slotOut());
    expect(s.z).toBeCloseTo(nodeSurfaceHeight(world, q[1] as number, map.heights[q[1] as number] as number, s.fx, s.fy), 9);
    expect(tileIndex(map, 11, 14)).toBe(q[1]);
  });
});

describe('queue easing', () => {
  const at = (fx: number, fy: number): QueueSlotPos => ({ fx, fy, z: 0, tile: 0, dir: 0 });

  it('walks toward the slot at walking speed and snaps over 1.2 tiles', () => {
    const ease = createQueueEase();
    const out = slotOut();
    expect(ease.step(1, at(5, 5), 100, out)).toBe(false); // first sight: stands at its slot
    expect(out.fx).toBe(5);
    expect(ease.step(1, at(5, 4), 101, out)).toBe(true);
    expect(out.fy).toBeCloseTo(5 - QUEUE_WALK_TILES_PER_TICK, 9);
    expect(out.dir).toBe(0); // walking north
    ease.step(1, at(5, 4), 120, out);
    expect(out.fy).toBe(4);
    expect(ease.step(1, at(5, 1), 121, out)).toBe(false); // 3 tiles away: snap
    expect(out.fy).toBe(1);
  });

  it('a paused game (same tick) does not move anyone', () => {
    const ease = createQueueEase();
    const out = slotOut();
    ease.step(1, at(5, 5), 10, out);
    ease.step(1, at(5, 4), 10, out);
    expect(out.fy).toBe(5);
  });

  it('sweep forgets guests not placed this frame', () => {
    const ease = createQueueEase();
    const out = slotOut();
    ease.step(1, at(5, 5), 10, out);
    ease.sweep();
    ease.sweep();
    expect(ease.step(1, at(5, 4), 11, out)).toBe(false); // forgotten: snaps instead of walking
    expect(out.fy).toBe(4);
  });

  it('the front guest boards: everyone behind moves one slot forward', () => {
    const { world, line, gate } = straight();
    const queue = [11, 12, 13, 14, 15];
    const before = new Map(queue.map((id, k) => [id, queueSlot(world, line, gate, k, slotOut())]));
    queue.shift();
    queue.forEach((id, k) => {
      const after = queueSlot(world, line, gate, k, slotOut());
      const prev = before.get(queue[k - 1] ?? 11) as QueueSlotPos;
      expect(after.fx).toBeCloseTo(prev.fx, 9);
      expect(after.fy).toBeCloseTo(prev.fy, 9);
      expect(id).toBeGreaterThan(11);
    });
  });
});
