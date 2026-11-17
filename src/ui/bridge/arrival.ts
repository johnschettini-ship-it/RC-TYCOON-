/**
 * What follows the push through the arch (VITE_ART=real build with the realistic look only; title-to-play bridge §2,
 * §3). The title marks a new park just before it opens one (`markNewPark`: the New Park form and the scenario flow's
 * starts); `view.ts` calls `arrived` when the push ends; the bridge (`./index.ts`) listens and plays the glow and, for a
 * new sandbox or free-play park, the welcome card (`arrivalPlan`). Continue and Load mark nothing, so a reload of a
 * park never shows the welcome card again (no save field). Module state only, no side effects at load: the website
 * build folds every caller away.
 */
import type { ScenarioKind } from '../../sim/scenario/types';

let newPark = false;

/** A new park is about to open from the title. */
export function markNewPark(): void {
  newPark = true;
}

/**
 * Clears the mark without an arrival: the title shown again (mid-push, or after a park opened while the title was
 * hidden and so had no push). Without it, the next Continue or Load would take the stale mark for a new park.
 */
export function clearNewPark(): void {
  newPark = false;
}

/** Whether the park that just opened is new; clears the mark. */
export function takeNewPark(): boolean {
  const v = newPark;
  newPark = false;
  return v;
}

export interface Arrival {
  reduced: boolean;
}
let listener: ((a: Arrival) => void) | null = null;
/** The push through the arch runs: the park shows under the title, but nothing may speak or pop up yet. */
let arriving = false;

/** The push started (true) or was stopped without an arrival (false). */
export function setArriving(on: boolean): void {
  arriving = on;
}

/**
 * True while the push runs: the tip bubble waits (`tips/bubble.ts`), so no tip shows, nor is read out, before the park
 * has arrived and the welcome card (when it shows) has opened; the card then holds the tips as a modal.
 */
export function arrivalHolds(): boolean {
  return arriving;
}

export function onArrival(fn: ((a: Arrival) => void) | null): void {
  listener = fn;
}

/** The push ended and the park shows (called by the title). */
export function arrived(a: Arrival): void {
  try {
    listener?.(a);
  } finally {
    arriving = false;
  }
}

/** After a title transition: the glow unless reduced motion; the welcome card for a new sandbox or free-play park. */
export function arrivalPlan(o: { reduced: boolean; newPark: boolean; kind: ScenarioKind }): { glow: boolean; welcome: boolean } {
  return { glow: !o.reduced, welcome: o.newPark && (o.kind === 'freePlay' || o.kind === 'sandbox') };
}
