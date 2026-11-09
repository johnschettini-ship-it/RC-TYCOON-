/**
 * Settings store (Phase 6 §4.9). Owner: integrator (contract; real body). One store per page, held by `Game`.
 *
 * - First run (nothing stored): built-in defaults; nothing is written until a setting changes.
 * - Unreadable stored settings (bad JSON, wrong format, newer version, missing, unknown, or bad value): `problem`
 *   is "Settings could not be read" (the UI shows it with **Reset settings**). Until the player resets, the game
 *   uses defaults in memory, changes stay in memory, and the stored text is never overwritten.
 * - A failed write (storage full or blocked) keeps the new values in memory and sets `writeFailed`.
 * Listeners run after every change with the keys that changed.
 */
import type { KeyValueStore } from '../save';
import { defaultSettings, isValidSetting, parseSettings, serializeSettings, SETTING_KEYS, SETTINGS_KEY, SETTINGS_UNREADABLE } from './schema';
import type { SettingKey, SettingsValues } from './types';

export type SettingsListener = (values: Readonly<SettingsValues>, changed: readonly SettingKey[]) => void;

export class SettingsStore {
  private current: SettingsValues;
  private readError: string | null = null;
  private readDetail: string | null = null;
  private failedWrite = false;
  private listeners: SettingsListener[] = [];

  constructor(private readonly storage: KeyValueStore | null) {
    this.current = defaultSettings();
    if (storage === null) return;
    let text: string | null;
    try {
      text = storage.getItem(SETTINGS_KEY);
    } catch {
      // Blocked storage: defaults in memory, nothing to protect.
      return;
    }
    if (text === null) return;
    const parsed = parseSettings(text);
    if (parsed.ok) {
      this.current = parsed.values;
    } else {
      this.readError = SETTINGS_UNREADABLE;
      this.readDetail = parsed.error;
    }
  }

  /** The values in use (read-only view; change them with `set`, `update`, or `reset`). */
  get values(): Readonly<SettingsValues> {
    return this.current;
  }

  get<K extends SettingKey>(key: K): SettingsValues[K] {
    return this.current[key];
  }

  /** "Settings could not be read" while stored settings are unreadable and not reset; else null. */
  get problem(): string | null {
    return this.readError;
  }

  /** Technical reason for `problem` (console only). */
  get problemDetail(): string | null {
    return this.readDetail;
  }

  /** True when the last write to storage failed. */
  get writeFailed(): boolean {
    return this.failedWrite;
  }

  /** Change one setting. False (and no change) when the value is not allowed. */
  set<K extends SettingKey>(key: K, value: SettingsValues[K]): boolean {
    return this.update({ [key]: value } as Partial<SettingsValues>);
  }

  /** Change several settings at once. False (and no change at all) when any value is not allowed. */
  update(patch: Partial<SettingsValues>): boolean {
    const keys = Object.keys(patch) as SettingKey[];
    for (const k of keys) if (!isValidSetting(k, patch[k])) return false;
    const changed = keys.filter((k) => this.current[k] !== patch[k]);
    if (changed.length === 0) return true;
    this.current = { ...this.current, ...patch };
    this.write();
    this.notify(changed);
    return true;
  }

  /** Reset settings: defaults, written to storage (this also clears an unreadable-settings problem). */
  reset(): void {
    const before = this.current;
    this.current = defaultSettings();
    this.readError = null;
    this.readDetail = null;
    this.write();
    this.notify(SETTING_KEYS.filter((k) => before[k] !== this.current[k]));
  }

  /** Subscribe to changes. Returns the unsubscribe function. */
  onChange(cb: SettingsListener): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private write(): void {
    if (this.storage === null || this.readError !== null) return;
    try {
      this.storage.setItem(SETTINGS_KEY, serializeSettings(this.current));
      this.failedWrite = false;
    } catch {
      this.failedWrite = true;
    }
  }

  private notify(changed: readonly SettingKey[]): void {
    if (changed.length === 0) return;
    for (const l of this.listeners) l(this.current, changed);
  }
}

/** A store with no persistence (tests, `new Game(world)` without a store). */
export function memorySettingsStore(): SettingsStore {
  return new SettingsStore(null);
}
