import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boardRide, finishRide, forgetDestination, joinQueue } from '../../../src/sim/guests/api';
import { updateGuests } from '../../../src/sim/guests/update';
import { THOUGHT } from '../../../src/sim/guests/thoughts';
import { guestHooks } from '../../../src/sim/hooks';
import { text } from '../../../src/data/strings/en';
import { Content, neighbour, tileIndex, type Dir } from '../../../src/sim/map';
import { GUEST_DECISION_INTERVAL, LOST_EXIT_TICKS, SIT_MAX_TICKS } from '../../../src/data/tuning/guests';
import { addGuestDirect, makeTestWorld, placeFootpath } from '../../helpers/world';
import { buildPark, type TestPark } from './park';
import { fake, isWalkable, resetFake } from './fakePathing';
import type { World } from '../../../src/sim/types';
import type { Guest } from '../../../src/sim/guests/types';
import type { Ride } from '../../../src/sim/rides/types';

vi.mock('../../../src/sim/pathing/index', () => import('./fakePathing'));
vi.mock('../../../src/sim/hooks', () => ({
  guestHooks: { beforeDecision: [], perTick: [], rideScore: [], rideScoreFactor: [], stallWant: [], afterPurchase: [] },
}));

beforeEach(() => {
  resetFake();
  guestHooks.beforeDecision.length = 0;
  guestHooks.perTick.length = 0;
});

function tickGuests(w: World, n: number): void {
  for (let i = 0; i < n; i++) {
    updateGuests(w);
    w.state.tick++;
  }
}

function calmGuest(w: World, tile: number, patch: Partial<Guest> = {}): Guest {
  return addGuestDirect(w, tile, {
    needs: { hunger: 0, thirst: 0, bladder: 0, energy: 255, happiness: 180, nausea: 0 },
    ...patch,
  });
}

function setup(): { w: World; p: TestPark } {
  const w = makeTestWorld();
  return { w, p: buildPark(w) };
}

/** Every guest stands on a tile a guest may stand on (or is on a ride). */
function allOnWalkable(w: World): boolean {
  return w.state.guests.every(
    (g) =>
      g.state === 'riding' ||
      g.tile === w.state.map.entranceTile ||
      isWalkable(w, g.tile, 'guest') ||
      w.state.map.content[g.tile] === Content.Queue,
  );
}

/** Demolish the way W1-C does: stopRide (riders finish, queue leaves), remove the record and tiles, then forget. */
function demolishRide(w: World, ride: Ride): void {
  for (const id of ride.riders.slice()) {
    const g = w.state.guests.find((x) => x.id === id);
    if (g) finishRide(w, g, ride);
  }
  ride.riders = [];
  w.state.rides = w.state.rides.filter((r) => r.id !== ride.id);
  for (let i = 0; i < w.state.map.content.length; i++) {
    if (w.state.map.contentRef[i] === ride.id) {
      w.state.map.content[i] = Content.Empty;
      w.state.map.contentRef[i] = -1;
    }
  }
  forgetDestination(w, `ride:${ride.id}`);
}

