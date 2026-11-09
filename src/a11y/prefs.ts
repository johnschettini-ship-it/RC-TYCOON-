/**
 * Display preferences every client module reads (Phase 6 §4.7): reduced motion, high contrast, text scale.
 * Owner: integrator (contract; real body). W4-F keeps them in step with the settings store and
 * `prefers-reduced-motion` (`setDisplayPrefs`); the renderer, layers (W4-C fireworks and beams, W4-E guest bobbing),
 * audio, and UI read `displayPrefs()` each frame. Defaults keep the Build 2 behaviour.
 */
import type { ReducedMotionSetting, TextScale } from '../settings/types';

export interface DisplayPrefs {
  /** Camera inertia, UI transitions, guest bobbing, beam sweeps, and firework bursts off. */
  reducedMotion: boolean;
  /** Thicker outlines, darker panel backgrounds. */
  highContrast: boolean;
  textScale: TextScale;
}

const DEFAULT_PREFS: DisplayPrefs = Object.freeze({ reducedMotion: false, highContrast: false, textScale: 100 });

let prefs: DisplayPrefs = DEFAULT_PREFS;

export function displayPrefs(): Readonly<DisplayPrefs> {
  return prefs;
}

export function setDisplayPrefs(next: DisplayPrefs): void {
  prefs = Object.freeze({ ...next });
}

/** Back to the defaults (tests). */
export function resetDisplayPrefs(): void {
  prefs = DEFAULT_PREFS;
}

/** Phase 6 §4.7: follows `prefers-reduced-motion` unless the setting overrides it. */
export function resolveReducedMotion(setting: ReducedMotionSetting, systemPrefersReduced: boolean): boolean {
  return setting === 'on' || (setting === 'auto' && systemPrefersReduced);
}
