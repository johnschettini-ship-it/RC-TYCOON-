import { describe, expect, it, vi } from 'vitest';
import { boardRide, finishRide, joinQueue } from '../../../src/sim/guests/api';
import { updateGuests } from '../../../src/sim/guests/update';
import { THOUGHT } from '../../../src/sim/guests/thoughts';
import { currentLedger } from '../../../src/sim/economy/ledger';
import { Content } from '../../../src/sim/map';
import { GUEST_WALK_TICKS_PER_TILE, QUEUE_MAX_JOIN, QUEUE_MAX_WAIT } from '../../../src/data/tuning/guests';
import { addGuestDirect, makeTestWorld, makeTrackRideDataDirect, placeRideDirect, testResultDirect } from '../../helpers/world';
import { buildPark } from './park';
import type { World } from '../../../src/sim/types';
import type { Guest } from '../../../src/sim/guests/types';

vi.mock('../../../src/sim/pathing/index', () => import('./fakePathing'));
vi.mock('../../../src/sim/hooks', () => ({
  guestHooks: { beforeDecision: [], perTick: [], rideScore: [], rideScoreFactor: [], stallWant: [], afterPurchase: [] },
}));

function tickGuests(w: World, n: number): void {
  for (let i = 0; i < n; i++) {
    updateGuests(w);
    w.state.tick++;
  }
}

/** Join as if during this tick's guest update; the next update runs at the next tick. */
function joinNow(w: World, g: Guest, ride: Parameters<typeof joinQueue>[2]): void {
  joinQueue(w, g, ride);
  w.state.tick++;
}

/** Calm guest: needs stay below uncomfortable for a long time. */
function calmGuest(w: World, tile: number, patch: Partial<Guest> = {}): Guest {
  return addGuestDirect(w, tile, {
    needs: { hunger: 0, thirst: 0, bladder: 0, energy: 255, happiness: 180, nausea: 0 },
    ...patch,
  });
}

describe('walking (Phase 1 §4.2–4.3)', () => {
  it('walks 10 ticks per tile toward its target and joins the queue on its first queue tile', () => {
    const w = makeTestWorld();
    const p = buildPark(w);
    const g = calmGuest(w, p.main(30), { target: `ride:${p.carousel.id}`, nextDecisionTick: 1e9 });
    tickGuests(w, GUEST_WALK_TICKS_PER_TILE - 1);
    expect(g.tile).toBe(p.main(30));
    expect(g.nextTile).toBe(p.main(29));
    expect(g.dir).toBe(3);
    tickGuests(w, 1);
    expect(g.tile).toBe(p.main(29));
    // 6 tiles in all: (30,60) → (25,60) → (25,59), the first queue tile.
    tickGuests(w, 5 * GUEST_WALK_TICKS_PER_TILE - 1);
    expect(g.state).toBe('walking');
    tickGuests(w, 1);
    expect(g.tile).toBe(p.t(25, 59));
    expect(g.state).toBe('queueing');
    expect(g.activityId).toBe(p.carousel.id);
    expect(p.carousel.queue).toEqual([g.id]);
  });

  it('uses lane = id % 4 from spawn and keeps it', () => {
    const w = makeTestWorld();
    const p = buildPark(w);
    const g = calmGuest(w, p.main(30));
    expect(g.lane).toBe(g.id % 4);
  });
});

