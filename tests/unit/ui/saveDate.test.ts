import { describe, expect, it } from 'vitest';
import { text } from '../../../src/data/strings/en';
import { monthName } from '../../../src/i18n';
import { formatDate, monthOfYear, yearOf } from '../../../src/sim/time';
import { saveDateLabel } from '../../../src/ui/scenario/model';

describe('saveDateLabel (the park line under Continue, F7)', () => {
  it('is the month and the year of the tick from the string table (prog.monthYear and monthName), without the clock', () => {
    for (const tick of [0, 1, 3675, 9 * 60 * 60, 123_456, 2_000_000]) {
      const date = saveDateLabel(tick);
      expect(date, `${tick}`).toBe(text('prog.monthYear', { month: monthName(monthOfYear(tick)), year: yearOf(tick) }));
      // In English it is the start of the HUD date.
      expect(formatDate(tick).startsWith(`${date} · `), `${tick}: ${formatDate(tick)}`).toBe(true);
    }
    expect(saveDateLabel(0)).toBe('Mar · Year 1');
    expect(saveDateLabel(3675)).toBe('Apr · Year 1');
  });
});
