/**
 * Scenario progress storage (Phase 5 §4.12). Owner: W3-I. Key `tc.progress`, separate from saves: a save never
 * contains progress. Client side (localStorage through the save module's `KeyValueStore`), never imported by `sim/`.
 *
 * - `read()` validates fully: JSON parses, `format` matches, `version` known, every record has every field with the
 *   right type (and no unknown fields). Newer version → "Your progress comes from a newer version of the game"; any
 *   other failure → "Your scenario progress could not be read". After a failed read nothing is written until the
 *   player resets (`reset()`, confirm dialog in the UI) and only the start-open scenarios are open. Missing records are
 *   never filled in. A missing key is a first run: empty progress, nothing written.
 * - `recordResult` re-reads the stored data (another tab may have written), then merges: more stars wins; on a tie
 *   the earlier `endMonthIndex`; on a full tie the stored record stays. Records with an older `defVersion` stay as
 *   they are (tagged "earlier version" in the UI); a win on a newer version starts that scenario's record afresh,
 *   because results of different scenario versions cannot be compared.
 * - `markTutorialDone` sets `tutorialDone`.
 * - `importRaw` (Settings → Data, Phase 6 §4.9) stores a progress file the player picked. It runs the same check as
 *   `read()` and gives the same errors; a refused file changes nothing (not the stored text, not the last read, and
 *   never a silent reset). A file that passes replaces the stored progress, even after a failed read (the player's
 *   choice, like `reset()`).
 */
import { SCENARIOS, type Difficulty } from '../data/scenarios';
import { UNLOCK_WINS } from '../data/tuning/scenario';
import type { KeyValueStore } from '../save';
import { scenarioResult, type ScenarioResult } from '../sim/scenario/api';
import type { ScenarioRun } from '../sim/scenario/types';
import type { SimEvent, World } from '../sim/types';

export const PROGRESS_KEY = 'tc.progress';
export const PROGRESS_FORMAT = 'thrills-and-chills-progress';
export const PROGRESS_VERSION = 1;

export const ERR_PROGRESS_NEWER = 'Your progress comes from a newer version of the game';
export const ERR_PROGRESS_UNREADABLE = 'Your scenario progress could not be read';

export const DIFFICULTIES: readonly Difficulty[] = ['relaxed', 'standard', 'tough'];

export interface ScenarioBest {
  /** 1–3. */
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

/**
 * Result of `ProgressStore.importRaw`: stored; refused by the check (`error` is the load message); or the file passed
 * but the device refused the write (no storage, or `setItem` threw).
 */
export type ProgressImport =
  | { ok: true; progress: Progress }
  | { ok: false; reason: 'invalid'; error: string }
  | { ok: false; reason: 'storage' };

export function emptyProgress(): Progress {
  return { format: PROGRESS_FORMAT, version: PROGRESS_VERSION, scenarios: {}, tutorialDone: false };
}

// ------------------------------------------------------------------ validation

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const hasExactly = (o: Rec, keys: readonly string[]): boolean => {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
};

const BEST_KEYS = ['stars', 'endMonthIndex', 'parkValue', 'rating', 'guests', 'completedAt'] as const;

function validBest(v: unknown): v is ScenarioBest {
  if (!isRecord(v) || !hasExactly(v, BEST_KEYS)) return false;
  return (
    isInt(v.stars) && v.stars >= 1 && v.stars <= 3 &&
    isInt(v.endMonthIndex) && v.endMonthIndex >= 0 &&
    isInt(v.parkValue) &&
    isInt(v.rating) && v.rating >= 0 && v.rating <= 1000 &&
    isInt(v.guests) && v.guests >= 0 &&
    typeof v.completedAt === 'string'
  );
}

function validScenario(v: unknown): v is ScenarioProgress {
  if (!isRecord(v) || !hasExactly(v, ['defVersion', 'best'])) return false;
  if (!isInt(v.defVersion) || v.defVersion < 1 || !isRecord(v.best)) return false;
  for (const [k, b] of Object.entries(v.best)) {
    if (!(DIFFICULTIES as readonly string[]).includes(k) || !validBest(b)) return false;
  }
  return true;
}

/** Parse and validate stored progress (Phase 5 §4.12). Never fills in anything. */
export function parseProgress(raw: string): ProgressRead {
  const bad: ProgressRead = { ok: false, error: ERR_PROGRESS_UNREADABLE, raw };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return bad;
  }
  if (!isRecord(data) || data.format !== PROGRESS_FORMAT || !isInt(data.version)) return bad;
  if (data.version > PROGRESS_VERSION) return { ok: false, error: ERR_PROGRESS_NEWER, raw };
  if (data.version !== PROGRESS_VERSION) return bad;
  if (!hasExactly(data, ['format', 'version', 'scenarios', 'tutorialDone'])) return bad;
  if (typeof data.tutorialDone !== 'boolean' || !isRecord(data.scenarios)) return bad;
  for (const s of Object.values(data.scenarios)) if (!validScenario(s)) return bad;
  return { ok: true, progress: data as unknown as Progress };
}

