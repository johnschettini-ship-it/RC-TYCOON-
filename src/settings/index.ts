/** Settings (Phase 6 §4.9). Owner: integrator (contract). The settings screen is W4-F (`src/ui/settings/`). */
export * from './types';
export {
  SETTINGS_FORMAT,
  SETTINGS_KEY,
  SETTINGS_UNREADABLE,
  SETTINGS_VERSION,
  SETTING_KEYS,
  SETTING_SPECS,
  defaultSettings,
  isValidSetting,
  parseSettings,
  serializeSettings,
  type SettingsParse,
} from './schema';
export { SettingsStore, memorySettingsStore, type SettingsListener } from './store';
