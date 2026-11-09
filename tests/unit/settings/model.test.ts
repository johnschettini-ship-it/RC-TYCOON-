/** Settings screen model (Phase 6 §4.9, §7): sections, controls, labels, and writes through the store. */
import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../../src/save';
import { isValidSetting, SETTING_KEYS, SETTINGS_KEY, SettingsStore, type SettingKey } from '../../../src/settings';
import { applySetting, settingsNotice, settingsSections, type ControlSpec } from '../../../src/ui/settings/model';
import { settingsStrings } from '../../../src/data/strings/settings';
import { text } from '../../../src/data/strings/en';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const LOCALES = [{ code: 'en', name: 'English' }];
const sections = (desktop = true) => settingsSections({ locales: LOCALES, version: '3.0.0', desktop });
const controls = (desktop = true): ControlSpec[] => sections(desktop).flatMap((s) => s.controls);
const settingKeyOf = (c: ControlSpec): SettingKey | null => ('key' in c ? c.key : null);

describe('settings sections (Phase 6 §4.9 table)', () => {
  it('lists the 7 sections in order with their titles', () => {
    expect(sections().map((s) => s.id)).toEqual(['audio', 'display', 'controls', 'language', 'gameplay', 'data', 'about']);
    expect(sections().map((s) => s.title)).toEqual(['Audio', 'Display', 'Controls', 'Language', 'Gameplay', 'Data', 'About']);
  });

  it('every setting has exactly one control (edge scrolling only on desktop)', () => {
    const keys = controls().flatMap((c) => settingKeyOf(c) ?? []);
    expect([...keys].sort()).toEqual([...SETTING_KEYS].sort());
    expect(new Set(keys).size).toBe(keys.length);
    const phone = controls(false).flatMap((c) => settingKeyOf(c) ?? []);
    expect(phone).not.toContain('edgeScrolling');
    expect(phone.length).toBe(SETTING_KEYS.length - 1);
  });

  it('the sections hold the §4.9 settings', () => {
    const keysOf = (id: string): string[] => sections().find((s) => s.id === id)?.controls.flatMap((c) => settingKeyOf(c) ?? []) ?? [];
    expect(keysOf('audio')).toEqual(['masterVolume', 'musicVolume', 'sfxVolume', 'ambienceVolume', 'uiVolume', 'muteAll']);
    expect(keysOf('display')).toEqual(['textScale', 'highContrast', 'reducedMotion', 'renderQuality', 'perfOverlay']);
    expect(keysOf('controls')).toEqual(['panSpeed', 'edgeScrolling', 'longPressMs']);
    expect(keysOf('language')).toEqual(['locale']);
    expect(keysOf('gameplay')).toEqual(['autosave', 'confirmDemolish', 'unlockAllScenarios', 'offlinePlay']);
    const data = sections().find((s) => s.id === 'data')?.controls.map((c) => (c.kind === 'action' ? c.id : c.kind));
    expect(data).toEqual(['exportSaves', 'exportProgress', 'importProgress', 'resetProgress']);
    const about = sections().find((s) => s.id === 'about')?.controls.map((c) => (c.kind === 'info' ? c.id : c.kind));
    expect(about).toEqual(['version', 'credits', 'originality', 'license']);
  });

  it('every control has a label; sliders and choices offer only valid values', () => {
    for (const c of controls()) {
      expect(c.label.trim().length, JSON.stringify(c)).toBeGreaterThan(0);
      if (c.kind === 'slider') {
        expect(isValidSetting(c.key, c.min)).toBe(true);
        expect(isValidSetting(c.key, c.max)).toBe(true);
        expect(isValidSetting(c.key, c.min - 1)).toBe(false);
        expect(isValidSetting(c.key, c.max + 1)).toBe(false);
      }
      if (c.kind === 'choice') {
        expect(c.options.length).toBeGreaterThan(1);
        for (const o of c.options) {
          expect(isValidSetting(c.key, o.value), `${c.key} ${String(o.value)}`).toBe(true);
          expect(o.label.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('choices follow the spec: text scale 100–175%, reduced motion auto/on/off, quality auto/high/low, long press 400/500/700 ms', () => {
    const choice = (key: SettingKey): unknown[] => {
      const c = controls().find((x) => x.kind === 'choice' && x.key === key);
      return c && c.kind === 'choice' ? c.options.map((o) => o.value) : [];
    };
    expect(choice('textScale')).toEqual([100, 125, 150, 175]);
    expect(choice('reducedMotion')).toEqual(['auto', 'on', 'off']);
    expect(choice('renderQuality')).toEqual(['auto', 'high', 'low']);
    expect(choice('longPressMs')).toEqual([400, 500, 700]);
    expect(choice('locale')).toEqual(['auto', 'en']);
  });

  it('the scenario unlock switch keeps its Build 2 test id; About shows the version', () => {
    const unlock = controls().find((c) => c.kind === 'toggle' && c.key === 'unlockAllScenarios');
    expect(unlock?.kind === 'toggle' ? unlock.testId : null).toBe('title-unlock-all');
    const version = controls().find((c) => c.kind === 'info' && c.id === 'version');
    expect(version?.kind === 'info' ? version.value : '').toBe('3.0.0');
  });

  it('settings strings have no final period (master R4) and keep the spec texts', () => {
    for (const [k, v] of Object.entries(settingsStrings)) {
      expect(k.startsWith('settings.'), k).toBe(true);
      expect(/\.$/.test(v), `${k}: "${v}"`).toBe(false);
    }
    expect(text('settings.unreadable')).toBe('Settings could not be read');
    expect(text('settings.reset')).toBe('Reset settings');
  });
});

describe('the screen writes through the store', () => {
  it('a control change is stored in tc.settings; a bad value changes nothing', () => {
    const mem = new MemoryStore();
    const store = new SettingsStore(mem);
    expect(applySetting(store, 'musicVolume', 35)).toBe(true);
    expect(store.get('musicVolume')).toBe(35);
    expect(JSON.parse(mem.data.get(SETTINGS_KEY) ?? '{}').values.musicVolume).toBe(35);
    expect(applySetting(store, 'musicVolume', 101)).toBe(false);
    expect(applySetting(store, 'textScale', 110)).toBe(false);
    expect(store.get('musicVolume')).toBe(35);
    expect(applySetting(store, 'textScale', 175)).toBe(true);
    expect(store.get('textScale')).toBe(175);
  });

  it('unreadable settings show the notice with Reset settings; changes stay in memory until the reset', () => {
    const mem = new MemoryStore();
    mem.data.set(SETTINGS_KEY, '{"format":"thrills-and-chills-settings","version":1,"values":{}}');
    const store = new SettingsStore(mem);
    expect(settingsNotice(store)).toEqual({ message: 'Settings could not be read', action: 'Reset settings' });
    applySetting(store, 'sfxVolume', 10);
    expect(store.get('sfxVolume')).toBe(10);
    expect(mem.data.get(SETTINGS_KEY)).toBe('{"format":"thrills-and-chills-settings","version":1,"values":{}}');
    store.reset();
    expect(settingsNotice(store)).toBeNull();
    expect(JSON.parse(mem.data.get(SETTINGS_KEY) ?? '{}').values.sfxVolume).toBe(80);
  });

  it('a readable store has no notice', () => {
    expect(settingsNotice(new SettingsStore(new MemoryStore()))).toBeNull();
  });
});
