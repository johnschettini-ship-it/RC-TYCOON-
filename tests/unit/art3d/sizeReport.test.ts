import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ASSUMED_MEAN_BYTES, BIG_RIDES, S5_LIMIT_BYTES, catalogueEntries, railTileRanges, rideSizeRows, sizeReport, trackSizeRows, typePieces, type CatalogueEntry } from '../../../tools/art3d/sizeReport';
import { checkIndex, trackComplete } from '../../../tools/art3d/checkIndex';
import { reachedPoses } from '../../../tools/art3d/poses';
import { STAGE1_TRACK } from '../../../tools/art3d/trackBudget';
import type { RealFrame, RealIndex, RealKind, RealSetEntry } from '../../../src/render/real/indexFormat';

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

  it('projects track by frame area: measured frames kept, missing ones modelled from their rail height range', () => {
    // steel_coaster baked with one piece (straight, 1 rail tile) at every heading and both densities, 40 x 25 px (d2)
    // and 80 x 50 px (d4) frames; cars 2 frames per density.
    const fr = (w: number, h: number): RealFrame => ({ sheet: 'x', sx: 0, sy: 0, w, h, ox: 0, oy: 0 });
    const rails = ([2, 4] as const).flatMap((d) => ([0, 1, 2, 3] as const).map((r) => ({ ...set('rail', 'steel_coaster', d, r, `r${d}${r}.webp`, 20 * d, 25 * d), frames: { 'straight:t0': fr(20 * d, 25 * d) } })));
    const cars = ([2, 4] as const).map((d) => ({ ...set('car', 'steel_coaster', d, 'all', `c${d}.webp`, 30 * d, 15 * d), frames: { 'y0:p0:r0:full': fr(15 * d, 15 * d), 'y0:p0:r0:empty': fr(15 * d, 15 * d) } }));
    const files = new Map<string, number>([...rails.map((s) => [s.sheets[0]!.file, 1000] as [string, number]), ['c2.webp', 450], ['c4.webp', 1800]]);
    const cats: CatalogueEntry[] = [{ kind: 'track', id: 'steel_coaster', pieces: 34 }, { kind: 'track', id: 'junior_coaster', pieces: 20 }];
    const r = sizeReport(index([...rails, ...cars]), files, cats);
    const t = r.track!;
    // straight: dz 0, so h0 is the frame height; w the frame width
    expect(t.rail.d4).toEqual({ w: 80, h0: 100, pxPerM: 39.2 });
    expect(t.rail.d2).toEqual({ w: 40, h0: 50, pxPerM: 19.6 });
    // 8000 B over 4 x (40 x 50) + 4 x (80 x 100) frame px
    expect(t.railBytesPerPx).toBeCloseTo(8000 / 40000, 6);
    const steel = t.types.find((y) => y.id === 'steel_coaster')!;
    expect(steel).toMatchObject({ baked: true, pieces: 34, measuredBytes: 10250 });
    expect(steel.expectedFrames.rail).toBe(368);
    expect(steel.carPoses).toBe(472);
    // A loop tile (16 m of rail range) costs several times a straight one (dz 0) in the model.
    const loopDz = Math.max(...railTileRanges('vertical_loop_left', 0));
    expect(loopDz).toBeGreaterThanOrEqual(10);
    const area = (dz: number): number => t.rail.d4.w * (t.rail.d4.h0 + dz * t.rail.d4.pxPerM);
    expect(area(loopDz) / area(0)).toBeGreaterThan(4);
    // so steel (loops, corkscrews, helixes) projects more per rail tile than junior (none)
    const junior = t.types.find((y) => y.id === 'junior_coaster')!;
    expect(junior.baked).toBe(false);
    expect((steel.projectedBytes - steel.measuredBytes) / (steel.expectedFrames.rail - 4)).toBeGreaterThan(junior.projectedBytes / junior.expectedFrames.rail);
    expect(r.projectedFull).toBe(t.projectedBytes);
  });

  it('track rows hold every heading, the car set and the masks (stage 1 steel coaster: about 29 MiB at d4, not one turn)', () => {
    // The stage 1 sheets as baked (merge-b art, 2026-11-17): rails 755x817 (r0, r1) and 754x816 (r2, r3) at d4 with
    // masks, the car sheet 1159x1140 with its mask, supports 56x130 with masks.
    const masked = (kind: RealKind, rot: RealSetEntry['rot'], w: number, h: number): RealSetEntry => {
      const f = `${kind}${rot}.webp`;
      return { ...set(kind, 'steel_coaster', 4, rot, f), sheets: [{ file: f, w, h, mask: `${kind}${rot}-m.png` }, { file: `${kind}${rot}-m.png`, w, h }] };
    };
    const sets = [masked('rail', 0, 755, 817), masked('rail', 1, 755, 817), masked('rail', 2, 754, 816), masked('rail', 3, 754, 816),
      masked('support', 0, 56, 130), masked('support', 1, 56, 130), masked('support', 2, 56, 130), masked('support', 3, 56, 130), masked('car', 'all', 1159, 1140)];
    const r = sizeReport(index(sets), new Map(sets.flatMap((s) => s.sheets.map((x) => [x.file, 10] as [string, number]))), [{ kind: 'track', id: 'steel_coaster', pieces: 34 }]);
    const row = r.perItem.find((p) => p.id === 'steel_coaster')!;
    const rails = (2 * 755 * 817 + 2 * 754 * 816) * 4 * 2;
    const total = rails + 4 * 56 * 130 * 8 + 1159 * 1140 * 8;
    expect(row.residentAllClasses).toEqual({ d2: 0, d4: total });
    expect(total / 1024 / 1024).toBeCloseTo(29.1, 1);
    // not the old single-rotation peak (10.6 MiB: the car sheet and mask)
    expect(row.decodedPerTurn.d4).toBe(total);
    expect(row.perSet![0]).toEqual({ key: 'car:steel_coaster:d4:rall', d4Bytes: 1159 * 1140 * 8 });
    expect(row.perSet).toHaveLength(9);
  });

  it('track sets of the class layout (`rail:<type>~<class>`) count under their type', () => {
    const a = { ...set('rail', 'steel_coaster~base', 4, 0, 'a.webp', 10, 10), sheets: [{ file: 'a.webp', w: 10, h: 10, tint: 'alpha' as const }] };
    const b = set('rail', 'steel_coaster~loop', 4, 0, 'b.webp', 10, 20);
    const r = sizeReport(index([a, b]), new Map([['a.webp', 5], ['b.webp', 7]]), [{ kind: 'track', id: 'steel_coaster', pieces: 34 }]);
    expect(r.perItem).toHaveLength(1);
    expect(r.perItem[0]).toMatchObject({ id: 'steel_coaster', kind: 'track', compressedBytes: 12, residentAllClasses: { d2: 0, d4: 1200 } });
  });

  describe('track size rule (trackBudget)', () => {
    const MiB = 1024 * 1024;
    const over = (item: string): ReturnType<typeof trackSizeRows> => {
      // 8 MiB + 4 px: over the per-set limit at d4
      const s = { ...set('rail', item, 4, 0, 'a.webp', 1024, 2049), sheets: [{ file: 'a.webp', w: 1024, h: 2049 }] };
      return trackSizeRows(sizeReport(index([s]), new Map([['a.webp', 100]]), [{ kind: 'track', id: 'steel_coaster', pieces: 34 }, { kind: 'track', id: 'junior_coaster', pieces: 20 }]));
    };
    it('a set over 8 MiB decoded at d4 fails', () => {
      const r = over('junior_coaster~base');
      expect(r[0]!.problems).toEqual([`rail:junior_coaster~base:d4:r0: ${(1024 * 2049 * 4 / MiB).toFixed(2)} MiB decoded with masks, over 8.00 MiB`]);
      expect(over('steel_coaster~base')[0]!.problems).toHaveLength(1);
    });
    it('a stage 1 layout set of a declared type is reported, not failed', () => {
      const r = over('steel_coaster');
      expect(r[0]!.overSets).toEqual([{ key: 'rail:steel_coaster:d4:r0', d4Bytes: 1024 * 2049 * 4, allowed: true }]);
      expect(r[0]!.problems).toEqual([]);
    });
    it('compressed over the type limit fails (3 MB without loops, corkscrews or helixes)', () => {
      const s = set('rail', 'junior_coaster~base', 4, 0, 'a.webp');
      const r = trackSizeRows(sizeReport(index([s]), new Map([['a.webp', 3_000_001]]), [{ kind: 'track', id: 'junior_coaster', pieces: 20 }]));
      expect(r[0]!.problems).toEqual(['junior_coaster: 3.00 MB compressed, over 3.00 MB']);
    });
  });

  describe('TRACK_COMPLETE', () => {
    const fr: RealFrame = { sheet: 's.webp', sx: 0, sy: 0, w: 1, h: 1, ox: 0, oy: 0 };
    /** A complete fake bake of `type`'s `pieces` at both densities, in the class layout (`<type>~base`). */
    const complete = (type: string, pieces: readonly string[], d4Sheet: [number, number] = [8, 8]): RealSetEntry[] => {
      const out: RealSetEntry[] = [];
      for (const d of [2, 4] as const) {
        for (const r of [0, 1, 2, 3] as const) {
          const frames: Record<string, RealFrame> = {};
          for (const pc of pieces) railTileRanges(pc, r).forEach((_, ti) => { frames[`${pc}:t${ti}`] = fr; });
          const [w, h] = d === 4 && r === 0 ? d4Sheet : [8, 8];
          out.push({ ...set('rail', `${type}~base`, d, r, 's.webp', w, h), sheets: [{ file: 's.webp', w, h, tint: 'alpha' }], frames });
        }
        const frames: Record<string, RealFrame> = {};
        for (const p of reachedPoses(type, [...pieces])) for (const occ of ['full', 'empty']) frames[`y${p.yaw}:p${p.pitch}:r${p.roll}:${occ}`] = fr;
        out.push({ ...set('car', `${type}~base`, d, 'all', 's.webp', 8, 8), frames });
      }
      return out;
    };
    const steel = STAGE1_TRACK.steel_coaster!.pieces;

    it('a complete bake passes', () => {
      expect(trackComplete(index(complete('steel_coaster', steel)))).toEqual([]);
      expect(checkIndex(index(complete('steel_coaster', steel)), new Set(['s.webp']))).toEqual([]);
    });
    it('a missing piece frame fails, per density and heading', () => {
      const sets = complete('steel_coaster', steel);
      const r1 = sets.find((s) => s.key === 'rail:steel_coaster~base:d4:r1')!;
      delete r1.frames['turn_medium_left:t2'];
      expect(trackComplete(index(sets))).toEqual(['TRACK_COMPLETE rail:steel_coaster d4 r1: 1 rail frame(s) missing (turn_medium_left:t2)']);
    });
    it('a missing car pose fails', () => {
      const sets = complete('steel_coaster', steel);
      delete sets.find((s) => s.key === 'car:steel_coaster~base:d2:rall')!.frames['y8:p0:r0:empty'];
      expect(trackComplete(index(sets))).toEqual(['TRACK_COMPLETE car:steel_coaster d2: 1 car frame(s) missing (y8:p0:r0:empty)']);
    });
    it('a type not declared stage 1 must hold every piece it builds', () => {
      const pieces = typePieces('junior_coaster');
      expect(trackComplete(index(complete('junior_coaster', pieces)))).toEqual([]);
      const part = trackComplete(index(complete('junior_coaster', pieces.slice(0, 5))));
      expect(part.length).toBe(10); // 4 headings + cars, at each density
      expect(part[0]).toMatch(/^TRACK_COMPLETE rail:junior_coaster d2 r0: \d+ rail frame\(s\) missing/);
    });

    it('the command line exits 1 when a baked type breaks its per-set limit, 0 within it', () => {
      const run = (d4Sheet: [number, number]): { status: number; out: string } => {
        const dir = mkdtempSync(join(tmpdir(), 'trackfix-'));
        writeFileSync(join(dir, 's.webp'), Buffer.alloc(100));
        writeFileSync(join(dir, 'index.json'), JSON.stringify(index(complete('steel_coaster', steel, d4Sheet))));
        const p = spawnSync('npx', ['tsx', 'tools/art3d/checkIndexCli.ts', dir], { encoding: 'utf8' });
        return { status: p.status ?? -1, out: `${p.stdout}${p.stderr}` };
      };
      const bad = run([2048, 1025]); // 8.01 MiB: over 8 MiB
      expect(bad.out).toMatch(/TRACK SIZE RULE FAIL: rail:steel_coaster~base:d4:r0: 8\.01 MiB/);
      expect(bad.status).toBe(1);
      expect(run([2048, 1024]).status).toBe(0);
    }, 60000);
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
