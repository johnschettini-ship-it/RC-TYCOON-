/**
 * `formatGameDate` (Phase 6 §4.8): month names and the clock format (12 h / 24 h) come from the string table.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { en } from '../../../src/data/strings/en';
import { setLocale } from '../../../src/data/strings/index';
import { setActiveStrings } from '../../../src/data/strings/resolve';
import { formatGameDate, monthName } from '../../../src/i18n';
import { TICKS_PER_HOUR, TICKS_PER_MONTH } from '../../../src/data/tuning/core';
import { MONTH_NAMES, formatDate } from '../../../src/sim/time';

afterEach(() => {
  setActiveStrings(null);
  setLocale('en');
});

describe('formatGameDate', () => {
  it('equals the Build 2 HUD text in English', () => {
    expect(formatGameDate(450)).toBe('Mar · Year 1 · 09:00');
    for (let tick = 0; tick < 30 * TICKS_PER_MONTH; tick += 997) expect(formatGameDate(tick)).toBe(formatDate(tick));
  });

  it('month names come from the table', () => {
    for (let m = 0; m < 12; m++) expect(monthName(m)).toBe(MONTH_NAMES[m]);
  });

  it('uses the 12 h clock when the table says so', () => {
    setActiveStrings({ ...en, 'date.clock': '12' });
    expect(formatGameDate(0)).toBe('Mar · Year 1 · 12:00 AM');
    expect(formatGameDate(9 * TICKS_PER_HOUR + 25)).toBe('Mar · Year 1 · 9:30 AM');
    expect(formatGameDate(12 * TICKS_PER_HOUR)).toBe('Mar · Year 1 · 12:00 PM');
    expect(formatGameDate(21 * TICKS_PER_HOUR)).toBe('Mar · Year 1 · 9:00 PM');
  });

  it('changes with the locale', () => {
    setLocale('en-XA');
    const s = formatGameDate(450);
    expect(s).not.toBe('Mar · Year 1 · 09:00');
    expect(s).toContain('09:00');
    expect(s).toContain('Ṁåŕ');
    expect(s).toContain('Ýéåŕ 1');
  });
});
