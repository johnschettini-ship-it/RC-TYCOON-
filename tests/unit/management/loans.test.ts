import { describe, expect, it } from 'vitest';
import { executeCommand } from '../../../src/sim/commands';
import { maxLoan, monthlyInterest } from '../../../src/sim/finance/loans';
import { monthlyFinance } from '../../../src/sim/finance/monthly';
import { monthProfit } from '../../../src/sim/finance/ledger';
import { currentLedger } from '../../../src/sim/economy/ledger';
import { stepTick } from '../../../src/sim/tick';
import { LOAN_MIN_LIMIT, LOAN_RATE_BP, LOAN_STEP } from '../../../src/data/tuning/management';
import { MANAGEMENT_ERRORS, MSG } from '../../../src/data/strings/management';
import { makeTestWorld } from '../../helpers/world';

describe('loan limit (Phase 3 §4.8)', () => {
  it('is half the park value in $1,000 steps, at least $10,000', () => {
    expect([LOAN_MIN_LIMIT, LOAN_STEP, LOAN_RATE_BP]).toEqual([1_000_000, 100_000, 100]);
    const w = makeTestWorld();
    w.state.management.parkValue = 0;
    expect(maxLoan(w)).toBe(1_000_000);
    w.state.management.parkValue = 1_999_999;
    expect(maxLoan(w)).toBe(1_000_000);
    w.state.management.parkValue = 5_000_000;
    expect(maxLoan(w)).toBe(2_500_000);
    w.state.management.parkValue = 5_050_000; // half = $25,250 → $25,000
    expect(maxLoan(w)).toBe(2_500_000);
    w.state.management.parkValue = 5_199_999; // half = $25,999.99 → $25,000
    expect(maxLoan(w)).toBe(2_500_000);
    w.state.management.parkValue = 5_200_000;
    expect(maxLoan(w)).toBe(2_600_000);
  });
});

describe('borrow and repay', () => {
  it('borrow adds cash and balance through the loan ledger line', () => {
    const w = makeTestWorld();
    const cash = w.state.park.cash;
    expect(executeCommand(w, { type: 'borrow', amount: 500_000 })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(w.state.management.loan.balance).toBe(500_000);
    expect(w.state.park.cash).toBe(cash + 500_000);
    expect(currentLedger(w).lines.loan).toBe(500_000);
  });

  it('rejects amounts that are not positive multiples of $1,000', () => {
    const w = makeTestWorld();
    for (const amount of [0, -100_000, 50_000, 100_001, 150_000]) {
      expect(executeCommand(w, { type: 'borrow', amount })).toEqual({ ok: false, reason: 'Amount must be a multiple of $1,000' });
    }
    w.state.management.loan.balance = 300_000;
    expect(executeCommand(w, { type: 'repay', amount: 50_000 })).toEqual({ ok: false, reason: MANAGEMENT_ERRORS.loanStep });
    expect(w.state.management.loan.balance).toBe(300_000);
  });

  it('stops at the limit and changes nothing on failure', () => {
    const w = makeTestWorld();
    expect(executeCommand(w, { type: 'borrow', amount: 1_000_000 }).ok).toBe(true);
    const cash = w.state.park.cash;
    expect(executeCommand(w, { type: 'borrow', amount: 100_000 })).toEqual({ ok: false, reason: 'Loan limit reached' });
    expect(w.state.management.loan.balance).toBe(1_000_000);
    expect(w.state.park.cash).toBe(cash);
  });

  it('repay fails without a loan or without cash, and clamps to the balance', () => {
    const w = makeTestWorld();
    expect(executeCommand(w, { type: 'repay', amount: 100_000 })).toEqual({ ok: false, reason: 'No loan to repay' });
    executeCommand(w, { type: 'borrow', amount: 300_000 });
    w.state.park.cash = 99_999;
    expect(executeCommand(w, { type: 'repay', amount: 100_000 })).toEqual({ ok: false, reason: 'Not enough cash' });
    w.state.park.cash = 1_000_000;
    expect(executeCommand(w, { type: 'repay', amount: 100_000 })).toEqual({ ok: true, cost: 100_000, warnings: [] });
    expect(w.state.management.loan.balance).toBe(200_000);
    expect(w.state.park.cash).toBe(900_000);
    expect(executeCommand(w, { type: 'repay', amount: 500_000 })).toEqual({ ok: true, cost: 200_000, warnings: [] });
    expect(w.state.management.loan.balance).toBe(0);
    expect(currentLedger(w).lines.loan).toBe(300_000 - 300_000);
  });

  it('setup mode changes the balance only (no cash, no ledger, no limit)', () => {
    const w = makeTestWorld();
    const cash = w.state.park.cash;
    expect(executeCommand(w, { type: 'borrow', amount: 2_000_000 }, { setup: true }).ok).toBe(true);
    expect(w.state.management.loan.balance).toBe(2_000_000);
    expect(w.state.park.cash).toBe(cash);
    expect(currentLedger(w).lines.loan).toBe(0);
  });

  it('financing is excluded from profit', () => {
    const w = makeTestWorld();
    executeCommand(w, { type: 'borrow', amount: 500_000 });
    executeCommand(w, { type: 'repay', amount: 200_000 });
    const month = currentLedger(w);
    expect(month.lines.loan).toBe(300_000);
    expect(monthProfit(month)).toBe(0);
    month.lines.rideTickets = 1234;
    month.lines.loanInterest = -50;
    expect(monthProfit(month)).toBe(1184);
  });
});

describe('loan interest (month start)', () => {
  it('is floor(balance × 1%) × modifiers.loanInterest, booked to loanInterest', () => {
    expect(monthlyInterest(123_456, 1)).toBe(1234);
    expect(monthlyInterest(123_456, 1.5)).toBe(1851);
    expect(monthlyInterest(99, 1)).toBe(0);
    const w = makeTestWorld();
    w.state.management.loan.balance = 500_000;
    w.state.tick = 3600;
    const cash = w.state.park.cash;
    monthlyFinance(w);
    expect(w.state.park.cash).toBe(cash - 5_000);
    expect(currentLedger(w).lines.loanInterest).toBe(-5_000);
    expect(currentLedger(w).monthIndex).toBe(1);
  });

  it('charges at the first tick of each month in the tick pipeline', () => {
    const w = makeTestWorld();
    executeCommand(w, { type: 'borrow', amount: 500_000 });
    w.state.tick = 3599;
    stepTick(w);
    expect(w.state.economy.ledger.find((l) => l.monthIndex === 1)).toBeUndefined();
    stepTick(w);
    expect(w.state.economy.ledger.find((l) => l.monthIndex === 1)?.lines.loanInterest).toBe(-5_000);
  });

  it('posts a finance message when cash is negative at a month start', () => {
    const w = makeTestWorld();
    w.state.tick = 3600;
    monthlyFinance(w);
    expect(w.state.management.messages).toHaveLength(0);
    w.state.park.cash = -1;
    monthlyFinance(w);
    expect(w.state.management.messages.map((m) => [m.category, m.textId])).toEqual([['finance', MSG.cashNegative]]);
  });
});
