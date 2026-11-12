/** Phase 8b stage 0b test (never merged): the catalogue of ground pieces and the face stack rule. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { faceStack } from '../../../../src/render/pixel/app/faces';
import { GROUND_VARIANT_SEED, K_GROUND, groundKey, groundVariant } from '../../../../src/render/pixel/app/keys';
import { hash3 } from '../../../../src/render/pixel/ground';
import { clearSurfaceArt, installSurfaceArt } from '../../../../src/render/pixel/surfaceArt';
import { groundSpecs } from '../../../../tools/sheets/catalogue/ground';
import type { PictureSpec } from '../../../../tools/sheets/catalogue/types';
import { pictureHash } from '../../../../tools/sheets/picture';

beforeEach(installSurfaceArt);
afterEach(clearSurfaceArt);

const specs = groundSpecs();
const byKey = new Map(specs.map((s) => [s.key, s]));

describe('ground pieces', () => {
  it('faceStack', () => {
    expect(faceStack(6, 6, 4, 4)).toEqual({ from: 4, steps: 2, cap: 0 });
    expect(faceStack(7, 6, 4, 5)).toEqual({ from: 4, steps: 2, cap: 1 });
    expect(faceStack(4, 4, 4, 4)).toEqual({ from: 4, steps: 0, cap: 0 });
    expect(faceStack(5, 6, 4, 4)).toEqual({ from: 4, steps: 1, cap: 2 });
    expect(faceStack(3, 3, 4, 5)).toEqual({ from: 4, steps: 0, cap: 0 });
  });

  it('ground key fields are distinct', () => {
    expect(new Set(specs.map((s) => s.key)).size).toBe(specs.length);
    for (const s of specs) {
      expect(s.kind).toBe(K_GROUND);
      expect(s.pack).toBe('ground');
      expect(s.group).toBe('ground');
      expect(s.ref).toBeNull();
    }
    expect(groundVariant(5, 9)).toBe(hash3(5, 9, GROUND_VARIANT_SEED) & 3);
  });

  it('piece counts', () => {
    const part = (p: number): number => specs.filter((s) => Math.floor(s.key / (8 * 16 * 16 * 4)) === p).length;
    expect(part(0)).toBe(5 * 16 * 2 * 4);
    expect(part(1)).toBe(3 * 5 * 16 * 4);
    expect(part(2)).toBe(6);
    expect(part(3)).toBe(1);
    expect(specs.length).toBe(640 + 960 + 6 + 1);
  });

  it('a flat grass top piece covers exactly the tile diamond', () => {
    for (const v of [0, 1, 2, 3]) {
      const p = (byKey.get(groundKey(0, 0, 0, 1, v)) as PictureSpec).paint();
      // Art pixel (ax, ay) relative to the anchor (the tile's top corner): centre inside the diamond (`flatTop`).
      const want = new Set<string>();
      for (let ay = -2; ay < 20; ay++) {
        for (let ax = -20; ax < 20; ax++) {
          const a = (ax + 0.5) / 0.5 / 32;
          const b = (ay + 0.5) / 0.5 / 16;
          const uu = (a + b) / 2;
          const vv = (b - a) / 2;
          if (uu >= 0 && uu < 1 && vv >= 0 && vv < 1) want.add(`${ax},${ay}`);
        }
      }
      const got = new Set<string>();
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.slots[y * p.w + x] !== 0) got.add(`${x - p.ox},${y - p.oy}`);
      expect(got.size).toBe(want.size);
      expect([...got].filter((k) => !want.has(k))).toEqual([]);
    }
  });

  it('grassValue variation exists between variants', () => {
    const hashes = [0, 1, 2, 3].map((v) => pictureHash((byKey.get(groundKey(0, 0, 0, 1, v)) as PictureSpec).paint()));
    expect(new Set(hashes).size).toBe(4);
  });

  it('faces and water are single slot pieces, a cap is smaller than a full step', () => {
    const full = (byKey.get(groundKey(2, 0, 0, 0, 0)) as PictureSpec).paint();
    const cap = (byKey.get(groundKey(2, 0, 1, 0, 0)) as PictureSpec).paint();
    const n = (p: typeof full): number => p.slots.filter((v) => v !== 0).length;
    expect(n(full)).toBeGreaterThan(0);
    expect(n(cap)).toBeGreaterThan(0);
    expect(n(cap)).toBeLessThan(n(full));
    expect(new Set(full.slots.filter((v) => v !== 0)).size).toBe(1);
    const water = (byKey.get(groundKey(3, 0, 0, 0, 0)) as PictureSpec).paint();
    expect(new Set(water.slots.filter((v) => v !== 0)).size).toBe(1);
  });
});
