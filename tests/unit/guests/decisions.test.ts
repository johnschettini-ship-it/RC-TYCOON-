import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateGuests } from '../../../src/sim/guests/update';
import { decide } from '../../../src/sim/guests/decide';
import { spawnGuests } from '../../../src/sim/guests/arrivals';
import { THOUGHT } from '../../../src/sim/guests/thoughts';
import { guestHooks } from '../../../src/sim/hooks';
import { currentLedger } from '../../../src/sim/economy/ledger';
import { text } from '../../../src/data/strings/en';
import {
  FIRST_AID_TICKS,
  GUEST_DECISION_INTERVAL,
  GUEST_WALK_TICKS_PER_TILE,
  RECENT_LEAVERS_MAX,
  RESTROOM_TICKS,
  SALE_TICKS,
} from '../../../src/data/tuning/guests';
import { addGuestDirect, makeTestWorld, placeStallDirect, stateHash } from '../../helpers/world';
import { buildPark, type TestPark } from './park';
import { fake, resetFake } from './fakePathing';
import type { World } from '../../../src/sim/types';
import type { Guest } from '../../../src/sim/guests/types';

vi.mock('../../../src/sim/pathing/index', () => import('./fakePathing'));
vi.mock('../../../src/sim/hooks', () => ({
  guestHooks: { beforeDecision: [], perTick: [], rideScore: [], rideScoreFactor: [], stallWant: [], afterPurchase: [] },
}));

