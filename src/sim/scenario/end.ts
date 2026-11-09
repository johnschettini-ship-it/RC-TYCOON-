/** Ending a scenario run (Phase 5 §4.4). Owner: W3-H. */
import { emit } from '../events';
import type { World } from '../types';
import type { ScenarioEndReason, ScenarioRun } from './types';

/** Month index of the month a month-start tick closes. */
export function closingMonthIndex(tick: number, ticksPerMonth: number): number {
  return Math.floor(tick / ticksPerMonth) - 1;
}

/**
 * Sets the result and pushes `scenarioEnded` (the client pauses the loop on it; pausing is UI state).
 *
 * A win is recorded once, at the end tick (Phase 5 §4.4): the client writes progress from this tick's
 * `scenarioEnded` event (`progress/index.ts recordProgressEvents`), and the run is marked `progressRecorded` here, so
 * the state says the win has been handed over. A save loaded after the win carries the flag and sends no event, so
 * nothing records it again. A loss records nothing and leaves the flag false.
 */
export function endRun(world: World, run: ScenarioRun, status: 'won' | 'lost', reason: ScenarioEndReason | null, monthIndex: number): void {
  run.status = status;
  run.endReason = reason;
  run.endMonthIndex = monthIndex;
  if (status === 'won') run.progressRecorded = true;
  emit(world, { type: 'scenarioEnded', status, reason, monthIndex });
}
