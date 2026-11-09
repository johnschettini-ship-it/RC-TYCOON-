import { describe, expect, it } from 'vitest';
import { newLedgerMonth } from '../../../src/sim/economy/ledger';
import type { LedgerMonth } from '../../../src/sim/economy/types';
import { financeSummary, monthLabel, monthProfit, profitHistory } from '../../../src/ui/finance';

function month(i: number, lines: Partial<LedgerMonth['lines']> = {}): LedgerMonth {
  const m = newLedgerMonth(i);
  Object.assign(m.lines, lines);
  return m;
}

describe('finance panel data (Phase 1 §4.5)', () => {
  it('profit is the sum of the month lines; loan principal is financing, not profit', () => {
    expect(monthProfit(month(0, { construction: -120000, rideTickets: 5000, stock: -300, loan: 100000 }))).toBe(-115300);
  });

  it('this month and last month by category, only categories with money in either month', () => {
    const ledger = [month(3, { construction: -50000, entranceTickets: 2000 }), month(4, { rideTickets: 900, stock: -100 })];
    const s = financeSummary(ledger, 4);
    expect(s.rows).toEqual([
      { category: 'construction', thisMonth: 0, lastMonth: -50000 },
      { category: 'stock', thisMonth: -100, lastMonth: 0 },
      { category: 'entranceTickets', thisMonth: 0, lastMonth: 2000 },
      { category: 'rideTickets', thisMonth: 900, lastMonth: 0 },
    ]);
    expect(s.thisTotal).toBe(800);
    expect(s.lastTotal).toBe(-48000);
  });

  it('a first month has no last month', () => {
    const s = financeSummary([month(0, { construction: -1000 })], 0);
    expect(s.rows).toEqual([{ category: 'construction', thisMonth: -1000, lastMonth: 0 }]);
    expect(s.lastTotal).toBe(0);
    expect(financeSummary([], 0).rows).toEqual([]);
  });

  it('the profit chart covers the newest 12 months up to now, oldest first', () => {
    const ledger = Array.from({ length: 14 }, (_, i) => month(i, { rideTickets: i * 100 }));
    const h = profitHistory(ledger, 13);
    expect(h).toHaveLength(12);
    expect(h[0]).toEqual({ monthIndex: 2, profit: 200 });
    expect(h[11]).toEqual({ monthIndex: 13, profit: 1300 });
    expect(profitHistory(ledger.slice(0, 3), 2).map((m) => m.monthIndex)).toEqual([0, 1, 2]);
  });

  it('labels months with the game calendar', () => {
    expect(monthLabel(0)).toBe('Mar Y1');
    expect(monthLabel(11)).toBe('Feb Y1');
    expect(monthLabel(12)).toBe('Mar Y2');
  });
});
