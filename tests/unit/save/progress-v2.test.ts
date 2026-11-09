/**
 * Phase 6 §4.11 release checklist item 5: "A Build 2 progress file loads". `tests/fixtures/progress-v2.json` was
 * written by the Build 2 progress code (`src/progress` unchanged since 4ab1b43) through `ProgressStore`: 3 wins on
 * 2 scenarios and the tutorial done. Build 3 keeps progress format version 1 (progress is not in saves).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openScenarioIds, parseProgress, PROGRESS_KEY, ProgressStore, winCount } from '../../../src/progress';
import type { KeyValueStore } from '../../../src/save';

const json = readFileSync(join(__dirname, '../../fixtures/progress-v2.json'), 'utf8');

class Mem implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}

describe('Build 2 progress file (Phase 6 §4.11 item 5)', () => {
  it('parses with every record', () => {
    const r = parseProgress(json);
    if (!r.ok) throw new Error(r.error);
    expect(r.progress.tutorialDone).toBe(true);
    expect(Object.keys(r.progress.scenarios)).toEqual(['meadow_start', 'sandy_shores']);
    expect(r.progress.scenarios.meadow_start?.best.standard?.stars).toBe(3);
    expect(winCount(r.progress)).toBe(2);
    expect(openScenarioIds(r.progress, false).length).toBeGreaterThanOrEqual(3);
  });

  it('loads in the store and keeps recording on top of it', () => {
    const mem = new Mem();
    mem.data.set(PROGRESS_KEY, json);
    const store = new ProgressStore(mem);
    expect(store.blocked()).toBe(false);
    expect(store.recordResult('meadow_start', 1, 'tough', { stars: 1, endMonthIndex: 20, parkValue: 1, rating: 600, guests: 200, completedAt: '2026-11-10T00:00:00.000Z' })).toBe(true);
    const r = parseProgress(mem.data.get(PROGRESS_KEY) as string);
    expect(r.ok && Object.keys(r.progress.scenarios.meadow_start?.best ?? {}).sort()).toEqual(['relaxed', 'standard', 'tough']);
  });
});
