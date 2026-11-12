/**
 * Phase 8b stage 0b test (never merged): B1. With `TC_B1_DIR`: every decoded entry (`decoded-<pack>.json`, Playwright
 * `b1 decode`) passes the format check, and every entry with a stage 0 reference (`ref-<pack>.json`, `$PROTO/s0`) has
 * the reference's trimmed hash. Writes `result.md` (counts per kind, the first 20 failures) and fails on any failure.
 * Rails (controller decision on B1): the `[-w, 2w] × [-h, 2h]` anchor bound was written for single-tile pictures; a
 * rail tile of a multi-tile or inverted piece lies away from its anchor (tile centre at the piece's base height), so
 * each rail rectangle is checked against its own slice's bounds (`sliceBounds`, rebuilt as the tool built it) in art px
 * around the rail anchor, with a 1 art-pixel margin. Key rows: `TC_B1_KEYS` (default `TC_B1_DIR/../art/keys`).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as hook from '../../../../src/render/artHook';
import { TRACK_PIECE_IDS, TRACK_TYPE_IDS } from '../../../../src/render/pixel/app/keys';
import { PX_Z, viewFrame } from '../../../../src/render/track/project';
import type { SliceRec } from '../../../../src/render/track/layer';
import type { TrackDir, TrackPieceInstance } from '../../../../src/sim/rides/track/types';
import { onePieceSlices, RAIL_AT } from '../../../../tools/sheets/catalogue/track';
import { pieceWorldTiles } from '../../../../src/sim/rides/track/geometry';

const DIR = process.env.TC_B1_DIR;

interface Decoded {
  entry: number;
  kind: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
  hash: number;
  formatOk: boolean;
  why: string;
}

/** Art px per metre (the tool's `ART_PER_M`). */
const ART_PER_M = PX_Z / 2;
/** Margin of the exact rail bound (art px): the ink ring may reach one pixel past the slice bounds. */
const RAIL_MARGIN = 1;

const slicesCache = new Map<string, SliceRec[]>();
/**
 * Why a rail rectangle is outside its slice (or '' when inside): the slice of (type, piece, dir, tile, view) built as
 * the tool built it (`onePieceSlices` at `RAIL_AT`); `sl.bounds` are world px around the slice anchor, which is
 * `RAIL_AT.z` metres below the rail anchor.
 */
function railBoundWhy(key: number, d: Decoded): string {
  let v = key;
  const view = v % 4;
  v = Math.floor(v / 4);
  const tile = v % 64;
  v = Math.floor(v / 64);
  const dir = (v % 4) as TrackDir;
  v = Math.floor(v / 4);
  const pieceId = TRACK_PIECE_IDS[v % 256] as string;
  const typeId = TRACK_TYPE_IDS[Math.floor(v / 256)] as string;
  const piece: TrackPieceInstance = { defId: pieceId, x: RAIL_AT.x, y: RAIL_AT.y, z: RAIL_AT.z, dir, chain: false, brakeSpeed: null, cost: 0 };
  const id = `${typeId}/${pieceId}/${dir}/${view}`;
  let slices = slicesCache.get(id);
  if (!slices) slicesCache.set(id, (slices = onePieceSlices(typeId, piece, viewFrame(view, 64, 64))));
  const t = pieceWorldTiles(piece)[tile];
  const sl = t ? slices.find((s) => s.x === t.x && s.y === t.y) : undefined;
  if (!sl) return `no slice for ${id} tile ${tile}`;
  const b = sl.bounds;
  const lift = RAIL_AT.z * ART_PER_M;
  // Picture rectangle in art px around the slice anchor.
  const x0 = -d.ox;
  const x1 = d.w - d.ox;
  const y0 = -d.oy - lift;
  const y1 = d.h - d.oy - lift;
  const L = Math.floor(b.left / 2) - RAIL_MARGIN;
  const R = Math.ceil(b.right / 2) + RAIL_MARGIN;
  const T = Math.floor(b.top / 2) - RAIL_MARGIN;
  const B = Math.ceil(b.bottom / 2) + RAIL_MARGIN;
  return x0 >= L && x1 <= R && y0 >= T && y1 <= B ? '' : `${id} tile ${tile}: rect x ${x0}..${x1}, y ${y0}..${y1} outside slice x ${L}..${R}, y ${T}..${B}`;
}

