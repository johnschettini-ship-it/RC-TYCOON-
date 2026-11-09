/** Owner: W1-I. Hour start: campaign expiry (Phase 3 §4.7). */
import type { World } from '../types';

export function hourlyMarketing(_world: World): void {}

/** Arrival multiplier from running campaigns. */
export function campaignArrivalFactor(_world: World): number {
  return 1;
}
