import { describe, expect, it } from 'vitest';
import { GAME_VERSION, SaveStore, serialize, slotKey, type KeyValueStore } from '../../../src/save';
import { formatDate } from '../../../src/sim/time';
import { makeTestWorld, stateHash } from '../../helpers/world';
import { makeRichWorld } from './fixture';

const SAVE_FAILED = 'Could not save. Storage is full or blocked. Use Export instead';
const NOW = '2026-11-09T12:00:00.000Z';

class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
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

class ThrowingStore extends MemoryStore {
  constructor(private readonly failReads = false) {
    super();
  }
  override getItem(key: string): string | null {
    if (this.failReads) throw new DOMException('blocked', 'SecurityError');
    return super.getItem(key);
  }
  override setItem(): void {
    throw new DOMException('The quota has been exceeded', 'QuotaExceededError');
  }
}

describe('SaveStore', () => {
  it('uses the keys tc.save.1 … tc.save.3 and tc.save.auto', () => {
    expect(['1', '2', '3', 'auto'].map((s) => slotKey(s as '1'))).toEqual(['tc.save.1', 'tc.save.2', 'tc.save.3', 'tc.save.auto']);
    const mem = new MemoryStore();
    const store = new SaveStore(mem, () => NOW);
    const { world } = makeRichWorld();
    for (const slot of ['1', '2', '3', 'auto'] as const) expect(store.save(slot, world)).toBeNull();
    expect([...mem.data.keys()].sort()).toEqual(['tc.save.1', 'tc.save.2', 'tc.save.3', 'tc.save.auto']);
  });

  it('saves and loads a slot deep-equal', () => {
    const store = new SaveStore(new MemoryStore(), () => NOW);
    const { world } = makeRichWorld();
    expect(store.save('2', world)).toBeNull();
    const r = store.load('2');
    if (!r.ok) throw new Error(r.error);
    expect(r.world.state).toStrictEqual(world.state);
    expect(r.world.events).toEqual([]);
  });

  it('writes the game version and the save time into the envelope', () => {
    const mem = new MemoryStore();
    new SaveStore(mem, () => NOW).save('1', makeTestWorld());
    const raw = JSON.parse(mem.getItem('tc.save.1')!) as { gameVersion: string; savedAt: string };
    expect(raw.gameVersion).toBe(GAME_VERSION);
    expect(GAME_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(raw.savedAt).toBe(NOW);
  });

  it('returns the storage error when setItem throws (quota or blocked), without throwing', () => {
    const store = new SaveStore(new ThrowingStore(), () => NOW);
    const world = makeTestWorld();
    const before = stateHash(world);
    let result: string | null = null;
    expect(() => {
      result = store.save('auto', world);
    }).not.toThrow();
    expect(result).toBe(SAVE_FAILED);
    expect(stateHash(world)).toBe(before);
  });

  it('works without storage: save fails with the storage error, load and list report nothing', () => {
    const store = new SaveStore(null);
    expect(store.hasStore()).toBe(false);
    expect(store.save('1', makeTestWorld())).toBe(SAVE_FAILED);
    expect(store.load('1')).toEqual({ ok: false, error: 'Saved games are not available in this browser. Use Import instead' });
    expect(store.list()).toEqual([]);
  });

  it('load of an empty slot fails with a message', () => {
    expect(new SaveStore(new MemoryStore()).load('3')).toEqual({ ok: false, error: 'This save slot is empty' });
  });

  it('load when reading storage throws fails with a message', () => {
    const store = new SaveStore(new ThrowingStore(true));
    expect(store.load('1')).toEqual({ ok: false, error: 'Saved games are not available in this browser. Use Import instead' });
    expect(store.list()).toEqual([]);
  });

  it('load of a corrupt slot returns the deserialize error', () => {
    const mem = new MemoryStore();
    mem.setItem('tc.save.1', '{"format":"thrills-and-chills-save",');
    expect(new SaveStore(mem).load('1')).toEqual({ ok: false, error: 'This save could not be read' });
  });

  it('list() reads park name, save time, and game date from each envelope, in slot order', () => {
    const mem = new MemoryStore();
    const a = makeTestWorld(1, 'Alpha Park');
    const b = makeTestWorld(2, 'Beta Park');
    b.state.tick = 3600 + 75;
    new SaveStore(mem, () => '2026-11-09T08:00:00.000Z').save('auto', a);
    new SaveStore(mem, () => '2026-11-09T09:00:00.000Z').save('2', b);
    expect(new SaveStore(mem).list()).toEqual([
      { slot: '2', parkName: 'Beta Park', savedAt: '2026-11-09T09:00:00.000Z', gameDate: formatDate(3675) },
      { slot: 'auto', parkName: 'Alpha Park', savedAt: '2026-11-09T08:00:00.000Z', gameDate: formatDate(a.state.tick) },
    ]);
    expect(formatDate(3675)).toBe('Apr · Year 1 · 01:30');
  });

  it('list() skips a corrupt slot with no throw', () => {
    const mem = new MemoryStore();
    const store = new SaveStore(mem, () => NOW);
    store.save('1', makeTestWorld(1, 'Good One'));
    mem.setItem('tc.save.2', '{"format":"thrills-and-chi');
    mem.setItem('tc.save.3', JSON.stringify({ format: 'thrills-and-chills-save', savedAt: NOW, state: { park: {} } }));
    mem.setItem('tc.save.auto', serialize(makeTestWorld(), '0.1.0', NOW).replace('thrills-and-chills-save', 'other-game'));
    let list: ReturnType<SaveStore['list']> = [];
    expect(() => {
      list = store.list();
    }).not.toThrow();
    expect(list.map((i) => i.slot)).toEqual(['1']);
    expect(list[0]?.parkName).toBe('Good One');
  });
});
