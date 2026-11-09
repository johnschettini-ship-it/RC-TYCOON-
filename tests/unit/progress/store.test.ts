/**
 * Progress storage (Phase 5 §4.12): validation on read, errors and no writes after a failed read, the merge rule,
 * the player's reset, the tutorial flag, unlock thresholds (§4.7), and a win recorded once.
 */
import { describe, expect, it } from 'vitest';
import {
  emptyProgress,
  ERR_PROGRESS_NEWER,
  ERR_PROGRESS_UNREADABLE,
  isBetterResult,
  openScenarioIds,
  parseProgress,
  PROGRESS_KEY,
  ProgressStore,
  recordProgressEvents,
  recordScenarioWin,
  unlockWinsFor,
  winCount,
  type Progress,
  type ScenarioBest,
} from '../../../src/progress';
import { deserialize, serialize, type KeyValueStore } from '../../../src/save';
import { drainEvents } from '../../../src/sim/events';
import { createTutorialWorld } from '../../../src/sim/tutorial/start';
import { executeCommand } from '../../../src/sim/commands';
import { makeTestWorld } from '../../helpers/world';
import type { ScenarioResult } from '../../../src/sim/scenario/api';
import type { ScenarioRun } from '../../../src/sim/scenario/types';
import { emptyAwards } from '../../../src/sim/awards/types';

class FakeStore implements KeyValueStore {
  data = new Map<string, string>();
  writes = 0;
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes += 1;
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.writes += 1;
    this.data.delete(key);
  }
}

function best(patch: Partial<ScenarioBest> = {}): ScenarioBest {
  return { stars: 2, endMonthIndex: 7, parkValue: 9_120_000, rating: 640, guests: 312, completedAt: '2027-01-03T10:00:00Z', ...patch };
}

/** The spec example (Phase 5 §4.12). */
const SPEC_EXAMPLE = `{ "format": "thrills-and-chills-progress", "version": 1,
  "scenarios": { "meadow_start": { "defVersion": 1,
      "best": { "standard": { "stars": 2, "endMonthIndex": 7, "parkValue": 9120000,
                              "rating": 640, "guests": 312, "completedAt": "2027-01-03T10:00:00Z" } } } },
  "tutorialDone": true }`;

function stored(json: unknown): FakeStore {
  const s = new FakeStore();
  s.data.set(PROGRESS_KEY, typeof json === 'string' ? json : JSON.stringify(json));
  return s;
}

const good = (): Progress => ({ ...emptyProgress(), scenarios: { meadow_start: { defVersion: 1, best: { standard: best() } } }, tutorialDone: true });

