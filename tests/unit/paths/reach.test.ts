/** Path clarity (spec 2026-11-18 §2, §4): ride reach from the park entrance, cached with the path network. */
import { describe, expect, it } from 'vitest';
import { markNetworkDirty } from '../../../src/sim/pathing';
import { queueLine } from '../../../src/sim/pathing/queues';
import { footpathReached, pathMarks, rideReach } from '../../../src/sim/pathing/reach';
import { tileIndex } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeFootpath, placeQueue, placeRideDirect } from '../../helpers/world';
import { elevated } from './helpers';

/** Footpath from the park entrance's stub north to row `y`, then west to column `x` (inclusive). */
function road(world: World, x: number, y: number): void {
  const map = world.state.map;
  const ex = map.entranceTile % map.width;
  const ey = Math.floor(map.entranceTile / map.width);
  for (let yy = y; yy < ey; yy++) if (map.content[tileIndex(map, ex, yy)] === 0) placeFootpath(world, ex, yy);
  for (let xx = Math.min(x, ex); xx <= Math.max(x, ex); xx++) placeFootpath(world, xx, y);
  markNetworkDirty(world);
}

/** A carousel at (10, 10), entrance outside (11, 13). */
function carousel(world: World) {
  return placeRideDirect(world, 'carousel', 10, 10, 0);
}

describe('ride reach', () => {
  it('ride with no queue: noQueue at the tile outside the entrance gate', () => {
    const world = makeTestWorld();
    const ride = carousel(world);
    road(world, 11, 16);
    const r = rideReach(world, ride.id);
    expect(r).toEqual({ status: 'noQueue', tile: ride.entrance!.outside, z: world.state.map.heights[ride.entrance!.gate] });
  });

  it('queue with no footpath: noFootpath at the queue\'s open end', () => {
    const world = makeTestWorld();
    const ride = carousel(world);
    placeQueue(world, 11, 13);
    const end = placeQueue(world, 11, 14);
    markNetworkDirty(world);
    expect(rideReach(world, ride.id)).toMatchObject({ status: 'noFootpath', tile: end });
  });

  it('queue touching a footpath that does not reach the park: noFootpath; that footpath is dimmed', () => {
    const world = makeTestWorld();
    const ride = carousel(world);
    placeQueue(world, 11, 13);
    const end = placeQueue(world, 11, 14);
    const lone = placeFootpath(world, 11, 15);
    markNetworkDirty(world);
    expect(rideReach(world, ride.id)).toMatchObject({ status: 'noFootpath', tile: end });
    expect(footpathReached(world, lone)).toBe(false);
    expect(pathMarks(world).dimmed).toContain(lone);
  });

  it('queue reached from the park, ride closed: closed; open: ok', () => {
    const world = makeTestWorld();
    const ride = carousel(world);
    placeQueue(world, 11, 13);
    placeQueue(world, 11, 14);
    road(world, 11, 15);
    ride.status = 'closed';
    expect(rideReach(world, ride.id)).toEqual({ status: 'closed', tile: -1, z: 0 });
    ride.status = 'open';
    expect(rideReach(world, ride.id)).toEqual({ status: 'ok', tile: -1, z: 0 });
    expect(pathMarks(world).dimmed).toEqual([]);
  });

  it('a ride whose entrance sits on another ride\'s queue has no queue of its own, though that queue is reached', () => {
    const world = makeTestWorld();
    const a = carousel(world); // queue (11,13),(11,14)
    const b = placeRideDirect(world, 'carousel', 14, 10, 0); // entrance outside (15, 13)
    a.status = 'open';
    b.status = 'open';
    placeQueue(world, 11, 13);
    placeQueue(world, 11, 14);
    for (let x = 12; x <= 15; x++) placeQueue(world, x, 14);
    placeQueue(world, 15, 13);
    road(world, 11, 15);
    // A (lower id) floods the joined queue; guests in it only go to A (queue clarity's "touches" rule).
    expect(queueLine(world, b.id)).toBeNull();
    expect(rideReach(world, a.id)?.status).toBe('ok');
    expect(rideReach(world, b.id)).toMatchObject({ status: 'noQueue', tile: b.entrance!.outside });
  });

  it('a footpath one tile past the queue end, cut off from the park, is not enough', () => {
    const world = makeTestWorld();
    const ride = carousel(world);
    ride.status = 'open';
    placeQueue(world, 11, 13);
    placeQueue(world, 11, 14);
    const lone = placeFootpath(world, 11, 16);
    markNetworkDirty(world);
    expect(rideReach(world, ride.id)?.status).toBe('noFootpath');
    expect(footpathReached(world, lone)).toBe(false);
  });

  it('an elevated footpath links the queue to the park', () => {
    const world = makeTestWorld();
    const ride = carousel(world);
    ride.status = 'open';
    placeQueue(world, 11, 13);
    placeQueue(world, 11, 14);
    const h = world.state.map.heights[tileIndex(world.state.map, 11, 15)] as number;
    // A deck one step up from (11,15) to (11,17), with ramps at both ends, onto the road at row 18.
    elevated(world, 11, 15, h, 'footpath', 2); // ramp rising southward
    elevated(world, 11, 16, h + 1, 'footpath');
    elevated(world, 11, 17, h, 'footpath', 0); // ramp rising northward
    road(world, 11, 18);
    expect(rideReach(world, ride.id)?.status).toBe('ok');
  });

  it('no park entrance: nothing is reached', () => {
    const world = makeTestWorld();
    const ride = carousel(world);
    placeQueue(world, 11, 13);
    road(world, 11, 14);
    world.state.map.entranceTile = -1;
    markNetworkDirty(world);
    expect(rideReach(world, ride.id)?.status).toBe('noFootpath');
    expect(pathMarks(world).dimmed.length).toBeGreaterThan(10);
  });

  it('pathMarks lists unqueued entrances, unreached queue ends, dimmed footpaths', () => {
    const world = makeTestWorld();
    const a = carousel(world);
    const b = placeRideDirect(world, 'carousel', 20, 10, 0); // entrance outside (21, 13)
    placeQueue(world, 21, 13);
    const end = placeQueue(world, 21, 14);
    const lone = placeFootpath(world, 40, 40);
    markNetworkDirty(world);
    const m = pathMarks(world);
    expect(m.entrances).toEqual([{ rideId: a.id, tile: a.entrance!.outside, z: world.state.map.heights[a.entrance!.gate] }]);
    expect(m.queueEnds).toEqual([{ rideId: b.id, node: end }]);
    expect(m.dimmed).toEqual([lone]);
  });

  it('rebuilt only with the network', () => {
    const world = makeTestWorld();
    carousel(world);
    const m1 = pathMarks(world);
    expect(pathMarks(world)).toBe(m1);
    placeFootpath(world, 40, 40);
    markNetworkDirty(world);
    const m2 = pathMarks(world);
    expect(m2).not.toBe(m1);
    expect(m2.dimmed).toEqual([tileIndex(world.state.map, 40, 40)]);
  });

  it('ride with no entrance, or no such ride: null', () => {
    const world = makeTestWorld();
    const ride = carousel(world);
    ride.entrance = null;
    expect(rideReach(world, ride.id)).toBeNull();
    expect(rideReach(world, 999)).toBeNull();
  });
});
