import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ASSUMED_MEAN_BYTES, BIG_RIDES, S5_LIMIT_BYTES, catalogueEntries, rideSizeRows, sizeReport, type CatalogueEntry } from '../../../tools/art3d/sizeReport';
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
    // rides: mean 200 x 2 unbaked; stalls: 50 x 1; show has no baked item, so its assumed mean x 1
    expect(r.projectedFull).toBe(450 + 400 + 50 + ASSUMED_MEAN_BYTES.show);
    expect(r.byKind.ride?.basis).toBe('measured');
  });

  it('an unbaked kind uses its assumed mean and is listed in assumedKinds', () => {
    const idx = index([set('ride', 'a', 2, 0, 'a.webp')]);
    const r = sizeReport(idx, new Map([['a.webp', 100]]), [...cat('ride', 'a'), ...cat('people', 'p', 'q')]);
    expect(r.assumedKinds).toEqual(['people']);
    expect(r.byKind.people).toMatchObject({ basis: 'assumed', mean: ASSUMED_MEAN_BYTES.people, projected: 2 * ASSUMED_MEAN_BYTES.people });
    expect(r.byKind.ride?.basis).toBe('measured');
    expect(r.projectedFull).toBe(100 + 2 * ASSUMED_MEAN_BYTES.people);
  });

  it('projects track from measured bytes per piece over each type\'s piece count', () => {
    const rail = (rot: 0 | 1, file: string): RealSetEntry => ({ ...set('rail', 'tc', 2, rot, file), frames: { 'p1:t0': {} as never, 'p2:t0': {} as never } });
    const idx = index([rail(0, 'r0.webp'), rail(1, 'r1.webp'), set('support', 'tc', 2, 0, 's.webp'), set('car', 'tc', 2, 0, 'c.webp')]);
    const files = new Map([['r0.webp', 100], ['r1.webp', 300], ['s.webp', 10], ['c.webp', 30]]);
    // 2 baked pieces, 400 B rail => 200 B/piece; supports+cars 40 B per type
    const cats: CatalogueEntry[] = [{ kind: 'track', id: 'tc', pieces: 2 }, { kind: 'track', id: 'u1', pieces: 10 }, { kind: 'track', id: 'u2', pieces: 5 }];
    const r = sizeReport(idx, files, cats);
    expect(r.track).toMatchObject({ bytesPerPiece: 200, bakedPieces: 2, fixedBytesPerType: 40 });
    expect(r.track!.types.map((t) => t.projectedBytes)).toEqual([440, 2040, 1040]);
    expect(r.track!.projectedBytes).toBe(3520);
    expect(r.projectedFull).toBe(3520); // baked 440 replaced by the type's full list
  });

  it('reports missing files', () => {
    const idx = index([set('ride', 'a', 2, 0, 'a.webp'), set('ride', 'a', 4, 0, 'gone.webp')]);
    const r = sizeReport(idx, new Map([['a.webp', 5]]), cat('ride', 'a'));
    expect(r.missingFiles).toEqual(['gone.webp']);
  });

  it('counts mask files in the item and the total', () => {
    const sh = { file: 'a.webp', w: 10, h: 10, mask: 'a.mask.webp' };
    const idx = index([{ ...set('ride', 'a', 2, 0, 'a.webp'), sheets: [sh] }]);
    const r = sizeReport(idx, new Map([['a.webp', 100], ['a.mask.webp', 40]]), cat('ride', 'a'));
    expect(r.perItem[0]?.compressedBytes).toBe(140);
    expect(r.totalCompressed).toBe(140);
    expect(r.missingFiles).toEqual([]);
    // listed as its own sheet too: still counted once
    const idx2 = index([{ ...set('ride', 'a', 2, 0, 'a.webp'), sheets: [sh, { file: 'a.mask.webp', w: 10, h: 10 }] }]);
    expect(sizeReport(idx2, new Map([['a.webp', 100], ['a.mask.webp', 40]]), cat('ride', 'a')).totalCompressed).toBe(140);
  });

  it('decoded per turn: resident counts the sheets only (a mask is decoded only during a tint), transient adds the masks', () => {
    const sh = { file: 'a.webp', w: 10, h: 10, mask: 'a.mask.webp' };
    const idx = index([{ ...set('ride', 'a', 4, 0, 'a.webp'), sheets: [sh, { file: 'a.mask.webp', w: 10, h: 10 }] }]);
    const r = sizeReport(idx, new Map([['a.webp', 100], ['a.mask.webp', 40]]), cat('ride', 'a'));
    const a = r.perItem.find((p) => p.id === 'a')!;
    expect(a.kind).toBe('ride');
    expect(a.residentPerTurn).toEqual({ d2: 0, d4: 400 });
    expect(a.decodedPerTurn).toEqual({ d2: 0, d4: 800 });
  });

  describe('flat ride size rules (with tint masks)', () => {
    const MiB = 1024 * 1024;
    /** One ride at d4, turn 0: a sheet of `px` pixels and its mask, `bytes` compressed in all. */
    const ride = (id: string, bytes: number, px: number): { sets: RealSetEntry[]; files: [string, number][] } => {
      const sh = { file: `${id}.webp`, w: px, h: 1, mask: `${id}-mask.webp` };
      return { sets: [{ ...set('ride', id, 4, 0, `${id}.webp`), sheets: [sh, { file: `${id}-mask.webp`, w: px, h: 1 }] }, set('shadow', id, 4, 0, `${id}-s.webp`)], files: [[`${id}.webp`, bytes - 1000], [`${id}-mask.webp`, 1000], [`${id}-s.webp`, 5_000_000]] };
    };
    const rows = (...rs: ReturnType<typeof ride>[]) => {
      const idx = index(rs.flatMap((r) => r.sets));
      const ids = rs.map((r) => r.sets[0]!.item);
      return rideSizeRows(sizeReport(idx, new Map(rs.flatMap((r) => r.files)), cat('ride', ...ids)), ids);
    };
    it('compressed (sheets and masks, not the shadow) at most 2.5 MB; 4 MB for bumper_cars, pendulum_ship, magic_carpet, thunder_disc', () => {
      expect(BIG_RIDES).toEqual(['bumper_cars', 'pendulum_ship', 'magic_carpet', 'thunder_disc']);
      const r = rows(ride('carousel', 2_500_000, 10), ride('big_wheel', 2_500_001, 10), ride('bumper_cars', 4_000_000, 10), ride('thunder_disc', 4_000_001, 10));
      expect(r.map((x) => [x.id, x.compressed, x.limit, x.problems.length])).toEqual([
        ['carousel', 2_500_000, 2_500_000, 0], ['big_wheel', 2_500_001, 2_500_000, 1], ['bumper_cars', 4_000_000, 4_000_000, 0], ['thunder_disc', 4_000_001, 4_000_000, 1],
      ]);
      expect(r[1]!.problems[0]).toBe('big_wheel: 2.50 MB compressed, over 2.50 MB');
    });
    it('decoded per turn at density 4 at most 32 MiB for the resident sheets; the transient (with masks) is reported', () => {
      const px = (32 * MiB) / 4;
      const r = rows(ride('carousel', 1000 + 1, px), ride('big_wheel', 1000 + 1, px + 1));
      expect(r[0]).toMatchObject({ residentD4: 32 * MiB, transientD4: 64 * MiB, problems: [] });
      expect(r[1]!.problems).toEqual(['big_wheel: 32.00 MiB decoded per turn at density 4, over 32.00 MiB']);
    });
    it('a ride with no baked sets is a problem; no ride is exempt (swing_tower holds the rule since fix round 1)', () => {
      expect(rideSizeRows(sizeReport(index([]), new Map(), cat('ride', 'x')), ['x'])[0]!.problems).toEqual(['x: not baked']);
      const big = rows(ride('swing_tower', 10_000_000, (40 * MiB) / 4))[0]!;
      expect(big.problems).toEqual(['swing_tower: 10.00 MB compressed, over 2.50 MB', 'swing_tower: 40.00 MiB decoded per turn at density 4, over 32.00 MiB']);
    });
  });

  it('throws when an id is in two kinds', () => {
    expect(() => sizeReport(index([]), new Map(), [...cat('ride', 'x'), ...cat('stall', 'x')])).toThrow(/two kinds/);
  });

  it('the real catalogue has no id in two kinds and every track type has pieces', () => {
    expect(() => sizeReport(index([]), new Map())).not.toThrow();
    for (const c of catalogueEntries().filter((e) => e.kind === 'track')) expect(c.pieces).toBeGreaterThan(5);
  });

  it('the command line exits 1 on a fixture over the limit and 0 under it', () => {
    const run = (bytes: number): number => {
      const dir = mkdtempSync(join(tmpdir(), 'sizefix-'));
      writeFileSync(join(dir, 'a.webp'), Buffer.alloc(bytes));
      writeFileSync(join(dir, 's.webp'), Buffer.alloc(100));
      // with its shadow sets: the index check wants every ride's shadow
      writeFileSync(join(dir, 'm.webp'), Buffer.alloc(100));
      // a ride set carries its tint mask and base colour (ride colour choice)
      const masked = (d: 2 | 4): RealSetEntry => ({ ...set('ride', 'carousel', d, 'all', 'a.webp'), baseColour: '#a8232b', sheets: [{ file: 'a.webp', w: 10, h: 10, mask: 'm.webp' }, { file: 'm.webp', w: 10, h: 10 }] });
      writeFileSync(join(dir, 'index.json'), JSON.stringify(index([masked(2), masked(4), set('shadow', 'carousel', 2, 'all', 's.webp'), set('shadow', 'carousel', 4, 'all', 's.webp')])));
      return spawnSync('npx', ['tsx', 'tools/art3d/checkIndexCli.ts', dir], { encoding: 'utf8' }).status ?? -1;
    };
    expect(run(10_000_000)).toBe(1); // 10 MB x 18 rides is over 150 MB
    expect(run(1_000)).toBe(0);
  }, 60000);

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
