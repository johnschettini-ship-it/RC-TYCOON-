import type { Cents } from '../units';

/** Every cash change goes to exactly one category. Sum of lines = cash change (ledger invariant). */
export type LedgerCategory =
  | 'construction'
  | 'demolitionRefunds'
  | 'rideRunning'
  | 'stallRunning'
  | 'stock'
  | 'entranceTickets'
  | 'rideTickets'
  | 'stallSales'
  | 'wages'
  | 'staffHiring'
  | 'research'
  | 'marketing'
  | 'loanInterest'
  | 'loan'
  | 'repairs'
  | 'landPurchase'
  | 'shows';

export const LEDGER_CATEGORIES: readonly LedgerCategory[] = [
  'construction',
  'demolitionRefunds',
  'rideRunning',
  'stallRunning',
  'stock',
  'entranceTickets',
  'rideTickets',
  'stallSales',
  'wages',
  'staffHiring',
  'research',
  'marketing',
  'loanInterest',
  'loan',
  'repairs',
  'landPurchase',
  'shows',
];

export interface LedgerMonth {
  monthIndex: number;
  lines: Record<LedgerCategory, Cents>;
}

export interface EconomyState {
  /** One record per month, oldest first. The last record is the current month. */
  ledger: LedgerMonth[];
}