// ------------------------------------------------------------------ merge rule

/** `a` beats the stored `b`: more stars; on a tie the earlier end month. */
export function isBetterResult(a: ScenarioBest, b: ScenarioBest): boolean {
  if (a.stars !== b.stars) return a.stars > b.stars;
  return a.endMonthIndex < b.endMonthIndex;
}

function merged(p: Progress, id: string, defVersion: number, difficulty: Difficulty, best: ScenarioBest): Progress {
  const old = p.scenarios[id];
  const entry: ScenarioProgress = old && old.defVersion === defVersion ? { defVersion, best: { ...old.best } } : { defVersion, best: {} };
  if (old && old.defVersion > defVersion) return p; // a result of an older scenario version never replaces a newer record
  const prev = entry.best[difficulty];
  if (prev && !isBetterResult(best, prev)) return p;
  entry.best[difficulty] = { ...best };
  return { ...p, scenarios: { ...p.scenarios, [id]: entry } };
}

// ------------------------------------------------------------------ store

export class ProgressStore {
  private last: ProgressRead | null = null;

  constructor(private readonly store: KeyValueStore | null) {}

  /** Read and validate the stored progress. A failed read blocks every write until `reset()`. */
  read(): ProgressRead {
    let raw: string | null = null;
    try {
      raw = this.store ? this.store.getItem(PROGRESS_KEY) : null;
    } catch {
      raw = null;
    }
    this.last = raw === null ? { ok: true, progress: emptyProgress() } : parseProgress(raw);
    return this.last;
  }

  /** The last read (reads once on first use). */
  current(): ProgressRead {
    return this.last ?? this.read();
  }

  /** True after a failed read until the player resets. */
  blocked(): boolean {
    return !this.current().ok;
  }

  private write(p: Progress): boolean {
    if (!this.store) return false;
    try {
      this.store.setItem(PROGRESS_KEY, JSON.stringify(p));
    } catch {
      return false;
    }
    this.last = { ok: true, progress: p };
    return true;
  }

  /** Change the stored progress unless the last read failed; re-reads first so another tab's records survive. */
  private update(change: (p: Progress) => Progress): boolean {
    if (this.blocked()) return false;
    const r = this.read();
    if (!r.ok) return false;
    const next = change(r.progress);
    if (next === r.progress) return true;
    return this.write(next);
  }

  /** Record a win (once per run: the client records on the `scenarioEnded` event only). True when stored. */
  recordResult(scenarioId: string, defVersion: number, difficulty: Difficulty, best: ScenarioBest): boolean {
    return this.update((p) => merged(p, scenarioId, defVersion, difficulty, best));
  }

  markTutorialDone(): boolean {
    return this.update((p) => (p.tutorialDone ? p : { ...p, tutorialDone: true }));
  }