beforeEach(() => {
  resetFake();
  guestHooks.beforeDecision.length = 0;
  guestHooks.perTick.length = 0;
  guestHooks.rideScore.length = 0;
  guestHooks.rideScoreFactor.length = 0;
  guestHooks.stallWant.length = 0;
  guestHooks.afterPurchase.length = 0;
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

const ids = (g: Guest): string[] => g.thoughts.map((t) => t.id);

describe('need-driven stall choice (Phase 1 §4.3 Decisions 1)', () => {
  it('targets the nearest reachable stall of the needed kind and thinks about the need', () => {
    const { w, p } = setup();
    const far = placeStallDirect(w, 'snack_shack', 22, 59, 2); // service (22, 60)
    const g = calmGuest(w, p.main(33));
    g.needs.hunger = 170;
    decide(w, g);
    expect(g.target).toBe(`stall:${p.snack.id}`);
    expect(ids(g)).toContain(THOUGHT.hungry);
    g.target = null;
    fake.unreachable.add(`stall:${p.snack.id}`);
    decide(w, g);
    expect(g.target).toBe(`stall:${far.id}`);
  });

  it('serves the most pressing need first: thirst 200 over hunger 170; bladder → restrooms', () => {
    const { w, p } = setup();
    const g = calmGuest(w, p.main(33));
    g.needs.hunger = 170;
    g.needs.thirst = 200;
    decide(w, g);
    expect(g.target).toBe(`stall:${p.fizz.id}`);
    const h = calmGuest(w, p.main(33));
    h.needs.bladder = 160;
    decide(w, h);
    expect(h.target).toBe(`stall:${p.restrooms.id}`);
    expect(ids(h)).toContain(THOUGHT.needRestroom);
  });

  it('skips a price above item value × 2 with "Too expensive for a snack" / "… for a drink"', () => {
    const { w, p } = setup();
    p.snack.price = 601;
    p.fizz.price = 401;
    const g = calmGuest(w, p.main(33));
    g.needs.hunger = 170;
    g.needs.thirst = 170;
    decide(w, g);
    expect(g.target === `stall:${p.snack.id}` || g.target === `stall:${p.fizz.id}`).toBe(false);
    expect(ids(g)).toContain(THOUGHT.snackTooExpensive);
    expect(ids(g)).toContain(THOUGHT.drinkTooExpensive);
    expect(text(THOUGHT.snackTooExpensive)).toBe('Too expensive for a snack');
    expect(text(THOUGHT.drinkTooExpensive)).toBe('Too expensive for a drink');
    p.snack.price = 600;
    g.target = null;
    decide(w, g);
    expect(g.target).toBe(`stall:${p.snack.id}`);
  });

  it('divides stall distance by the stallWant hooks (Phase 3 §4.9)', () => {
    const { w, p } = setup();
    const far = placeStallDirect(w, 'snack_shack', 22, 59, 2); // 11 tiles from (33, 60); the near one is 3
    guestHooks.stallWant.push((_w, _g, s) => (s.id === far.id ? 4 : 1));
    const g = calmGuest(w, p.main(33));
    g.needs.hunger = 170;
    decide(w, g);
    expect(g.target).toBe(`stall:${far.id}`);
    guestHooks.stallWant.push((_w, _g, s) => (s.id === far.id ? 0 : 1));
    g.target = null;
    decide(w, g);
    expect(g.target).toBe(`stall:${p.snack.id}`);
  });
});

describe('ride choice (Phase 1 §4.3 Decisions 2)', () => {
  it('a Thrill guest picks Swing Tower; a Chill guest picks the Carousel and thinks Swing Tower is too intense', () => {
    const { w, p } = setup();
    const thrill = calmGuest(w, p.main(30), { temperament: 80 });
    const chill = calmGuest(w, p.main(30), { temperament: 20 });
    decide(w, thrill);
    decide(w, chill);
    expect(thrill.target).toBe(`ride:${p.swing.id}`);
    expect(chill.target).toBe(`ride:${p.carousel.id}`);
    expect(ids(chill)).toContain(THOUGHT.tooIntense);
  });

  it('gives each hard-reject thought at the decision', () => {
    const { w, p } = setup();
    p.carousel.price = 1000;
    p.swing.queue = Array.from({ length: 25 }, (_, i) => 9000 + i);
    const g = calmGuest(w, p.main(30), { temperament: 50 });
    decide(w, g);
    expect(g.target).toBeNull();
    expect(ids(g)).toEqual(expect.arrayContaining([THOUGHT.rideTooExpensive, THOUGHT.queueTooLong]));
  });

  it('never targets an unreachable or closed ride', () => {
    const { w, p } = setup();
    fake.unreachable.add(`ride:${p.swing.id}`);
    p.carousel.status = 'closed';
    const g = calmGuest(w, p.main(30), { temperament: 80 });
    decide(w, g);
    expect(g.target).toBeNull();
  });

  it('skips rides the guest cannot pay for', () => {
    const { w, p } = setup();
    const g = calmGuest(w, p.main(30), { temperament: 80, cash: p.swing.price - 1 });
    decide(w, g);
    expect(g.target).not.toBe(`ride:${p.swing.id}`);
  });

  it('adds the rideScore hooks', () => {
    const { w, p } = setup();
    guestHooks.rideScore.push((_w, _g, r) => (r.id === p.carousel.id ? 10 : 0));
    const g = calmGuest(w, p.main(30), { temperament: 80 });
    decide(w, g);
    expect(g.target).toBe(`ride:${p.carousel.id}`);
  });

  it('multiplies a positive score by the rideScoreFactor hooks', () => {
    const { w, p } = setup();
    const g = calmGuest(w, p.main(30), { temperament: 80 });
    decide(w, g);
    const usual = g.target;
    expect(usual).not.toBeNull();
    const w2 = setup();
    const ride = Number(String(usual).slice('ride:'.length));
    guestHooks.rideScoreFactor.push((_w, _g, r) => (r.id === ride ? 0 : 1));
    const g2 = calmGuest(w2.w, w2.p.main(30), { temperament: 80 });
    decide(w2.w, g2);
    expect(g2.target).not.toBe(usual);
  });
});

describe('guest hooks', () => {
  it('beforeDecision runs first; returning true takes the decision', () => {
    const { w, p } = setup();
    const seen: number[] = [];
    guestHooks.beforeDecision.push((_w, g) => {
      seen.push(g.id);
      return true;
    });
    const g = calmGuest(w, p.main(30), { temperament: 80 });
    decide(w, g);
    expect(seen).toEqual([g.id]);
    expect(g.target).toBeNull();
    guestHooks.beforeDecision[0] = () => false;
    decide(w, g);
    expect(g.target).toBe(`ride:${p.swing.id}`);
  });

  it('decides every 40 ticks while walking and calls perTick every tick for every guest', () => {
    const { w, p } = setup();
    let decisions = 0;
    guestHooks.beforeDecision.push(() => {
      decisions++;
      return true;
    });
    const perTick: number[] = [];
    guestHooks.perTick.push((_w, g) => perTick.push(g.id));
    const a = calmGuest(w, p.main(30));
    calmGuest(w, p.main(33));
    tickGuests(w, 2 * GUEST_DECISION_INTERVAL + 1);
    expect(decisions).toBe(2 * 3);
    expect(perTick.length).toBe(2 * (2 * GUEST_DECISION_INTERVAL + 1));
    expect(perTick[0]).toBe(a.id);
  });
});

describe('leaving (Phase 1 §4.3 Decisions 3, Leaving)', () => {
  it('leaves at happiness ≤ 60 with "Time to go home"', () => {
    const { w, p } = setup();
    const g = calmGuest(w, p.main(30));
    g.needs.happiness = 60;
    decide(w, g);
    expect(g.state).toBe('leaving');
    expect(g.target).toBe('exit');
    expect(ids(g)).toContain(THOUGHT.goHome);
  });

  it('leaves at energy ≤ 50 with "I am tired"', () => {
    const { w, p } = setup();
    const g = calmGuest(w, p.main(30));
    g.needs.energy = 50;
    decide(w, g);
    expect(g.state).toBe('leaving');
    expect(ids(g)).toEqual(expect.arrayContaining([THOUGHT.tired, THOUGHT.goHome]));
  });

  it('leaves when cash is below the cheapest open ride or stall price', () => {
    const { w, p } = setup();
    p.restrooms.open = false; // $0 would make every guest able to afford something
    const g = calmGuest(w, p.main(30), { cash: 199 });
    decide(w, g);
    expect(g.state).toBe('leaving');
    const h = calmGuest(w, p.main(30), { cash: 200, temperament: 20 });
    decide(w, h);
    expect(h.state).toBe('walking');
  });

  it('leaves after 3 decisions in a row with no ride above 0, saying "What a great park!" when happy', () => {
    const { w, p } = setup();
    p.carousel.status = 'closed';
    p.swing.status = 'closed';
    const g = calmGuest(w, p.main(30));
    g.needs.happiness = 230;
    tickGuests(w, 2 * GUEST_DECISION_INTERVAL);
    expect(g.noRideStreak).toBe(2);
    expect(g.state).toBe('walking');
    tickGuests(w, 1);
    expect(g.state).toBe('leaving');
    expect(ids(g)).toEqual(expect.arrayContaining([THOUGHT.goHome, THOUGHT.greatPark]));
  });

  it('walks to the entrance, stores final happiness, and is removed', () => {
    const { w, p } = setup();
    const g = calmGuest(w, p.main(31), { state: 'leaving', target: 'exit' });
    g.needs.happiness = 199;
    tickGuests(w, 3 * GUEST_WALK_TICKS_PER_TILE - 1);
    expect(w.state.guests).toContain(g);
    tickGuests(w, 1);
    expect(w.state.guests).not.toContain(g);
    expect(w.state.park.recentLeavers).toEqual([199]);
    expect(w.events).toContainEqual({ type: 'guestsChanged' });
  });

  it('keeps only the last 200 leavers', () => {
    const { w } = setup();
    w.state.park.recentLeavers = Array.from({ length: RECENT_LEAVERS_MAX }, (_, i) => i);
    const g = calmGuest(w, w.state.map.entranceTile, { state: 'leaving', target: 'exit' });
    g.needs.happiness = 250;
    tickGuests(w, 1);
    expect(w.state.park.recentLeavers).toHaveLength(RECENT_LEAVERS_MAX);
    expect(w.state.park.recentLeavers[0]).toBe(1);
    expect(w.state.park.recentLeavers[RECENT_LEAVERS_MAX - 1]).toBe(250);
  });
});

describe('buying (Phase 1 §4.3 Buying, catalog §3)', () => {
  function atCounter(w: World, stallId: number, tile: number, patch: Partial<Guest> = {}): Guest {
    return calmGuest(w, tile, { target: `stall:${stallId}`, nextDecisionTick: 1e9, ...patch });
  }

  it('buys at the Snack Shack in 20 ticks: pays, hunger −120, afterPurchase hook', () => {
    const { w, p } = setup();
    const after: number[] = [];
    guestHooks.afterPurchase.push((_w, g, s) => after.push(g.id * 1000 + s.id));
    const g = atCounter(w, p.snack.id, p.main(30), { cash: 1000 });
    g.needs.hunger = 200;
    tickGuests(w, 1);
    expect(g.state).toBe('buying');
    expect(p.snack.servingGuest).toBe(g.id);
    tickGuests(w, SALE_TICKS - 1);
    expect(g.state).toBe('buying');
    tickGuests(w, 1);
    expect(g.state).toBe('walking');
    expect(g.needs.hunger).toBe(80);
    expect(g.cash).toBe(1000 - p.snack.price);
    expect(g.spent).toBe(p.snack.price);
    expect(currentLedger(w).lines.stallSales).toBe(p.snack.price);
    expect(p.snack.servingGuest).toBe(-1);
    expect(after).toEqual([g.id * 1000 + p.snack.id]);
  });

  it('Fizz Stand: thirst −120, bladder +40', () => {
    const { w, p } = setup();
    const g = atCounter(w, p.fizz.id, p.main(32));
    g.needs.thirst = 150;
    tickGuests(w, SALE_TICKS + 1);
    expect(g.needs.thirst).toBe(30);
    expect(g.needs.bladder).toBe(40);
  });

  it('Restrooms take 60 ticks and reset the bladder', () => {
    const { w, p } = setup();
    const g = atCounter(w, p.restrooms.id, p.main(40));
    g.needs.bladder = 220;
    tickGuests(w, RESTROOM_TICKS);
    expect(g.state).toBe('buying');
    tickGuests(w, 1);
    expect(g.state).toBe('walking');
    expect(g.needs.bladder).toBe(0);
  });

  it('Phase 3 stalls: map item, First Aid (60 ticks), Cash Machine withdrawal without a ledger line', () => {
    const { w, p } = setup();
    const kiosk = placeStallDirect(w, 'info_kiosk', 21, 59, 2);
    const aid = placeStallDirect(w, 'first_aid', 23, 59, 2);
    const atm = placeStallDirect(w, 'cash_machine', 26, 59, 2);
    const a = atCounter(w, kiosk.id, p.main(21));
    const b = atCounter(w, aid.id, p.main(23));
    b.needs.nausea = 110; // below uncomfortable, so no happiness loss during the visit
    b.needs.happiness = 100;
    const c = atCounter(w, atm.id, p.main(26), { cash: 500 });
    const ledger = { ...currentLedger(w).lines };
    tickGuests(w, SALE_TICKS + 1);
    expect(a.items.map).toBe(true);
    expect(c.cash).toBeGreaterThanOrEqual(500 + 4000);
    expect(c.cash).toBeLessThanOrEqual(500 + 8000);
    expect(c.cash % 100).toBe(0);
    expect(b.state).toBe('buying');
    tickGuests(w, FIRST_AID_TICKS - SALE_TICKS);
    expect(b.needs.nausea).toBe(0);
    expect(b.needs.happiness).toBe(105);
    expect(currentLedger(w).lines.stallSales).toBe(ledger.stallSales + kiosk.price);
  });

  it('a price raised while walking stops the sale at the counter', () => {
    const { w, p } = setup();
    const g = atCounter(w, p.snack.id, p.main(30));
    p.snack.price = 700;
    tickGuests(w, 1);
    expect(g.state).toBe('walking');
    expect(ids(g)).toContain(THOUGHT.snackTooExpensive);
    expect(p.snack.totals.sales).toBe(0);
  });

  it('a stall closed during service makes no sale', () => {
    const { w, p } = setup();
    const g = atCounter(w, p.snack.id, p.main(30));
    tickGuests(w, 1);
    p.snack.open = false;
    tickGuests(w, SALE_TICKS);
    expect(g.state).toBe('walking');
    expect(p.snack.totals.sales).toBe(0);
  });
});

describe('determinism (master 5.4)', () => {
  it('the same seed and setup give the same state after 3,000 ticks', () => {
    const run = (): string => {
      const w = makeTestWorld(4242);
      buildPark(w);
      w.state.park.entranceFee = 0;
      spawnGuests(w, 40);
      tickGuests(w, 3000);
      return stateHash(w);
    };
    expect(run()).toBe(run());
  });
});