describe('queues (Phase 1 §4.3 Queueing)', () => {
  it('does not join a queue of 25 and thinks "That queue is far too long"', () => {
    const w = makeTestWorld();
    const p = buildPark(w);
    p.carousel.queue = Array.from({ length: QUEUE_MAX_JOIN }, (_, i) => 9000 + i);
    const g = calmGuest(w, p.main(25), { target: `ride:${p.carousel.id}`, nextDecisionTick: 1e9 });
    tickGuests(w, GUEST_WALK_TICKS_PER_TILE);
    expect(p.carousel.queue).not.toContain(g.id);
    expect(g.state).toBe('walking');
    expect(g.target).toBeNull();
    expect(g.thoughts.map((t) => t.id)).toContain(THOUGHT.queueTooLong);
    expect(w.state.map.content[g.tile]).not.toBe(Content.Queue);
  });

  it('joins when the queue holds 24', () => {
    const w = makeTestWorld();
    const p = buildPark(w);
    p.carousel.queue = Array.from({ length: QUEUE_MAX_JOIN - 1 }, (_, i) => 9000 + i);
    const g = calmGuest(w, p.t(25, 59), { target: `ride:${p.carousel.id}` });
    expect(joinQueue(w, g, p.carousel)).toBe(true);
    expect(p.carousel.queue).toHaveLength(QUEUE_MAX_JOIN);
    expect(p.carousel.queue[QUEUE_MAX_JOIN - 1]).toBe(g.id);
  });

  it('leaves after 1,200 ticks of waiting with "I waited too long" and loses 1 happiness per 100 ticks', () => {
    const w = makeTestWorld();
    const p = buildPark(w);
    const g = calmGuest(w, p.t(25, 59), { target: `ride:${p.carousel.id}` });
    joinNow(w, g, p.carousel);
    tickGuests(w, QUEUE_MAX_WAIT - 1);
    expect(g.state).toBe('queueing');
    expect(g.needs.happiness).toBe(180 - 11);
    tickGuests(w, 1);
    expect(g.state).toBe('walking');
    expect(p.carousel.queue).toEqual([]);
    expect(g.thoughts.map((t) => t.id)).toContain(THOUGHT.waitedTooLong);
    expect(g.needs.happiness).toBe(180 - 12);
    expect(g.activityId).toBe(-1);
    expect(w.state.map.content[g.tile]).toBe(Content.Footpath);
  });

  it('runs out of patience twice as fast while the ride is broken, except slow running (Phase 3 §4.5)', () => {
    const w = makeTestWorld();
    const p = buildPark(w);
    const a = calmGuest(w, p.t(25, 59), { target: `ride:${p.carousel.id}` });
    const b = calmGuest(w, p.t(35, 59), { target: `ride:${p.swing.id}` });
    joinQueue(w, a, p.carousel);
    joinNow(w, b, p.swing);
    p.carousel.status = 'broken';
    p.carousel.breakdownType = 'stopped';
    p.swing.status = 'broken';
    p.swing.breakdownType = 'slow_running';
    tickGuests(w, QUEUE_MAX_WAIT / 2 - 1);
    expect(a.state).toBe('queueing');
    tickGuests(w, 1);
    expect(a.state).toBe('walking');
    expect(a.thoughts.map((t) => t.id)).toContain(THOUGHT.waitedTooLong);
    expect(b.state).toBe('queueing');
  });

  it('a guest removed from the queue by another system re-plans', () => {
    const w = makeTestWorld();
    const p = buildPark(w);
    const g = calmGuest(w, p.t(25, 59), { target: `ride:${p.carousel.id}` });
    joinQueue(w, g, p.carousel);
    p.carousel.queue.length = 0;
    tickGuests(w, 1);
    expect(g.state).toBe('walking');
    expect(g.activityId).toBe(-1);
  });
});

describe('boarding (Phase 1 §4.3 Riding)', () => {
  it('pays the price into ride tickets, leaves the queue, and rides; totals are the ride system’s', () => {
    const w = makeTestWorld();
    const p = buildPark(w);
    const g = calmGuest(w, p.t(25, 59), { target: `ride:${p.carousel.id}`, cash: 1000 });
    joinQueue(w, g, p.carousel);
    const cash = w.state.park.cash;
    expect(boardRide(w, g, p.carousel)).toBe(true);
    expect(g.cash).toBe(1000 - p.carousel.price);
    expect(g.spent).toBe(p.carousel.price);
    expect(w.state.park.cash).toBe(cash + p.carousel.price);
    expect(currentLedger(w).lines.rideTickets).toBe(p.carousel.price);
    expect(p.carousel.totals).toEqual({ riders: 0, income: 0, ridersThisMonth: 0, incomeThisMonth: 0 });
    expect(p.carousel.queue).toEqual([]);
    expect(g.state).toBe('riding');
    expect(g.activityId).toBe(p.carousel.id);
    expect(boardRide(w, g, p.carousel)).toBe(false);
  });

  it('a guest who cannot pay does not board, thinks "I need cash", and leaves the queue', () => {
    const w = makeTestWorld();
    const p = buildPark(w);
    const g = calmGuest(w, p.t(25, 59), { target: `ride:${p.carousel.id}`, cash: p.carousel.price - 1 });
    joinQueue(w, g, p.carousel);
    expect(boardRide(w, g, p.carousel)).toBe(false);
    expect(g.state).toBe('walking');
    expect(p.carousel.queue).toEqual([]);
    expect(g.thoughts.map((t) => t.id)).toContain(THOUGHT.needCash);
    expect(currentLedger(w).lines.rideTickets).toBe(0);
  });
});

