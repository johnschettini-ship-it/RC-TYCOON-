/**
 * Client side of localization (Phase 6 §4.8). Owner: W4-G.
 *
 * - `initI18n(game)`: pick the locale (`game.settings.locale`; `auto` = `matchLocale(navigator.languages)`), set
 *   `<html lang>`, and follow settings changes. Text built when the UI mounts changes at the next reload; text the
 *   UI rebuilds (HUD date, money, toasts, panels opened later) changes at once. Missing keys at runtime show English
 *   and warn once per id (`setLocale`).
 * - `formatGameDate(tick)`: the HUD date with month names and the clock format (12 h / 24 h) from the string table
 *   (the game calendar is not a real calendar). English: "Mar · Year 1 · 09:00" (the Build 2 text).
 * - `localizeReason(reason)`: command reasons and warnings are English text from the sim (master R27); the client
 *   maps a reason back to its string id (exact text, or a template with `{…}` placeholders) and shows it in the
 *   current locale. Catalog names inside a reason are shown in the current locale too. Unknown text is shown as is.
 */
import type { Game } from '../game';
import { currentLocale, matchLocale, LOCALES, setLocale, t } from '../data/strings/index';
import { clockOf, monthOfYear, yearOf } from '../sim/time';
import { contentIdOfName, contentKey } from '../data/strings/content';
import { exactReasonId, reasonId } from './reasons';

export { reasonId } from './reasons';

/** The locale for a `locale` setting: `auto` follows the browser; an unknown code falls back to English. */
export function resolveLocale(setting: string, preferred: readonly string[]): string {
  if (setting === 'auto') return matchLocale(preferred);
  return LOCALES.some((l) => l.code === setting) ? setting : 'en';
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  const list = navigator.languages;
  if (Array.isArray(list) && list.length > 0) return list;
  return navigator.language ? [navigator.language] : [];
}

function apply(code: string): void {
  setLocale(code);
  if (typeof document !== 'undefined') document.documentElement.lang = currentLocale();
}

export function initI18n(game: Game): void {
  apply(resolveLocale(game.settings.get('locale'), browserLanguages()));
  game.settings.onChange((values, changed) => {
    if (changed.includes('locale')) apply(resolveLocale(values.locale, browserLanguages()));
  });
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** Month name from the string table; `month` 0 = March … 11 = February (`monthOfYear`). */
export function monthName(month: number): string {
  return t(`date.month.${month}`);
}

/** The clock in the table's format: "21:30" (24 h) or "9:30 PM" (12 h). */
export function formatClock(tick: number): string {
  const { hour, minute } = clockOf(tick);
  if (t('date.clock') === '12') {
    const h = hour % 12 === 0 ? 12 : hour % 12;
    return t('date.time12', { h, mm: pad2(minute), ampm: t(hour < 12 ? 'date.am' : 'date.pm') });
  }
  return t('date.time24', { hh: pad2(hour), mm: pad2(minute) });
}

export function formatGameDate(tick: number): string {
  return t('date.full', { month: monthName(monthOfYear(tick)), year: yearOf(tick), time: formatClock(tick) });
}

export function localizeReason(reason: string): string {
  if (currentLocale() === 'en') return reason;
  const m = reasonId(reason);
  if (!m) return reason;
  const params = { ...m.params };
  for (const [k, v] of Object.entries(params)) {
    if (typeof v !== 'string') continue;
    const inner = exactReasonId(v);
    if (inner) {
      params[k] = t(inner);
      continue;
    }
    // A catalog name inside a reason ("Test failed: train stopped on piece 4 (Steep Slope Up)") is shown in the
    // current locale too (`content.<id>`, Build 3 gate).
    const content = contentIdOfName(v);
    if (content !== undefined) params[k] = t(contentKey(content));
  }
  return t(m.id, params);
}
