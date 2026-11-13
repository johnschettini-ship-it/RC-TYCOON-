import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RealIndex, RealKind } from '../../src/render/real/indexFormat';

const MAX_SHEET = 2048;
const NEEDS_ALL_ROTS: ReadonlySet<RealKind> = new Set<RealKind>(['ride', 'stall', 'scenery', 'car']);

/** Returns a list of problems; empty means the index and the files agree. */
export function checkIndex(index: RealIndex, files: Set<string>): string[] {
  const problems: string[] = [];
  const referenced = new Set<string>();
  for (const set of index.sets) {
    const sheets = new Map<string, { w: number; h: number }>();
    for (const s of set.sheets) {
      sheets.set(s.file, s);
      referenced.add(s.file);
      if (!files.has(s.file)) problems.push(`${set.key}: unknown file ${s.file}`);
      if (s.w > MAX_SHEET || s.h > MAX_SHEET) problems.push(`${set.key}: sheet ${s.file} is ${s.w}x${s.h}, over ${MAX_SHEET}px`);
      if (s.mask !== undefined) {
        referenced.add(s.mask);
        if (!files.has(s.mask)) problems.push(`${set.key}: unknown file ${s.mask}`);
        const m = index.sets.flatMap((x) => x.sheets).find((x) => x.file === s.mask);
        if (m && (m.w !== s.w || m.h !== s.h)) problems.push(`${set.key}: mask ${s.mask} size differs from sheet ${s.file}`);
      }
    }
    for (const [k, f] of Object.entries(set.frames)) {
      const sh = sheets.get(f.sheet);
      if (!sh) { problems.push(`${set.key}: frame ${k} uses unlisted sheet ${f.sheet}`); continue; }
      if (f.sx < 0 || f.sy < 0 || f.sx + f.w > sh.w || f.sy + f.h > sh.h) problems.push(`${set.key}: frame ${k} outside sheet ${f.sheet}`);
      if (!Number.isFinite(f.ox) || !Number.isFinite(f.oy)) problems.push(`${set.key}: frame ${k} has non-finite ox/oy`);
    }
  }
  for (const f of files) if (f !== 'index.json' && !referenced.has(f)) problems.push(`file not in index: ${f}`);

  const groups = new Map<string, { kind: RealKind; item: string; density: number; rots: Set<string> }>();
  for (const set of index.sets) {
    if (!NEEDS_ALL_ROTS.has(set.kind)) continue;
    const id = `${set.kind}:${set.item}:d${set.density}`;
    const g = groups.get(id) ?? { kind: set.kind, item: set.item, density: set.density, rots: new Set<string>() };
    g.rots.add(String(set.rot));
    groups.set(id, g);
  }
  for (const [id, g] of groups) {
    if (g.rots.has('all')) continue;
    for (const r of ['0', '1', '2', '3']) if (!g.rots.has(r)) problems.push(`${id}: missing rotation ${r}`);
  }
  return problems;
}

function main(): void {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: tsx tools/art3d/checkIndex.ts <dir>'); process.exit(2); }
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as RealIndex;
  const problems = checkIndex(index, new Set(readdirSync(dir)));
  for (const p of problems) console.error(p);
  console.log(problems.length === 0 ? 'index OK' : `${problems.length} problem(s)`);
  process.exit(problems.length === 0 ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
