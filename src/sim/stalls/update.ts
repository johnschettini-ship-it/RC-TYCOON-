/**
 * Owner: W1-E. Phase 1 §4.4 stalls. The guest system runs the sale and restroom timers (state `buying`)
 * and calls `sellItem`. This pass only keeps `servingGuest` valid: a stall is released when its guest
 * is gone or no longer buying there.
 */
import { findGuest } from '../guests/api';
import type { World } from '../types';

export function updateStalls(world: World): void {
  for (const stall of world.state.stalls) {
    if (stall.servingGuest === -1) continue;
    const guest = findGuest(world, stall.servingGuest);
    if (!guest || guest.state !== 'buying' || guest.activityId !== stall.id) stall.servingGuest = -1;
  }
}
