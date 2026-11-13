import { describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/real-index.json';
import { frameKey, setKey, type RealIndex } from '../../../../src/render/real/indexFormat';
import { checkIndex } from '../../../../tools/art3d/checkIndex';

const base = fixture as unknown as RealIndex;
const clone = (): RealIndex => structuredClone(base);
const filesOf = (i: RealIndex): Set<string> => new Set(i.sets.flatMap((s) => s.sheets.map((x) => x.file)));
const problems = (i: RealIndex, files = filesOf(i)): string[] => checkIndex(i, files);

describe('keys', () => {
  it('builds set and frame keys', () => {
    expect(setKey('ride', 'carousel', 2, 3)).toBe('ride:carousel:d2:r3');
    expect(setKey('ground', 'grass', 4, 'all')).toBe('ground:grass:d4:rall');
    expect(frameKey(['carousel', 'f7', 'occ2'])).toBe('carousel:f7:occ2');
  });
  it('fixture keys match setKey', () => {
    for (const s of base.sets) expect(s.key).toBe(setKey(s.kind, s.item, s.density, s.rot));
  });
});

describe('checkIndex', () => {
  it('fixture is clean', () => expect(problems(base)).toEqual([]));
  it('unknown file', () => {
    const f = filesOf(base); f.delete('ground-grass-d2.webp');
    expect(problems(base, f).some((p) => p.includes('unknown file'))).toBe(true);
  });
  it('file not in index', () => {
    const f = filesOf(base); f.add('stray.webp');
    expect(problems(base, f).some((p) => p.includes('file not in index'))).toBe(true);
  });
  it('sheet over 2048', () => {
    const i = clone(); i.sets[0]!.sheets[0]!.w = 4096;
    expect(problems(i).some((p) => p.includes('over 2048'))).toBe(true);
  });
  it('frame outside sheet', () => {
    const i = clone(); i.sets[0]!.frames['t0']!.sx = 120;
    expect(problems(i).some((p) => p.includes('outside sheet'))).toBe(true);
  });
  it('non-finite ox/oy', () => {
    const i = clone(); i.sets[0]!.frames['t0']!.oy = NaN;
    expect(problems(i).some((p) => p.includes('non-finite'))).toBe(true);
  });
  it('mask size differs', () => {
    const i = clone(); i.sets[1]!.sheets[1]!.w = 128;
    expect(problems(i).some((p) => p.includes('mask'))).toBe(true);
  });
  it('missing rotation', () => {
    const i = clone(); i.sets = i.sets.filter((s) => s.key !== 'ride:carousel:d2:r2');
    expect(problems(i).some((p) => p.includes('missing rotation 2'))).toBe(true);
  });
  it('rot all satisfies rotations', () => {
    const i = clone(); const r = i.sets.find((s) => s.kind === 'ride')!;
    i.sets = [r]; r.rot = 'all';
    expect(problems(i, filesOf(i)).filter((p) => p.includes('rotation'))).toEqual([]);
  });
});
