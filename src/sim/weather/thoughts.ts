/**
 * Owner: W1-I. Minimal thought writer for weather hooks (master R5, Phase 1 §4.3 thought rules):
 * keep the newest `GUEST_THOUGHTS_KEPT` thoughts, and the same thought at most once per game day.
 * Swap for W1-D's guest thought API at integration if it differs.
 */
import { TICKS_PER_DAY } from '../../data/tuning/core';
import { GUEST_THOUGHTS_KEPT } from '../../data/tuning/management';
import type { Guest } from '../guests/types';
import type { World } from '../types';

/** Adds the thought unless it was shown within the last game day. True if it was added. */
export function think(world: World, guest: Guest, id: string): boolean {
  const tick = world.state.tick;
  const last = guest.thoughtCooldowns[id];
  if (last !== undefined && tick - last < TICKS_PER_DAY) return false;
  guest.thoughtCooldowns[id] = tick;
  guest.thoughts.push({ id, tick });
  if (guest.thoughts.length > GUEST_THOUGHTS_KEPT) guest.thoughts.splice(0, guest.thoughts.length - GUEST_THOUGHTS_KEPT);
  return true;
}
