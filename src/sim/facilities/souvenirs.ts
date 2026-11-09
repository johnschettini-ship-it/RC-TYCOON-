/**
 * Owner: W2-C. Balloons, maps, and Cash Machine counts after a purchase; the cocoa thought (Phase 3 §4.10, §4.16).
 * - Each game hour a held balloon floats away with chance BALLOON_LOSS: "My balloon flew away!", −5 happiness.
 * - After buying: a balloon gives "I love my balloon"; a map after "I am lost. I need a map" gives
 *   "This map is a lifesaver" and ends the lost count; a Cash Machine visit counts one withdrawal.
 * - "A cocoa would be nice": a thirsty walking guest while the weather raises an open Cocoa Hut's sales.
 * Item effects (happiness, the held flag) are the guest system's catalog effects.
 */
import { getStallDef } from '../../data/catalog';
import { BALLOON_LOSS, BALLOON_LOSS_HAPPY, COCOA_THOUGHT_THIRST } from '../../data/tuning/facilities';
import { THOUGHT_REPEAT_TICKS } from '../../data/tuning/guests';
import { changeNeed } from '../guests/needs';
import { THOUGHT, addThought } from '../guests/thoughts';
import type { Guest } from '../guests/types';
import { rngChance } from '../rng';
import type { Stall } from '../stalls/types';
import { isHourStart } from '../time';
import type { World } from '../types';
import { resetWayfinding } from './wayfinding';

const COCOA = 'cocoa_hut';

/** perTick: at each hour start, a held balloon may float away. Draws from the RNG only for holders. */
export function balloonPerTick(world: World, guest: Guest): void {
  if (!guest.items.balloon || !isHourStart(world.state.tick)) return;
  if (!rngChance(world.state, BALLOON_LOSS)) return;
  guest.items.balloon = false;
  changeNeed(guest, 'happiness', -BALLOON_LOSS_HAPPY);
  addThought(world, guest, THOUGHT.balloonFlewAway);
}

function thoughtRecently(world: World, guest: Guest, id: string): boolean {
  const last = guest.thoughtCooldowns[id];
  return last !== undefined && world.state.tick - last < THOUGHT_REPEAT_TICKS;
}

/** afterPurchase: souvenir and map thoughts, the lost count, and Cash Machine withdrawals. */
export function facilityAfterPurchase(world: World, guest: Guest, stall: Stall): void {
  const def = getStallDef(stall.defId);
  if (!def) return;
  if (def.effects.gives === 'balloon') addThought(world, guest, THOUGHT.loveBalloon);
  if (def.effects.gives === 'map') {
    if (thoughtRecently(world, guest, THOUGHT.lostNeedMap)) addThought(world, guest, THOUGHT.mapLifesaver);
    resetWayfinding(guest);
  }
  // Guests go to a Cash Machine only with cash < $10 (services.ts), so every visit is one withdrawal.
  if (def.effects.withdraw) guest.withdrawals += 1;
}

/** beforeDecision: "A cocoa would be nice" (thought only). */
export function cocoaThought(world: World, guest: Guest): boolean {
  if (guest.state !== 'walking' || guest.needs.thirst < COCOA_THOUGHT_THIRST) return false;
  const weather = world.state.management.weather.current;
  const factor = getStallDef(COCOA)?.weatherFactors[weather] ?? 1;
  if (factor <= 1) return false;
  for (const stall of world.state.stalls) {
    if (stall.defId === COCOA && stall.open) {
      addThought(world, guest, THOUGHT.wantCocoa);
      break;
    }
  }
  return false;
}
