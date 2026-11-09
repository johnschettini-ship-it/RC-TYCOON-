/**
 * Objective evaluation at month end (Phase 5 §4.3–4.4, step 4 of the month-end pipeline, master R13). Owner: W3-H.
 * Contract: for an active scenario run, update each `ObjectiveProgress`; when all are met at the same month end and
 * the deadline allows it, set `status: 'won'`, `endMonthIndex`, and emit `scenarioEnded`. Frozen after
 * `continued`. Stub: no-op.
 */
import type { World } from '../types';

export function evaluateObjectives(_world: World): void {}