describe('reading progress', () => {
  it('first run: no key → empty progress, nothing written', () => {
    const s = new FakeStore();
    const store = new ProgressStore(s);
    expect(store.read()).toEqual({ ok: true, progress: emptyProgress() });
    expect(s.writes).toBe(0);
  });

  it('reads the spec example', () => {
    const r = parseProgress(SPEC_EXAMPLE);
    expect(r).toEqual({ ok: true, progress: good() });
  });

  it('no storage at all reads as empty progress', () => {
    expect(new ProgressStore(null).read()).toEqual({ ok: true, progress: emptyProgress() });
  });

  const unreadable: Array<[string, unknown]> = [
    ['bad JSON', '{"format": "thrills-and-chills-progress", '],
    ['not an object', '[]'],
    ['wrong format', { ...good(), format: 'thrills-and-chills-save' }],
    ['missing version', { format: 'thrills-and-chills-progress', scenarios: {}, tutorialDone: false }],
    ['version not an integer', { ...good(), version: 1.5 }],
    ['version 0', { ...good(), version: 0 }],
    ['missing tutorialDone', { format: 'thrills-and-chills-progress', version: 1, scenarios: {} }],
    ['tutorialDone not a boolean', { ...good(), tutorialDone: 'yes' }],
    ['scenarios is an array', { ...good(), scenarios: [] }],
    ['record without defVersion', { ...good(), scenarios: { meadow_start: { best: {} } } }],
    ['record without best', { ...good(), scenarios: { meadow_start: { defVersion: 1 } } }],
    ['best entry missing a field', { ...good(), scenarios: { meadow_start: { defVersion: 1, best: { standard: { ...best(), guests: undefined } } } } }],
    ['stars as a string', { ...good(), scenarios: { meadow_start: { defVersion: 1, best: { standard: { ...best(), stars: '2' } } } } }],
    ['stars out of range', { ...good(), scenarios: { meadow_start: { defVersion: 1, best: { standard: best({ stars: 4 }) } } } }],
    ['unknown preset', { ...good(), scenarios: { meadow_start: { defVersion: 1, best: { insane: best() } } } }],
    ['completedAt not a string', { ...good(), scenarios: { meadow_start: { defVersion: 1, best: { standard: { ...best(), completedAt: 5 } } } } }],
    ['extra field', { ...good(), cheats: true }],
  ];
  for (const [name, data] of unreadable) {
    it(`${name} → "${ERR_PROGRESS_UNREADABLE}" and no write`, () => {
      const s = stored(data);
      const raw = s.getItem(PROGRESS_KEY);
      const store = new ProgressStore(s);
      expect(store.read()).toEqual({ ok: false, error: ERR_PROGRESS_UNREADABLE, raw });
      expect(store.recordResult('meadow_start', 1, 'standard', best({ stars: 3 }))).toBe(false);
      expect(store.markTutorialDone()).toBe(false);
      expect(s.writes).toBe(0);
      expect(s.getItem(PROGRESS_KEY)).toBe(raw);
    });
  }

  it(`a newer version → "${ERR_PROGRESS_NEWER}" and no write`, () => {
    const s = stored({ ...good(), version: 2, futureThing: [] });
    const store = new ProgressStore(s);
    const r = store.read();
    expect(r).toMatchObject({ ok: false, error: ERR_PROGRESS_NEWER });
    expect(store.blocked()).toBe(true);
    expect(store.recordResult('meadow_start', 1, 'tough', best())).toBe(false);
    expect(s.writes).toBe(0);
  });

  it('writes stay blocked until the player resets; the reset writes empty progress', () => {
    const s = stored('not json');
    const store = new ProgressStore(s);
    expect(store.read().ok).toBe(false);
    expect(store.reset()).toBe(true);
    expect(s.writes).toBe(1);
    expect(JSON.parse(s.getItem(PROGRESS_KEY) as string)).toEqual(emptyProgress());
    expect(store.blocked()).toBe(false);
    expect(store.recordResult('meadow_start', 1, 'standard', best())).toBe(true);
    expect(store.read()).toEqual({ ok: true, progress: { ...emptyProgress(), scenarios: { meadow_start: { defVersion: 1, best: { standard: best() } } } } });
  });

  it('a record with an older defVersion stays as it is', () => {
    const s = stored({ ...good(), scenarios: { meadow_start: { defVersion: 1, best: { standard: best() } } } });
    const r = new ProgressStore(s).read();
    expect(r.ok && r.progress.scenarios.meadow_start?.defVersion).toBe(1);
  });
});

