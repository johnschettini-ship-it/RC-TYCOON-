/** Phase 5 §4.3: every goal type at pass, fail, and boundary; streaks and their resets. */
import { describe, expect, it } from 'vitest';
import type { Objective } from '../../../src/data/scenarios';
import { newLedgerMonth } from '../../../src/sim/economy/ledger';
import { evaluateGoal, NO_PROGRESS, onDaySample } from '../../../src/sim/scenario/goals';
import { getScenarioDef } from '../../../src/data/scenarios';
import { newScenarioRun } from '../../../src/sim/scenario/start';
import type { ObjectiveProgress, ParkSample } from '../../../src/sim/scenario/types';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld, makeTrackRideDataDirect, placeFootpath, placeRideDirect, testResultDirect } from '../../helpers/world';
import type { Ride } from '../../../src/sim/rides/types';

const P = (met: boolean, value: number, streak: number): ObjectiveProgress => ({ met, value, streak });

function world(): World {
  return makeTestWorld();
}

function guests(w: World, n: number, patch: Parameters<typeof addGuestDirect>[2] = {}): void {
  const tile = placeFootpath(w, 31, 40);
  for (let k = 0; k < n; k++) addGuestDirect(w, tile, patch);
}

function sample(patch: Partial<ParkSample>): ParkSample {
  return { tick: 600, guests: 0, rating: 0, meanHappiness: 0, chill: 0, family: 0, thrill: 0, chillHappiness: 0, familyHappiness: 0, thrillHappiness: 0, ...patch };
}

/** A track ride of `typeId`, open, with a passed test of the given excitement and intensity. */
function coaster(w: World, typeId: string, excitement: number, intensity: number, open = true): Ride {
  const ride = placeRideDirect(w, 'carousel', 10 + w.state.rides.length * 4, 10);
  ride.kind = 'track';
  ride.defId = typeId;
  ride.status = open ? 'open' : 'closed';
  makeTrackRideDataDirect(w, ride, { test: testResultDirect({ excitement, intensity }) });
  return ride;
}

describe('guestsInPark', () => {
  const goal: Objective = { type: 'guestsInPark', count: 3, minRating: 500 };
  it('passes at the count and rating, fails one below either, and counts month ends in a row', () => {
    const w = world();
    guests(w, 3);
    w.state.park.rating = 500;
    expect(evaluateGoal(w, goal, P(true, 3, 2), 0)).toEqual(P(true, 3, 3));
    w.state.park.rating = 499;
    expect(evaluateGoal(w, goal, P(true, 3, 2), 0)).toEqual(P(false, 3, 0));
    w.state.park.rating = 900;
    w.state.guests.pop();
    expect(evaluateGoal(w, goal, NO_PROGRESS, 0)).toEqual(P(false, 2, 0));
    expect(evaluateGoal(w, { type: 'guestsInPark', count: 2 }, NO_PROGRESS, 0).met).toBe(true);
  });
});

describe('parkRatingHeld (daily ratings at the 12:00 samples)', () => {
  function run(w: World): void {
    const def = getScenarioDef('fading_fairground')!;
    w.state.scenario = newScenarioRun(def, 'standard');
  }
  it('a day at the rating adds to the streak, one day below resets it to 0', () => {
    const w = world();
    run(w);
    const sc = w.state.scenario;
    if (sc.kind !== 'scenario') throw new Error();
    for (let d = 0; d < 8; d++) onDaySample(w, sample({ rating: 650 }));
    expect(sc.objectives[1]).toEqual(P(false, 650, 8));
    onDaySample(w, sample({ rating: 649 }));
    expect(sc.objectives[1]).toEqual(P(false, 649, 0));
    onDaySample(w, sample({ rating: 700 }));
    expect(sc.objectives[1]!.streak).toBe(1);
  });

  it('is met once the streak reaches months × 3 days', () => {
    const w = world();
    const goal: Objective = { type: 'parkRatingHeld', rating: 650, months: 3 };
    expect(evaluateGoal(w, goal, P(false, 700, 9), 2).met).toBe(true);
    expect(evaluateGoal(w, goal, P(false, 700, 8), 2).met).toBe(false);
  });

  it('frozen runs do not move', () => {
    const w = world();
    run(w);
    const sc = w.state.scenario;
    if (sc.kind !== 'scenario') throw new Error();
    sc.status = 'won';
    onDaySample(w, sample({ rating: 900 }));
    expect(sc.objectives[1]!.streak).toBe(0);
    expect(sc.loseCounters.lowRatingDays).toBe(0);
  });
});

