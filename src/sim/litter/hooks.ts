/**
 * Owner: W1-H. Trash, mess, dirt, benches, vandalism, and performer bonuses as guest hooks (Phase 3 §4.2–4.4).
 * beforeDecision order: keep sitting → sick → dirt → broken items → vandalism → performers → bench.
 * Only "keep sitting" and "bench" take the decision (return true).
 */
import { getStallDef } from '../../data/catalog/stalls';
import { STAFF_THOUGHTS } from '../../data/strings/staff';
import {
  ANGRY_HAPPY,
  BENCH_TIRED,
  BENCH_TIRED_CHILL,
  BROKEN_ITEM_HAPPY,
  CHILL_MAX,
  CLEAN_PARK_THOUGHT_MIN,
  DIRT_BAD,
  DIRT_BAD_HAPPY,
  DIRT_MILD,
  DIRT_MILD_HAPPY,
  LITTER_TILE_MAX,
  MESS_DIRT_WEIGHT,
  MESS_TILE_MAX,
  PERFORMER_RADIUS,
  SECURITY_RADIUS,
  SICK_CHANCE,
  SICK_HAPPY_DROP,
  SICK_NAUSEA,
  SICK_NAUSEA_DROP,
  TRASH_TIMER_MAX,
  TRASH_TIMER_MIN,
  VANDAL_CHANCE,
} from '../../data/tuning/staff';
import type { Guest } from '../guests/types';
import type { GuestHooks } from '../hooks';
import { Content, neighbour, PathItem, type Dir } from '../map';
import { rngChance, rngInt } from '../rng';
import { costumeMatches, performerBonus } from '../staff/costumes';
import { addThought, changeHappiness, changeNeed } from '../staff/guestEffects';
import { performersWithin, securityWithin } from '../staff/presence';
import type { Stall } from '../stalls/types';
import type { World } from '../types';
import { isSitting, sitOnBench, updateSitter } from './benches';
import { cleanlinessThisTick } from './metrics';
import { hasFreeBenchSeat, isBroken, isUsableBin, setBroken } from './pathItems';
import { recentBreakFactor } from '../breakdowns/api';

const DIRS: readonly Dir[] = [0, 1, 2, 3];

/** The tile itself, then its 4-neighbours in N, E, S, W order (−1 outside the map). */
function area(world: World, tile: number): number[] {
  const map = world.state.map;
  return [tile, ...DIRS.map((d) => neighbour(map, tile, d))];
}

function isPathTile(world: World, tile: number): boolean {
  const c = world.state.map.content[tile];
  return c === Content.Footpath || c === Content.Queue;
}

// --- afterPurchase ---

/** §4.3 Litter source: food or drink gives trash with a timer. A guest carries at most one piece. */
function trashAfterPurchase(world: World, guest: Guest, stall: Stall): void {
  const def = getStallDef(stall.defId);
  if (!def || (def.kind !== 'food' && def.kind !== 'drink')) return;
  if (guest.trashTimer > 0) return;
  guest.trashTimer = rngInt(world.state, TRASH_TIMER_MIN, TRASH_TIMER_MAX);
}

// --- perTick ---

function tryBin(world: World, guest: Guest): boolean {
  const map = world.state.map;
  for (const t of area(world, guest.tile)) {
    if (t >= 0 && isUsableBin(map, t)) {
      map.binFill[t] = (map.binFill[t] as number) + 1;
      guest.trashTimer = 0;
      return true;
    }
  }
  return false;
}

/** §4.3 Bin use and drop. Trash waits (timer stays at 1) while the guest cannot drop it here. */
function trashPerTick(world: World, guest: Guest): void {
  if (guest.trashTimer <= 0) return;
  const free = guest.state === 'walking' || guest.state === 'queueing' || guest.state === 'leaving' || guest.state === 'sitting';
  if (free && guest.tile >= 0 && tryBin(world, guest)) return;
  if (guest.trashTimer > 1) {
    guest.trashTimer -= 1;
    return;
  }
  if (!free || guest.tile < 0 || !isPathTile(world, guest.tile)) return;
  const map = world.state.map;
  if ((map.litter[guest.tile] as number) >= LITTER_TILE_MAX) return;
  map.litter[guest.tile] = (map.litter[guest.tile] as number) + 1;
  guest.trashTimer = 0;
}

function sitterPerTick(world: World, guest: Guest): void {
  if (guest.state === 'sitting' || world.state.staff.benchSitters.length > 0) updateSitter(world, guest);
}

// --- beforeDecision ---

function keepSitting(world: World, guest: Guest): boolean {
  return guest.state === 'sitting' && isSitting(world, guest.id);
}

/** §4.3 Mess: a guest with nausea ≥ SICK_NAUSEA is sick with chance SICK_CHANCE. */
function sick(world: World, guest: Guest): boolean {
  if (guest.needs.nausea < SICK_NAUSEA) return false;
  if (!rngChance(world.state, SICK_CHANCE)) return false;
  const map = world.state.map;
  if (guest.tile >= 0 && (map.mess[guest.tile] as number) < MESS_TILE_MAX) {
    map.mess[guest.tile] = (map.mess[guest.tile] as number) + 1;
  }
  changeNeed(guest, 'nausea', -SICK_NAUSEA_DROP);
  changeHappiness(guest, -SICK_HAPPY_DROP);
  addThought(world, guest, STAFF_THOUGHTS.feelAwful);
  return false;
}

