/**
 * Lose checks at month end (Phase 5 §4.4, §4.8; step 5 of the month-end pipeline, master R13). Owner: W3-H.
 * Contract: time up, bankrupt (counter of month ends with cash < 0 and loan = max loan), rating collapse (6 daily
 * ratings in a row < 200, counted at the day samples), per the difficulty preset. On a loss set `status: 'lost'`,
 * `endReason`, `endMonthIndex`, and emit `scenarioEnded`. Stops after a win, a loss, or `continued`. Stub: no-op.
 */
import type { World } from '../types';

export function checkLoseConditions(_world: World): void {}
