/**
 * Active-locale lookup behind `text()` (Phase 6 §4.8). Owner: integrator (contract; real body).
 * With no active table (the default) `text()` behaves exactly as in Build 2. The localization card (W4-G) sets the
 * active table when the player picks a language; ids the active table lacks fall back to English and report to the
 * missing handler (W4-G logs a warning once per id). Imports nothing, so `en.ts` and `index.ts` can both use it.
 */
import type { StringParams, StringTable } from './types';

let active: StringTable | null = null;
let onMissing: ((id: string) => void) | null = null;

/** The table `text()` reads first, or null for English only. */
export function setActiveStrings(table: StringTable | null): void {
  active = table;
}

export function activeStrings(): StringTable | null {
  return active;
}

/** Called with an id the active table lacks but English has. */
export function setMissingStringHandler(fn: ((id: string) => void) | null): void {
  onMissing = fn;
}

/** The text for `id`: the active table, else `fallback` (English), else undefined. */
export function lookupString(id: string, fallback: StringTable): string | undefined {
  if (active !== null) {
    const v = active[id];
    if (v !== undefined) return v;
    const en = fallback[id];
    if (en !== undefined && onMissing !== null) onMissing(id);
    return en;
  }
  return fallback[id];
}

/** Replace `{name}` placeholders; unknown names stay as written. */
export function fillParams(raw: string, params: StringParams): string {
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] === undefined ? `{${k}}` : String(params[k])));
}
