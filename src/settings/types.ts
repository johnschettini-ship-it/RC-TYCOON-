/**
 * Player settings (Phase 6 §4.9). Owner: integrator (contract). Settings are not game state: they live in
 * `localStorage` under `tc.settings`, never in saves, and the simulation never reads them.
 * Adding a setting: add it here, to `SETTING_SPECS` (`./schema.ts`) with its default and check. Version 1 has shipped,
 * so a new setting also bumps `SETTINGS_VERSION` and adds a migration in `parseSettings` for every older version,
 * so settings stored by an earlier build stay readable.
 */

export type TextScale = 100 | 125 | 150 | 175;
export type ReducedMotionSetting = 'auto' | 'on' | 'off';
export type RenderQuality = 'auto' | 'high' | 'low';
export type LongPressMs = 400 | 500 | 700;

export interface SettingsValues {
  // ---- Audio (W4-A reads) ----
  /** 0–100. */
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  /** Interface sounds. */
  uiVolume: number;
  muteAll: boolean;
  // ---- Display (W4-F; render quality and the performance overlay: W4-E) ----
  textScale: TextScale;
  highContrast: boolean;
  /** `auto` follows `prefers-reduced-motion`. */
  reducedMotion: ReducedMotionSetting;
  renderQuality: RenderQuality;
  perfOverlay: boolean;
  // ---- Controls (W4-F) ----
  /** Pan speed in percent of the Build 1 speed, 50–200. */
  panSpeed: number;
  /** Desktop only. */
  edgeScrolling: boolean;
  longPressMs: LongPressMs;
  // ---- Language (W4-G) ----
  /** `auto` = `navigator.language` matched to the available locales; else a locale code such as `en` or `en-XA`. */
  locale: string;
  // ---- Gameplay ----
  autosave: boolean;
  confirmDemolish: boolean;
  /** Short tips (Phase 7; labelled "Tips" since the mascots were removed in Task 23, key kept). Added in version 2. */
  mascotTips: boolean;
  unlockAllScenarios: boolean;
  // ---- Offline (Phase 6 §4.10, W4-G) ----
  offlinePlay: boolean;
}

export type SettingKey = keyof SettingsValues;

/** The stored document (Phase 6 §4.9). */
export interface SettingsDocument {
  format: 'thrills-and-chills-settings';
  version: number;
  values: SettingsValues;
}