describe('the merge rule', () => {
  it('more stars wins; on a tie the earlier end month; else the stored record stays', () => {
    expect(isBetterResult(best({ stars: 3, endMonthIndex: 11 }), best({ stars: 2, endMonthIndex: 5 }))).toBe(true);
    expect(isBetterResult(best({ stars: 2, endMonthIndex: 6 }), best({ stars: 2, endMonthIndex: 7 }))).toBe(true);
    expect(isBetterResult(best({ stars: 2, endMonthIndex: 7 }), best({ stars: 2, endMonthIndex: 7 }))).toBe(false);
    expect(isBetterResult(best({ stars: 1, endMonthIndex: 1 }), best({ stars: 2, endMonthIndex: 7 }))).toBe(false);
  });

  it('recordResult keeps the best record per preset', () => {
    const s = new FakeStore();
    const store = new ProgressStore(s);
    store.read();
    expect(store.recordResult('meadow_start', 1, 'standard', best({ stars: 2, endMonthIndex: 7 }))).toBe(true);
    store.recordResult('meadow_start', 1, 'standard', best({ stars: 1, endMonthIndex: 3 }));
    store.recordResult('meadow_start', 1, 'standard', best({ stars: 2, endMonthIndex: 9 }));
    store.recordResult('meadow_start', 1, 'relaxed', best({ stars: 1, endMonthIndex: 13 }));
    const r = store.read();
    if (!r.ok) throw new Error(r.error);
    expect(r.progress.scenarios.meadow_start).toEqual({ defVersion: 1, best: { standard: best({ stars: 2, endMonthIndex: 7 }), relaxed: best({ stars: 1, endMonthIndex: 13 }) } });
    store.recordResult('meadow_start', 1, 'standard', best({ stars: 2, endMonthIndex: 6, guests: 400 }));
    const r2 = store.read();
    expect(r2.ok && r2.progress.scenarios.meadow_start?.best.standard).toEqual(best({ stars: 2, endMonthIndex: 6, guests: 400 }));
  });

  it('a win on a newer scenario version starts a new record for that version', () => {
    const s = stored({ ...good(), scenarios: { meadow_start: { defVersion: 1, best: { standard: best({ stars: 3 }), tough: best() } } } });
    const store = new ProgressStore(s);
    store.read();
    store.recordResult('meadow_start', 2, 'standard', best({ stars: 1 }));
    const r = store.read();
    expect(r.ok && r.progress.scenarios.meadow_start).toEqual({ defVersion: 2, best: { standard: best({ stars: 1 }) } });
  });

  it('markTutorialDone sets the flag and keeps the records', () => {
    const s = stored({ ...good(), tutorialDone: false });
    const store = new ProgressStore(s);
    expect(store.markTutorialDone()).toBe(true);
    const r = store.read();
    expect(r).toEqual({ ok: true, progress: good() });
  });

  it('a record written by another tab is merged, not overwritten', () => {
    const s = new FakeStore();
    const store = new ProgressStore(s);
    store.read();
    s.data.set(PROGRESS_KEY, JSON.stringify(good()));
    store.recordResult('sandy_shores', 1, 'tough', best({ stars: 3 }));
    const r = store.read();
    expect(r.ok && Object.keys(r.progress.scenarios).sort()).toEqual(['meadow_start', 'sandy_shores']);
  });
});

describe('unlocks (Phase 5 §4.7)', () => {
  const IDS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
  function withWins(n: number): Progress {
    const p = emptyProgress();
    for (let i = 0; i < n; i++) p.scenarios[IDS[i] as string] = { defVersion: 1, best: { relaxed: best({ stars: 1 }) } };
    return p;
  }

  it('wins needed per card: 0 for 1–3, 2 for 4–6, 4 for 7, 6 for 8', () => {
    expect(IDS.map((_, i) => unlockWinsFor(i))).toEqual([0, 0, 0, 2, 2, 2, 4, 6]);
  });

  it('opens 3, then 6 after 2 wins, 7 after 4, 8 after 6', () => {
    const open = (n: number): number => openScenarioIds(withWins(n), false, IDS).length;
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(open)).toEqual([3, 3, 6, 6, 7, 7, 8, 8, 8]);
    expect(openScenarioIds(withWins(2), false, IDS)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6']);
  });

  it('a win is any scenario with a record; unknown ids do not count', () => {
    const p = withWins(1);
    p.scenarios.old_removed = { defVersion: 1, best: { standard: best() } };
    expect(winCount(p, IDS)).toBe(1);
  });

  it('unreadable progress opens only the start scenarios; Unlock all opens every card', () => {
    expect(openScenarioIds(null, false, IDS)).toEqual(['s1', 's2', 's3']);
    expect(openScenarioIds(null, true, IDS)).toEqual(IDS);
    expect(openScenarioIds(withWins(0), true, IDS)).toEqual(IDS);
  });
});

describe('recording a win', () => {
  function run(patch: Partial<ScenarioRun> = {}): ScenarioRun {
    return {
      kind: 'scenario',
      id: 'meadow_start',
      defVersion: 1,
      difficulty: 'standard',
      status: 'won',
      endReason: null,
      endMonthIndex: 9,
      continued: false,
      progressRecorded: true,
      deadlineMonthIndex: 11,
      objectives: [],
      loseCounters: { bankruptMonths: 0, lowRatingDays: 0 },
      awards: emptyAwards(),
      ...patch,
    };
  }
  const result: ScenarioResult = { status: 'won', endReason: null, endMonthIndex: 9, guests: 260, rating: 610, parkValue: 5_000_000, totalProfit: 120_000, bestCoasterExcitement: null, stars: 2 };

  it('writes the end-screen facts once per scenarioEnded event', () => {
    const s = new FakeStore();
    const store = new ProgressStore(s);
    expect(recordScenarioWin(store, run(), result, '2027-02-01T09:00:00.000Z')).toBe(true);
    const r = store.read();
    expect(r.ok && r.progress.scenarios.meadow_start).toEqual({
      defVersion: 1,
      best: { standard: { stars: 2, endMonthIndex: 9, parkValue: 5_000_000, rating: 610, guests: 260, completedAt: '2027-02-01T09:00:00.000Z' } },
    });
    expect(s.writes).toBe(1);
  });

  it('a loss or a missing result records nothing', () => {
    const s = new FakeStore();
    const store = new ProgressStore(s);
    expect(recordScenarioWin(store, run({ status: 'lost' }), { ...result, status: 'lost', stars: 0 }, 'x')).toBe(false);
    expect(recordScenarioWin(store, run(), null, 'x')).toBe(false);
    expect(s.writes).toBe(0);
  });
});

