/** Owner: W1-H. Bench sitting (Phase 3 §4.3). Sitters live in `state.staff.benchSitters`, sorted by guest id. */
import { BENCH_ENERGY } from '../../data/catalog/people';
import { BENCH_SIT_TICKS } from '../../data/tuning/staff';
import type { Guest } from '../guests/types';
import { findGuestById, indexById } from '../staff/lookup';
import { changeNeed } from '../staff/guestEffects';
import type { World } from '../types';

function sitterIndex(world: World, guestId: number): number {
  const list = world.state.staff.benchSitters;
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = (list[mid] as { guestId: number }).guestId;
    if (v === guestId) return mid;
    if (v < guestId) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

export function isSitting(world: World, guestId: number): boolean {
  return sitterIndex(world, guestId) >= 0;
}

/** The guest sits on the bench tile for BENCH_SIT_TICKS. */
export function sitOnBench(world: World, guest: Guest, benchTile: number): void {
  const list = world.state.staff.benchSitters;
  if (sitterIndex(world, guest.id) >= 0) return;
  guest.state = 'sitting';
  guest.stateTicks = 0;
  guest.tile = benchTile;
  guest.nextTile = -1;
  guest.progress = 0;
  const entry = { guestId: guest.id, tile: benchTile, untilTick: world.state.tick + BENCH_SIT_TICKS };
  let at = list.length;
  while (at > 0 && (list[at - 1] as { guestId: number }).guestId > guest.id) at--;
  list.splice(at, 0, entry);
}

/** Per tick: a sitter whose time is up gets the energy and walks on. */
export function updateSitter(world: World, guest: Guest): void {
  const i = sitterIndex(world, guest.id);
  if (i < 0) return;
  const list = world.state.staff.benchSitters;
  const entry = list[i] as { untilTick: number };
  if (guest.state !== 'sitting') {
    list.splice(i, 1);
    return;
  }
  if (world.state.tick < entry.untilTick) return;
  changeNeed(guest, 'energy', BENCH_ENERGY);
  guest.state = 'walking';
  guest.stateTicks = 0;
  list.splice(i, 1);
}

/** The bench is gone: everyone on it stands up at once (no energy gain). */
export function standUpFromBench(world: World, tile: number): void {
  const keep = [];
  for (const s of world.state.staff.benchSitters) {
    if (s.tile !== tile) {
      keep.push(s);
      continue;
    }
    const g = findGuestById(world, s.guestId);
    if (g && g.state === 'sitting') {
      g.state = 'walking';
      g.stateTicks = 0;
    }
  }
  world.state.staff.benchSitters = keep;
}

/** Remove sitters whose guest has left the park. */
export function pruneSitters(world: World): void {
  const guests = world.state.guests;
  const list = world.state.staff.benchSitters;
  if (list.every((s) => indexById(guests, s.guestId) >= 0)) return;
  world.state.staff.benchSitters = list.filter((s) => indexById(guests, s.guestId) >= 0);
}