describe('Review Focus 1: guests re-plan after target demolished', () => {
  it('walkers, queuers, and riders all drop a demolished ride within one decision interval', () => {
    const { w, p } = setup();
    const dest = `ride:${p.carousel.id}` as const;
    const walkers = [20, 33, 40].map((x) => calmGuest(w, p.main(x), { target: dest, nextDecisionTick: w.state.tick + 30 }));
    const queued = calmGuest(w, p.t(25, 59), { target: dest });
    joinQueue(w, queued, p.carousel);
    const rider = calmGuest(w, p.t(25, 59), { target: dest });
    joinQueue(w, rider, p.carousel);
    boardRide(w, rider, p.carousel);
    p.carousel.riders.push(rider.id);
    tickGuests(w, 5);

    demolishRide(w, p.carousel);
    // Nobody keeps the dangling target or activity right after the demolish.
    for (const g of w.state.guests) {
      expect(g.target).not.toBe(dest);
      expect(g.activityId).not.toBe(p.carousel.id);
      expect(g.state).not.toBe('queueing');
    }
    expect(rider.tile).toBe(p.t(25, 53));
    // Everyone has re-planned (decided again) within one decision interval, on walkable tiles.
    const t0 = w.state.tick;
    tickGuests(w, GUEST_DECISION_INTERVAL);
    for (const g of [...walkers, queued, rider]) {
      expect(g.nextDecisionTick).toBeGreaterThan(t0);
      expect(g.target).not.toBe(dest);
    }
    expect(allOnWalkable(w)).toBe(true);
  });

  it('closing a ride (record still there) empties its queue and re-plans walkers', () => {
    const { w, p } = setup();
    const dest = `ride:${p.swing.id}` as const;
    const q1 = calmGuest(w, p.t(35, 59), { target: dest });
    const q2 = calmGuest(w, p.t(35, 59), { target: dest });
    joinQueue(w, q1, p.swing);
    joinQueue(w, q2, p.swing);
    const walker = calmGuest(w, p.main(20), { target: dest });
    p.swing.status = 'closed';
    forgetDestination(w, dest);
    expect(p.swing.queue).toEqual([]);
    for (const g of [q1, q2, walker]) {
      expect(g.state).toBe('walking');
      expect(g.target).toBeNull();
      expect(g.nextDecisionTick).toBe(w.state.tick);
    }
    expect(w.state.map.content[q1.tile]).toBe(Content.Footpath);
  });

  it('a demolished stall cancels a purchase in progress without a sale', () => {
    const { w, p } = setup();
    const g = calmGuest(w, p.main(30), { target: `stall:${p.snack.id}`, nextDecisionTick: 1e9 });
    tickGuests(w, 1);
    expect(g.state).toBe('buying');
    w.state.stalls = w.state.stalls.filter((s) => s.id !== p.snack.id);
    forgetDestination(w, `stall:${p.snack.id}`);
    expect(g.state).toBe('walking');
    expect(g.activityId).toBe(-1);
    expect(g.target).toBeNull();
    tickGuests(w, 30);
    expect(p.snack.totals.sales).toBe(0);
  });

  it('re-plans even when nobody calls forgetDestination (record removed)', () => {
    const { w, p } = setup();
    const dest = `ride:${p.carousel.id}` as const;
    const walker = calmGuest(w, p.main(33), { target: dest, nextDecisionTick: 1e9 });
    const queued = calmGuest(w, p.t(25, 59), { target: dest });
    joinQueue(w, queued, p.carousel);
    w.state.rides = w.state.rides.filter((r) => r.id !== p.carousel.id);
    tickGuests(w, 1);
    expect(walker.target).not.toBe(dest);
    expect(queued.state).toBe('walking');
    expect(queued.activityId).toBe(-1);
  });

  it('a rider whose ride record vanished is put back on the paths', () => {
    const { w, p } = setup();
    const g = calmGuest(w, p.t(25, 59), { target: `ride:${p.carousel.id}` });
    joinQueue(w, g, p.carousel);
    boardRide(w, g, p.carousel);
    w.state.rides = w.state.rides.filter((r) => r.id !== p.carousel.id);
    w.state.map.content[p.t(25, 59)] = Content.Empty;
    tickGuests(w, 1);
    expect(g.state).toBe('walking');
    expect(g.activityId).toBe(-1);
    expect(allOnWalkable(w)).toBe(true);
  });
});

