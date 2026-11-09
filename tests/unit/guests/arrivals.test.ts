import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnArrivals, spawnGuest, spawnGuests } from '../../../src/sim/guests/arrivals';
import { arrivalsPerHour } from '../../../src/sim/park/arrivals';
import { currentLedger } from '../../../src/sim/economy/ledger';
import { temperamentGroup } from '../../../src/data/catalog';
import { START_HAPPINESS } from '../../../src/data/tuning/guests';
import { makeTestWorld, placeRideDirect } from '../../helpers/world';

vi.mock('../../../src/sim/pathing/index', () => import('./fakePathing'));
vi.mock('../../../src/sim/park/arrivals', () => ({ arrivalsPerHour: vi.fn(() => 0) }));
vi.mock('../../../src/sim/hooks', () => ({
  guestHooks: { beforeDecision: [], perTick: [], rideScore: [], stallWant: [], afterPurchase: [] },
}));

const perHour = vi.mocked(arrivalsPerHour);

function openWorld(fee = 0) {
  const w = makeTestWorld(777);
  w.state.park.open = true;
  w.state.park.entranceFee = fee;
  return w;
}

function runArrivals(w: ReturnType<typeof makeTestWorld>, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    spawnArrivals(w);
    w.state.tick++;
  }
}

beforeEach(() => perHour.mockReset());

describe('spawn rate (Phase 1 §4.6, spawn side)', () => {
  it('spawns arrivalsPerHour guests per game hour through the carry', () => {
    const w = openWorld();
    perHour.mockReturnValue(6);
    runArrivals(w, 50 * 10); // 10 game hours
    expect(w.state.guests).toHaveLength(60);
    expect(w.state.park.guestsArrivedTotal).toBe(60);
    expect(w.state.park.arrivalCarry).toBe(0);
  });

  it('carries fractional arrivals between ticks and hours', () => {
    const w = openWorld();
    perHour.mockReturnValue(1.3); // 26 thousandths per tick
    runArrivals(w, 49);
    expect(w.state.guests).toHaveLength(1);
    expect(w.state.park.arrivalCarry).toBe(49 * 26 - 1000);
    runArrivals(w, 50 * 20 - 49);
    expect(w.state.guests).toHaveLength(26);
  });

  it('spawns nobody while the park is closed', () => {
    const w = openWorld();
    w.state.park.open = false;
    perHour.mockReturnValue(50);
    runArrivals(w, 500);
    expect(w.state.guests).toHaveLength(0);
    expect(w.state.park.arrivalCarry).toBe(0);
  });

  it('emits guestsChanged when guests arrive', () => {
    const w = openWorld();
    perHour.mockReturnValue(50); // 1 guest per tick
    spawnArrivals(w);
    expect(w.events).toContainEqual({ type: 'guestsChanged' });
  });
});

describe('entrance fee (Phase 1 §4.3 Spawn and entry)', () => {
  it('turns guests away when the fee is above every tolerance ($5 × 1.2 with no open rides)', () => {
    const w = openWorld(601);
    const cash = w.state.park.cash;
    for (let i = 0; i < 200; i++) expect(spawnGuest(w)).toBeNull();
    expect(w.state.guests).toHaveLength(0);
    expect(w.state.park.turnedAway).toBe(200);
    expect(w.state.park.guestsArrivedTotal).toBe(0);
    expect(w.state.park.cash).toBe(cash);
    expect(w.state.nextId).toBe(1);
  });

  it('lets everyone in below every tolerance ($5 × 0.8) and books entrance tickets', () => {
    const w = openWorld(400);
    const cash = w.state.park.cash;
    const guests = spawnGuests(w, 100);
    expect(guests).toHaveLength(100);
    expect(w.state.park.turnedAway).toBe(0);
    expect(currentLedger(w).lines.entranceTickets).toBe(400 * 100);
    expect(w.state.park.cash).toBe(cash + 400 * 100);
    for (const g of guests) {
      expect(g.spent).toBe(400);
      expect(g.cash).toBeGreaterThanOrEqual(4000 - 400);
      expect(g.cash).toBeLessThanOrEqual(12000 - 400);
    }
  });

  it('turns away a share of guests between the tolerance bounds', () => {
    const w = openWorld(500); // tolerance $4–$6: about half turn away
    spawnGuests(w, 1000);
    expect(w.state.park.turnedAway).toBeGreaterThan(350);
    expect(w.state.park.turnedAway).toBeLessThan(650);
    expect(w.state.guests.length + w.state.park.turnedAway).toBe(1000);
  });

  it('raises the tolerance by $2.50 per open ride', () => {
    const w = openWorld(790);
    placeRideDirect(w, 'carousel', 10, 10).status = 'open';
    placeRideDirect(w, 'big_wheel', 20, 10).status = 'open';
    placeRideDirect(w, 'swing_tower', 30, 10); // closed: does not count
    spawnGuests(w, 100); // tolerance ≥ $10 × 0.8 = $8.00
    expect(w.state.park.turnedAway).toBe(0);
  });

  it('multiplies the tolerance by modifiers.priceTolerance (master R7)', () => {
    const w = openWorld(800);
    spawnGuests(w, 50);
    expect(w.state.park.turnedAway).toBe(50);
    w.state.modifiers.priceTolerance = 2; // tolerance ≥ $5 × 0.8 × 2 = $8.00
    spawnGuests(w, 50);
    expect(w.state.park.turnedAway).toBe(50);
    expect(w.state.guests).toHaveLength(50);
  });
});

