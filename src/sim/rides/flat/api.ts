/** Owner: W1-E. Flat ride control used by demolish (W1-C), breakdowns (W1-H), and the price commands. */
import { findGuest, finishRide, leaveQueue } from '../../guests/api';
import type { Ride } from '../types';
import type { World } from '../../types';
import type { EntityId } from '../../units';

/** Remove one id from a guest id list by value (no-op when it is not there). */
export function removeId(list: EntityId[], id: EntityId): void {
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
}

/**
 * Every queued guest leaves through `leaveQueue`, front first. Robust to a `leaveQueue` that removes the
 * guest from `ride.queue` itself; ids of guests that no longer exist are dropped.
 */
export function emptyQueue(world: World, ride: Ride, thoughtId: string | null = null): void {
  const queued = ride.queue.slice();
  for (const id of queued) {
    const guest = findGuest(world, id);
    if (guest) leaveQueue(world, guest, ride, thoughtId);
    removeId(ride.queue, id);
  }
}

/** Every rider gets off through `finishRide`, in boarding order. */
export function unloadRiders(world: World, ride: Ride): void {
  const riders = ride.riders.slice();
  for (const id of riders) {
    const guest = findGuest(world, id);
    if (guest) finishRide(world, guest, ride);
  }
  ride.riders = [];
}

/** Stop at once: unload every rider through finishRide and empty the queue through leaveQueue. */
export function stopRide(world: World, ride: Ride): void {
  unloadRiders(world, ride);
  emptyQueue(world, ride, null);
  ride.cycle = { phase: 'waiting', ticks: 0 };
}
