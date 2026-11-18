/** Queue clarity (spec 2026-11-18 §2–3): the card of a tapped queue tile, and what a tap on a queue tile picks. */
import { describe, expect, it } from 'vitest';
import { pickEntity } from '../../../src/input/tools';
import { markNetworkDirty } from '../../../src/sim/pathing';
import { tileIndex } from '../../../src/sim/map';
import { queueCard, resolveQueueCard } from '../../../src/ui/panels/queueCard';
import { queueKey } from '../../../src/sim/pathing/queues';
import { en } from '../../../src/data/strings/en';
import { enPlurals } from '../../../src/data/strings/plurals';
import { addGuestDirect, makeTestWorld, placeFootpath, placeQueue, placeRideDirect } from '../../helpers/world';

describe('queue card', () => {
  it('an owned queue: the ride name, its guest count, and the ride to open', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10, 0);
    ride.name = 'Merry Spin';
    const q = placeQueue(w, 11, 13);
    placeQueue(w, 11, 14);
    markNetworkDirty(w);
    ride.queue = [];
    expect(queueCard(w, q)).toEqual({ rideId: ride.id, title: 'Merry Spin', count: 'Queue: 0 guests', lines: [] });
    ride.queue = [101];
    expect(queueCard(w, q)?.count).toBe('Queue: 1 guest');
    ride.queue = [101, 102, 103];
    expect(queueCard(w, tileIndex(w.state.map, 11, 14))?.count).toBe('Queue: 3 guests');
  });

  it('a queue that reaches no ride says so and has no ride to open', () => {
    const w = makeTestWorld();
    const q = placeQueue(w, 30, 30);
    markNetworkDirty(w);
    expect(queueCard(w, q)).toEqual({ rideId: null, title: 'Queue', count: null, lines: ['This queue reaches no ride'] });
  });

  it('a queue another ride\'s entrance touches names both rides', () => {
    const w = makeTestWorld();
    const a = placeRideDirect(w, 'carousel', 10, 10, 0);
    const b = placeRideDirect(w, 'carousel', 14, 10, 0);
    a.name = 'Carousel 1';
    b.name = 'Carousel 2';
    for (let x = 11; x <= 15; x++) placeQueue(w, x, 13);
    markNetworkDirty(w);
    const card = queueCard(w, tileIndex(w.state.map, 15, 13));
    expect(card?.rideId).toBe(a.id);
    expect(card?.lines).toEqual(['The Carousel 2 line touches the Carousel 1 line. Guests in it only go to Carousel 1']);
  });

  it('no card once the tile is no longer a queue', () => {
    const w = makeTestWorld();
    const q = placeQueue(w, 30, 30);
    markNetworkDirty(w);
    expect(queueCard(w, q)).not.toBeNull();
    placeFootpath(w, 30, 30);
    markNetworkDirty(w);
    expect(queueCard(w, q)).toBeNull();
  });

  it('every new string is in the string tables', () => {
    for (const k of ['queue.card.title', 'queue.card.openRide', 'queue.card.noRide', 'queue.warn.touches']) expect(en[k], k).toBeTypeOf('string');
    expect(enPlurals['queue.card.count']).toEqual({ one: 'Queue: {n} guest', other: 'Queue: {n} guests' });
  });
});

describe('a tap on a queue tile', () => {
  it('picks the queue even with a guest standing there; a footpath still picks the guest', () => {
    const w = makeTestWorld();
    placeRideDirect(w, 'carousel', 10, 10, 0);
    const q = placeQueue(w, 11, 13);
    markNetworkDirty(w);
    addGuestDirect(w, q);
    expect(pickEntity(w, q)).toEqual({ kind: 'queue', id: queueKey(w, q) });
    const path = placeFootpath(w, 30, 30);
    const g = addGuestDirect(w, path);
    expect(pickEntity(w, path)).toEqual({ kind: 'guest', id: g.id });
  });
});

describe('the open card follows its queue by a stable key', () => {
  it('resolves while the same ride owns the tapped tile; closes when the owner changes or the queue goes', () => {
    const w = makeTestWorld();
    const a = placeRideDirect(w, 'carousel', 10, 10, 0);
    const q = placeQueue(w, 11, 13);
    const q2 = placeQueue(w, 11, 14);
    markNetworkDirty(w);
    const key = queueKey(w, q2);
    expect(resolveQueueCard(w, key, a.id)?.rideId).toBe(a.id);
    // Cut the line: the tapped tile no longer reaches the ride.
    placeFootpath(w, 11, 13);
    markNetworkDirty(w);
    expect(resolveQueueCard(w, key, a.id)).toBeNull();
    placeQueue(w, 11, 13);
    markNetworkDirty(w);
    expect(resolveQueueCard(w, key, a.id)?.rideId).toBe(a.id);
    placeFootpath(w, 11, 14);
    markNetworkDirty(w);
    expect(resolveQueueCard(w, key, a.id)).toBeNull();
    expect(q).toBeGreaterThan(0);
  });
});
