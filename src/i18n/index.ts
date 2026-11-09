/**
 * Client side of localization (Phase 6 §4.8). Owner: W4-G. Neutral stubs keep the Build 2 output exactly.
 *
 * - `initI18n(game)`: pick the locale (`game.settings.locale`, `auto` = `matchLocale(navigator.languages)`), set
 *   `<html lang>`, and follow settings changes. Missing keys at runtime show English and warn once per id.
 * - `formatGameDate(tick)`: the HUD date with month names and the clock format (12 h / 24 h) from the string table
 *   (the game calendar is not a real calendar). Neutral: `formatDate(tick)` ("Mar · Year 1 · 09:00").
 * - `localizeReason(reason)`: command reasons and warnings are English text from the sim (Build 3 keeps the sim API);
 *   the client maps a reason back to its string id (exact text, or a template with `{…}` placeholders) and shows it
 *   in the current locale. Neutral: the reason as is.
 */
import type { Game } from '../game';
import { formatDate } from '../sim/time';

export function initI18n(game: Game): void {
  void game;
}

export function formatGameDate(tick: number): string {
  return formatDate(tick);
}

export function localizeReason(reason: string): string {
  return reason;
}
