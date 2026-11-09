/** Master rule R24: a ride `broken` with `slow_running` keeps operating for guests, arrivals, rating, and light. */
import { describe, expect, it } from 'vitest';
import { isRideOperating, openRides } from '../../../src/sim/park/rides';
import { rideAcceptsGuests, rideChoosable } from '../../../src/sim/guests/state';
import { feeToleranceBase } from '../../../src/sim/guests/arrivals';
import { makeTestWorld, placeRideDirect } from '../../helpers/world';

describe('slow-running rides operate (master R24)', () => {
  it('counts as open for arrivals and guests; other breakdowns do not', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 20, 20);
    ride.status = 'open';
    const openFee = feeToleranceBase(w);
    ride.status = 'broken';
    ride.breakdownType = 'slow_running';
    expect(isRideOperating(ride)).toBe(true);
    expect(openRides(w)).toEqual([ride]);
    expect(rideChoosable(ride)).toBe(true);
    expect(rideAcceptsGuests(ride)).toBe(true);
    expect(feeToleranceBase(w)).toBe(openFee);
    ride.breakdownType = 'stopped';
    expect(isRideOperating(ride)).toBe(false);
    expect(openRides(w)).toEqual([]);
    expect(rideChoosable(ride)).toBe(false);
    expect(rideAcceptsGuests(ride)).toBe(false);
    expect(feeToleranceBase(w)).toBeLessThan(openFee);
  });
});