describe('Review Focus 1: guest on a removed path relocates', () => {
  it('moves to the nearest walkable tile (BFS N, E, S, W)', () => {
    const { w, p } = setup();
    const g = calmGuest(w, p.main(30), { nextDecisionTick: 1e9 });
    w.state.map.content[p.main(30)] = Content.Empty;
    tickGuests(w, 1);
    // (30, 59) is the Snack Shack; east (31, 60) is the first walkable neighbour.
    expect([p.main(31), p.main(29)]).toContain(g.tile);
    expect(g.tile).not.toBe(p.main(30));
    expect(allOnWalkable(w)).toBe(true);
  });

  it('goes to the park entrance when nothing walkable is within 10 tiles', () => {
    const { w } = setup();
    const lonely = tileIndex(w.state.map, 5, 5);
    const g = calmGuest(w, lonely, { nextDecisionTick: 1e9 });
    tickGuests(w, 1);
    expect(g.tile).toBe(w.state.map.entranceTile);
  });

  it('stops a step toward a tile that was just removed', () => {
    const { w, p } = setup();
    const g = calmGuest(w, p.main(30), { target: `stall:${p.restrooms.id}`, nextDecisionTick: 1e9 });
    tickGuests(w, 3);
    expect(g.nextTile).toBe(p.main(31));
    w.state.map.content[p.main(31)] = Content.Empty;
    tickGuests(w, 1);
    expect(g.tile).toBe(p.main(30));
    expect(g.nextTile).not.toBe(p.main(31));
  });

  it('a queuer whose queue tile is removed leaves the queue; a buyer whose counter tile is removed stops', () => {
    const { w, p } = setup();
    const q = calmGuest(w, p.t(25, 59), { target: `ride:${p.carousel.id}` });
    joinQueue(w, q, p.carousel);
    const b = calmGuest(w, p.main(30), { target: `stall:${p.snack.id}`, nextDecisionTick: 1e9 });
    tickGuests(w, 1);
    expect(b.state).toBe('buying');
    w.state.map.content[p.t(25, 59)] = Content.Empty;
    w.state.map.content[p.main(30)] = Content.Empty;
    tickGuests(w, 1);
    expect(p.carousel.queue).toEqual([]);
    expect(q.state).toBe('walking');
    expect(b.state).toBe('walking');
    expect(p.snack.servingGuest).toBe(-1);
    expect(allOnWalkable(w)).toBe(true);
  });
});

describe('Review Focus 2: lost guest heads for exit', () => {
  it('wanders with "I am lost" and heads for the exit at the first decision 100 ticks after getting lost', () => {
    const { w, p } = setup();
    fake.unreachable.add(`ride:${p.carousel.id}`);
    fake.unreachable.add(`ride:${p.swing.id}`);
    const g = calmGuest(w, p.main(30), { target: `ride:${p.carousel.id}`, nextDecisionTick: w.state.tick + GUEST_DECISION_INTERVAL });
    const t0 = w.state.tick;
    tickGuests(w, 1);
    expect(g.lostSinceTick).toBe(t0);
    expect(g.target).toBeNull();
    expect(g.thoughts.map((t) => t.id)).toContain(THOUGHT.lost);
    expect(text(THOUGHT.lost)).toBe('I am lost');
    // Decisions at t0 + 40 and t0 + 80 find nothing; the guest stays lost and does not count a no-ride streak.
    tickGuests(w, 3 * GUEST_DECISION_INTERVAL - 1);
    expect(g.state).toBe('walking');
    expect(g.noRideStreak).toBe(0);
    expect(w.state.tick - g.lostSinceTick).toBeGreaterThanOrEqual(LOST_EXIT_TICKS);
    // t0 + 120 is the first decision at least 100 ticks after getting lost.
    tickGuests(w, 1);
    expect(g.state).toBe('leaving');
    expect(g.target).toBe('exit');
    expect(g.lostSinceTick).toBe(-1);
    tickGuests(w, 600);
    expect(w.state.guests).not.toContain(g);
  });

  it('a lost guest who finds a reachable ride again stops being lost', () => {
    const { w, p } = setup();
    fake.unreachable.add(`ride:${p.carousel.id}`);
    fake.unreachable.add(`ride:${p.swing.id}`);
    const g = calmGuest(w, p.main(30), { temperament: 80, target: `ride:${p.carousel.id}`, nextDecisionTick: w.state.tick + 40 });
    tickGuests(w, 1);
    expect(g.lostSinceTick).toBeGreaterThanOrEqual(0);
    fake.unreachable.clear();
    tickGuests(w, GUEST_DECISION_INTERVAL);
    expect(g.lostSinceTick).toBe(-1);
    expect(g.target).toBe(`ride:${p.swing.id}`);
  });

  it('a guest on a path island never targets anything, stays lost, and loops nowhere', () => {
    const w = makeTestWorld();
    buildPark(w);
    const island = [placeFootpath(w, 10, 10), placeFootpath(w, 11, 10), placeFootpath(w, 12, 10)];
    const g = calmGuest(w, island[1] as number);
    tickGuests(w, 2000);
    expect(g.target).toBeNull();
    expect(g.lostSinceTick).toBeGreaterThanOrEqual(0);
    expect(island).toContain(g.tile);
    expect(g.state).toBe('walking');
  });

  it('a leaving guest with no route to the exit wanders lost and leaves once a route exists', () => {
    const { w, p } = setup();
    fake.unreachable.add('exit');
    const g = calmGuest(w, p.main(25), { state: 'leaving', target: 'exit' });
    tickGuests(w, 100);
    expect(g.lostSinceTick).toBeGreaterThanOrEqual(0);
    expect(w.state.guests).toContain(g);
    fake.unreachable.clear();
    tickGuests(w, 400);
    expect(w.state.guests).not.toContain(g);
  });
});

