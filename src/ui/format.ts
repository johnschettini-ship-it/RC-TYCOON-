/** Display formatting. Owner: W1-B. Pure and locale-independent. */
import { temperamentGroup } from '../data/catalog';
import type { Cents } from '../sim/units';

const MINUS = '−';

function groupThousands(n: number): string {
  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return out;
}

/** "$15,000", "$2.50", "−$1,200": cents only when the amount is not whole dollars. */
export function formatMoney(cents: Cents): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  const body = `$${groupThousands(dollars)}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`;
  return neg ? `${MINUS}${body}` : body;
}

/** Prices always show cents: "$2.00". */
export function formatPrice(cents: Cents): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const body = `$${groupThousands(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, '0')}`;
  return neg ? `${MINUS}${body}` : body;
}

/** Ratings are integer hundredths: 250 → "2.50". */
export function formatRating(hundredths: number): string {
  return (hundredths / 100).toFixed(2);
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
