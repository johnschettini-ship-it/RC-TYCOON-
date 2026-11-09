/**
 * Settings screen (Phase 6 §4.9, §7). Owner: W4-F. Neutral stub: nothing mounted (the title keeps its Build 2
 * settings view until W4-F replaces it).
 *
 * Contract: side tabs on desktop, a full-screen sheet with a section list on phone, 44 px slider thumbs; sections
 * Audio, Display, Controls, Language (the locale list from `LOCALES`, W4-G), Gameplay, Data (export all saves, export
 * / import / reset progress with confirm), About (version, credits, originality statement, license). Every control
 * writes through `game.settings`. While `game.settings.problem` is set, a notice shows it with **Reset settings**.
 * Opened from the title screen and the in-game menu (W4-F owns both).
 */
import type { UiContext } from '../context';
import type { UiExtension } from '../extensions';

/** Open the settings screen at `section` (default: the first). Neutral: does nothing. */
export function openSettingsScreen(ctx: UiContext, section?: string): void {
  void ctx;
  void section;
}

export const settingsUi: UiExtension = {};
