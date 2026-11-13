import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { installStoragePrefix, startRealBuild } from '../../../../src/render/real/storagePrefix';
import { artStyle } from '../../../../src/render/artStyle';

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

  it('VITE_ART=real build: ?art=classic is still prefixed', () => {
    const S = makeStorageClass();
    const s = new S();
    s.setItem('tc.save.1', 'real park');
    expect(startRealBuild(s, artStyle('?art=classic', 'real'))).toBe(false);
    expect(s.getItem('tc.save.1')).toBeNull();
    s.clear();
    expect((s as unknown as { raw(): string[] }).raw()).toEqual(['tc.save.1']);
  });

  it('VITE_ART=real build: the prefix is on before the realistic code loads, so a failed import stays prefixed', () => {
    const S = makeStorageClass();
    const s = new S();
    s.setItem('tc.settings', 'real');
    // ?art=real: the prefix goes on synchronously, before `import('./render/real/boot')` is even started.
    expect(startRealBuild(s, artStyle('?art=real', 'real'))).toBe(true);
    expect(s.getItem('tc.settings')).toBeNull();
    // main.ts: the decision runs in the gate itself, ahead of both boot paths (import, its .catch, and plain boot()).
    const main = readFileSync('src/main.ts', 'utf8');
    const gate = main.indexOf("if (import.meta.env.VITE_ART === 'real' && startRealBuild(pageStorage(), artStyle()))");
    expect(gate).toBeGreaterThan(0);
    expect(main.indexOf("import('./render/real/boot')")).toBeGreaterThan(gate);
    expect(main.slice(0, gate).match(/^\s*boot\(/m)).toBeNull();
  });

  it('a build without storage still decides by the style', () => {
    expect(startRealBuild(null, 'real')).toBe(true);
    expect(startRealBuild(null, 'classic')).toBe(false);
  });
});
