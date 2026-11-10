/**
 * Settings screen model (Phase 6 §4.9, §7). Owner: W4-F. Pure: which sections and controls the screen shows, their
 * labels and allowed values. Every control writes through `game.settings` (`applySetting`); nothing else stores
 * settings.
 */
import { text } from '../../data/strings/en';
import { LONG_PRESS_OPTIONS_MS, TEXT_SCALES } from '../../data/tuning/a11y';
import type { SettingKey, SettingsStore, SettingsValues } from '../../settings';
import { isValidSetting } from '../../settings';

export type SettingsSectionId = 'audio' | 'display' | 'controls' | 'language' | 'gameplay' | 'data' | 'about';
export const SETTINGS_SECTIONS: readonly SettingsSectionId[] = ['audio', 'display', 'controls', 'language', 'gameplay', 'data', 'about'];

type KeysOf<T> = { [K in SettingKey]: SettingsValues[K] extends T ? K : never }[SettingKey];
export type NumberKey = KeysOf<number>;
export type BoolKey = KeysOf<boolean>;

export type DataAction = 'exportSaves' | 'exportProgress' | 'importProgress' | 'resetProgress';
export type InfoId = 'version' | 'credits' | 'originality' | 'license' | 'reloadHint';

export type ControlSpec =
  | { kind: 'slider'; key: NumberKey; label: string; min: number; max: number; step: number; unit: 'percent' | 'number' }
  | { kind: 'toggle'; key: BoolKey; label: string; detail?: string; testId?: string }
  | { kind: 'choice'; key: SettingKey; label: string; options: Array<{ value: string | number; label: string }> }
  | { kind: 'action'; id: DataAction; label: string; detail?: string; danger?: boolean }
  | { kind: 'info'; id: InfoId; label: string; value: string };

export interface SectionSpec {
  id: SettingsSectionId;
  title: string;
  controls: ControlSpec[];
}

export interface SectionOptions {
  /** Locales to list (W4-G's `LOCALES`), English first. */
  locales: ReadonlyArray<{ code: string; name: string }>;
  /** `GAME_VERSION`. */
  version: string;
  /** Desktop layout: Edge scrolling is a desktop setting. */
  desktop: boolean;
}

const volume = (key: NumberKey, id: string): ControlSpec => ({ kind: 'slider', key, label: text(`settings.audio.${id}`), min: 0, max: 100, step: 1, unit: 'percent' });
const toggle = (key: BoolKey, id: string, extra: { detail?: string; testId?: string } = {}): ControlSpec => ({ kind: 'toggle', key, label: text(id), ...extra });

export function settingsSections(opts: SectionOptions): SectionSpec[] {
  const s = (id: SettingsSectionId, controls: ControlSpec[]): SectionSpec => ({ id, title: text(`settings.section.${id}`), controls });
  return [
    s('audio', [
      volume('masterVolume', 'master'),
      volume('musicVolume', 'music'),
      volume('sfxVolume', 'sfx'),
      volume('ambienceVolume', 'ambience'),
      volume('uiVolume', 'ui'),
      toggle('muteAll', 'settings.audio.mute'),
    ]),
    s('display', [
      { kind: 'choice', key: 'textScale', label: text('settings.display.textScale'), options: TEXT_SCALES.map((v) => ({ value: v, label: text('settings.percent', { n: v }) })) },
      toggle('highContrast', 'settings.display.highContrast', { detail: text('settings.display.highContrastDetail') }),
      {
        kind: 'choice',
        key: 'reducedMotion',
        label: text('settings.display.reducedMotion'),
        options: (['auto', 'on', 'off'] as const).map((v) => ({ value: v, label: text(`settings.motion.${v}`) })),
      },
      {
        kind: 'choice',
        key: 'renderQuality',
        label: text('settings.display.quality'),
        options: (['auto', 'high', 'low'] as const).map((v) => ({ value: v, label: text(`settings.quality.${v}`) })),
      },
      toggle('perfOverlay', 'settings.display.perfOverlay', { detail: text('settings.display.perfOverlayDetail') }),
    ]),
    s('controls', [
      { kind: 'slider', key: 'panSpeed', label: text('settings.controls.panSpeed'), min: 50, max: 200, step: 10, unit: 'percent' },
      ...(opts.desktop ? [toggle('edgeScrolling', 'settings.controls.edgeScrolling', { detail: text('settings.controls.edgeScrollingDetail') })] : []),
      {
        kind: 'choice',
        key: 'longPressMs',
        label: text('settings.controls.longPress'),
        options: LONG_PRESS_OPTIONS_MS.map((v) => ({ value: v, label: text('settings.ms', { n: v }) })),
      },
    ]),
    s('language', [
      {
        kind: 'choice',
        key: 'locale',
        label: text('settings.language.locale'),
        options: [{ value: 'auto', label: text('lang.auto') }, ...opts.locales.map((l) => ({ value: l.code, label: l.name }))],
      },
      { kind: 'info', id: 'reloadHint', label: text('settings.language.note'), value: text('lang.reloadHint') },
    ]),
    s('gameplay', [
      toggle('autosave', 'settings.gameplay.autosave', { detail: text('settings.gameplay.autosaveDetail') }),
      toggle('confirmDemolish', 'settings.gameplay.confirmDemolish', { detail: text('settings.gameplay.confirmDemolishDetail') }),
      toggle('mascotTips', 'settings.gameplay.mascotTips', { detail: text('settings.gameplay.mascotTipsDetail') }),
      toggle('unlockAllScenarios', 'prog.settings.unlockAll', { detail: text('prog.settings.unlockAllDetail'), testId: 'title-unlock-all' }),
      toggle('offlinePlay', 'settings.gameplay.offline', { detail: text('settings.gameplay.offlineDetail') }),
    ]),
    s('data', [
      { kind: 'action', id: 'exportSaves', label: text('settings.data.exportSaves'), detail: text('settings.data.exportSavesDetail') },
      { kind: 'action', id: 'exportProgress', label: text('settings.data.exportProgress') },
      { kind: 'action', id: 'importProgress', label: text('settings.data.importProgress') },
      { kind: 'action', id: 'resetProgress', label: text('settings.data.resetProgress'), danger: true },
    ]),
    s('about', [
      { kind: 'info', id: 'version', label: text('settings.about.version'), value: opts.version },
      { kind: 'info', id: 'credits', label: text('settings.about.credits'), value: `${text('prog.credits.text')}. ${text('prog.credits.mascots')}` },
      { kind: 'info', id: 'originality', label: text('settings.about.originality'), value: text('settings.about.originalityText') },
      { kind: 'info', id: 'license', label: text('settings.about.license'), value: text('settings.about.licenseText') },
    ]),
  ];
}

/** Write one setting through the store. False (and no change) when the value is not allowed. */
export function applySetting(store: SettingsStore, key: SettingKey, value: unknown): boolean {
  if (!isValidSetting(key, value)) return false;
  return store.set(key, value);
}

/** The unreadable-settings notice (Phase 6 §4.9), or null when the stored settings were read. */
export function settingsNotice(store: SettingsStore): { message: string; action: string } | null {
  return store.problem === null ? null : { message: store.problem, action: text('settings.reset') };
}
