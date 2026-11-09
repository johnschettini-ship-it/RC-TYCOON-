/** Phase 3 §4.10 First Aid and Cash Machine: triggers at their edges, visits, effects, and the withdrawal limit. */
import { describe, expect, it } from 'vitest';
import { getStallDef } from '../../../src/data/catalog';
import { CASH_MACHINE_HAPPY, CASH_MACHINE_MAX_WITHDRAWALS, FIRST_AID_NAUSEA } from '../../../src/data/tuning/facilities';
import { FIRST_AID_TICKS, NEED_UNCOMFORTABLE } from '../../../src/data/tuning/guests';
import { currentLedger } from '../../../src/sim/economy/ledger';
import { cashMachineDecision, firstAidDecision, nearestFacility } from '../../../src/sim/facilities/services';
import { decide } from '../../../src/sim/guests/decide';
import { THOUGHT } from '../../../src/sim/guests/thoughts';
import { updateGuests } from '../../../src/sim/guests/update';
import type { Guest } from '../../../src/sim/guests/types';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld } from '../../helpers/world';
import { facilityPark } from './park';

function setup(): { w: World; p: ReturnType<typeof facilityPark> } {
  const w = makeTestWorld(99);
  return { w, p: facilityPark(w) };
}

const ids = (g: Guest): string[] => g.thoughts.map((t) => t.id);

/** Run guest updates until `done` or `max` ticks. */
function until(w: World, done: () => boolean, max = 400): void {
  for (let k = 0; k < max && !done(); k++) {
    updateGuests(w);
    w.state.tick += 1;
  }
}

const WITHDRAW = getStallDef('cash_machine')?.effects.withdraw ?? { belowCents: 0, minCents: 0, maxCents: 0 };

describe('First Aid (§4.10)', () => {
  it(`nausea ${FIRST_AID_NAUSEA - 1} does nothing; ${FIRST_AID_NAUSEA} targets the nearest First Aid`, () => {
    const { w, p } = setup();
    const far = p.stall('first_aid', 10);
    const near = p.stall('first_aid', 36);
    const g = addGuestDirect(w, p.main(30));
    g.needs.nausea = FIRST_AID_NAUSEA - 1;
    firstAidDecision(w, g);
    expect(g.target).toBeNull();
    g.needs.nausea = FIRST_AID_NAUSEA;
    expect(firstAidDecision(w, g)).toBe(false);
    expect(g.target).toBe(`stall:${near.id}`);
    expect(nearestFacility(w, g, 'first_aid')?.stall.id).toBe(near.id);
    expect(far.id).not.toBe(near.id);
  });

  it('keeps an existing target and ignores closed or unreachable First Aid', () => {
    const { w, p } = setup();
    const aid = p.stall('first_aid', 36);
    const g = addGuestDirect(w, p.main(30), { target: 'exit' });
    g.needs.nausea = 200;
    firstAidDecision(w, g);
    expect(g.target).toBe('exit');
    g.target = null;
    aid.open = false;
    firstAidDecision(w, g);
    expect(g.target).toBeNull();
  });

  it('has the urgency of Restrooms: a higher pressing need goes first, a lower one waits', () => {
    const { w, p } = setup();
    const aid = p.stall('first_aid', 36);
    const loo = p.stall('restrooms', 26);
    const g = addGuestDirect(w, p.main(30));
    g.needs.nausea = 170;
    g.needs.bladder = 200;
    decide(w, g);
    expect(g.target).toBe(`stall:${loo.id}`);
    g.target = null;
    g.needs.bladder = NEED_UNCOMFORTABLE;
    decide(w, g);
    expect(g.target).toBe(`stall:${aid.id}`);
  });

  it('the visit takes 60 ticks, resets nausea, and gives +5 happiness', () => {
    const { w, p } = setup();
    const aid = p.stall('first_aid', 33);
    const g = addGuestDirect(w, p.main(30));
    g.needs.nausea = 160;
    g.needs.happiness = 150;
    until(w, () => g.state === 'buying');
    expect(g.activityId).toBe(aid.id);
    let ticks = 0;
    until(w, () => {
      if (g.state !== 'buying') return true;
      ticks += 1;
      return false;
    });
    expect(ticks).toBe(FIRST_AID_TICKS);
    expect(g.needs.nausea).toBe(0);
    expect(g.needs.happiness).toBeGreaterThanOrEqual(150);
    expect(aid.totals.sales).toBe(1);
  });
});

