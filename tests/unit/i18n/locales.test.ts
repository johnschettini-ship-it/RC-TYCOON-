/**
 * Locale completeness (Phase 6 §4.8, §9): CI blocks any shipped locale with a missing key or a placeholder mismatch.
 * The pseudo-locale `en-XA` (master R28) is accented, at least 30% longer, and keeps every placeholder.
 */
import { describe, expect, it } from 'vitest';
import { en } from '../../../src/data/strings/en';
import { LOCALES } from '../../../src/data/strings/index';
import { offlineStrings, FORMAT_KEYS } from '../../../src/data/strings/offline';
import { enPlurals } from '../../../src/data/strings/plurals';
import { pseudoLocalize } from '../../../src/data/strings/en-XA';
import type { LocaleDef, PluralForms } from '../../../src/data/strings/types';

const PLACEHOLDER = /\{(\w+)\}/g;
const placeholders = (s: string): string[] => [...s.matchAll(PLACEHOLDER)].map((m) => m[1] as string).sort();
const FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

/** Every problem with a locale table against English: missing or extra keys, placeholder mismatches. */
function problems(def: LocaleDef): string[] {
  const out: string[] = [];
  for (const id of Object.keys(en)) {
    const v = def.strings[id];
    if (v === undefined) {
      out.push(`${def.code}: missing ${id}`);
      continue;
    }
    const allowed = FORMAT_KEYS[id];
    if (allowed) {
      if (!allowed.includes(v)) out.push(`${def.code}: ${id} must be one of ${allowed.join(', ')}`);
      continue;
    }
    if (placeholders(v).join() !== placeholders(en[id] as string).join()) out.push(`${def.code}: placeholders differ at ${id}`);
  }
  for (const id of Object.keys(def.strings)) if (en[id] === undefined) out.push(`${def.code}: unknown key ${id}`);
  for (const [id, forms] of Object.entries(enPlurals)) {
    const tr: PluralForms | undefined = def.plurals[id];
    if (!tr) {
      out.push(`${def.code}: missing plural ${id}`);
      continue;
    }
    const want = placeholders(forms.other).join();
    for (const f of FORMS) {
      const v = tr[f];
      if (v !== undefined && placeholders(v).join() !== want) out.push(`${def.code}: placeholders differ at ${id}.${f}`);
    }
  }
  for (const id of Object.keys(def.plurals)) if (enPlurals[id] === undefined) out.push(`${def.code}: unknown plural ${id}`);
  return out;
}

describe('shipped locales (Phase 6 §4.8)', () => {
  it('English first, then the pseudo-locale en-XA (master R28)', () => {
    expect(LOCALES.map((l) => l.code)).toEqual(['en', 'en-XA']);
    for (const l of LOCALES) expect(l.name.length).toBeGreaterThan(0);
  });

  it('every locale has every key with the same placeholders as English', () => {
    expect(LOCALES.flatMap(problems)).toEqual([]);
  });

  it('the completeness check catches a missing key, an extra key, and a placeholder mismatch', () => {
    const base = LOCALES[1] as LocaleDef;
    const strings: Record<string, string> = { ...base.strings, 'zz.extra': 'x', 'ui.slot.label': 'Slot' };
    delete strings['ui.hud.cash'];
    const broken: LocaleDef = { ...base, code: 'xx', strings, plurals: {} };
    expect(problems(broken)).toEqual(['xx: missing ui.hud.cash', 'xx: placeholders differ at ui.slot.label', 'xx: unknown key zz.extra', 'xx: missing plural hud.guests']);
  });

  it('plural keys never repeat a string id', () => {
    for (const id of Object.keys(enPlurals)) expect(en[id], id).toBeUndefined();
  });

  it('English plurals have an other form with the {n} placeholder', () => {
    for (const [id, forms] of Object.entries(enPlurals)) expect(forms.other, id).toContain('{n}');
  });
});

describe('pseudo-locale en-XA (Phase 6 §4.8)', () => {
  const xa = LOCALES.find((l) => l.code === 'en-XA') as LocaleDef;

  it('accents every letter and keeps placeholders, digits, and symbols', () => {
    expect(pseudoLocalize('Slot {n}')).toMatch(/^\[Šļöţ \{n\}.*\]$/u);
    expect(pseudoLocalize('${amount}')).toMatch(/^\[\$\{amount\}.*\]$/u);
    expect(pseudoLocalize('')).toBe('');
  });

  it('every string is at least 30% longer than English and has no plain ASCII letters outside placeholders', () => {
    for (const [id, v] of Object.entries(en)) {
      const p = xa.strings[id] as string;
      if (FORMAT_KEYS[id]) {
        expect(p, id).toBe(v);
        continue;
      }
      if (v === '') continue;
      expect(p.length, id).toBeGreaterThanOrEqual(Math.ceil(v.length * 1.3));
      expect(p.replace(PLACEHOLDER, ''), id).not.toMatch(/[A-Za-z]/);
    }
  });

  it('plural forms are pseudo-localized too', () => {
    expect(xa.plurals['hud.guests']?.one).toBe(pseudoLocalize('{n} guest'));
    expect(xa.plurals['hud.guests']?.other).toBe(pseudoLocalize('{n} guests'));
  });

  it('is generated from English, so a new English key is covered at once', () => {
    expect(Object.keys(xa.strings).sort()).toEqual(Object.keys(en).sort());
  });
});

describe('localization strings (master R4)', () => {
  it('no final period; spec texts are exact', () => {
    for (const [id, v] of Object.entries(offlineStrings)) expect(/\.$/.test(v), `${id}: "${v}"`).toBe(false);
    expect(offlineStrings['offline.updateReady']).toBe('Update ready');
    expect(offlineStrings['offline.reload']).toBe('Reload');
    expect(offlineStrings['offline.later']).toBe('Later');
    expect(offlineStrings['money.format']).toBe('${amount}');
  });
});
