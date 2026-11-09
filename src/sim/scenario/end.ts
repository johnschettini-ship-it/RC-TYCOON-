/** Ending a scenario run (Phase 5 §4.4). Owner: W3-H. */
import { emit } from '../events';
import type { World } from '../types';
import type { ScenarioEndReason, ScenarioRun } from './types';

/** Month index of the month a month-start tick closes. */
export function closingMonthIndex(tick: number, ticksPerMonth: number): number {
  return Math.floor(tick / ticksPerMonth) - 1;
}

/** Sets the result and pushes `scenarioEnded` (the client pauses the loop on it; pausing is UI state). */
export function endRun(world: World, run: ScenarioRun, status: 'won' | 'lost', reason: ScenarioEndReason | null, monthIndex: number): void {
  run.status = status;
  run.endReason = reason;
  run.endMonthIndex = monthIndex;
  emit(world, { type: 'scenarioEnded', status, reason, monthIndex });
}
