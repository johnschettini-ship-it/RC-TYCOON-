/**
 * Settings defaults and validation (Phase 6 §4.9). Owner: integrator (contract). Validated like saves: exact format
 * and version, every value present with the right type and range, no unknown values, nothing filled in.
 */
import { VOLUME_DEFAULTS } from '../data/tuning/audio';
import type { SettingKey, SettingsValues } from './types';

export const SETTINGS_KEY = 'tc.settings';
export const SETTINGS_FORMAT = 'thrills-and-chills-settings';
/** Version this build writes and reads. A newer version is unreadable (never silently replaced). */
export const SETTINGS_VERSION = 1;

/** Player-facing notice for unreadable settings (Phase 6 §4.9). The detail goes to the console. */
export const SETTINGS_UNREADABLE = 'Settings could not be read';

type Check = (v: unknown) => boolean;

const isBool: Check = (v) => typeof v === 'boolean';
const intIn =
  (min: number, max: number): Check =>
  (v) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const oneOf =
  (values: readonly unknown[]): Check =>
  (v) =>
    values.includes(v);
/** `auto`, or a BCP 47-like code (`en`, `en-XA`, `pt-BR`). Unknown codes fall back to English at runtime (W4-G). */
const LOCALE_RE = /^(?:auto|[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?)$/;
const isLocale: Check = (v) => typeof v === 'string' && LOCALE_RE.test(v);

const volume = intIn(0, 100);

/** One entry per setting: its check and its built-in default. Key order is the stored order. */
export const SETTING_SPECS: { readonly [K in SettingKey]: { check: Check; fallback: SettingsValues[K] } } = {
  masterVolume: { check: volume, fallback: VOLUME_DEFAULTS.master },
  musicVolume: { check: volume, fallback: VOLUME_DEFAULTS.music },
  sfxVolume: { check: volume, fallback: VOLUME_DEFAULTS.sfx },
  ambienceVolume: { check: volume, fallback: VOLUME_DEFAULTS.ambience },
  uiVolume: { check: volume, fallback: VOLUME_DEFAULTS.ui },
  muteAll: { check: isBool, fallback: false },
  textScale: { check: oneOf([100, 125, 150, 175]), fallback: 100 },
  highContrast: { check: isBool, fallback: false },
  reducedMotion: { check: oneOf(['auto', 'on', 'off']), fallback: 'auto' },
  renderQuality: { check: oneOf(['auto', 'high', 'low']), fallback: 'auto' },
  perfOverlay: { check: isBool, fallback: false },
  panSpeed: { check: intIn(50, 200), fallback: 100 },
  edgeScrolling: { check: isBool, fallback: false },
  longPressMs: { check: oneOf([400, 500, 700]), fallback: 500 },
  locale: { check: isLocale, fallback: 'auto' },
  autosave: { check: isBool, fallback: true },
  confirmDemolish: { check: isBool, fallback: false },
  unlockAllScenarios: { check: isBool, fallback: false },
  offlinePlay: { check: isBool, fallback: true },
};

export const SETTING_KEYS = Object.keys(SETTING_SPECS) as SettingKey[];

/** Built-in defaults (first run, Reset settings). Default values keep the Build 2 behaviour. */
export function defaultSettings(): SettingsValues {
  const out = {} as Record<SettingKey, unknown>;
  for (const k of SETTING_KEYS) out[k] = SETTING_SPECS[k].fallback;
  return out as SettingsValues;
}

/** True when `value` is allowed for `key`. */
export function isValidSetting<K extends SettingKey>(key: K, value: unknown): value is SettingsValues[K] {
  const spec = SETTING_SPECS[key] as { check: Check } | undefined;
  return spec !== undefined && spec.check(value);
}

export type SettingsParse = { ok: true; values: SettingsValues } | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Parse and check a stored settings document. `error` is a short technical reason (for the console). */
export function parseSettings(json: string): SettingsParse {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'not JSON' };
  }
  if (!isRecord(raw)) return { ok: false, error: 'not an object' };
  for (const k of Object.keys(raw)) if (k !== 'format' && k !== 'version' && k !== 'values') return { ok: false, error: `unknown field ${k}` };
  if (raw.format !== SETTINGS_FORMAT) return { ok: false, error: 'wrong format' };
  const version = raw.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, error: 'bad version' };
  if (version > SETTINGS_VERSION) return { ok: false, error: 'newer version' };
  const values = raw.values;
  if (!isRecord(values)) return { ok: false, error: 'bad values' };
  for (const k of Object.keys(values)) if (!Object.prototype.hasOwnProperty.call(SETTING_SPECS, k)) return { ok: false, error: `unknown setting ${k}` };
  const out = {} as Record<SettingKey, unknown>;
  for (const k of SETTING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(values, k)) return { ok: false, error: `missing setting ${k}` };
    if (!isValidSetting(k, values[k])) return { ok: false, error: `bad value at ${k}` };
    out[k] = values[k];
  }
  return { ok: true, values: out as SettingsValues };
}

/** The stored text for `values` (keys in `SETTING_KEYS` order). */
export function serializeSettings(values: SettingsValues): string {
  const ordered = {} as Record<SettingKey, unknown>;
  for (const k of SETTING_KEYS) ordered[k] = values[k];
  return JSON.stringify({ format: SETTINGS_FORMAT, version: SETTINGS_VERSION, values: ordered });
}
