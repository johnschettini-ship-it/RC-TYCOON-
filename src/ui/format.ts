/**
 * Display formatting. Owner: W4-G (Build 1: W1-B). Phase 6 §4.8: grouping and the decimal sign from
 * `Intl.NumberFormat` for the current locale, the currency sign from the string table (`money.format`, "${amount}"
 * in English). English output is the Build 2 text: "$15,000", "$2.50", "−$1,200".
 */
import { temperamentGroup } from '../data/catalog';
import { currentLocale, text } from '../data/strings/index';
import type { Cents } from '../sim/units';

const MINUS = '−';

interface NumberParts {
  whole: Intl.NumberFormat;
  decimal: string;
}

const parts = new Map<string, NumberParts>();

function numberParts(locale: string): NumberParts {
  let p = parts.get(locale);
  if (!p) {
    const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: true });
    const decimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1 }).formatToParts(1.5).find((x) => x.type === 'decimal')?.value ?? '.';
    p = { whole, decimal };
    parts.set(locale, p);
  }
  return p;
}

/** Whole units grouped, then the hundredths when `fraction` is not null: "1,234.05". */
function amountText(units: number, fraction: number | null, locale: string): string {
  const p = numberParts(locale);
  const w = p.whole.format(units);
  return fraction === null ? w : `${w}${p.decimal}${String(fraction).padStart(2, '0')}`;
}

function money(cents: Cents, alwaysCents: boolean, locale: string): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const rest = abs % 100;
  const amount = amountText(Math.floor(abs / 100), alwaysCents || rest !== 0 ? rest : null, locale);
  const body = text('money.format', { amount });
  return neg ? `${MINUS}${body}` : body;
}

/** "$15,000", "$2.50", "−$1,200": cents only when the amount is not whole dollars. */
export function formatMoney(cents: Cents, locale: string = currentLocale()): string {
  return money(cents, false, locale);
}

/** From this many whole dollars the phone pill shows three significant digits with K or M (Task 24). */
const SHORT_FROM = 100_000;
const compact = new Map<string, Intl.NumberFormat>();

/**
 * The upright phone's pill (Task 24): whole dollars below $100,000 ("$19,983"), three significant digits with K or M
 * from there ("$199K", "$1.23M"). Cut, not rounded: the pill never shows more cash than the park has. The full value
 * is in the pill's name and title.
 */
export function formatMoneyShort(cents: Cents, locale: string = currentLocale()): string {
  const neg = cents < 0;
  const dollars = Math.trunc(Math.abs(cents) / 100);
  if (dollars < SHORT_FROM) return money(neg ? -dollars * 100 : dollars * 100, false, locale);
  const step = 10 ** (String(dollars).length - 3);
  let f = compact.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(locale, { notation: 'compact', maximumSignificantDigits: 3 });
    compact.set(locale, f);
  }
  const body = text('money.format', { amount: f.format(Math.trunc(dollars / step) * step) });
  return neg ? `${MINUS}${body}` : body;
}

/** Prices always show cents: "$2.00". */
export function formatPrice(cents: Cents, locale: string = currentLocale()): string {
  return money(cents, true, locale);
}

/** Ratings are integer hundredths: 250 → "2.50". */
export function formatRating(hundredths: number, locale: string = currentLocale()): string {
  const neg = hundredths < 0;
  const abs = Math.abs(Math.round(hundredths));
  const s = amountText(Math.floor(abs / 100), abs % 100, locale);
  return neg ? `-${s}` : s;
}

export interface TemperamentShares {
  chill: number;
  family: number;
  thrill: number;
  total: number;
}

/** Guests per temperament group (master R6). */
export function temperamentShares(guests: ReadonlyArray<{ temperament: number }>): TemperamentShares {
  const s: TemperamentShares = { chill: 0, family: 0, thrill: 0, total: guests.length };
  for (const g of guests) s[temperamentGroup(g.temperament)]++;
  return s;
}

/** Whole percentages that add up to 100 (largest remainder; ties go Chill, Family, Thrill). */
export function sharePercents(s: TemperamentShares): { chill: number; family: number; thrill: number } {
  if (s.total === 0) return { chill: 0, family: 0, thrill: 0 };
  const keys = ['chill', 'family', 'thrill'] as const;
  const exact = keys.map((k) => (s[k] * 100) / s.total);
  const out = exact.map((v) => Math.floor(v));
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = [0, 1, 2].sort((a, b) => (exact[b] as number) - (out[b] as number) - ((exact[a] as number) - (out[a] as number)) || a - b);
  for (const i of order) {
    if (left <= 0) break;
    if ((exact[i] as number) - (out[i] as number) > 0) {
      out[i] = (out[i] as number) + 1;
      left--;
    }
  }
  return { chill: out[0] as number, family: out[1] as number, thrill: out[2] as number };
}