describe('Cash Machine (§4.10)', () => {
  function poorGuest(w: World, p: ReturnType<typeof facilityPark>, patch: Partial<Guest> = {}): Guest {
    return addGuestDirect(w, p.main(30), { cash: WITHDRAW.belowCents - 1, ...patch });
  }

  it('cash $9.99 targets the nearest Cash Machine and thinks "I need cash"; $10.00 does not', () => {
    const { w, p } = setup();
    const atm = p.stall('cash_machine', 35);
    const g = poorGuest(w, p);
    expect(cashMachineDecision(w, g)).toBe(false);
    expect(g.target).toBe(`stall:${atm.id}`);
    expect(ids(g)).toContain(THOUGHT.needCash);
    const rich = poorGuest(w, p, { cash: WITHDRAW.belowCents });
    cashMachineDecision(w, rich);
    expect(rich.target).toBeNull();
  });

  it(`needs happiness ≥ ${CASH_MACHINE_HAPPY}`, () => {
    const { w, p } = setup();
    p.stall('cash_machine', 35);
    const g = poorGuest(w, p);
    g.needs.happiness = CASH_MACHINE_HAPPY - 1;
    cashMachineDecision(w, g);
    expect(g.target).toBeNull();
    g.needs.happiness = CASH_MACHINE_HAPPY;
    cashMachineDecision(w, g);
    expect(g.target).not.toBeNull();
  });

  it(`allows fewer than ${CASH_MACHINE_MAX_WITHDRAWALS} withdrawals per visit`, () => {
    const { w, p } = setup();
    p.stall('cash_machine', 35);
    const one = poorGuest(w, p, { withdrawals: CASH_MACHINE_MAX_WITHDRAWALS - 1 });
    cashMachineDecision(w, one);
    expect(one.target).not.toBeNull();
    const two = poorGuest(w, p, { withdrawals: CASH_MACHINE_MAX_WITHDRAWALS });
    cashMachineDecision(w, two);
    expect(two.target).toBeNull();
  });

  it('withdraws $40–$80 in whole dollars with no ledger entry, twice at most', () => {
    const { w, p } = setup();
    const atm = p.stall('cash_machine', 33);
    const g = poorGuest(w, p, { cash: 500 });
    const ledger = { ...currentLedger(w).lines };
    const cashBefore = w.state.park.cash;
    until(w, () => g.withdrawals === 1);
    expect(g.cash - 500).toBeGreaterThanOrEqual(WITHDRAW.minCents);
    expect(g.cash - 500).toBeLessThanOrEqual(WITHDRAW.maxCents);
    expect(g.cash % 100).toBe(0);
    expect(currentLedger(w).lines).toEqual(ledger);
    expect(w.state.park.cash).toBe(cashBefore);
    expect(atm.totals.sales).toBe(1);

    // Spend it all: second withdrawal, then no more.
    g.cash = 0;
    g.target = null;
    until(w, () => g.withdrawals === 2);
    expect(g.cash).toBeGreaterThanOrEqual(WITHDRAW.minCents);
    g.cash = 0;
    g.target = null;
    g.nextDecisionTick = w.state.tick;
    updateGuests(w);
    expect(g.target).not.toBe(`stall:${atm.id}`);
    expect(g.withdrawals).toBe(CASH_MACHINE_MAX_WITHDRAWALS);
  });

  it('withdrawal amounts are deterministic for a seed', () => {
    const run = (): number => {
      const { w, p } = setup();
      p.stall('cash_machine', 33);
      const g = poorGuest(w, p, { cash: 0 });
      until(w, () => g.withdrawals === 1);
      return g.cash;
    };
    expect(run()).toBe(run());
  });
});