describe('sitting (Phase 3 §4.3; the bench owner W1-H ends it)', () => {
  it('holds a sitting guest still and lets a perTick hook end the sit', () => {
    const { w, p } = setup();
    guestHooks.perTick.push((_w, g) => {
      if (g.state === 'sitting' && g.stateTicks >= 60) {
        g.needs.energy += 60;
        g.state = 'walking';
        g.stateTicks = 0;
      }
    });
    const g = calmGuest(w, p.main(30), { state: 'sitting', nextDecisionTick: 1e9 });
    g.needs.energy = 100;
    tickGuests(w, 59);
    expect(g.state).toBe('sitting');
    expect(g.tile).toBe(p.main(30));
    expect(g.nextTile).toBe(-1);
    tickGuests(w, 1);
    expect(g.state).toBe('walking');
    expect(g.needs.energy).toBeGreaterThan(150); // +60 from the hook, minus normal drain
    guestHooks.perTick.length = 0;
  });

  it('stands a guest up without energy when nothing ends the sit for SIT_MAX_TICKS', () => {
    const { w, p } = setup();
    const g = calmGuest(w, p.main(30), { state: 'sitting', nextDecisionTick: 1e9 });
    g.needs.energy = 100;
    tickGuests(w, SIT_MAX_TICKS - 1);
    expect(g.state).toBe('sitting');
    tickGuests(w, 1);
    expect(g.state).toBe('walking');
    expect(g.needs.energy).toBeLessThanOrEqual(100);
    expect(g.nextDecisionTick).toBe(w.state.tick - 1);
  });

  it('a sitter whose tile is removed stands up on a walkable tile', () => {
    const { w, p } = setup();
    const g = calmGuest(w, p.main(30), { state: 'sitting' });
    w.state.map.content[p.main(30)] = Content.Empty;
    tickGuests(w, 1);
    expect(g.state).toBe('walking');
    expect(allOnWalkable(w)).toBe(true);
  });
});

describe('wandering (Phase 1 §4.2)', () => {
  it('never reverses at once except at a dead end, and never enters a queue or the entrance', () => {
    const { w, p } = setup();
    guestHooks.beforeDecision.push(() => true); // keep the guest target-free
    const g = calmGuest(w, p.main(30), { dir: 1 });
    const path: number[] = [g.tile];
    for (let i = 0; i < 3000; i++) {
      tickGuests(w, 1);
      if (g.tile !== path[path.length - 1]) path.push(g.tile);
      expect(w.state.map.content[g.tile]).toBe(Content.Footpath);
    }
    expect(path.length).toBeGreaterThan(100);
    const walkableNeighbours = (t: number): number =>
      ([0, 1, 2, 3] as Dir[]).filter((d) => {
        const n = neighbour(w.state.map, t, d);
        return n >= 0 && w.state.map.content[n] === Content.Footpath;
      }).length;
    for (let i = 1; i + 1 < path.length; i++) {
      if (path[i + 1] === path[i - 1]) expect(walkableNeighbours(path[i] as number)).toBe(1);
    }
  });
});
