/**
 * Owner: W2-C. Info Kiosk and maps (Phase 3 §4.10): wrong turns, the lost rule, kiosk detours.
 *
 * - Wrong turns: a guest without a map, stepping off a junction footpath (3 or more walkable
 *   neighbours) toward a reachable target, takes a random non-best footpath neighbour with chance
 *   WRONG_TURN (× LOST_WRONG_TURN_FACTOR while lost).
 * - Lost: a guest whose path distance to its target has not beaten its best for LOST_STEPS steps.
 *   Lost ends when the distance improves. A new target starts a new count.
 * - At each decision a lost guest thinks "I am lost. I need a map", loses LOST_HAPPY, and targets the
 *   nearest Info Kiosk when it is closer than the current target.
 * - With a map: no wrong turns and never lost by this rule. The Phase 1 "no route" rule (guest system,
 *   `lostSinceTick`) still applies: a map does not make an unreachable target reachable.
 *
 * Steps are counted when a step begins (`progress === 1`), so each step counts once and standing still
 * never counts.
 */
import {
  JUNCTION_MIN_NEIGHBOURS,
  LOST_HAPPY,
  LOST_STEPS,
  LOST_WRONG_TURN_FACTOR,
  WRONG_TURN,
} from '../../data/tuning/facilities';
import { dirBetween } from '../guests/movement';
import { changeNeed } from '../guests/needs';
import { findStall, parseDest } from '../guests/state';
import { THOUGHT, addThought } from '../guests/thoughts';
import type { Guest } from '../guests/types';
import { Content, neighbour, type Dir } from '../map';
import { distanceTo, isWalkable } from '../pathing';
import { rngChance, rngInt } from '../rng';
import type { World } from '../types';
import { isOnTheMove, nearestFacility, targetStall } from './common';

const DIRS: readonly Dir[] = [0, 1, 2, 3];
const KIOSK = 'info_kiosk';

/** Lost by the Phase 3 rule (§4.10). */
export function isWayLost(guest: Guest): boolean {
  return guest.lostSteps >= LOST_STEPS;
}

/** Lost by either rule: Phase 1 "no route" (`lostSinceTick`) or Phase 3 wrong turns (`lostSteps`). */
export function isGuestLost(guest: Guest): boolean {
  return guest.lostSinceTick >= 0 || isWayLost(guest);
}

/** Forget the progress count (no target, a new target, a map, or not walking). */
export function resetWayfinding(guest: Guest): void {
  guest.lostSteps = 0;
  guest.bestDistance = -1;
  guest.lostTarget = null;
}

/** A tile with at least JUNCTION_MIN_NEIGHBOURS guest-walkable neighbours (footpath or park entrance). */
export function isJunction(world: World, tile: number): boolean {
  const map = world.state.map;
  let n = 0;
  for (const d of DIRS) {
    const t = neighbour(map, tile, d);
    if (t >= 0 && isWalkable(world, t, 'guest')) n++;
  }
  return n >= JUNCTION_MIN_NEIGHBOURS;
}

/**
 * Count one step at the guest's tile. Returns the path distance to the target, or null when the guest
 * has no reachable target (the count is then reset; "no route" is the Phase 1 rule's business).
 */
export function trackProgress(world: World, guest: Guest): number | null {
  const target = guest.target;
  if (target === null || guest.items.map || !isOnTheMove(guest)) {
    resetWayfinding(guest);
    return null;
  }
  const d = distanceTo(world, guest.tile, target);
  if (d === null) {
    resetWayfinding(guest);
    return null;
  }
  if (guest.lostTarget !== target || guest.bestDistance < 0) {
    guest.lostTarget = target;
    guest.bestDistance = d;
    guest.lostSteps = 0;
  } else if (d < guest.bestDistance) {
    guest.bestDistance = d;
    guest.lostSteps = 0;
  } else if (guest.lostSteps < LOST_STEPS) {
    guest.lostSteps += 1;
  }
  return d;
}

/**
 * At a step start on a junction: maybe swap the best next tile for another footpath neighbour.
 * Draws from the RNG only when a wrong turn is possible. Returns true when the guest turned wrong.
 */
export function wrongTurnAtStep(world: World, guest: Guest): boolean {
  if (guest.items.map || guest.target === null || !isOnTheMove(guest)) return false;
  const map = world.state.map;
  const here = guest.tile;
  const best = guest.nextTile;
  if (best < 0 || map.content[here] !== Content.Footpath || !isJunction(world, here)) return false;
  const options: number[] = [];
  for (const d of DIRS) {
    const n = neighbour(map, here, d);
    if (n >= 0 && n !== best && map.content[n] === Content.Footpath) options.push(n);
  }
  if (options.length === 0) return false;
  const chance = WRONG_TURN * (isWayLost(guest) ? LOST_WRONG_TURN_FACTOR : 1);
  if (!rngChance(world.state, chance)) return false;
  const alt = options[rngInt(world.state, 0, options.length - 1)] as number;
  guest.nextTile = alt;
  guest.dir = dirBetween(world, here, alt, guest.dir);
  return true;
}

function headingToKiosk(world: World, guest: Guest): boolean {
  if (guest.target === null) return false;
  const p = parseDest(guest.target);
  return p.kind === 'stall' && findStall(world, p.id)?.defId === KIOSK;
}

/** A lost guest without a map heads for the nearest Info Kiosk when it is closer than the current target. */
function kioskDetour(world: World, guest: Guest): void {
  if (guest.items.map || guest.target === null || headingToKiosk(world, guest)) return;
  const kiosk = nearestFacility(world, guest, KIOSK);
  if (!kiosk) return;
  const current = distanceTo(world, guest.tile, guest.target);
  if (current !== null && kiosk.distance >= current) return;
  targetStall(guest, kiosk.stall);
  resetWayfinding(guest);
}

/** beforeDecision: a lost walking guest thinks about a map, loses happiness, and may detour to a kiosk. */
export function lostDecision(world: World, guest: Guest): boolean {
  if (guest.state !== 'walking' || !isWayLost(guest)) return false;
  changeNeed(guest, 'happiness', -LOST_HAPPY);
  addThought(world, guest, THOUGHT.lostNeedMap);
  kioskDetour(world, guest);
  return false;
}
