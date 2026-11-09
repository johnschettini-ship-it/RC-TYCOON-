/** Owner: W1-I. Loans (Phase 3 §4.8). Borrowed and repaid amounts are financing (ledger category `loan`). */
import { LOAN_MIN_LIMIT, LOAN_RATE_BP, LOAN_STEP } from '../../data/tuning/management';
import { MANAGEMENT_ERRORS } from '../../data/strings/management';
import { canAfford, recordLedger, type CommandContext } from '../economy/ledger';
import { fail, ok, type CommandResult } from '../commands/types';
import type { World } from '../types';
import type { Cents } from '../units';
import { scenarioMaxLoan } from '../scenario/api';

/** `max(LOAN_MIN_LIMIT, floor(0.5 × parkValue / LOAN_STEP) × LOAN_STEP)`. */
export function maxLoan(world: World): Cents {
  // A scenario can fix the loan limit (Phase 5 §4.1); otherwise the Phase 3 formula applies.
  const fixed = scenarioMaxLoan(world.state);
  if (fixed !== null) return fixed;
  const pv = Math.max(0, world.state.management.parkValue);
  return Math.max(LOAN_MIN_LIMIT, Math.floor(pv / (2 * LOAN_STEP)) * LOAN_STEP);
}

/** Interest for one month: `floor(balance × LOAN_RATE_BP / 10,000 × loanInterest)`. */
export function monthlyInterest(balance: Cents, loanInterestModifier: number): Cents {
  if (balance <= 0) return 0;
  return Math.floor((balance * LOAN_RATE_BP * loanInterestModifier) / 10_000);
}

function isStep(amount: Cents): boolean {
  return Number.isInteger(amount) && amount > 0 && amount % LOAN_STEP === 0;
}

/** Setup mode (scenario start, tests) changes only the balance: no cash, no ledger line, no limit. */
export function borrow(world: World, amount: Cents, ctx: CommandContext): CommandResult {
  if (!isStep(amount)) return fail(MANAGEMENT_ERRORS.loanStep);
  const loan = world.state.management.loan;
  if (!ctx.setup && loan.balance + amount > maxLoan(world)) return fail(MANAGEMENT_ERRORS.loanLimit);
  loan.balance += amount;
  if (!ctx.setup) recordLedger(world, 'loan', amount);
  return ok(0);
}

/** Repays `min(amount, balance)`; the result's `cost` is the amount repaid. */
export function repay(world: World, amount: Cents, ctx: CommandContext): CommandResult {
  if (!isStep(amount)) return fail(MANAGEMENT_ERRORS.loanStep);
  const loan = world.state.management.loan;
  if (loan.balance <= 0) return fail(MANAGEMENT_ERRORS.noLoan);
  const due = Math.min(amount, loan.balance);
  if (!canAfford(world, due, ctx)) return fail(MANAGEMENT_ERRORS.notEnoughCash);
  loan.balance -= due;
  if (!ctx.setup) recordLedger(world, 'loan', -due);
  return ok(due);
}
