/**
 * Owner: W1-G (physics, test runs, dispatch, boarding) and W2-B (guest operation polish).
 * Track rides update after flat rides (master R13): ascending ride id, then ascending train id.
 */
import { getTrackTypeDef } from '../../../data/track';
import type { World } from '../../types';
import { trackData } from './common';
import { operateRide, stepLiveTest } from './operation';

export function updateTrackRides(world: World): void {
  for (const ride of world.state.rides) {
    if (ride.kind !== 'track') continue;
    const data = trackData(world, ride.id);
    if (!data) continue;
    const type = getTrackTypeDef(data.typeId);
    if (!type) continue;
    if (ride.status === 'open') data.openedOnce = true;
    if (ride.status === 'building' || !data.circuitClosed) continue;
    if (ride.status === 'testing') {
      stepLiveTest(world, ride, data, type);
      continue;
    }
    operateRide(world, ride, data, type);
  }
}
