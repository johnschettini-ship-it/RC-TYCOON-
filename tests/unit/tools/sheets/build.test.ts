/** Phase 8b stage 0b test (never merged): sheet build (files, indexes, report) and the app output check. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decodeIndex } from '../../../../src/render/pixel/app/format';
import { clearSurfaceArt, installSurfaceArt } from '../../../../src/render/pixel/surfaceArt';
import { checkApp } from '../../../../scripts/check-app';
import { buildSheets } from '../../../../tools/sheets/build';
import { groundSpecs } from '../../../../tools/sheets/catalogue/ground';
import { objectSpecs } from '../../../../tools/sheets/catalogue/objects';
import type { PictureSpec } from '../../../../tools/sheets/catalogue/types';

beforeEach(installSurfaceArt);
afterEach(clearSurfaceArt);

const specs = (): PictureSpec[] => [...objectSpecs().slice(0, 200), ...groundSpecs().slice(0, 20)];

let built: ReturnType<typeof buildSheets> | null = null;
const small = (): ReturnType<typeof buildSheets> => {
  if (!built) {
    installSurfaceArt();
    built = buildSheets(specs(), {});
  }
  return built;
};

const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

describe('buildSheets', () => {
  it('builds a small catalogue into sheets and an index that decodes', () => {
    const b = small();
    const byPath = new Map(b.files.map((f) => [f.path, f.bytes]));
    expect(b.packs.length).toBeGreaterThan(0);
    for (const p of b.packs) {
      const bytes = byPath.get(p.index);
      expect(bytes, p.index).toBeDefined();
      expect(p.index).toBe(`art/${p.name}/index-${p.hash}.bin`);
      const ix = decodeIndex(bytes as Uint8Array);
      expect(ix.swaps.length).toBe(38);
      const dir = dirname(p.index);
      for (const s of ix.sheets) {
        expect(byPath.has(`${dir}/${s.file}`), s.file).toBe(true);
        expect(s.w).toBeLessThanOrEqual(2048);
        expect(s.h).toBeLessThanOrEqual(2048);
      }
      for (let e = 0; e < ix.kind.length; e++) {
        const s = ix.sheets[ix.sheet[e] as number];
        expect(s).toBeDefined();
        expect((ix.x[e] as number) + (ix.w[e] as number)).toBeLessThanOrEqual(s!.w);
        expect((ix.y[e] as number) + (ix.h[e] as number)).toBeLessThanOrEqual(s!.h);
      }
      const r = b.report.packs[p.name]!;
      expect(r.sheets).toBe(ix.sheets.length);
      expect(r.pictures).toBe(ix.kind.length);
      expect(r.pngBytes).toBe(ix.sheets.reduce((n, s) => n + byPath.get(`${dir}/${s.file}`)!.length, 0));
      expect(r.decodedBytes).toBe(ix.sheets.reduce((n, s) => n + s.w * s.h * 4, 0));
      expect(b.keys[p.name]!.length).toBe(ix.kind.length);
    }
    const packs = Object.values(b.report.packs);
    expect(packs.reduce((n, p) => n + p.pictures, 0)).toBe(220);
    expect(b.report.totalPngBytes).toBe(packs.reduce((n, p) => n + p.pngBytes, 0));
    expect(Object.values(b.report.kinds).reduce((n, k) => n + k.pictures, 0)).toBe(220);
    expect(b.report.appArtBytesFull).toBe(b.files.reduce((n, f) => n + f.bytes.length, 0));
    expect(b.report.appArtBytesCoarseOnly).toBeLessThan(b.report.appArtBytesFull);
  });

  it('the same input gives the same file names', () => {
    const again = buildSheets(specs(), {});
    expect(again.files.map((f) => f.path)).toEqual(small().files.map((f) => f.path));
  });

  it('checkApp finds a missing sheet and an extra file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tc-check-app-'));
    temps.push(dir);
    for (const f of small().files) {
      mkdirSync(dirname(join(dir, f.path)), { recursive: true });
      writeFileSync(join(dir, f.path), f.bytes);
    }
    expect(checkApp(dir).ok).toBe(true);
    const sheet = small().files.find((f) => f.path.endsWith('.png'))!;
    rmSync(join(dir, sheet.path));
    writeFileSync(join(dir, 'art', 'stray.png'), new Uint8Array(4));
    const r = checkApp(dir);
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toContain(sheet.path);
    expect(r.lines.join('\n')).toContain('art/stray.png');
  });
});