describe('ride effects (Phase 1 §4.3 Riding)', () => {
  function ride(w: World, defId: string, t: number): { g: Guest; r: ReturnType<typeof placeRideDirect> } {
    const r = placeRideDirect(w, defId, 10, 10);
    r.status = 'open';
    const g = calmGuest(w, 0, { temperament: t, cash: 5000 });
    g.needs.happiness = 100;
    boardRide(w, g, r);
    return { g, r };
  }

  it('Flip Arm for T = 80: happiness +20 ("That was amazing!"), nausea +63, energy −5', () => {
    const w = makeTestWorld();
    const { g, r } = ride(w, 'flip_arm', 80);
    finishRide(w, g, r);
    // 12 × 6.5 / 5 × (1 + 0.6 × 0.5) = 20.28 → 20; nausea 6.0 × 15 × 0.7 = 63.
    expect(g.needs.happiness).toBe(120);
    expect(g.needs.nausea).toBe(63);
    expect(g.needs.energy).toBe(250);
    expect(g.thoughts.map((t) => t.id)).toEqual([THOUGHT.amazing]);
    expect(g.ridden[String(r.id)]).toBe(1);
  });

  it('Teacup Twirl for T = 70: happiness +10 ("That was nice")', () => {
    const w = makeTestWorld();
    const { g, r } = ride(w, 'teacup_twirl', 70);
    finishRide(w, g, r);
    // 12 × 3.5 / 5 × (1 + 0.3 × 0.5) = 9.66 → 10; nausea 4.5 × 15 × 0.8 = 54.
    expect(g.needs.happiness).toBe(110);
    expect(g.needs.nausea).toBe(54);
    expect(g.thoughts.map((t) => t.id)).toEqual([THOUGHT.nice]);
  });

  it('Carousel for T = 50 is tame: the gain halves ("That was a bit tame")', () => {
    const w = makeTestWorld();
    const { g, r } = ride(w, 'carousel', 50);
    finishRide(w, g, r);
    // 12 × 2.5 / 5 × 1.15 = 6.9, halved = 3.45 → 3; nausea 0.5 × 15 × 1.0 = 7.5 → 8.
    expect(g.needs.happiness).toBe(103);
    expect(g.needs.nausea).toBe(8);
    expect(g.thoughts.map((t) => t.id)).toEqual([THOUGHT.tame]);
  });

  it('caps happiness at 255', () => {
    const w = makeTestWorld();
    const { g, r } = ride(w, 'flip_arm', 80);
    g.needs.happiness = 250;
    finishRide(w, g, r);
    expect(g.needs.happiness).toBe(255);
  });

  it('slow running lowers excitement by 1.00 (Phase 3 §4.5)', () => {
    const w = makeTestWorld();
    const { g, r } = ride(w, 'flip_arm', 80);
    r.status = 'broken';
    r.breakdownType = 'slow_running';
    finishRide(w, g, r);
    // 12 × 5.5 / 5 × 1.3 = 17.16 → 17.
    expect(g.needs.happiness).toBe(117);
  });

  it('places the guest on the exit footpath, walking, with no target, deciding now', () => {
    const w = makeTestWorld();
    const p = buildPark(w);
    const g = calmGuest(w, p.t(25, 59), { target: `ride:${p.carousel.id}` });
    joinQueue(w, g, p.carousel);
    boardRide(w, g, p.carousel);
    g.seat = { rideId: p.carousel.id, trainId: 0, car: 0, seat: 0 };
    finishRide(w, g, p.carousel);
    expect(g.tile).toBe(p.carousel.exit?.outside);
    expect(g.tile).toBe(p.t(25, 53));
    expect(g.state).toBe('walking');
    expect(g.target).toBeNull();
    expect(g.activityId).toBe(-1);
    expect(g.seat).toBeNull();
    expect(g.nextDecisionTick).toBe(w.state.tick);
  });

  it('relocates the guest when the exit footpath is gone', () => {
    const w = makeTestWorld();
    const p = buildPark(w);
    const g = calmGuest(w, p.t(25, 59), { target: `ride:${p.carousel.id}` });
    joinQueue(w, g, p.carousel);
    boardRide(w, g, p.carousel);
    w.state.map.content[p.t(25, 53)] = Content.Empty;
    finishRide(w, g, p.carousel);
    expect(g.tile).toBe(p.t(26, 53));
  });

  it('ignores finishRide for a guest who is not riding that ride', () => {
    const w = makeTestWorld();
    const p = buildPark(w);
    const g = calmGuest(w, p.main(30));
    const before = JSON.stringify(g);
    finishRide(w, g, p.carousel);
    expect(JSON.stringify(g)).toBe(before);
  });

  it('track rides: airtime pleases Thrill guests, inversions upset Chill guests (Phase 2 §4.11)', () => {
    const w = makeTestWorld();
    const r = placeRideDirect(w, 'carousel', 10, 10);
    r.kind = 'track';
    r.defId = 'steel_coaster';
    r.status = 'open';
    r.stats = { excitement: 500, intensity: 400, nausea: 143 };
    // W1-G units: airtime in ticks (24 ticks = 1.2 s at 20 ticks per second), inversions as a count.
    makeTrackRideDataDirect(w, r, { test: testResultDirect({ airtimeTicks: 24, inversions: 1 }), openedOnce: true });
    const thrill = calmGuest(w, 0, { temperament: 70 });
    const chill = calmGuest(w, 0, { temperament: 20 });
    const family = calmGuest(w, 0, { temperament: 50 });
    for (const g of [thrill, chill, family]) {
      g.needs.happiness = 100;
      boardRide(w, g, r);
      finishRide(w, g, r);
    }
    // Thrill tag. Base gains: T 70 (fit 0.4) 12 × 5 / 5 × 1.2 = 14.4 → 14; T 20 (fit < 0) 12; T 50 (fit 0) 12.
    expect(thrill.needs.happiness).toBe(100 + 14 + 10);
    expect(thrill.thoughts.map((t) => t.id)).toContain(THOUGHT.airtimeAwesome);
    expect(chill.needs.happiness).toBe(100 + 12 - 10);
    expect(chill.thoughts.map((t) => t.id)).toContain(THOUGHT.neverUpsideDown);
    expect(family.needs.happiness).toBe(100 + 12);
    expect(family.thoughts.map((t) => t.id)).not.toContain(THOUGHT.airtimeAwesome);
  });

  it('track rides: the airtime threshold is 1.0 s = 20 ticks of the W1-G test result', () => {
    const ride = (w: World, airtimeTicks: number) => {
      const r = placeRideDirect(w, 'carousel', 10, 10);
      r.kind = 'track';
      r.defId = 'steel_coaster';
      r.status = 'open';
      r.stats = { excitement: 500, intensity: 400, nausea: 143 };
      makeTrackRideDataDirect(w, r, { test: testResultDirect({ airtimeTicks }), openedOnce: true });
      return r;
    };
    for (const [ticks, reacts] of [
      [19, false],
      [20, true],
    ] as const) {
      const w = makeTestWorld();
      const r = ride(w, ticks);
      const g = calmGuest(w, 0, { temperament: 70 });
      g.needs.happiness = 100;
      boardRide(w, g, r);
      finishRide(w, g, r);
      expect(g.needs.happiness).toBe(100 + 14 + (reacts ? 10 : 0));
      expect(g.thoughts.some((t) => t.id === THOUGHT.airtimeAwesome)).toBe(reacts);
    }
  });
});
