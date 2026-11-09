/** Guest API used by ride and stall systems. Owner: W1-D. Signatures are a contract. */
import type { Guest } from './types';
import type { Ride } from '../rides/types';
import type { World } from '../types';

/** Guest at the queue front boards: pays the price and enters state `riding`. False if the guest cannot board. */
export function boardRide(_world: World, _guest: Guest, _ride: Ride): boolean {
  return false;
}

/** Ride over: apply ride effects (Phase 1 §4.3 Riding) and place the guest on the exit's outside tile. */
export function finishRide(_world: World, _guest: Guest, _ride: Ride): void {}

/** Remove a guest from a ride queue (closed ride, demolish, timeout). The guest re-plans. */
export function leaveQueue(_world: World, _guest: Guest, _ride: Ride, _thoughtId: string | null): void {}

export function findGuest(world: World, id: number): Guest | undefined {
  return world.state.guests.find((g) => g.id === id);
}

/** A ride, stall, or exit route was removed or closed: every guest targeting it re-plans at once. */
export function forgetDestination(_world: World, _dest: import('./types').DestKey): void {}
