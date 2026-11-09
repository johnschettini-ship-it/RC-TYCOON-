/**
 * Display prefs in step with the settings and `prefers-reduced-motion` (Phase 6 §4.7). Owner: W4-F. No DOM: the media
 * query comes in as an object, so tests pass a fake.
 */
import type { SettingKey, SettingsStore, SettingsValues } from '../settings';
import { resolveReducedMotion, setDisplayPrefs, type DisplayPrefs } from './prefs';

/** The parts of `MediaQueryList` the binding uses. */
export interface MotionQuery {
  readonly matches: boolean;
  addEventListener(type: 'change', cb: () => void): void;
  removeEventListener(type: 'change', cb: () => void): void;
}

const DISPLAY_KEYS: readonly SettingKey[] = ['textScale', 'highContrast', 'reducedMotion'];

export function prefsFromSettings(values: Readonly<SettingsValues>, systemPrefersReduced: boolean): DisplayPrefs {
  return {
    reducedMotion: resolveReducedMotion(values.reducedMotion, systemPrefersReduced),
    highContrast: values.highContrast,
    textScale: values.textScale,
  };
}

/**
 * Keep `setDisplayPrefs` in step: now, after each change of a display setting, and when the system preference
 * changes. `apply` runs after each update (the UI root classes). Returns the unbind function.
 */
export function bindDisplayPrefs(store: SettingsStore, query: MotionQuery | null, apply: (p: DisplayPrefs) => void): () => void {
  const update = (): void => {
    const p = prefsFromSettings(store.values, query?.matches ?? false);
    setDisplayPrefs(p);
    apply(p);
  };
  update();
  const offStore = store.onChange((_v, changed) => {
    if (changed.some((k) => DISPLAY_KEYS.includes(k))) update();
  });
  query?.addEventListener('change', update);
  return () => {
    offStore();
    query?.removeEventListener('change', update);
  };
}
