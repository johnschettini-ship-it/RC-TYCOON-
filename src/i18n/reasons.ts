/**
 * Reason → string id (master R27). Owner: W4-G. Command reasons and warnings are English text from the simulation;
 * this index maps a reason back to the id of the same English text: an exact match first, else a template match
 * (`{name}` placeholders capture the filled-in values). Built once from the English table.
 */
import { en } from '../data/strings/en';
import type { StringParams } from '../data/strings/types';

export interface ReasonMatch {
  id: string;
  params: StringParams;
}

interface Template {
  id: string;
  re: RegExp;
  names: string[];
  /** Letters outside placeholders: more literal text = a more specific template, tried first. */
  weight: number;
}

interface ReasonIndex {
  exact: Map<string, string>;
  templates: Template[];
}

const PLACEHOLDER = /\{(\w+)\}/g;
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let index: ReasonIndex | null = null;

function build(): ReasonIndex {
  const exact = new Map<string, string>();
  const templates: Template[] = [];
  // `reason.*` ids first: when two ids share an English text, the reason id names it.
  const ids = Object.keys(en);
  const ordered = [...ids.filter((id) => id.startsWith('reason.')), ...ids.filter((id) => !id.startsWith('reason.'))];
  for (const id of ordered) {
    const value = en[id] as string;
    if (value === '') continue;
    if (!exact.has(value)) exact.set(value, id);
    const names = [...value.matchAll(PLACEHOLDER)].map((m) => m[1] as string);
    if (names.length === 0) continue;
    const literal = value.replace(PLACEHOLDER, '');
    const weight = (literal.match(/[A-Za-z]/g) ?? []).length;
    // A template of placeholders and punctuation only would match any text.
    if (weight < 3) continue;
    const source = value
      .split(/\{\w+\}/)
      .map(escapeRe)
      .join('([\\s\\S]+?)');
    templates.push({ id, re: new RegExp(`^${source}$`), names, weight });
  }
  // Stable: equal weights keep table order (reason ids first).
  templates.sort((a, b) => b.weight - a.weight);
  return { exact, templates };
}

/** The string id and parameters of an English reason, or null when no table has it. */
export function reasonId(reason: string): ReasonMatch | null {
  index ??= build();
  const id = index.exact.get(reason);
  if (id !== undefined) return { id, params: {} };
  for (const tpl of index.templates) {
    const m = tpl.re.exec(reason);
    if (!m) continue;
    const params: StringParams = {};
    tpl.names.forEach((name, i) => {
      if (params[name] === undefined) params[name] = m[i + 1] as string;
    });
    return { id: tpl.id, params };
  }
  return null;
}

/** The id of a text that is exactly a `reason.*` entry (a reason inside a reason, such as "skipped: {reason}"). */
export function exactReasonId(text: string): string | null {
  index ??= build();
  const id = index.exact.get(text);
  return id !== undefined && id.startsWith('reason.') ? id : null;
}
