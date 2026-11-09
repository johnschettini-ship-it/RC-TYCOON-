/** Shared helpers for the track system. Owner: W1-G. */
import { getTrackTypeDef, type TrackTypeDef } from '../../../data/track';
import { REFUND_SHARE_AFTER_OPEN } from '../../../data/tuning/track';
import { TRACK_ERR } from '../../../data/strings/track';
import type { World } from '../../types';
import type { Ride, RideStatus } from '../types';
import type { TrackRideData } from './types';
import { invalidateLayout } from './layout';

export interface TrackCtx {
  ride: Ride;
  data: TrackRideData;
  type: TrackTypeDef;
}

export function trackData(world: World, rideId: number): TrackRideData | undefined {
  return world.state.track.rides[String(rideId)];
}

export function findRide(world: World, rideId: number): Ride | undefined {
  const rides = world.state.rides;
  let lo = 0;
  let hi = rides.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = rides[mid] as Ride;
    if (r.id === rideId) return r;
    if (r.id < rideId) lo = mid + 1;
    else hi = mid - 1;
  }
  return rides.find((r) => r.id === rideId);
}

export function trackContext(world: World, rideId: number): TrackCtx | null {
  const ride = findRide(world, rideId);
  if (!ride || ride.kind !== 'track') return null;
  const data = trackData(world, rideId);
  if (!data) return null;
  const type = getTrackTypeDef(data.typeId);
  if (!type) return null;
  return { ride, data, type };
}

/** Statuses in which the ride runs for guests (or is held mid-operation). */
export function isRunningStatus(s: RideStatus): boolean {
  return s === 'open' || s === 'broken' || s === 'inspecting' || s === 'stormHold';
}

/** Every train is empty and stands in the station (or in the shed). */
export function trainsIdle(data: TrackRideData): boolean {
  return data.trains.every(
    (t) => t.seats.every((g) => g < 0) && (t.parked || (t.v === 0 && t.state !== 'running' && t.state !== 'held')),
  );
}

/** Why the track cannot be edited now, or null. A closed, empty ride may be edited (it returns to building). */
export function editBlock(ride: Ride, data: TrackRideData): string | null {
  if (ride.status === 'building') return null;
  if (isRunningStatus(ride.status)) return TRACK_ERR.closeFirst;
  if (ride.status === 'testing') return TRACK_ERR.waitForTest;
  if (!trainsIdle(data) || ride.riders.length > 0) return TRACK_ERR.mustBeEmpty;
  return null;
}

export function enterBuilding(ride: Ride, data: TrackRideData): void {
  ride.status = 'building';
  data.trains = [];
  data.testRun = null;
}

/** Any change to pieces, chain, brake speed, train count, or car count clears the test result. */
export function clearTest(ride: Ride, data: TrackRideData): void {
  data.test = null;
  ride.stats = null;
  invalidateLayout(data);
}

/** Refund share: 100% before the ride first opens, 50% after (phase-2 §4.12, master R15). */
export function refundShare(data: TrackRideData): number {
  return data.openedOnce ? REFUND_SHARE_AFTER_OPEN : 1;
}
