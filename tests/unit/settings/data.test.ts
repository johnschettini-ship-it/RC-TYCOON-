/** Settings → Data (Phase 6 §4.9): export all saves, export / import / reset progress. */
import { describe, expect, it } from 'vitest';
import { slotKey, type KeyValueStore } from '../../../src/save';
import { PROGRESS_KEY, ProgressStore, emptyProgress } from '../../../src/progress';
import { importProgress, savesExport, SAVES_EXPORT_FORMAT } from '../../../src/ui/settings/data';
import { readFileSync } from 'node:fs';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe('export all saves', () => {
  it('bundles every stored slot (manual and autosave) as its save envelope, or reports none', () => {
    const mem = new MemoryStore();
    expect(savesExport(mem, '2026-11-09T10:00:00.000Z')).toBeNull();
    const a = { format: 'thrills-and-chills-save', schemaVersion: 3, gameVersion: '3.0.0', savedAt: 'x', state: { n: 1 } };
    mem.setItem(slotKey('2'), JSON.stringify(a));
    mem.setItem(slotKey('auto'), '{not json');
    const out = savesExport(mem, '2026-11-09T10:00:00.000Z');
    expect(out).not.toBeNull();
    const doc = JSON.parse(out ?? '');
    expect(doc.format).toBe(SAVES_EXPORT_FORMAT);
    expect(doc.exportedAt).toBe('2026-11-09T10:00:00.000Z');
    expect(Object.keys(doc.saves)).toEqual(['2', 'auto']);
    expect(doc.saves['2']).toEqual(a);
    // A damaged slot is exported as its text, never dropped or "fixed".
    expect(doc.saves.auto).toBe('{not json');
  });
});

describe('import progress', () => {
  it('a valid progress file is stored through the progress store and read back', () => {
    const mem = new MemoryStore();
    const store = new ProgressStore(mem);
    const raw = readFileSync('tests/fixtures/progress-v2.json', 'utf8');
    expect(importProgress(store, raw)).toEqual({ ok: true });
    // The store that imported already holds the new progress (no separate re-read needed) ...
    const cur = store.current();
    expect(cur.ok && cur.progress.tutorialDone).toBe(true);
    // ... and a fresh store reads the same from storage.
    const r = new ProgressStore(mem).read();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.progress.tutorialDone).toBe(true);
  });

  it('a bad file changes nothing and says why (the load messages)', () => {
    const mem = new MemoryStore();
    mem.setItem(PROGRESS_KEY, JSON.stringify(emptyProgress()));
    const before = mem.getItem(PROGRESS_KEY);
    const store = new ProgressStore(mem);
    const r = importProgress(store, '{"format":"something-else"}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Your scenario progress could not be read');
    const newer = importProgress(store, JSON.stringify({ ...emptyProgress(), version: 9 }));
    expect(newer).toEqual({ ok: false, error: 'Your progress comes from a newer version of the game' });
    expect(mem.getItem(PROGRESS_KEY)).toBe(before);
    expect(store.blocked()).toBe(false);
  });

  it('no storage: the file passes the check but is not stored', () => {
    const r = importProgress(new ProgressStore(null), readFileSync('tests/fixtures/progress-v2.json', 'utf8'));
    expect(r).toEqual({ ok: false, error: 'This device does not allow the game to store data' });
  });

  it('the settings screen imports through the progress store, never by writing tc.progress itself', () => {
    const src = readFileSync('src/ui/settings/data.ts', 'utf8') + readFileSync('src/ui/settings/index.ts', 'utf8');
    expect(src).toContain('importProgress(progressStore(), raw)');
    expect(src).not.toMatch(/setItem\(\s*PROGRESS_KEY/);
  });
});
