/**
 * Locale choice, switching, plurals, and missing keys (Phase 6 §4.8, §9).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { en, text } from '../../../src/data/strings/en';
import { currentLocale, formatNumber, matchLocale, missingStringWarner, pluralCategory, pluralForm, setLocale, t } from '../../../src/data/strings/index';
import { pseudoLocalize } from '../../../src/data/strings/en-XA';
import { setActiveStrings, setMissingStringHandler } from '../../../src/data/strings/resolve';
import { initI18n, resolveLocale } from '../../../src/i18n';
import { Game } from '../../../src/game';
import { makeTestWorld } from '../../helpers/world';

afterEach(() => {
  setLocale('en');
  vi.restoreAllMocks();
});

describe('language choice (Phase 6 §4.8)', () => {
  it('matches navigator languages exactly or by language part, else English', () => {
    expect(matchLocale(['en-US'])).toBe('en');
    expect(matchLocale(['EN'])).toBe('en');
    expect(matchLocale(['de-DE', 'fr'])).toBe('en');
    expect(matchLocale(['de-DE', 'en-GB'])).toBe('en');
    expect(matchLocale([])).toBe('en');
  });

  it('the pseudo-locale is chosen only by its exact code', () => {
    expect(matchLocale(['en-xa'])).toBe('en-XA');
    expect(matchLocale(['en-XB'])).toBe('en');
  });

  it('the setting overrides the browser; auto follows it; an unknown code falls back to English', () => {
    expect(resolveLocale('auto', ['en-AU'])).toBe('en');
    expect(resolveLocale('en-XA', ['en-AU'])).toBe('en-XA');
    expect(resolveLocale('en', ['en-XA'])).toBe('en');
    expect(resolveLocale('pt-BR', ['en-XA'])).toBe('en');
  });
});

describe('setLocale', () => {
  it('switches text() and t() and refuses unknown codes', () => {
    expect(setLocale('en-XA')).toBe(true);
    expect(currentLocale()).toBe('en-XA');
    expect(text('ui.hud.cash')).toBe(pseudoLocalize(en['ui.hud.cash'] as string));
    expect(t('ui.slot.label', { n: 2 })).toMatch(/^\[Šļöţ 2 /u);
    expect(setLocale('xx')).toBe(false);
    expect(currentLocale()).toBe('en-XA');
    expect(setLocale('en')).toBe(true);
    expect(text('ui.hud.cash')).toBe(en['ui.hud.cash']);
  });
});

describe('plurals (Intl.PluralRules)', () => {
  it('gives every CLDR category', () => {
    expect([0, 1, 2, 3, 11, 100].map((n) => pluralCategory(n, 'ar'))).toEqual(['zero', 'one', 'two', 'few', 'many', 'other']);
    expect([1, 2, 5, 22, 25].map((n) => pluralCategory(n, 'pl'))).toEqual(['one', 'few', 'many', 'few', 'many']);
    expect([1, 2, 0].map((n) => pluralCategory(n, 'en'))).toEqual(['one', 'other', 'other']);
    expect(pluralCategory(1, 'ja')).toBe('other');
  });

  it('picks the form of the category and falls back to other', () => {
    const forms = { zero: 'z', one: 'o', two: 't', few: 'f', many: 'm', other: 'x' };
    expect([0, 1, 2, 3, 11, 100].map((n) => pluralForm(forms, n, 'ar')).join('')).toBe('zotfmx');
    expect(pluralForm({ other: 'x' }, 1, 'en')).toBe('x');
  });

  it('t() fills plural strings by n', () => {
    expect(t('hud.guests', { n: 1 })).toBe('1 guest');
    expect(t('hud.guests', { n: 0 })).toBe('0 guests');
    expect(t('hud.guests', { n: 42 })).toBe('42 guests');
    expect(t('hud.guests')).toBe('{n} guests');
    setLocale('en-XA');
    expect(t('hud.guests', { n: 1 })).toBe(pseudoLocalize('{n} guest').replace('{n}', '1'));
  });
});

describe('missing keys at runtime (Phase 6 §4.8)', () => {
  it('show the English text and warn once per id', () => {
    const warn = vi.fn();
    setMissingStringHandler(missingStringWarner(warn));
    setActiveStrings({ 'ui.hud.cash': 'Kasse' });
    try {
      expect(text('ui.hud.cash')).toBe('Kasse');
      expect(text('ui.slot.label', { n: 1 })).toBe('Slot 1');
      expect(text('ui.slot.label', { n: 2 })).toBe('Slot 2');
      expect(text('ui.hud.rating')).toBe(en['ui.hud.rating']);
    } finally {
      setActiveStrings(null);
      setMissingStringHandler(null);
    }
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toContain('ui.slot.label');
  });

  it('setLocale installs the warning for non-English locales', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setLocale('en-XA');
    expect(text('no.such.key')).toBe('no.such.key');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('numbers', () => {
  it('group by the locale', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    setLocale('en-XA');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });
});

describe('initI18n', () => {
  it('applies the setting, sets <html lang>, and follows setting changes', () => {
    const doc = { documentElement: { lang: '' } };
    vi.stubGlobal('document', doc);
    vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' });
    try {
      const game = new Game(makeTestWorld());
      game.settings.set('locale', 'en-XA');
      initI18n(game);
      expect(currentLocale()).toBe('en-XA');
      expect(doc.documentElement.lang).toBe('en-XA');
      game.settings.set('locale', 'auto');
      expect(currentLocale()).toBe('en');
      expect(doc.documentElement.lang).toBe('en');
      game.settings.set('locale', 'en-XA');
      expect(doc.documentElement.lang).toBe('en-XA');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