describe('marketing effects on arrivals (Phase 3 §4.7, W1-I helpers)', () => {
  it('charges no fee during Open Gate Day', () => {
    const w = openWorld(5000);
    w.state.management.campaigns.push({ type: 'open_gate_day', targetId: -1, endTick: w.state.tick + 1200 });
    const guests = spawnGuests(w, 20);
    expect(guests).toHaveLength(20);
    expect(w.state.park.turnedAway).toBe(0);
    expect(currentLedger(w).lines.entranceTickets).toBe(0);
    for (const g of guests) expect(g.spent).toBe(0);
  });

  it('shifts temperament +20 during Thrill Weekend and −20 during Chill Weekend', () => {
    const plain = openWorld();
    const thrill = openWorld();
    const chill = openWorld();
    thrill.state.management.campaigns.push({ type: 'thrill_weekend', targetId: -1, endTick: 99_999 });
    chill.state.management.campaigns.push({ type: 'chill_weekend', targetId: -1, endTick: 99_999 });
    const a = spawnGuests(plain, 200);
    const b = spawnGuests(thrill, 200);
    const c = spawnGuests(chill, 200);
    for (let i = 0; i < 200; i++) {
      const t = (a[i] as (typeof a)[number]).temperament;
      expect((b[i] as (typeof b)[number]).temperament).toBe(Math.min(100, t + 20));
      expect((c[i] as (typeof c)[number]).temperament).toBe(Math.max(0, t - 20));
    }
  });
});

describe('new guest record (Phase 1 §4.3)', () => {
  it('starts on the entrance tile with start values in range and every field filled', () => {
    const w = openWorld();
    const guests = spawnGuests(w, 300);
    let prev = 0;
    for (const g of guests) {
      expect(g.id).toBeGreaterThan(prev);
      prev = g.id;
      expect(g.tile).toBe(w.state.map.entranceTile);
      expect(g.nextTile).toBe(-1);
      expect(g.state).toBe('arriving');
      expect(g.lane).toBe(g.id % 4);
      expect(g.target).toBeNull();
      expect(g.needs.hunger).toBeGreaterThanOrEqual(30);
      expect(g.needs.hunger).toBeLessThanOrEqual(60);
      expect(g.needs.thirst).toBeGreaterThanOrEqual(30);
      expect(g.needs.thirst).toBeLessThanOrEqual(60);
      expect(g.needs.bladder).toBeGreaterThanOrEqual(10);
      expect(g.needs.bladder).toBeLessThanOrEqual(40);
      expect(g.needs.energy).toBeGreaterThanOrEqual(200);
      expect(g.needs.energy).toBeLessThanOrEqual(255);
      expect(g.needs.nausea).toBe(0);
      expect(g.needs.happiness).toBe(START_HAPPINESS);
      expect(g.cash % 100).toBe(0);
      expect(g.cash).toBeGreaterThanOrEqual(4000);
      expect(g.cash).toBeLessThanOrEqual(12000);
      expect(g.items).toEqual({ map: false, umbrella: false, balloon: false });
      expect(g.nextDecisionTick).toBe(w.state.tick);
      expect(g.lostSinceTick).toBe(-1);
      expect(g.activityId).toBe(-1);
      expect(g.seat).toBeNull();
    }
  });

  it('draws temperament with mean 50 ± 2 over 10,000 arrivals and all three groups', () => {
    const w = openWorld();
    const guests = spawnGuests(w, 10_000);
    const mean = guests.reduce((s, g) => s + g.temperament, 0) / guests.length;
    expect(Math.abs(mean - 50)).toBeLessThanOrEqual(2);
    const groups = new Set(guests.map((g) => temperamentGroup(g.temperament)));
    expect(groups).toEqual(new Set(['chill', 'family', 'thrill']));
  });

  it('is deterministic for a seed', () => {
    const a = openWorld();
    const b = openWorld();
    expect(JSON.stringify(spawnGuests(a, 50))).toBe(JSON.stringify(spawnGuests(b, 50)));
  });
});
