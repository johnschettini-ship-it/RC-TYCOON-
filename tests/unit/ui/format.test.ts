import { afterEach, describe, expect, it } from 'vitest';
import { en } from '../../../src/data/strings/en';
import { setLocale } from '../../../src/data/strings/index';
import { setActiveStrings } from '../../../src/data/strings/resolve';
import { formatMoney, formatPrice, formatRating, sharePercents, temperamentShares } from '../../../src/ui/format';

afterEach(() => {
  setActiveStrings(null);
  setLocale('en');
});

describe('money formatting (integer cents)', () => {
  it('shows whole dollars without cents and other amounts with two decimals', () => {
    expect(formatMoney(1_500_000)).toBe('$15,000');
    expect(formatMoney(250)).toBe('$2.50');
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(123_456_789)).toBe('$1,234,567.89');
    expect(formatMoney(-120_000)).toBe('−$1,200');
    expect(formatMoney(-5)).toBe('−$0.05');
  });

  it('prices always show two decimals', () => {
    expect(formatPrice(200)).toBe('$2.00');
    expect(formatPrice(1250)).toBe('$12.50');
    expect(formatPrice(0)).toBe('$0.00');
  });

  it('ratings are hundredths shown as 0.00–10.00', () => {
    expect(formatRating(250)).toBe('2.50');
    expect(formatRating(1000)).toBe('10.00');
    expect(formatRating(5)).toBe('0.05');
  });
});

describe('money and numbers follow the locale (Phase 6 §4.8)', () => {
  it('the currency sign comes from money.format', () => {
    setActiveStrings({ ...en, 'money.format': '{amount} ¤' });
    expect(formatMoney(1_500_000)).toBe('15,000 ¤');
    expect(formatMoney(-250)).toBe('−2.50 ¤');
    expect(formatPrice(200)).toBe('2.00 ¤');
  });

  it('the pseudo-locale wraps money and keeps the digits', () => {
    setLocale('en-XA');
    expect(formatMoney(1_500_000)).toMatch(/^\[\$15,000 .+\]$/u);
    expect(formatMoney(-120_000)).toMatch(/^−\[\$1,200 .+\]$/u);
    expect(formatPrice(250)).toMatch(/^\[\$2\.50 .+\]$/u);
    expect(formatRating(250)).toBe('2.50');
  });

  it('grouping and the decimal sign come from Intl.NumberFormat', () => {
    // A locale with other separators, read through the same code path as the shipped ones.
    expect(formatMoney(123_456_789, 'de')).toBe('$1.234.567,89');
    expect(formatPrice(1250, 'de')).toBe('$12,50');
    expect(formatRating(250, 'de')).toBe('2,50');
    expect(formatMoney(123_456_789)).toBe('$1,234,567.89');
  });
});

describe('Thrill/Chill balance (master R6 groups)', () => {
  it('counts Chill ≤ 35, Family 36–64, Thrill ≥ 65', () => {
    const s = temperamentShares([{ temperament: 0 }, { temperament: 35 }, { temperament: 36 }, { temperament: 64 }, { temperament: 65 }, { temperament: 100 }]);
    expect(s).toEqual({ chill: 2, family: 2, thrill: 2, total: 6 });
  });

  it('percentages always add up to 100 (largest remainder)', () => {
    expect(sharePercents({ chill: 1, family: 1, thrill: 1, total: 3 })).toEqual({ chill: 34, family: 33, thrill: 33 });
    expect(sharePercents({ chill: 1, family: 0, thrill: 3, total: 4 })).toEqual({ chill: 25, family: 0, thrill: 75 });
  });

  it('no guests gives all zeros', () => {
    expect(sharePercents(temperamentShares([]))).toEqual({ chill: 0, family: 0, thrill: 0 });
  });
});
