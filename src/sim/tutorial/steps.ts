/**
 * The 16 tutorial steps (Phase 5 §4.11). Owner: W3-I.
 * `ui` steps are finished by the UI with `tutorialAdvance { stepId }` (Next, camera, zoom, panels).
 * `sim` steps are checked after every successful command and at every hour start.
 */
import { getFlatRideDef, getStallDef, getTrackRideDef } from '../../data/catalog';
import { START_ENTRANCE_FEE } from '../../data/tuning/core';
import { rideWarnings } from '../commands/build/warnings';
import type { Command } from '../commands/types';
import { Content } from '../map';
import { distanceTo } from '../pathing';
import type { Ride } from '../rides/types';
import type { World } from '../types';

export type TutorialGuide = 'frost' | 'spark' | 'both';

export type TutorialStepId =
  | 'welcome'
  | 'moveView'
  | 'zoom'
  | 'footpath'
  | 'carousel'
  | 'connectCarousel'
  | 'openRide'
  | 'stalls'
  | 'openPark'
  | 'inspectGuest'
  | 'swingTower'
  | 'changePrice'
  | 'juniorCoaster'
  | 'groundskeeper'
  | 'financePanel'
  | 'guests100';

export interface TutorialStep {
  id: TutorialStepId;
  guide: TutorialGuide;
  check: 'ui' | 'sim';
}

/** Spec table order (Phase 5 §4.11). */
export const TUTORIAL_STEPS: readonly TutorialStep[] = Object.freeze([
  { id: 'welcome', guide: 'both', check: 'ui' },
  { id: 'moveView', guide: 'frost', check: 'ui' },
  { id: 'zoom', guide: 'frost', check: 'ui' },
  { id: 'footpath', guide: 'spark', check: 'sim' },
  { id: 'carousel', guide: 'frost', check: 'sim' },
  { id: 'connectCarousel', guide: 'frost', check: 'sim' },
  { id: 'openRide', guide: 'spark', check: 'sim' },
  { id: 'stalls', guide: 'frost', check: 'sim' },
  { id: 'openPark', guide: 'spark', check: 'sim' },
  { id: 'inspectGuest', guide: 'both', check: 'ui' },
  { id: 'swingTower', guide: 'spark', check: 'sim' },
  { id: 'changePrice', guide: 'frost', check: 'sim' },
  { id: 'juniorCoaster', guide: 'spark', check: 'sim' },
  { id: 'groundskeeper', guide: 'frost', check: 'sim' },
  { id: 'financePanel', guide: 'both', check: 'ui' },
  { id: 'guests100', guide: 'both', check: 'sim' },
] satisfies TutorialStep[]);

export const TUTORIAL_STEP_COUNT = TUTORIAL_STEPS.length;

/** Footpath tiles connected to the entrance needed by step 4. */
export const TUTORIAL_FOOTPATH_TILES = 6;
/** Guests in the park needed by step 16. */
export const TUTORIAL_GUESTS = 100;
/** Stalls step 8 asks for, one of each. */
export const TUTORIAL_STALLS: readonly string[] = ['snack_shack', 'fizz_stand', 'restrooms'];

/** Footpath tiles joined to the park entrance through footpaths (4 neighbours), counted up to `limit`. */
export function footpathTilesFromEntrance(world: World, limit = Infinity): number {
  const map = world.state.map;
  const start = map.entranceTile;
  if (start < 0) return 0;
  const { width, height, content } = map;
  const seen = new Uint8Array(content.length);
  const stack = [start];
  seen[start] = 1;
  let count = 0;
  while (stack.length > 0 && count < limit) {
    const t = stack.pop() as number;
    const x = t % width;
    const y = (t - x) / width;
    const next = [x > 0 ? t - 1 : -1, x < width - 1 ? t + 1 : -1, y > 0 ? t - width : -1, y < height - 1 ? t + width : -1];
    for (const n of next) {
      if (n < 0 || seen[n] || content[n] !== Content.Footpath) continue;
      seen[n] = 1;
      count += 1;
      stack.push(n);
    }
  }
  return count;
}

const ridesOf = (world: World, defId: string): Ride[] => world.state.rides.filter((r) => r.defId === defId);

function reachable(world: World, dest: `ride:${number}` | `stall:${number}`): boolean {
  const entrance = world.state.map.entranceTile;
  return entrance >= 0 && distanceTo(world, entrance, dest) !== null;
}

/** A ride or stall price differs from its catalog default, or the entrance fee from the start fee. */
export function anyPriceChanged(world: World): boolean {
  const s = world.state;
  if (s.park.entranceFee !== START_ENTRANCE_FEE) return true;
  for (const r of s.rides) {
    const def = r.kind === 'flat' ? getFlatRideDef(r.defId) : getTrackRideDef(s.track.rides[String(r.id)]?.typeId ?? r.defId);
    if (def && r.price !== def.defaultPrice) return true;
  }
  for (const st of s.stalls) {
    const def = getStallDef(st.defId);
    if (def && st.price !== def.defaultPrice) return true;
  }
  return false;
}

const PRICE_COMMANDS: ReadonlySet<string> = new Set(['setRidePrice', 'setStallPrice', 'setEntranceFee']);

/**
 * The `sim` check of a step. `cmd` is the successful command that triggered the check (null at hour start).
 * `ui` steps never pass here.
 */
export function simStepMet(world: World, id: TutorialStepId, cmd: Command | null): boolean {
  const s = world.state;
  switch (id) {
    case 'footpath':
      return footpathTilesFromEntrance(world, TUTORIAL_FOOTPATH_TILES) >= TUTORIAL_FOOTPATH_TILES;
    case 'carousel':
      return ridesOf(world, 'carousel').length > 0;
    case 'connectCarousel':
      return ridesOf(world, 'carousel').some((r) => rideWarnings(world, r).length === 0);
    case 'openRide':
      return ridesOf(world, 'carousel').some((r) => r.status === 'open');
    case 'stalls':
      return TUTORIAL_STALLS.every((defId) => s.stalls.some((st) => st.defId === defId && reachable(world, `stall:${st.id}`)));
    case 'openPark':
      return s.park.open;
    case 'swingTower':
      return ridesOf(world, 'swing_tower').some((r) => r.status === 'open' && rideWarnings(world, r).length === 0 && reachable(world, `ride:${r.id}`));
    case 'changePrice':
      return (cmd !== null && PRICE_COMMANDS.has(cmd.type)) || anyPriceChanged(world);
    case 'juniorCoaster':
      return s.rides.some((r) => r.kind === 'track' && s.track.rides[String(r.id)]?.typeId === 'junior_coaster' && s.track.rides[String(r.id)]?.test != null);
    case 'groundskeeper':
      return s.staff.members.some((m) => m.type === 'groundskeeper');
    case 'guests100':
      return s.guests.length >= TUTORIAL_GUESTS;
    default:
      return false;
  }
}