/** Kind code → name, from the `K_*` codes of the hook. */
const KIND_NAMES = new Map<number, string>(
  Object.entries(hook)
    .filter(([k, v]) => k.startsWith('K_') && typeof v === 'number')
    .map(([k, v]) => [v as number, k.slice(2).toLowerCase()]),
);

describe.skipIf(!DIR)('B1 compare', () => {
  it('format ok everywhere and equal hashes where a stage 0 reference exists', () => {
    const dir = DIR as string;
    const packs = readdirSync(dir)
      .filter((f) => f.startsWith('decoded-') && f.endsWith('.json'))
      .map((f) => f.slice('decoded-'.length, -'.json'.length))
      .sort();
    expect(packs.length).toBeGreaterThan(0);
    const counts = new Map<string, { entries: number; compared: number; equal: number; formatOk: number }>();
    const failures: string[] = [];
    let total = 0;
    let railsChecked = 0;
    let railFails = 0;
    const keysDir = process.env.TC_B1_KEYS ?? join(dir, '..', 'art', 'keys');
    for (const pack of packs) {
      const decoded = JSON.parse(readFileSync(join(dir, `decoded-${pack}.json`), 'utf8')) as Decoded[];
      const refPath = join(dir, `ref-${pack}.json`);
      const refs = new Map<number, number>();
      if (existsSync(refPath)) for (const r of JSON.parse(readFileSync(refPath, 'utf8')) as Array<{ entry: number; hash: number }>) refs.set(r.entry, r.hash);
      const seen = new Set<number>();
      const keyOf = new Map<number, number>();
      if (decoded.some((d) => d.kind === hook.K_RAIL))
        for (const r of JSON.parse(readFileSync(join(keysDir, `${pack}.json`), 'utf8')) as Array<{ entry: number; key: number }>) keyOf.set(r.entry, r.key);
      for (const d of decoded) {
        total++;
        seen.add(d.entry);
        const kind = KIND_NAMES.get(d.kind) ?? `kind ${d.kind}`;
        const c = counts.get(kind) ?? { entries: 0, compared: 0, equal: 0, formatOk: 0 };
        counts.set(kind, c);
        c.entries++;
        let formatOk = d.formatOk;
        if (d.kind === hook.K_RAIL) {
          railsChecked++;
          const key = keyOf.get(d.entry);
          const why = key === undefined ? 'no key row' : railBoundWhy(key, d);
          if (why) {
            railFails++;
            formatOk = false;
            failures.push(`${pack} entry ${d.entry} (${kind}): exact rail bound: ${why}`);
          }
        }
        if (formatOk) c.formatOk++;
        if (!d.formatOk) failures.push(`${pack} entry ${d.entry} (${kind}): format: ${d.why}`);
        const ref = refs.get(d.entry);
        if (ref !== undefined) {
          c.compared++;
          if (ref === d.hash) c.equal++;
          else failures.push(`${pack} entry ${d.entry} (${kind}): hash ${d.hash} vs stage 0 ${ref}`);
        }
      }
      for (const e of refs.keys()) if (!seen.has(e)) failures.push(`${pack} entry ${e}: has a reference but was not decoded`);
    }
    const lines = [
      '# B1 result (stage 0b)',
      '',
      `Packs: ${packs.join(', ')}. Entries: ${total}. Failures: ${failures.length}.`,
      '',
      'Rail anchors (controller decision on B1, second decode run): the `[-w, 2w] × [-h, 2h]` bound was written for',
      'single-tile pictures and is wrong for tiles of multi-tile and inverted rails, which lie away from their anchor',
      '(tile centre at the piece base height); the first run failed 240 rails on it only (`result.first-run.md`). Every',
      `rail is now checked against its own slice bounds (\`sliceBounds\`), 1 art-px margin: ${railsChecked} rails checked, ${railFails} outside.`,
      '',
      '| Kind | Entries | Compared | Equal | Format ok |',
      '|---|---|---|---|---|',
      ...[...counts.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, c]) => `| ${k} | ${c.entries} | ${c.compared} | ${c.equal} | ${c.formatOk} |`),
      '',
      failures.length ? '## First failures' : 'B1: pass (every compared hash equal, every entry format ok).',
      ...failures.slice(0, 20).map((f) => `- ${f}`),
      '',
    ];
    writeFileSync(join(dir, 'result.md'), lines.join('\n'));
    expect(failures).toEqual([]);
  });
});
