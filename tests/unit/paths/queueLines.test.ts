/** Queue clarity (spec 2026-11-18 §4): queue lines, unlinked groups and conflicts from the queue flood fill. */
import { describe, expect, it } from 'vitest';
import { markNetworkDirty } from '../../../src/sim/pathing';
import { queueComponent, queueConflicts, queueLine, queueNodeAt, unlinkedQueueGroups } from '../../../src/sim/pathing/queues';
import { tileIndex } from '../../../src/sim/map';
import { makeTestWorld, placeQueue, placeRideDirect } from '../../helpers/world';
import { elevated } from './helpers';

describe('queue lines', () => {
  it('orders a straight queue from the entrance outward', () => {
    const world = makeTestWorld();
    const ride = placeRideDirect(world, 'carousel', 10, 10, 0); // entrance outside = (11, 13)
    const q = [placeQueue(world, 11, 13), placeQueue(world, 11, 14), placeQueue(world, 11, 15), placeQueue(world, 12, 15)];
    markNetworkDirty(world);
    const line = queueLine(world, ride.id);
    expect(line?.rideId).toBe(ride.id);
    expect(line?.nodes).toEqual(q);
    expect(line?.toward).toEqual([-1, q[0], q[1], q[2]]);
  });

  it('orders a branching queue by distance, ties N,E,S,W', () => {
    const world = makeTestWorld();
    const ride = placeRideDirect(world, 'carousel', 10, 10, 0);
    const a = placeQueue(world, 11, 13);
    const b = placeQueue(world, 11, 14);
    const w = placeQueue(world, 10, 14);
    const e = placeQueue(world, 12, 14);
    markNetworkDirty(world);
    expect(queueLine(world, ride.id)?.nodes).toEqual([a, b, e, w]);
    expect(queueLine(world, ride.id)?.toward).toEqual([-1, a, b, b]);
  });

  it('has no line for a ride without a queue at its entrance', () => {
    const world = makeTestWorld();
    const ride = placeRideDirect(world, 'carousel', 10, 10, 0);
    expect(queueLine(world, ride.id)).toBeNull();
    expect(queueLine(world, 999)).toBeNull();
  });

  it('lists a queue section that reaches no ride; owned tiles never appear', () => {
    const world = makeTestWorld();
    placeRideDirect(world, 'carousel', 10, 10, 0);
    const owned = placeQueue(world, 11, 13);
    const u1 = placeQueue(world, 30, 30);
    const u2 = placeQueue(world, 31, 30);
    markNetworkDirty(world);
    const groups = unlinkedQueueGroups(world);
    expect(groups.map((g) => [...g].sort((x, y) => x - y))).toEqual([[u1, u2]]);
    expect(groups.flat()).not.toContain(owned);
  });

  it('includes elevated queue nodes in groups and components', () => {
    const world = makeTestWorld();
    const h = world.state.map.heights[tileIndex(world.state.map, 30, 30)] as number;
    elevated(world, 30, 30, h + 4, 'queue');
    elevated(world, 31, 30, h + 4, 'queue');
    const tiles = world.state.map.width * world.state.map.height;
    const groups = unlinkedQueueGroups(world);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
    for (const n of groups[0] as number[]) expect(n).toBeGreaterThanOrEqual(tiles);
    const node = queueNodeAt(world, tileIndex(world.state.map, 30, 30));
    expect(node).toBeGreaterThanOrEqual(tiles);
    expect(queueComponent(world, node).owner).toBeNull();
    expect(queueComponent(world, node).nodes).toHaveLength(2);
  });

  it('names a ride whose entrance is on another ride\'s queue', () => {
    const world = makeTestWorld();
    const a = placeRideDirect(world, 'carousel', 10, 10, 0); // entrance outside (11, 13)
    const b = placeRideDirect(world, 'carousel', 14, 10, 0); // entrance outside (15, 13)
    for (let x = 11; x <= 15; x++) placeQueue(world, x, 13);
    markNetworkDirty(world);
    expect(queueConflicts(world)).toEqual([{ rideId: b.id, ownerId: a.id }]);
    expect(queueLine(world, b.id)).toBeNull();
    expect(queueLine(world, a.id)?.nodes).toHaveLength(5);
  });

  it('queueComponent of an owned node and queueNodeAt off a queue', () => {
    const world = makeTestWorld();
    const ride = placeRideDirect(world, 'carousel', 10, 10, 0);
    const q0 = placeQueue(world, 11, 13);
    const q1 = placeQueue(world, 11, 14);
    markNetworkDirty(world);
    const c = queueComponent(world, q1);
    expect(c.owner).toBe(ride.id);
    expect([...c.nodes].sort((x, y) => x - y)).toEqual([q0, q1]);
    expect(queueNodeAt(world, tileIndex(world.state.map, 40, 40))).toBe(-1);
    expect(queueComponent(world, -1)).toEqual({ owner: null, nodes: [] });
  });

  it('rebuilds only when the network does', () => {
    const world = makeTestWorld();
    placeRideDirect(world, 'carousel', 10, 10, 0);
    placeQueue(world, 11, 13);
    markNetworkDirty(world);
    const first = queueConflicts(world);
    expect(queueConflicts(world)).toBe(first);
    placeQueue(world, 11, 14);
    markNetworkDirty(world);
    expect(queueConflicts(world)).not.toBe(first);
  });
});

describe('unlinked groups after a tap on a far tile', () => {
  it('lists a group even when its component was first built from a higher node', () => {
    const world = makeTestWorld();
    const u1 = placeQueue(world, 30, 30);
    const u2 = placeQueue(world, 31, 30);
    markNetworkDirty(world);
    queueComponent(world, u2);
    // Nodes ascending, so the marker sits on the same tile whichever tile was tapped first.
    expect(unlinkedQueueGroups(world)).toEqual([[u1, u2]]);
  });
});
