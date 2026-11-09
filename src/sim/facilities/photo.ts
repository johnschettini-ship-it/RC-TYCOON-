/**
 * Owner: W4-D. The Photo Booth (phase-6-polish.md §4.5, catalog §3): guests want a photo twice as much when the booth
 * stands within 6 tiles of a ride exit with excitement ≥ 5.00 (fresh off a big ride). Chebyshev tiles from the booth to
 * the exit gate, like the other "within N tiles" rules. The photo itself (happiness +10, one per guest) is the catalog
 * effect the guest system applies.
 */
import { PHOTO_BOOTH_ID, PHOTO_BOOTH_MIN_EXCITEMENT, PHOTO_BOOTH_RADIUS, PHOTO_BOOTH_WANT } from '../../data/tuning/facilities';
import type { Guest } from '../guests/types';
import type { Stall } from '../stalls/types';
import type { World } from '../types';

/** True when a ride exit with excitement ≥ 5.00 lies within the radius of the booth. */
export function excitingExitNear(world: World, stall: Stall): boolean {
  const w = world.state.map.width;
  for (const ride of world.state.rides) {
    const exit = ride.exit;
    if (!exit || exit.gate < 0 || !ride.stats || ride.stats.excitement < PHOTO_BOOTH_MIN_EXCITEMENT) continue;
    const gx = exit.gate % w;
    const gy = (exit.gate - gx) / w;
    if (Math.max(Math.abs(gx - stall.x), Math.abs(gy - stall.y)) <= PHOTO_BOOTH_RADIUS) return true;
  }
  return false;
}

/** stallWant hook: ×2 for a Photo Booth near an exciting ride's exit, else ×1. */
export function photoBoothWant(world: World, _guest: Guest, stall: Stall): number {
  if (stall.defId !== PHOTO_BOOTH_ID) return 1;
  return excitingExitNear(world, stall) ? PHOTO_BOOTH_WANT : 1;
}
