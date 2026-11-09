/** Owner: W1-I. Month-start tasks after the ledger close (Phase 3 §4.8, master R13). */
import { MSG } from '../../data/strings/management';
import { recordLedger } from '../economy/ledger';
import { notify } from '../notifications';
import type { World } from '../types';
import { monthlyInterest } from './loans';

/** Loan interest to `loanInterest`, then the negative-cash warning. Phase 3 has no game over. */
export function monthlyFinance(world: World): void {
  const s = world.state;
  const interest = monthlyInterest(s.management.loan.balance, s.modifiers.loanInterest);
  if (interest > 0) recordLedger(world, 'loanInterest', -interest);
  if (s.park.cash < 0) notify(world, 'finance', MSG.cashNegative);
}
