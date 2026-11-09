/**
 * Owner: W1-H. Small guest helpers used by litter, vandalism, performers, and breakdowns.
 * Thoughts follow master R5: `{ id, tick }`, newest last, at most 5, same id at most once per game day.
 * W1-D owns the guest system; if it exports a shared thought helper, these should call it instead.
 */
import { TICKS_PER_DAY } from '../../data/tuning/core';
import type { Guest } from '../guests/types';
import type { World } from '../types';

export const MAX_THOUGHTS = 5;
const NEED_MAX = 255;

/** Adds the thought unless the guest had it within the last game day. True when added. */
export function addThought(world: World, guest: Guest, id: string, params?: Record<string, string | number>): boolean {
  const now = world.state.tick;
  const last = guest.thoughtCooldowns[id];
  if (last !== undefined && now - last < TICKS_PER_DAY) return false;
  guest.thoughts.push(params ? { id, tick: now, params } : { id, tick: now });
  while (guest.thoughts.length > MAX_THOUGHTS) guest.thoughts.shift();
  guest.thoughtCooldowns[id] = now;
  return true;
}

export function changeHappiness(guest: Guest, delta: number): void {
  guest.needs.happiness = Math.max(0, Math.min(NEED_MAX, guest.needs.happiness + delta));
}

export function changeNeed(guest: Guest, key: 'energy' | 'nausea', delta: number): void {
  guest.needs[key] = Math.max(0, Math.min(NEED_MAX, guest.needs[key] + delta));
}
