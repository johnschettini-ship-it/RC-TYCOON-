import { describe, expect, it } from 'vitest';
import { RIDE_COLOUR_CHOICES } from '../../../../src/data/catalog/flatRides';
import { executeCommand } from '../../../../src/sim/commands';
import { makeTestWorld, placeRideDirect } from '../../../helpers/world';

describe('setRideColour', () => {
  it('offers Original plus the six palette indices', () => {
    expect(RIDE_COLOUR_CHOICES).toEqual([0, 1, 2, 3, 4, 7]);
  });

  it('sets and clears a flat ride colour', () => {
    const world = makeTestWorld();
    const ride = placeRideDirect(world, 'carousel', 10, 10);
    expect(executeCommand(world, { type: 'setRideColour', rideId: ride.id, colour: 4 }).ok).toBe(true);
    expect(ride.colour).toBe(4);
    expect(executeCommand(world, { type: 'setRideColour', rideId: ride.id, colour: null }).ok).toBe(true);
    expect(ride.colour).toBeNull();
  });

  it('rejects a colour outside the choices', () => {
    const world = makeTestWorld();
    const ride = placeRideDirect(world, 'carousel', 10, 10);
    executeCommand(world, { type: 'setRideColour', rideId: ride.id, colour: 3 });
    for (const colour of [5, 8, -1, 1.5]) {
      const r = executeCommand(world, { type: 'setRideColour', rideId: ride.id, colour });
      expect(r.ok).toBe(false);
      expect(ride.colour).toBe(3);
    }
  });

  it('rejects a missing ride', () => {
    const world = makeTestWorld();
    expect(executeCommand(world, { type: 'setRideColour', rideId: 9999, colour: 1 }).ok).toBe(false);
  });

  it('rejects a track ride', () => {
    const world = makeTestWorld();
    const ride = placeRideDirect(world, 'carousel', 10, 10);
    ride.kind = 'track';
    const r = executeCommand(world, { type: 'setRideColour', rideId: ride.id, colour: 1 });
    expect(r.ok).toBe(false);
    expect(ride.colour).toBeUndefined();
  });
});
