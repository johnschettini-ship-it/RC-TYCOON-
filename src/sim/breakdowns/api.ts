/** Owner: W1-H. Called by ride systems at dispatch (flat cycle start, train dispatch). */
import type { Ride } from '../rides/types';
import type { World } from '../types';

/** Rolls wear and breakdown for one dispatch. True if the ride broke down (ride must not start the cycle). */
export function onRideDispatch(_world: World, _ride: Ride): boolean {
  return false;
}

/** 0–1 average reliability for the rating. */
export function reliabilityScore(_world: World): number {
  return 1;
}
