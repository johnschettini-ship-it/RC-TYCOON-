/** Display prefs follow the settings and `prefers-reduced-motion` (Phase 6 §4.7). */
import { afterEach, describe, expect, it } from 'vitest';
import { displayPrefs, resetDisplayPrefs } from '../../../src/a11y/prefs';
import { bindDisplayPrefs, prefsFromSettings, type MotionQuery } from '../../../src/a11y/sync';
import { defaultSettings, memorySettingsStore } from '../../../src/settings';

class FakeQuery implements MotionQuery {
  matches = false;
  private ls: Array<() => void> = [];
  addEventListener(_t: 'change', cb: () => void): void {
    this.ls.push(cb);
  }
  removeEventListener(_t: 'change', cb: () => void): void {
    this.ls = this.ls.filter((l) => l !== cb);
  }
  set(v: boolean): void {
    this.matches = v;
    for (const l of this.ls) l();
  }
}

afterEach(() => resetDisplayPrefs());

describe('prefsFromSettings', () => {
  it('reduced motion: auto follows the system, on and off override it', () => {
    const v = defaultSettings();
    expect(prefsFromSettings(v, false)).toEqual({ reducedMotion: false, highContrast: false, textScale: 100 });
    expect(prefsFromSettings(v, true).reducedMotion).toBe(true);
    expect(prefsFromSettings({ ...v, reducedMotion: 'on' }, false).reducedMotion).toBe(true);
    expect(prefsFromSettings({ ...v, reducedMotion: 'off' }, true).reducedMotion).toBe(false);
  });

  it('copies text scale and high contrast', () => {
    expect(prefsFromSettings({ ...defaultSettings(), textScale: 175, highContrast: true }, false)).toEqual({ reducedMotion: false, highContrast: true, textScale: 175 });
  });
});

describe('bindDisplayPrefs', () => {
  it('sets the prefs now, after every display setting change, and when the system preference changes', () => {
    const store = memorySettingsStore();
    const q = new FakeQuery();
    const seen: boolean[] = [];
    const off = bindDisplayPrefs(store, q, (p) => seen.push(p.reducedMotion));
    expect(displayPrefs()).toEqual({ reducedMotion: false, highContrast: false, textScale: 100 });
    q.set(true);
    expect(displayPrefs().reducedMotion).toBe(true);
    store.set('reducedMotion', 'off');
    expect(displayPrefs().reducedMotion).toBe(false);
    store.set('textScale', 150);
    store.set('highContrast', true);
    expect(displayPrefs()).toEqual({ reducedMotion: false, highContrast: true, textScale: 150 });
    // A setting that is not a display pref does not re-apply.
    const n = seen.length;
    store.set('musicVolume', 10);
    expect(seen.length).toBe(n);
    off();
    store.set('reducedMotion', 'on');
    expect(displayPrefs().reducedMotion).toBe(false);
  });

  it('works without a media query (old browsers): auto means motion on', () => {
    const store = memorySettingsStore();
    bindDisplayPrefs(store, null, () => {});
    expect(displayPrefs().reducedMotion).toBe(false);
  });
});
