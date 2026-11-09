/** Owner: W1-E. Ride facts the rating and the arrival rate share. */
import { getFlatRideDef, getTrackRideDef, type RideTag } from '../../data/catalog';
import type { Ride } from '../rides/types';
import type { World } from '../types';

/** Rides with status `open` (flat and track), in id order. */
export function openRides(world: World): Ride[] {
  return world.state.rides.filter((r) => r.status === 'open');
}

function trackTypeId(world: World, ride: Ride): string {
  return world.state.track.rides[String(ride.id)]?.typeId ?? ride.defId;
}

/** Catalog tag of a ride, or null for an unknown definition. */
export function rideTag(world: World, ride: Ride): RideTag | null {
  if (ride.kind === 'flat') return getFlatRideDef(ride.defId)?.tag ?? null;
  return getTrackRideDef(trackTypeId(world, ride))?.tag ?? null;
}

/**
 * Guests on board at once (at least 1). Flat rides: catalog capacity.
 * Track rides: seats of all trains = trains × cars per train × seats per car.
 */
export function rideCapacity(world: World, ride: Ride): number {
  if (ride.kind === 'flat') return Math.max(1, getFlatRideDef(ride.defId)?.capacity ?? 1);
  const data = world.state.track.rides[String(ride.id)];
  const seatsPerCar = getTrackRideDef(trackTypeId(world, ride))?.seatsPerCar ?? 1;
  const seats = data ? data.trainConfig.trains * data.trainConfig.carsPerTrain * seatsPerCar : seatsPerCar;
  return Math.max(1, seats);
}
