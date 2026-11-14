import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cacheKey } from '../../../tools/art3d/cacheKey';

describe('bake cache key', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  const files = (): string[] => {
    const d = mkdtempSync(join(tmpdir(), 'cachekey-'));
    dirs.push(d);
    const a = join(d, 'kit.js');
    const b = join(d, 'item.js');
    writeFileSync(a, 'shared');
    writeFileSync(b, 'item');
    return [a, b];
  };
  const input = { spec: { footprintTiles: [3, 3], heightM: 8 }, track: { pieces: { straight: { dirs: [{ x: [0, 0.25], z: [0, 0] }] } } } };

  it('is stable for the same files, input and densities', () => {
    const f = files();
    expect(cacheKey(f, input, [2, 4])).toBe(cacheKey(f, structuredClone(input), [2, 4]));
  });
  it('changes when the track geometry in the input changes', () => {
    const f = files();
    const moved = structuredClone(input);
    moved.track.pieces.straight.dirs[0]!.z[1] = 0.01;
    expect(cacheKey(f, moved, [2, 4])).not.toBe(cacheKey(f, input, [2, 4]));
  });
  it('changes when a shared file changes', () => {
    const f = files();
    const before = cacheKey(f, input, [2, 4]);
    writeFileSync(f[0]!, 'shared, edited');
    expect(cacheKey(f, input, [2, 4])).not.toBe(before);
  });
  it('changes with the densities', () => {
    const f = files();
    expect(cacheKey(f, input, [4])).not.toBe(cacheKey(f, input, [2, 4]));
  });
});
