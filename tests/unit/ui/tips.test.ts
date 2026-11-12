// tests/unit/ui/tips.test.ts
import { describe, expect, it } from 'vitest';
import { makeTestWorld, placeRideDirect } from '../../helpers/world';
import { dropStale, matchingTips, shownTip, tipInput, underServedGroup, type TipId, type TipInput } from '../../../src/ui/tips/model';

const base: TipInput = {
  cash: 100_000, tutorial: false, tipsOn: true,
  guestPercents: { chill: 15, family: 55, thrill: 30 }, guestTotal: 20,
  openRides: { chill: 0, family: 2, thrill: 2 },
};
const ids = (i: TipInput): TipId[] => matchingTips(i).map((t) => t.id);
const none = { chill: 0, family: 0, thrill: 0 };

describe('tip rules (Phase 7 §4.8)', () => {
  it('order: cashLow, then noRide, then underServed', () => {
    expect(ids({ ...base, cash: -1, openRides: none })).toEqual(['cashLow', 'noRide']);
    expect(ids({ ...base, cash: -1 })).toEqual(['cashLow', 'underServed.chill']);
    expect(ids({ ...base, cash: 0 })).toEqual(['underServed.chill']);
  });
  it('rule 3 needs 20 guests', () => {
    expect(ids({ ...base, guestTotal: 19 })).toEqual([]);
    expect(ids({ ...base, guestTotal: 20 })).toEqual(['underServed.chill']);
  });
  it('a gap of 14 points gives no tip; 15 gives a tip', () => {
    expect(ids({ ...base, guestPercents: { chill: 14, family: 56, thrill: 30 } })).toEqual([]);
    expect(ids(base)).toEqual(['underServed.chill']);
  });
  it('a tie goes to Chill, then Family, then Thrill', () => {
    expect(underServedGroup({ ...base, guestPercents: { chill: 50, family: 0, thrill: 50 }, openRides: { chill: 0, family: 1, thrill: 0 } })).toBe('chill');
    expect(underServedGroup({ ...base, guestPercents: { chill: 0, family: 50, thrill: 50 }, openRides: { chill: 1, family: 0, thrill: 0 } })).toBe('family');
  });
  it('each tip is its id and group, with no speaker or mood (Task 23)', () => {
    const thrill = matchingTips({ ...base, guestPercents: { chill: 10, family: 20, thrill: 70 }, openRides: { chill: 1, family: 1, thrill: 0 } })[0];
    expect(thrill).toEqual({ id: 'underServed.thrill', group: 'thrill' });
    expect(matchingTips(base)[0]).toEqual({ id: 'underServed.chill', group: 'chill' });
    expect(matchingTips({ ...base, openRides: none })[0]).toEqual({ id: 'noRide', group: null });
    expect(matchingTips({ ...base, cash: -1 })[0]).toEqual({ id: 'cashLow', group: null });
  });
  it('the Tutorial and the setting hide the tips, not the under-served group', () => {
    expect(ids({ ...base, tutorial: true })).toEqual([]);
    expect(ids({ ...base, tipsOn: false })).toEqual([]);
    expect(underServedGroup({ ...base, tutorial: true, tipsOn: false })).toBe('chill');
    expect(underServedGroup({ ...base, openRides: none })).toBeNull();
  });
  it('a closed tip returns only after its rule stops and starts again', () => {
    const noRide = matchingTips({ ...base, openRides: none });
    let closed = new Set<TipId>(['noRide']);
    expect(shownTip(noRide, closed)).toBeNull();
    closed = dropStale(closed, noRide);
    expect([...closed]).toEqual(['noRide']);
    closed = dropStale(closed, []);
    expect(closed.size).toBe(0);
    expect(shownTip(noRide, closed)?.id).toBe('noRide');
  });
  it('closing the first tip shows the next', () => {
    expect(shownTip(matchingTips({ ...base, cash: -1, openRides: none }), new Set<TipId>(['cashLow']))?.id).toBe('noRide');
  });
  it('tipInput reads the world', () => {
    const w = makeTestWorld();
    expect(tipInput(w, true)).toMatchObject({ cash: w.state.park.cash, tutorial: false, tipsOn: true, guestTotal: 0, openRides: none });
    const ride = placeRideDirect(w, 'carousel', 10, 10, 0);
    ride.status = 'open';
    expect(tipInput(w, true).openRides).toEqual({ chill: 0, family: 1, thrill: 0 });
  });
});
