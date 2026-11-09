/**
 * Localization (Phase 6 §4.8). Owner: W4-G. No runtime dependency: `Intl.PluralRules` and `Intl.NumberFormat` only.
 * Signatures are a contract. Bodies work for English now (the only locale until W4-G adds `en-XA`); "neutral"
 * marks bodies W4-G replaces.
 *
 * - `t(key, params)`: plural forms by `params.n` when the key is a plural, else the string (`text()` semantics:
 *   active locale, then English, then the id itself).
 * - `setLocale(code)` switches the active table (`./resolve.ts`) for both `t` and `text`; unknown codes are refused.
 * - Adding a language: copy `en.ts` to `<code>.ts`, translate, keep placeholders, register it in `LOCALES`, run
 *   `npm test` (completeness and placeholder test, W4-G), check screens at 175% text scale.
 */
import { en, text } from './en';
import { enPlurals } from './plurals';
import { fillParams, setActiveStrings } from './resolve';
import type { LocaleDef, PluralForms, PluralTable, StringParams } from './types';

export type { LocaleDef, PluralForms, PluralTable, StringParams, StringTable } from './types';
export { text } from './en';

/** Every locale the game ships, English first (the fallback). */
export const LOCALES: readonly LocaleDef[] = [{ code: 'en', name: 'English', strings: en, plurals: enPlurals }];

let current: LocaleDef = LOCALES[0] as LocaleDef;

export function currentLocale(): string {
  return current.code;
}

/** Switch the language (Settings → Language, or the detected one). False for an unknown code. */
export function setLocale(code: string): boolean {
  const def = LOCALES.find((l) => l.code === code);
  if (!def) return false;
  current = def;
  setActiveStrings(def.code === 'en' ? null : def.strings);
  return true;
}

/**
 * Phase 6 §4.8 language choice: the first of `preferred` (e.g. `navigator.languages`) that matches a locale exactly
 * or by its language part; else English. Neutral: English.
 */
export function matchLocale(preferred: readonly string[]): string {
  void preferred;
  return 'en';
}

const pluralRules = new Map<string, Intl.PluralRules>();

/** CLDR plural category of `n` in the current (or given) locale. */
export function pluralCategory(n: number, locale: string = current.code): Intl.LDMLPluralRule {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules.select(n);
}

function pluralOf(key: string): PluralForms | undefined {
  return current.plurals[key] ?? enPlurals[key];
}

/** Resolve a string id (Phase 6 §4.8). Plural keys need a numeric `n` (the `other` form otherwise). */
export function t(key: string, params?: StringParams): string {
  const forms = pluralOf(key);
  if (forms) {
    const n = params?.n;
    const form = typeof n === 'number' ? (forms[pluralCategory(n)] ?? forms.other) : forms.other;
    return params ? fillParams(form, params) : form;
  }
  return text(key, params);
}

/** Grouped number in the current locale ("12,345"). */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat(current.code).format(n);
}