describe('progress from sim events: a win is recorded once (Phase 5 §4.4)', () => {
  const result: ScenarioResult = { status: 'won', endReason: null, endMonthIndex: 7, guests: 300, rating: 620, parkValue: 4_000_000, totalProfit: 50_000, bestCoasterExcitement: 655, stars: 3 };

  function wonWorld() {
    const w = makeTestWorld();
    w.state.scenario = {
      kind: 'scenario', id: 'meadow_start', defVersion: 1, difficulty: 'standard', status: 'won', endReason: null, endMonthIndex: 7,
      continued: false, progressRecorded: true, deadlineMonthIndex: 11, objectives: [], loseCounters: { bankruptMonths: 0, lowRatingDays: 0 }, awards: emptyAwards(),
    };
    w.events.push({ type: 'scenarioEnded', status: 'won', reason: null, monthIndex: 7 });
    return w;
  }

  it('records on the scenarioEnded event, and a save loaded after the win records nothing', () => {
    const s = new FakeStore();
    const store = new ProgressStore(s);
    const w = wonWorld();
    expect(recordProgressEvents(store, w, drainEvents(w), 't1', () => result)).toBe(1);
    // Save after the win, reload it, and play on: no event, no second record.
    const loaded = deserialize(serialize(w, '0.1.0', '2027-01-01T00:00:00Z'));
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.world.state.scenario).toMatchObject({ kind: 'scenario', status: 'won' });
    expect(recordProgressEvents(store, loaded.world, drainEvents(loaded.world), 't2', () => result)).toBe(0);
    expect(s.writes).toBe(1);
    const r = store.read();
    expect(r.ok && r.progress.scenarios.meadow_start?.best.standard?.completedAt).toBe('t1');
  });

  it('a won event that is not the run\'s recorded win records nothing (another month, a run not marked at its end tick)', () => {
    const s = new FakeStore();
    const store = new ProgressStore(s);
    const other = wonWorld();
    expect(recordProgressEvents(store, other, [{ type: 'scenarioEnded', status: 'won', reason: null, monthIndex: 6 }], 't', () => result)).toBe(0);
    const unmarked = wonWorld();
    if (unmarked.state.scenario.kind !== 'scenario') throw new Error('scenario expected');
    unmarked.state.scenario.progressRecorded = false;
    expect(recordProgressEvents(store, unmarked, drainEvents(unmarked), 't', () => result)).toBe(0);
    expect(s.writes).toBe(0);
  });

  it('a lost run and other events record nothing', () => {
    const s = new FakeStore();
    const store = new ProgressStore(s);
    const w = makeTestWorld();
    expect(recordProgressEvents(store, w, [{ type: 'scenarioEnded', status: 'lost', reason: 'timeUp', monthIndex: 11 }, { type: 'monthEnded', monthIndex: 11 }], 't', () => result)).toBe(0);
    expect(s.writes).toBe(0);
  });

  it('finishing the tutorial sets tutorialDone; skipping it does not', () => {
    const s = new FakeStore();
    const store = new ProgressStore(s);
    const skipped = createTutorialWorld(1, 'T');
    executeCommand(skipped, { type: 'tutorialSkipAll' });
    expect(recordProgressEvents(store, skipped, drainEvents(skipped), 't')).toBe(0);
    const w = createTutorialWorld(1, 'T');
    if (w.state.scenario.kind !== 'tutorial') throw new Error('tutorial expected');
    w.state.scenario.stepIndex = 15;
    executeCommand(w, { type: 'tutorialSkipStep' });
    expect(recordProgressEvents(store, w, drainEvents(w), 't')).toBe(1);
    const r = store.read();
    expect(r.ok && r.progress.tutorialDone).toBe(true);
  });
});
