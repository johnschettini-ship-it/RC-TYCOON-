/**
 * Owner: W4-G. Pseudo-locale `en-XA` (Phase 6 §4.8, master R28): English with every letter accented, at least 30%
 * longer, wrapped in `[ … ]`, placeholders intact. It is generated from `en` when the module loads, so it always
 * covers every string id. Layout tests use it to find clipped text; e2e tests use it to find hard-coded UI text
 * (plain ASCII letters on screen did not come from the string table).
 */
import { en } from './en';
import { FORMAT_KEYS } from './offline';
import { enPlurals } from './plurals';
import type { LocaleDef, PluralForms, PluralTable, StringTable } from './types';

/** One UTF-16 unit per letter, so accenting keeps the length. */
const ACCENTED: Readonly<Record<string, string>> = {
  a: 'å', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ',
  n: 'ñ', o: 'ö', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'û', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Å', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Î', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ',
  N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Û', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

/** Accented filler words that make each string longer (word breaks included, so wrapping is tested too). */
const FILLER = 'ļöŕéɱ îþšûɱ ðöļöŕ šîţ åɱéţ çöñšéçţéţûŕ åðîþîšçîñĝ éļîţ ';

const PLACEHOLDER = /(\{\w+\})/;

function accent(s: string): string {
  let out = '';
  for (const ch of s) out += ACCENTED[ch] ?? ch;
  return out;
}

/** "Slot {n}" → "[Šļöţ {n} ļö]": at least 30% longer than the English text; the empty string stays empty. */
export function pseudoLocalize(s: string): string {
  if (s === '') return s;
  const body = s
    .split(PLACEHOLDER)
    .map((part, i) => (i % 2 === 1 ? part : accent(part)))
    .join('');
  // "[" + body + " " + filler + "]".
  const need = Math.max(1, Math.ceil(s.length * 1.3) - body.length - 3);
  let filler = '';
  while (filler.length < need) filler += FILLER;
  filler = filler.slice(0, need);
  if (filler.endsWith(' ')) filler = `${filler.slice(0, -1)}ļ`;
  return `[${body} ${filler}]`;
}

function pseudoTable(table: StringTable): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, v] of Object.entries(table)) out[id] = FORMAT_KEYS[id] ? v : pseudoLocalize(v);
  return out;
}

function pseudoPlurals(table: PluralTable): Record<string, PluralForms> {
  const out: Record<string, PluralForms> = {};
  for (const [id, forms] of Object.entries(table)) {
    const p: PluralForms = { other: pseudoLocalize(forms.other) };
    for (const f of ['zero', 'one', 'two', 'few', 'many'] as const) {
      const v = forms[f];
      if (v !== undefined) p[f] = pseudoLocalize(v);
    }
    out[id] = p;
  }
  return out;
}

export const enXA: LocaleDef = {
  code: 'en-XA',
  name: 'Pseudo-English',
  strings: pseudoTable(en),
  plurals: pseudoPlurals(enPlurals),
};