/** §4.3 Dirt effect over the current tile and its 4 neighbours. */
function dirt(world: World, guest: Guest): boolean {
  if (guest.tile < 0) return false;
  const map = world.state.map;
  let d = 0;
  for (const t of area(world, guest.tile)) {
    if (t >= 0) d += (map.litter[t] as number) + MESS_DIRT_WEIGHT * (map.mess[t] as number);
  }
  if (d >= DIRT_BAD) {
    changeHappiness(guest, -DIRT_BAD_HAPPY);
    addThought(world, guest, STAFF_THOUGHTS.pathFilthy);
  } else if (d >= DIRT_MILD) {
    changeHappiness(guest, -DIRT_MILD_HAPPY);
  } else if (d === 0 && cleanlinessThisTick(world) >= CLEAN_PARK_THOUGHT_MIN) {
    addThought(world, guest, STAFF_THOUGHTS.cleanPark);
  }
  return false;
}

const BROKEN_THOUGHT: Record<number, string> = {
  [PathItem.Bench]: STAFF_THOUGHTS.brokenBench,
  [PathItem.Bin]: STAFF_THOUGHTS.brokenBin,
  [PathItem.Lamp]: STAFF_THOUGHTS.brokenLamp,
};

/** §4.4 Guests next to a broken item lose 1 happiness per decision and may think about it. */
function brokenItems(world: World, guest: Guest): boolean {
  if (guest.tile < 0) return false;
  const map = world.state.map;
  for (const t of area(world, guest.tile)) {
    if (t < 0 || map.pathItem[t] === PathItem.None || !isBroken(map, t)) continue;
    changeHappiness(guest, -BROKEN_ITEM_HAPPY);
    const id = BROKEN_THOUGHT[map.pathItem[t] as number];
    if (id) addThought(world, guest, id);
    break;
  }
  return false;
}

/** §4.4 An angry walking guest may break a path item here or on a 4-neighbour, unless Security is near. */
function vandalism(world: World, guest: Guest): boolean {
  if (guest.state !== 'walking' || guest.tile < 0 || guest.needs.happiness >= ANGRY_HAPPY) return false;
  const map = world.state.map;
  let target = -1;
  for (const t of area(world, guest.tile)) {
    if (t >= 0 && map.pathItem[t] !== PathItem.None && !isBroken(map, t)) {
      target = t;
      break;
    }
  }
  if (target < 0 || securityWithin(world, guest.tile, SECURITY_RADIUS)) return false;
  if (rngChance(world.state, VANDAL_CHANCE)) setBroken(map, target, true);
  return false;
}

/** §4.2 Performer bonus: at most one per decision (the best one in range). */
function performers(world: World, guest: Guest): boolean {
  if (guest.tile < 0) return false;
  const near = performersWithin(world, guest.tile, PERFORMER_RADIUS);
  if (near.length === 0) return false;
  let best = near[0] as { costume: import('../../data/catalog/types').Costume | null };
  for (const p of near) if (performerBonus(p.costume, guest.temperament) > performerBonus(best.costume, guest.temperament)) best = p;
  changeHappiness(guest, performerBonus(best.costume, guest.temperament));
  if (costumeMatches(best.costume, guest.temperament)) {
    addThought(world, guest, best.costume === 'frost' ? STAFF_THOUGHTS.frostCute : STAFF_THOUGHTS.sparkAwesome);
  } else {
    addThought(world, guest, STAFF_THOUGHTS.performerFun);
  }
  return false;
}

/** §4.3 Benches: a tired walking guest sits on a free bench here or on a 4-neighbour. */
function bench(world: World, guest: Guest): boolean {
  if (guest.state !== 'walking' || guest.tile < 0) return false;
  const limit = guest.temperament <= CHILL_MAX ? BENCH_TIRED_CHILL : BENCH_TIRED;
  if (guest.needs.energy >= limit) return false;
  for (const t of area(world, guest.tile)) {
    if (t >= 0 && hasFreeBenchSeat(world, t)) {
      sitOnBench(world, guest, t);
      return true;
    }
  }
  return false;
}

/** Individual decision hooks, exported for tests and for the integrator. */
export const decisionHooks = { keepSitting, sick, dirt, brokenItems, vandalism, performers, bench };

export const litterHooks: Partial<GuestHooks> = {
  beforeDecision: [keepSitting, sick, dirt, brokenItems, vandalism, performers, bench],
  perTick: [sitterPerTick, trashPerTick],
  afterPurchase: [trashAfterPurchase],
  // A ride fixed recently looks less safe (Phase 3 §4.5).
  rideScoreFactor: [(world, _guest, ride) => recentBreakFactor(world, ride)],
};
