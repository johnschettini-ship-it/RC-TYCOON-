/**
 * Objective evaluation at month end (Phase 5 §4.3–4.4, step 4 of the month-end pipeline, master R13). Owner: W3-H.
 * Contract: for an active scenario run, update each `ObjectiveProgress`; when all are met at the same month end and
 * the deadline allows it, set `status: 'won'`, `endMonthIndex`, and emit `scenarioEnded`. Frozen after
 * `continued` (the status is no longer `active`).
 */
import { getScenarioDef } from '../../data/scenarios';
import { TICKS_PER_MONTH } from '../../data/tuning/core';
import { DIFFICULTY } from '../../data/tuning/scenario';
import type { World } from '../types';
import { closingMonthIndex, endRun } from './end';
import { evaluateGoal, NO_PROGRESS } from './goals';

export function evaluateObjectives(world: World): void {
  const s = world.state;
  const run = s.scenario;
  if (run.kind !== 'scenario' || run.status !== 'active') return;
  const def = getScenarioDef(run.id);
  const monthIndex = closingMonthIndex(s.tick, TICKS_PER_MONTH);
  if (!def || monthIndex < 0) return;
  run.objectives = def.objectives.map((obj, i) => evaluateGoal(world, obj, run.objectives[i] ?? NO_PROGRESS, monthIndex));
  if (!run.objectives.every((p) => p.met)) return;
  const late = run.deadlineMonthIndex !== null && monthIndex > run.deadlineMonthIndex;
  if (late && !DIFFICULTY[run.difficulty].lateWinAllowed) return;
  endRun(world, run, 'won', null, monthIndex);
}
