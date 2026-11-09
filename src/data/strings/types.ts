/**
 * String table types (Phase 6 §4.8). Owner: integrator (contract).
 * A table maps dotted ids to strings with `{name}` placeholders. Plural strings live in a separate table per locale
 * (`./plurals.ts`), so every existing `Record<string, string>` table and `text()` keep working unchanged.
 */

/** `Intl.PluralRules` categories; `other` is required. */
export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

export type StringParams = Record<string, string | number>;
export type StringTable = Readonly<Record<string, string>>;
export type PluralTable = Readonly<Record<string, PluralForms>>;

/** One locale: its strings and plurals. A missing id falls back to English (and warns, W4-G). */
export interface LocaleDef {
  /** BCP 47 code: `en`, `en-XA`. */
  code: string;
  /** The language's own name (settings list). */
  name: string;
  strings: StringTable;
  plurals: PluralTable;
}
