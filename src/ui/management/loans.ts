/** Loan view model (Phase 3 §4.8): $1,000 steps, limit, monthly interest. Owner: W2-B. Pure. */
import { LOAN_RATE_BP, LOAN_STEP } from '../../data/tuning/management';
import { maxLoan, monthlyInterest } from '../../sim/finance/loans';
import type { World } from '../../sim/types';
import type { Cents } from '../../sim/units';

/** Amount the Borrow button sends: one step while it stays within the limit, else 0 (disabled). */
export function borrowStep(balance: Cents, limit: Cents): Cents {
  return balance + LOAN_STEP <= limit ? LOAN_STEP : 0;
}

/**
 * Cash a Repay press needs: one step, or the rest of a smaller balance (the command repays
 * `min(amount, balance)`). 0 when there is no loan or not enough cash.
 */
export function repayStep(balance: Cents, cash: Cents): Cents {
  if (balance <= 0) return 0;
  const due = Math.min(LOAN_STEP, balance);
  return cash >= due ? due : 0;
}

export interface LoanView {
  balance: Cents;
  limit: Cents;
  /** Interest charged at the next month start. */
  interest: Cents;
  /** Monthly rate in percent. */
  ratePercent: number;
  /** Borrow amount for the button, or 0 when the limit is reached. */
  borrow: Cents;
  /** Amount for the Repay command (always one step), or 0 when it would fail. */
  repay: Cents;
}

export function loanView(world: World): LoanView {
  const s = world.state;
  const balance = s.management.loan.balance;
  const limit = maxLoan(world);
  return {
    balance,
    limit,
    interest: monthlyInterest(balance, s.modifiers.loanInterest),
    ratePercent: (LOAN_RATE_BP * s.modifiers.loanInterest) / 100,
    borrow: borrowStep(balance, limit),
    repay: repayStep(balance, s.park.cash) > 0 ? LOAN_STEP : 0,
  };
}
