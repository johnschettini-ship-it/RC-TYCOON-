import { describe, expect, it } from 'vitest';
import { S5_LIMIT_BYTES, sizeReport, type CatalogueEntry } from '../../../tools/art3d/sizeReport';
import type { RealIndex, RealKind, RealSetEntry } from '../../../src/render/real/indexFormat';

function set(kind: RealKind, item: string, density: 2 | 4, rot: RealSetEntry['rot'], file: string, w = 10, h = 10): RealSetEntry {
  return { key: `${kind}:${item}:d${density}:r${rot}`, kind, item, density, rot, sheets: [{ file, w, h }], frames: {} };
}
function index(sets: RealSetEntry[]): RealIndex {
  return { format: 'real/1', pxPerMetreZoom1: 11.31, stepPxPerMetre: 9.8, densities: [2, 4], sets, bytes: { compressed: 0, decodedByDensity: { 2: 0, 4: 0 } } };
}
const cat = (kind: CatalogueEntry['kind'], ...ids: string[]): CatalogueEntry[] => ids.map((id) => ({ kind, id }));

describe('sizeReport', () => {
  it('sums per item', () => {
    const idx = index([
      set('ride', 'a', 2, 0, 'a2.webp'), set('ride', 'a', 4, 0, 'a4.webp', 20, 20), set('ride', 'a', 2, 1, 'a2b.webp'),
      set('scenery', 't', 2, 'all', 't.webp'),
    ]);
    const r = sizeReport(idx, new Map([['a2.webp', 100], ['a4.webp', 300], ['a2b.webp', 50], ['t.webp', 7]]), cat('ride', 'a'));
    expect(r.perItem.find((p) => p.id === 'a')!.compressedBytes).toBe(450);
    expect(r.perItem.find((p) => p.id === 'a')!.decodedPerTurn).toEqual({ d2: 400, d4: 1600 });
    expect(r.totalCompressed).toBe(457);
  });

  it('projects unbaked items by kind mean', () => {
    const idx = index([set('ride', 'a', 2, 0, 'a.webp'), set('ride', 'b', 2, 0, 'b.webp'), set('stall', 's', 2, 0, 's.webp')]);
    const files = new Map([['a.webp', 100], ['b.webp', 300], ['s.webp', 50]]);
    const r = sizeReport(idx, files, [...cat('ride', 'a', 'b', 'c', 'd'), ...cat('stall', 's', 't'), ...cat('show', 'x')]);
    // rides: mean 200 x 2 unbaked; stalls: 50 x 1; show has no baked item so adds nothing
    expect(r.projectedFull).toBe(450 + 400 + 50);
  });

  it('fails over 150 MB', () => {
    const idx = index([set('ride', 'a', 2, 0, 'a.webp')]);
    const files = new Map([['a.webp', 10_000_000]]);
    const ok = sizeReport(idx, files, cat('ride', 'a', 'b', 'c'));
    expect(ok.projectedFull).toBe(30_000_000);
    expect(ok.projectedFull).toBeLessThanOrEqual(S5_LIMIT_BYTES);
    const over = sizeReport(idx, files, cat('ride', ...Array.from({ length: 20 }, (_, i) => `r${i}`)));
    expect(over.projectedFull).toBeGreaterThan(S5_LIMIT_BYTES);
  });
});
