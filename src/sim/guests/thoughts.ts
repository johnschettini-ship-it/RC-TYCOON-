/**
 * Guest thoughts (master R5). Owner: W1-D.
 * Stored as `{ id, tick, params? }`; text comes from `src/data/strings/guests.ts` through `en.ts`.
 * Other systems (litter, weather, facilities, staff, track rides) add thoughts with `addThought`.
 */
import { THOUGHT_MAX, THOUGHT_REPEAT_TICKS } from '../../data/tuning/guests';
import type { World } from '../types';
import type { Guest } from './types';

/** Every guest thought id. Values equal keys of `guestStrings`. */
export const THOUGHT = {
  // Phase 1 §4.3
  hungry: 'hungry',
  thirsty: 'thirsty',
  needRestroom: 'needRestroom',
  tired: 'tired',
  sick: 'sick',
  lost: 'lost',
  amazing: 'amazing',
  nice: 'nice',
  tame: 'tame',
  tooIntense: 'tooIntense',
  rideTooExpensive: 'rideTooExpensive',
  snackTooExpensive: 'snackTooExpensive',
  drinkTooExpensive: 'drinkTooExpensive',
  queueTooLong: 'queueTooLong',
  waitedTooLong: 'waitedTooLong',
  goHome: 'goHome',
  greatPark: 'greatPark',
  // Phase 2 §4.11
  airtimeAwesome: 'airtimeAwesome',
  neverUpsideDown: 'neverUpsideDown',
  // Phase 3 §4.16
  filthy: 'filthy',
  cleanPark: 'cleanPark',
  brokeBench: 'brokeBench',
  brokeBin: 'brokeBin',
  brokeLamp: 'brokeLamp',
  rideBrokeDown: 'rideBrokeDown',
  stuck: 'stuck',
  stormClosed: 'stormClosed',
  lostNeedMap: 'lostNeedMap',
  mapLifesaver: 'mapLifesaver',
  balloonFlewAway: 'balloonFlewAway',
  loveBalloon: 'loveBalloon',
  rainNoUmbrella: 'rainNoUmbrella',
  goodUmbrella: 'goodUmbrella',
  tooHot: 'tooHot',
  tooCold: 'tooCold',
  wantCocoa: 'wantCocoa',
  feelAwful: 'feelAwful',
  performerFun: 'performerFun',
  frostCute: 'frostCute',
  sparkAwesome: 'sparkAwesome',
  needCash: 'needCash',
  thrillWeekend: 'thrillWeekend',
  chillWeekend: 'chillWeekend',
} as const;

export type ThoughtId = (typeof THOUGHT)[keyof typeof THOUGHT];

/**
 * Add a thought unless the guest had the same id within the last THOUGHT_REPEAT_TICKS (one game day).
 * Keeps the newest THOUGHT_MAX thoughts (newest last). Returns true when the thought was added.
 */
export function addThought(world: World, guest: Guest, id: string, params?: Record<string, string | number>): boolean {
  const now = world.state.tick;
  const cd = guest.thoughtCooldowns;
  const last = cd[id];
  if (last !== undefined && now - last < THOUGHT_REPEAT_TICKS) return false;
  for (const k of Object.keys(cd)) {
    if (now - (cd[k] as number) >= THOUGHT_REPEAT_TICKS) delete cd[k];
  }
  cd[id] = now;
  guest.thoughts.push(params ? { id, tick: now, params } : { id, tick: now });
  while (guest.thoughts.length > THOUGHT_MAX) guest.thoughts.shift();
  if (thoughtListener !== null) thoughtListener(world, guest, id);
  return true;
}

/**
 * Listener for every added thought (the guest hooks' `onThought` list). Installed by the hook registry
 * (`sim/hooks.ts`), because this module cannot import the registry: hook modules use `THOUGHT` while they load.
 */
let thoughtListener: ((world: World, guest: Guest, id: string) => void) | null = null;

export function setThoughtListener(fn: ((world: World, guest: Guest, id: string) => void) | null): void {
  thoughtListener = fn;
}

/** Name used in the delivery plan (W1-D "Produces"); same as `addThought`. */
export const guestThought = addThought;
