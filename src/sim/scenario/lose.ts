/**
 * Lose checks at month end (Phase 5 §4.4, §4.8; step 5 of the month-end pipeline, master R13). Owner: W3-H.
 * Contract: time up, bankrupt (counter of month ends with cash < 0 and loan = max loan), rating collapse (6 daily
 * ratings in a row < 200, counted at the day samples), per the difficulty preset. On a loss set `status: 'lost'`,
 * `endReason`, `endMonthIndex`, and emit `scenarioEnded`. Stops after a win, a loss, or `continued`.
 *
 * "Loan = max loan" uses the game's loan limit (`finance/loans.ts maxLoan`), the limit the player borrows against;
 * a balance above a fallen limit counts too.
 */
import { TICKS_PER_MONTH } from '../../data/tuning/core';
import { DIFFICULTY, RATING_COLLAPSE_DAYS } from '../../data/tuning/scenario';
import { maxLoan } from '../finance/loans';
import type { World } from '../types';
import { closingMonthIndex, endRun } from './end';
import type { ScenarioEndReason } from './types';

export function checkLoseConditions(world: World): void {
  const s = world.state;
  const run = s.scenario;
  if (run.kind !== 'scenario' || run.status !== 'active') return;
  const preset = DIFFICULTY[run.difficulty];
  const monthIndex = closingMonthIndex(s.tick, TICKS_PER_MONTH);
  if (monthIndex < 0) return;

  const counters = run.loseCounters;
  if (preset.bankruptMonths !== null) {
    const broke = s.park.cash < 0 && s.management.loan.balance >= maxLoan(world);
    counters.bankruptMonths = broke ? counters.bankruptMonths + 1 : 0;
  }

  let reason: ScenarioEndReason | null = null;
  if (run.deadlineMonthIndex !== null && monthIndex >= run.deadlineMonthIndex && !preset.lateWinAllowed) reason = 'timeUp';
  else if (preset.bankruptMonths !== null && counters.bankruptMonths >= preset.bankruptMonths) reason = 'bankrupt';
  else if (preset.ratingCollapse && counters.lowRatingDays >= RATING_COLLAPSE_DAYS) reason = 'ratingCollapse';
  if (reason !== null) endRun(world, run, 'lost', reason, monthIndex);
}
