/**
 * Localization (Phase 6 §4.8). Owner: W4-G. No runtime dependency: `Intl.PluralRules` and `Intl.NumberFormat` only.
 * Signatures are a contract.
 *
 * - `t(key, params)`: plural forms by `params.n` when the key is a plural, else the string (`text()` semantics:
 *   active locale, then English, then the id itself).
 * - `setLocale(code)` switches the active table (`./resolve.ts`) for both `t` and `text`; unknown codes are refused.
 *   An id the locale lacks shows the English text and logs one warning per id.
 * - Locales in Build 3 (master R28): English and the pseudo-locale `en-XA` (`./en-XA.ts`, generated from English).
 * - Adding a language: copy `en.ts` to `<code>.ts`, translate, keep placeholders, register it in `LOCALES`, run
 *   `npm test` (completeness and placeholder test, `tests/unit/i18n/locales.test.ts`), check screens at 175% text
 *   scale.
 */
import { en, text } from './en';
import { enXA } from './en-XA';
import { enPlurals } from './plurals';
import { fillParams, setActiveStrings, setMissingStringHandler } from './resolve';
import type { LocaleDef, PluralForms, PluralTable, StringParams } from './types';

export type { LocaleDef, PluralForms, PluralTable, StringParams, StringTable } from './types';
export { text } from './en';

/** Every locale the game ships, English first (the fallback). */
export const LOCALES: readonly LocaleDef[] = [{ code: 'en', name: 'English', strings: en, plurals: enPlurals }, enXA];

/** Pseudo-locales (`-XA`, `-XB` regions) are only chosen on purpose, never by a language-part match. */
const isPseudo = (code: string): boolean => /-X[AB]$/i.test(code);

let current: LocaleDef = LOCALES[0] as LocaleDef;

export function currentLocale(): string {
  return current.code;
}

/** A missing-id handler that logs one warning per id (Phase 6 §4.8 "show the English text and log a warning"). */
export function missingStringWarner(warn: (message: string) => void): (id: string) => void {
  const warned = new Set<string>();
  return (id) => {
    if (warned.has(id)) return;
    warned.add(id);
    warn(`Missing string "${id}" in locale ${current.code}; showing English`);
  };
}

const warnMissing = missingStringWarner((m) => console.warn(m));

/** Switch the language (Settings → Language, or the detected one). False for an unknown code. */
export function setLocale(code: string): boolean {
  const def = LOCALES.find((l) => l.code === code);
  if (!def) return false;
  current = def;
  const english = def.code === 'en';
  setActiveStrings(english ? null : def.strings);
  setMissingStringHandler(english ? null : warnMissing);
  return true;
}

/**
 * Phase 6 §4.8 language choice: the first of `preferred` (e.g. `navigator.languages`) that matches a locale exactly
 * (ignoring case) or by its language part (`en-GB` → `en`); else English. Pseudo-locales match only exactly.
 */
export function matchLocale(preferred: readonly string[]): string {
  for (const tag of preferred) {
    if (typeof tag !== 'string' || tag === '') continue;
    const lower = tag.toLowerCase();
    const exact = LOCALES.find((l) => l.code.toLowerCase() === lower);
    if (exact) return exact.code;
    const lang = lower.split('-')[0] as string;
    const byLanguage = LOCALES.find((l) => !isPseudo(l.code) && l.code.toLowerCase() === lang) ?? LOCALES.find((l) => !isPseudo(l.code) && l.code.toLowerCase().split('-')[0] === lang);
    if (byLanguage) return byLanguage.code;
  }
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

/** The form for `n` in `locale`: its CLDR category, else `other`. */
export function pluralForm(forms: PluralForms, n: number, locale: string = current.code): string {
  return forms[pluralCategory(n, locale)] ?? forms.other;
}

function pluralOf(key: string): PluralForms | undefined {
  const own = current.plurals[key];
  if (own) return own;
  const english = enPlurals[key];
  if (english && current.code !== 'en') warnMissing(key);
  return english;
}

/** Resolve a string id (Phase 6 §4.8). Plural keys need a numeric `n` (the `other` form otherwise). */
export function t(key: string, params?: StringParams): string {
  const forms = pluralOf(key);
  if (forms) {
    const n = params?.n;
    const form = typeof n === 'number' ? pluralForm(forms, n) : forms.other;
    return params ? fillParams(form, params) : form;
  }
  return text(key, params);
}

const numberFormats = new Map<string, Intl.NumberFormat>();

/** Grouped number in the current locale ("12,345"). */
export function formatNumber(n: number): string {
  let f = numberFormats.get(current.code);
  if (!f) {
    f = new Intl.NumberFormat(current.code);
    numberFormats.set(current.code, f);
  }
  return f.format(n);
}
