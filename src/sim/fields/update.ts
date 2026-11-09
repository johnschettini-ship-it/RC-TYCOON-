/**
 * Calm and Buzz refresh at every hour start (master R13, after the rating). Owner: W3-E.
 * Contract: bring the derived fields up to date with sources that change without a command (ride status, wilting,
 * litter penalties are read-time). Guest effects run through `fieldHooks` (`./hooks.ts`).
 *
 * The store already syncs at the first simulation read of every tick (`./store.ts`), so this hour-start refresh
 * also catches the changes made earlier in this tick (W3-D's hourly wilting runs just before it).
 */
import type { World } from '../types';
import { markStale, simFields } from './store';

export function hourlyFields(world: World): void {
  markStale(world);
  simFields(world);
}
