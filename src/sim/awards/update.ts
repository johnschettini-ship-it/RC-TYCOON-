/**
 * Monthly awards (Phase 5 §4.10; step 3 of the month-end pipeline, master R13: after the ledger closes and the
 * Phase 3 monthly tasks, before objectives). Owner: W3-I.
 * Evaluates every award on the closing month's metrics (`state.monthMetrics`, not yet reset), sets `awards.active`
 * for the coming month, appends to `awards.history`, and emits `{ type: 'award' }` per award, in table order.
 * No awards in the tutorial; with the sandbox option off nothing is won and the active list is cleared.
 */
import { emit } from '../events';
import { monthIndexOf } from '../time';
import type { World } from '../types';
import { awardsWon, measureAwards } from './criteria';
import { awardsEnabled } from './api';
import { isPositiveAward } from './types';

export function evaluateAwards(world: World): void {
  const scenario = world.state.scenario;
  if (scenario.kind === 'tutorial') return;
  const awards = scenario.awards;
  if (!awardsEnabled(world)) {
    awards.active = [];
    return;
  }
  const monthIndex = monthIndexOf(world.state.tick) - 1;
  const won = awardsWon(measureAwards(world));
  awards.active = won;
  for (const id of won) {
    awards.history.push({ monthIndex, id });
    emit(world, { type: 'award', id, positive: isPositiveAward(id), monthIndex });
  }
}
