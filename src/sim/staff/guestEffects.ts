/**
 * Owner: W1-H. Small guest need helpers used by litter, vandalism, performers, and breakdowns.
 * Thoughts go through the guest module's `addThought` (`src/sim/guests/thoughts.ts`, master R5).
 */
import type { Guest } from '../guests/types';

const NEED_MAX = 255;

export function changeHappiness(guest: Guest, delta: number): void {
  guest.needs.happiness = Math.max(0, Math.min(NEED_MAX, guest.needs.happiness + delta));
}

export function changeNeed(guest: Guest, key: 'energy' | 'nausea', delta: number): void {
  guest.needs[key] = Math.max(0, Math.min(NEED_MAX, guest.needs[key] + delta));
}
