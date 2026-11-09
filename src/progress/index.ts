/**
 * Scenario progress storage (Phase 5 §4.12). Owner: W3-I. Key `tc.progress`, separate from saves: a save never
 * contains progress. Client side (localStorage through the save module's `KeyValueStore`), never imported by `sim/`.
 *
 * Contract:
 * - `read()` validates fully: JSON parses, `format` matches, `version` known, every record has every field with the
 *   right type. Newer version → "Your progress comes from a newer version of the game"; any other failure → "Your
 *   scenario progress could not be read". After a failed read nothing is written until the player resets
 *   (`reset()`, confirm dialog in the UI) and only the start-open scenarios are open. Never fill in missing records.
 * - `recordResult` merges: more stars wins; on a tie the earlier `endMonthIndex`. Records with an older `defVersion`
 *   stay (tagged "earlier version").
 * - `markTutorialDone` sets `tutorialDone`.
 * Stub: reads as empty progress and writes nothing.
 */
import type { Difficulty } from '../data/scenarios/types';
import type { KeyValueStore } from '../save';

export const PROGRESS_KEY = 'tc.progress';
export const PROGRESS_FORMAT = 'thrills-and-chills-progress';
export const PROGRESS_VERSION = 1;

export const ERR_PROGRESS_NEWER = 'Your progress comes from a newer version of the game';
export const ERR_PROGRESS_UNREADABLE = 'Your scenario progress could not be read';

export interface ScenarioBest {
  stars: number;
  endMonthIndex: number;
  /** Cents. */
  parkValue: number;
  rating: number;
  guests: number;
  /** ISO date. */
  completedAt: string;
}

export interface ScenarioProgress {
  defVersion: number;
  best: Partial<Record<Difficulty, ScenarioBest>>;
}

export interface Progress {
  format: typeof PROGRESS_FORMAT;
  version: number;
  scenarios: Record<string, ScenarioProgress>;
  tutorialDone: boolean;
}

export type ProgressRead = { ok: true; progress: Progress } | { ok: false; error: string; raw: string };

export function emptyProgress(): Progress {
  return { format: PROGRESS_FORMAT, version: PROGRESS_VERSION, scenarios: {}, tutorialDone: false };
}

export class ProgressStore {
  constructor(private readonly store: KeyValueStore | null) {}

  /** Stub: empty progress. */
  read(): ProgressRead {
    void this.store;
    return { ok: true, progress: emptyProgress() };
  }

  /** Record a win (once per run: the sim's `progressRecorded` flag guards it). Stub: no-op. */
  recordResult(_scenarioId: string, _defVersion: number, _difficulty: Difficulty, _best: ScenarioBest): void {}

  markTutorialDone(): void {}

  /** Player-confirmed reset after a failed read. Stub: no-op. */
  reset(): void {}
}

/** Scenario ids open for this progress (Phase 5 §4.7: 1–3 at start; 2 wins → 4–6; 4 → 7; 6 → 8). Stub: none. */
export function openScenarioIds(_progress: Progress | null, _unlockAll: boolean): string[] {
  return [];
}
