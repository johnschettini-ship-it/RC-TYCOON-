import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentHash, itemSpec } from '../../../tools/art3d/catalog';
import { FLAT_RIDES, SCENERY, STALLS } from '../../../src/data/catalog';

describe('itemSpec', () => {
  it('reads catalogue footprints', () => expect(itemSpec('ride', 'carousel').footprintTiles).toEqual([3, 3]));

  it('reads the footprint of every flat ride and gives it a positive height', () => {
    for (const r of FLAT_RIDES) {
      const s = itemSpec('ride', r.id);
      expect(s.footprintTiles).toEqual([r.w, r.d]);
      expect(s.heightM).toBeGreaterThan(0);
    }
  });

  it('tall rides stand taller than the carousel', () => {
    expect(itemSpec('ride', 'big_wheel').heightM).toBeGreaterThan(itemSpec('ride', 'carousel').heightM);
    expect(itemSpec('ride', 'swing_tower').heightM).toBeGreaterThan(itemSpec('ride', 'carousel').heightM);
  });

  it('stalls take one tile', () => {
    for (const st of STALLS) {
      const s = itemSpec('stall', st.id);
      expect(s.footprintTiles).toEqual([1, 1]);
      expect(s.heightM).toBeGreaterThan(0);
    }
  });

  it('scenery reads w, d and heightM from the catalogue', () => {
    for (const sc of SCENERY) expect(itemSpec('scenery', sc.id)).toEqual({ footprintTiles: [sc.w, sc.d], heightM: sc.heightM });
  });

  it('throws on unknown ids', () => {
    expect(() => itemSpec('ride', 'no_such_ride')).toThrow(/no_such_ride/);
    expect(() => itemSpec('stall', 'carousel')).toThrow(/carousel/);
    expect(() => itemSpec('scenery', 'snack_shack')).toThrow(/snack_shack/);
  });
});

describe('contentHash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'art3d-hash-'));
  const a = join(dir, 'a.js');
  const b = join(dir, 'b.js');
  writeFileSync(a, 'export const a = 1;\n');
  writeFileSync(b, 'export const b = 2;\n');

  it('is a SHA-256 hex digest', () => expect(contentHash([a, b])).toMatch(/^[0-9a-f]{64}$/));

  it('does not depend on the order the files are listed in', () => expect(contentHash([b, a])).toBe(contentHash([a, b])));

  it('changes when a file changes', () => {
    const before = contentHash([a, b]);
    writeFileSync(b, 'export const b = 3;\n');
    expect(contentHash([a, b])).not.toBe(before);
  });

  it('tells apart moving text from one file to the next', () => {
    writeFileSync(a, 'xy');
    writeFileSync(b, 'z');
    const h1 = contentHash([a, b]);
    writeFileSync(a, 'x');
    writeFileSync(b, 'yz');
    expect(contentHash([a, b])).not.toBe(h1);
  });

  it('throws on a missing file', () => expect(() => contentHash([join(dir, 'missing.js')])).toThrow());
});