  /**
   * Store a progress file the player picked (Settings → Data). The same strict check as `read()`, with the same
   * errors; nothing is filled in, and a refused file writes nothing and leaves the last read as it was.
   */
  importRaw(raw: string): ProgressImport {
    const r = parseProgress(raw);
    if (!r.ok) return { ok: false, reason: 'invalid', error: r.error };
    if (!this.write(r.progress)) return { ok: false, reason: 'storage' };
    return { ok: true, progress: r.progress };
  }

  /** Player-confirmed reset (also after a failed read): empty progress is written. */
  reset(): boolean {
    return this.write(emptyProgress());
  }
}

/**
 * Record the win of a finished scenario run (called on its `scenarioEnded` event, so a save loaded after the win
 * never records it again). Losses and runs without a result record nothing.
 */
export function recordScenarioWin(store: ProgressStore, run: ScenarioRun, result: ScenarioResult | null, completedAt: string): boolean {
  if (!result || result.status !== 'won' || result.stars < 1) return false;
  return store.recordResult(run.id, run.defVersion, run.difficulty, {
    stars: Math.min(3, result.stars),
    endMonthIndex: result.endMonthIndex,
    parkValue: result.parkValue,
    rating: result.rating,
    guests: result.guests,
    completedAt,
  });
}

/**
 * Progress writes for a drained batch of sim events (the client calls it once per batch): a won `scenarioEnded`
 * records the run's result, a finished tutorial (`tutorialStep` with `done`) sets `tutorialDone`. Progress is written
 * only on these events, never from the state of a loaded save, so a win is recorded once (Phase 5 §4.4): the sim sends
 * the event once, at the end tick, and marks the run `progressRecorded` there (`sim/scenario/end.ts`); an event that
 * does not match the run's recorded win (another month, a run not marked) records nothing. Returns the number of
 * writes.
 */
export function recordProgressEvents(
  store: ProgressStore,
  world: World,
  events: readonly SimEvent[],
  completedAt: string,
  resultOf: (w: World) => ScenarioResult | null = scenarioResult,
): number {
  let writes = 0;
  for (const ev of events) {
    if (ev.type === 'scenarioEnded' && ev.status === 'won') {
      const run = world.state.scenario.kind === 'scenario' ? world.state.scenario : null;
      const matches = run !== null && run.status === 'won' && run.progressRecorded && run.endMonthIndex === ev.monthIndex;
      if (run && matches && recordScenarioWin(store, run, resultOf(world), completedAt)) writes += 1;
    } else if (ev.type === 'tutorialStep' && ev.done) {
      if (store.markTutorialDone()) writes += 1;
    }
  }
  return writes;
}

// ------------------------------------------------------------------ unlocks (Phase 5 §4.7)

const scenarioIds = (): string[] => SCENARIOS.map((s) => s.id);

/** Wins needed to open the card at `index` (card order): 0 for 1–3, 2 for 4–6, 4 for 7, 6 for 8. */
export function unlockWinsFor(index: number): number {
  if (index < 3) return 0;
  if (index < 6) return UNLOCK_WINS[0];
  if (index < 7) return UNLOCK_WINS[1];
  return UNLOCK_WINS[2];
}

/** Scenarios among `ids` with at least one recorded win (any preset, any version). */
export function winCount(progress: Progress | null, ids: readonly string[] = scenarioIds()): number {
  if (!progress) return 0;
  return ids.filter((id) => Object.keys(progress.scenarios[id]?.best ?? {}).length > 0).length;
}

/**
 * Scenario ids open for this progress, in card order (Phase 5 §4.7: 1–3 at start; 2 wins → 4–6; 4 → 7; 6 → 8).
 * `null` progress (unreadable) opens only the start scenarios. `unlockAll` (the setting) opens every card.
 */
export function openScenarioIds(progress: Progress | null, unlockAll: boolean, ids: readonly string[] = scenarioIds()): string[] {
  if (unlockAll) return [...ids];
  const wins = winCount(progress, ids);
  return ids.filter((_, i) => wins >= unlockWinsFor(i));
}