describe('parkValue', () => {
  it('passes at the value exactly, fails a cent below', () => {
    const w = world();
    w.state.management.parkValue = 12_000_000;
    expect(evaluateGoal(w, { type: 'parkValue', value: 12_000_000 }, NO_PROGRESS, 0)).toEqual(P(true, 12_000_000, 1));
    w.state.management.parkValue = 11_999_999;
    expect(evaluateGoal(w, { type: 'parkValue', value: 12_000_000 }, NO_PROGRESS, 0).met).toBe(false);
  });
});

describe('monthlyRideIncome and monthlyProfit (ledger of the closed month)', () => {
  function ledger(w: World, months: Array<Partial<Record<'rideTickets' | 'construction' | 'loan' | 'loanInterest', number>>>): void {
    w.state.economy.ledger = months.map((lines, monthIndex) => {
      const m = newLedgerMonth(monthIndex);
      Object.assign(m.lines, lines);
      return m;
    });
  }

  it('ride income: each of the last `months` closed months at the amount; a short month resets the streak', () => {
    const w = world();
    ledger(w, [{ rideTickets: 400_000 }, { rideTickets: 399_999 }, { rideTickets: 500_000 }, { rideTickets: 400_000 }, {}]);
    const goal: Objective = { type: 'monthlyRideIncome', amount: 400_000, months: 2 };
    let p = evaluateGoal(w, goal, NO_PROGRESS, 0);
    expect(p).toEqual(P(false, 400_000, 1));
    p = evaluateGoal(w, goal, p, 1);
    expect(p).toEqual(P(false, 399_999, 0));
    p = evaluateGoal(w, goal, p, 2);
    p = evaluateGoal(w, goal, p, 3);
    expect(p).toEqual(P(true, 400_000, 2));
    expect(evaluateGoal(w, goal, NO_PROGRESS, 9).met).toBe(false);
  });

  it('profit: income − expenses with loan interest, without borrowed money', () => {
    const w = world();
    ledger(w, [{ rideTickets: 900_000, construction: -300_000, loanInterest: -100_000, loan: 5_000_000 }]);
    const goal: Objective = { type: 'monthlyProfit', amount: 500_000, months: 1 };
    expect(evaluateGoal(w, goal, NO_PROGRESS, 0)).toEqual(P(true, 500_000, 1));
    w.state.economy.ledger[0]!.lines.loanInterest = -100_001;
    expect(evaluateGoal(w, goal, NO_PROGRESS, 0)).toEqual(P(false, 499_999, 0));
  });
});

describe('coasterExcitement', () => {
  it('counts open gravity coasters with a passed test at the excitement and under the intensity', () => {
    const w = world();
    const goal: Objective = { type: 'coasterExcitement', count: 2, minExcitement: 650, maxIntensity: 850 };
    coaster(w, 'steel_coaster', 650, 850);
    coaster(w, 'junior_coaster', 700, 851);
    coaster(w, 'mini_railway', 900, 100);
    coaster(w, 'wooden_coaster', 800, 500, false);
    expect(evaluateGoal(w, goal, NO_PROGRESS, 0)).toEqual(P(false, 1, 0));
    coaster(w, 'wooden_coaster', 649, 400);
    expect(evaluateGoal(w, goal, NO_PROGRESS, 0).value).toBe(1);
    const last = coaster(w, 'spinning_mouse', 651, 849);
    expect(evaluateGoal(w, goal, NO_PROGRESS, 0)).toEqual(P(true, 2, 1));
    w.state.track.rides[String(last.id)]!.test = null;
    expect(evaluateGoal(w, goal, NO_PROGRESS, 0).met).toBe(false);
    expect(evaluateGoal(w, { type: 'coasterExcitement', count: 1, minExcitement: 800, types: ['mini_railway'] }, NO_PROGRESS, 0).met).toBe(true);
  });
});

describe('ridesOpen', () => {
  it('counts open rides that match every filter', () => {
    const w = world();
    const manor = placeRideDirect(w, 'haunted_manor', 10, 10);
    const wheel = placeRideDirect(w, 'big_wheel', 20, 10);
    const ghost = coaster(w, 'ghost_train', 100, 100);
    manor.status = 'open';
    wheel.status = 'open';
    const spooky: Objective = { type: 'ridesOpen', count: 2, flag: 'spooky' };
    expect(evaluateGoal(w, spooky, NO_PROGRESS, 0)).toEqual(P(true, 2, 1));
    ghost.status = 'broken';
    expect(evaluateGoal(w, spooky, NO_PROGRESS, 0)).toEqual(P(false, 1, 0));
    expect(evaluateGoal(w, { type: 'ridesOpen', count: 1, tag: 'chill' }, NO_PROGRESS, 0).value).toBe(2);
    expect(evaluateGoal(w, { type: 'ridesOpen', count: 1, tag: 'chill', defIds: ['big_wheel'] }, NO_PROGRESS, 0).value).toBe(1);
    expect(evaluateGoal(w, { type: 'ridesOpen', count: 3 }, NO_PROGRESS, 0).met).toBe(false);
  });
});

