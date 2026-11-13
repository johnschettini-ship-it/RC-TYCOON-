import { describe, expect, it } from 'vitest';
import { installStoragePrefix } from '../../../../src/render/real/storagePrefix';

/** A Storage look-alike: methods and the `length` getter on the prototype, as on the real Storage. */
function makeStorageClass(): { new (): Storage; prototype: Storage } {
  class MemStorage {
    private readonly m = new Map<string, string>();
    getItem(k: string): string | null {
      return this.m.has(k) ? (this.m.get(k) as string) : null;
    }
    setItem(k: string, v: string): void {
      this.m.set(k, String(v));
    }
    removeItem(k: string): void {
      this.m.delete(k);
    }
    clear(): void {
      this.m.clear();
    }
    key(i: number): string | null {
      return [...this.m.keys()][i] ?? null;
    }
    get length(): number {
      return this.m.size;
    }
    /** Test-only view of every raw key. */
    raw(): string[] {
      return [...this.m.keys()].sort();
    }
  }
  return MemStorage as unknown as { new (): Storage; prototype: Storage };
}

describe('storage prefix for the realistic test (tcreal:)', () => {
  it('storage prefix hides and protects unprefixed keys', () => {
    const S = makeStorageClass();
    const s = new S();
    // The real game's save and settings, written before the test build starts.
    s.setItem('tc.save.1', 'real park');
    s.setItem('tc.settings', '{}');
    installStoragePrefix(s, 'tcreal:');
    const raw = (): string[] => (s as unknown as { raw(): string[] }).raw();

    // The game sees none of the real keys.
    expect(s.getItem('tc.save.1')).toBeNull();
    expect(s.length).toBe(0);
    expect(s.key(0)).toBeNull();

    // What the test build writes is stored under the prefix.
    s.setItem('tc.save.1', 'test park');
    s.setItem('tc.settings', '{"q":1}');
    expect(s.getItem('tc.save.1')).toBe('test park');
    expect(s.length).toBe(2);
    expect([s.key(0), s.key(1)].sort()).toEqual(['tc.save.1', 'tc.settings']);
    expect(raw()).toEqual(['tc.save.1', 'tc.settings', 'tcreal:tc.save.1', 'tcreal:tc.settings']);

    s.removeItem('tc.settings');
    expect(raw()).toEqual(['tc.save.1', 'tc.settings', 'tcreal:tc.save.1']);

    // clear() removes only prefixed keys: the real save survives.
    s.clear();
    expect(s.length).toBe(0);
    expect(raw()).toEqual(['tc.save.1', 'tc.settings']);
  });

  it('installing twice does not double the prefix', () => {
    const S = makeStorageClass();
    const s = new S();
    installStoragePrefix(s, 'tcreal:');
    installStoragePrefix(s, 'tcreal:');
    s.setItem('a', '1');
    expect((s as unknown as { raw(): string[] }).raw()).toEqual(['tcreal:a']);
  });
});
