/** Settings store (Phase 6 §4.9): `tc.settings`, versioned, strict, never silently reset. Wave 4.0 contract. */
import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../../src/save';
import {
  defaultSettings,
  parseSettings,
  serializeSettings,
  SETTING_KEYS,
  SETTINGS_KEY,
  SETTINGS_UNREADABLE,
  SettingsStore,
  type SettingKey,
} from '../../../src/settings';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  writes = 0;
  failWrites = false;
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('quota');
    this.writes += 1;
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const doc = (patch: (d: any) => void = () => {}): string => {
  const d = JSON.parse(serializeSettings(defaultSettings()));
  patch(d);
  return JSON.stringify(d);
};

describe('settings defaults (Phase 6 §4.9, §8)', () => {
  it('volumes 80 / 50 / 80 / 60 / 70, Build 2 behaviour everywhere else', () => {
    expect(defaultSettings()).toEqual({
      masterVolume: 80,
      musicVolume: 50,
      sfxVolume: 80,
      ambienceVolume: 60,
      uiVolume: 70,
      muteAll: false,
      textScale: 100,
      highContrast: false,
      reducedMotion: 'auto',
      renderQuality: 'auto',
      perfOverlay: false,
      panSpeed: 100,
      edgeScrolling: false,
      longPressMs: 500,
      locale: 'auto',
      autosave: true,
      confirmDemolish: false,
      unlockAllScenarios: false,
      offlinePlay: true,
    });
  });

  it('the stored document has the format, version 1, and every value', () => {
    const raw = JSON.parse(serializeSettings(defaultSettings()));
    expect(Object.keys(raw)).toEqual(['format', 'version', 'values']);
    expect(raw.format).toBe('thrills-and-chills-settings');
    expect(raw.version).toBe(1);
    expect(Object.keys(raw.values)).toEqual(SETTING_KEYS);
  });
});

describe('settings validation (like saves: no defaults filled in)', () => {
  const cases: Array<[string, string, string]> = [
    ['bad JSON', '{"format":', 'not JSON'],
    ['not an object', '[1]', 'not an object'],
    ['wrong format', doc((d) => (d.format = 'other')), 'wrong format'],
    ['newer version', doc((d) => (d.version = 2)), 'newer version'],
    ['version 0', doc((d) => (d.version = 0)), 'bad version'],
    ['unknown top field', doc((d) => (d.extra = 1)), 'unknown field extra'],
    ['missing value', doc((d) => delete d.values.musicVolume), 'missing setting musicVolume'],
    ['unknown value', doc((d) => (d.values.colourMode = 'x')), 'unknown setting colourMode'],
    ['volume out of range', doc((d) => (d.values.sfxVolume = 101)), 'bad value at sfxVolume'],
    ['volume not an integer', doc((d) => (d.values.sfxVolume = 50.5)), 'bad value at sfxVolume'],
    ['text scale not offered', doc((d) => (d.values.textScale = 110)), 'bad value at textScale'],
    ['long press not offered', doc((d) => (d.values.longPressMs = 450)), 'bad value at longPressMs'],
    ['bad locale', doc((d) => (d.values.locale = 'English')), 'bad value at locale'],
    ['bad bool', doc((d) => (d.values.muteAll = 'yes')), 'bad value at muteAll'],
  ];
  for (const [name, json, error] of cases) {
    it(`rejects ${name}`, () => {
      expect(parseSettings(json)).toEqual({ ok: false, error });
    });
  }

  it('accepts every offered value', () => {
    const r = parseSettings(doc((d) => Object.assign(d.values, { textScale: 175, reducedMotion: 'on', renderQuality: 'low', longPressMs: 700, locale: 'en-XA', panSpeed: 200, masterVolume: 0 })));
    expect(r.ok).toBe(true);
  });
});

describe('SettingsStore', () => {
  it('first run: defaults, nothing written until a change', () => {
    const mem = new MemoryStore();
    const s = new SettingsStore(mem);
    expect(s.values).toEqual(defaultSettings());
    expect(s.problem).toBeNull();
    expect(mem.writes).toBe(0);
    expect(s.set('musicVolume', 20)).toBe(true);
    expect(mem.writes).toBe(1);
    expect(new SettingsStore(mem).get('musicVolume')).toBe(20);
  });

  it('a change persists and notifies listeners with the changed keys only', () => {
    const mem = new MemoryStore();
    const s = new SettingsStore(mem);
    const seen: SettingKey[][] = [];
    const off = s.onChange((_v, changed) => seen.push([...changed]));
    s.update({ muteAll: true, textScale: 125, masterVolume: 80 });
    s.set('muteAll', true); // no change, no write, no call
    off();
    s.set('muteAll', false);
    expect(seen).toEqual([['muteAll', 'textScale']]);
    expect(mem.writes).toBe(2);
  });

  it('an invalid value changes nothing (whole patch refused)', () => {
    const mem = new MemoryStore();
    const s = new SettingsStore(mem);
    expect(s.update({ muteAll: true, sfxVolume: 500 })).toBe(false);
    expect(s.values).toEqual(defaultSettings());
    expect(mem.writes).toBe(0);
  });

  it('unreadable settings: notice, defaults in memory, stored text kept until Reset settings', () => {
    const mem = new MemoryStore();
    const bad = doc((d) => (d.version = 9));
    mem.data.set(SETTINGS_KEY, bad);
    const s = new SettingsStore(mem);
    expect(s.problem).toBe(SETTINGS_UNREADABLE);
    expect(s.problem).toBe('Settings could not be read');
    expect(s.problemDetail).toBe('newer version');
    expect(s.values).toEqual(defaultSettings());
    // Changes stay in memory; the stored data is never overwritten silently.
    expect(s.set('musicVolume', 10)).toBe(true);
    expect(s.get('musicVolume')).toBe(10);
    expect(mem.data.get(SETTINGS_KEY)).toBe(bad);
    expect(mem.writes).toBe(0);
    // The player picks Reset settings.
    s.reset();
    expect(s.problem).toBeNull();
    expect(s.values).toEqual(defaultSettings());
    expect(parseSettings(mem.data.get(SETTINGS_KEY)!)).toEqual({ ok: true, values: defaultSettings() });
  });

  it('a failed write keeps the value in memory and reports it', () => {
    const mem = new MemoryStore();
    mem.failWrites = true;
    const s = new SettingsStore(mem);
    expect(s.set('uiVolume', 5)).toBe(true);
    expect(s.get('uiVolume')).toBe(5);
    expect(s.writeFailed).toBe(true);
  });

  it('no storage at all: defaults in memory, changes work', () => {
    const s = new SettingsStore(null);
    expect(s.set('highContrast', true)).toBe(true);
    expect(s.get('highContrast')).toBe(true);
    expect(s.problem).toBeNull();
  });
});