describe('repayLoan', () => {
  it('needs a zero balance and cash of at least 0', () => {
    const w = world();
    w.state.management.loan.balance = 0;
    w.state.park.cash = 0;
    expect(evaluateGoal(w, { type: 'repayLoan' }, NO_PROGRESS, 0)).toEqual(P(true, 0, 1));
    w.state.park.cash = -1;
    expect(evaluateGoal(w, { type: 'repayLoan' }, NO_PROGRESS, 0).met).toBe(false);
    w.state.park.cash = 100;
    w.state.management.loan.balance = 100_000;
    expect(evaluateGoal(w, { type: 'repayLoan' }, NO_PROGRESS, 0)).toEqual(P(false, 100_000, 0));
  });
});

describe('temperamentBalance (means of the month day samples)', () => {
  const goal: Objective = { type: 'temperamentBalance', minGuests: 400, minShare: 30, minHappiness: 170, months: 2 };
  const ok = sample({ guests: 400, thrill: 120, chill: 120, family: 160, thrillHappiness: 170, chillHappiness: 170 });

  it('passes at every boundary and needs `months` months in a row', () => {
    const w = world();
    w.state.monthMetrics.daySamples = [ok, ok, ok];
    const first = evaluateGoal(w, goal, NO_PROGRESS, 0);
    expect(first).toEqual(P(false, 400, 1));
    expect(evaluateGoal(w, goal, first, 1)).toEqual(P(true, 400, 2));
  });

  it('fails one below on guests, either share, or either group happiness; no samples fail; a bad month resets', () => {
    const w = world();
    const cases: Partial<ParkSample>[] = [{ guests: 399, family: 159 }, { thrill: 119, family: 161 }, { chill: 119, family: 161 }, { thrillHappiness: 169 }, { chillHappiness: 169 }];
    for (const c of cases) {
      w.state.monthMetrics.daySamples = [ok, { ...ok, ...c }, ok];
      expect(evaluateGoal(w, goal, P(false, 0, 1), 0).streak, JSON.stringify(c)).toBe(0);
    }
    w.state.monthMetrics.daySamples = [{ ...ok, guests: 0, thrill: 0, chill: 0, family: 0 }, { ...ok, guests: 0, thrill: 0, chill: 0, family: 0 }, { ...ok, guests: 0, thrill: 0, chill: 0, family: 0 }];
    expect(evaluateGoal(w, goal, P(false, 0, 1), 0)).toEqual(P(false, 0, 0));
    w.state.monthMetrics.daySamples = [];
    expect(evaluateGoal(w, goal, P(false, 0, 1), 0).streak).toBe(0);
  });

  it('group happiness is weighted by group size', () => {
    const w = world();
    w.state.monthMetrics.daySamples = [
      sample({ guests: 400, thrill: 300, chill: 100, thrillHappiness: 160, chillHappiness: 200 }),
      sample({ guests: 400, thrill: 100, chill: 300, thrillHappiness: 200, chillHappiness: 160 }),
    ];
    // Thrill: (300 × 160 + 100 × 200) / 400 = 170; Chill likewise 170. Shares 50 / 50.
    expect(evaluateGoal(w, goal, P(false, 0, 1), 0).met).toBe(true);
  });
});

describe('afterDarkHappiness (means of the night samples, After Dark on)', () => {
  const goal: Objective = { type: 'afterDarkHappiness', minGuests: 300, minHappiness: 180, months: 1 };
  it('passes at the boundary with After Dark on, fails with it off or one below', () => {
    const w = world();
    w.state.park.afterDark = true;
    w.state.monthMetrics.nightSamples = [sample({ guests: 300, meanHappiness: 180 }), sample({ guests: 300, meanHappiness: 180 })];
    expect(evaluateGoal(w, goal, NO_PROGRESS, 0)).toEqual(P(true, 300, 1));
    w.state.park.afterDark = false;
    expect(evaluateGoal(w, goal, NO_PROGRESS, 0).met).toBe(false);
    w.state.park.afterDark = true;
    w.state.monthMetrics.nightSamples = [sample({ guests: 299, meanHappiness: 180 }), sample({ guests: 300, meanHappiness: 180 })];
    expect(evaluateGoal(w, goal, NO_PROGRESS, 0).met).toBe(false);
    w.state.monthMetrics.nightSamples = [sample({ guests: 300, meanHappiness: 179 })];
    expect(evaluateGoal(w, goal, P(true, 300, 4), 0)).toEqual(P(false, 300, 0));
    w.state.monthMetrics.nightSamples = [];
    expect(evaluateGoal(w, goal, NO_PROGRESS, 0).met).toBe(false);
  });
});
