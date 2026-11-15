/**
 * Pure validator of the baked realistic-art index (no node: imports, so the bake page or the game could import it).
 * The command line lives in checkIndexCli.ts; running this file directly forwards to it:
 *   npx tsx tools/art3d/checkIndex.ts <dir>
 */
import type { RealIndex, RealKind } from '../../src/render/real/indexFormat';

const MAX_SHEET = 2048;
const NEEDS_ALL_ROTS: ReadonlySet<RealKind> = new Set<RealKind>(['ride', 'stall', 'scenery', 'car']);

const okNum = (n: number): boolean => Number.isFinite(n) && n >= 0;

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
      if (!Number.isFinite(s.w) || !Number.isFinite(s.h)) problems.push(`${set.key}: sheet ${s.file} size is not finite`);
      if (s.w > MAX_SHEET || s.h > MAX_SHEET) problems.push(`${set.key}: sheet ${s.file} is ${s.w}x${s.h}, over ${MAX_SHEET}px`);
    }
    for (const s of set.sheets) {
      if (s.mask === undefined) continue;
      referenced.add(s.mask);
      if (!files.has(s.mask)) problems.push(`${set.key}: unknown file ${s.mask}`);
      const m = set.sheets.find((x) => x.file === s.mask);
      if (!m) problems.push(`${set.key}: mask not listed as a sheet: ${s.mask}`);
      else if (m.w !== s.w || m.h !== s.h) problems.push(`${set.key}: mask ${s.mask} size differs from sheet ${s.file}`);
    }
    for (const [k, f] of Object.entries(set.frames)) {
      const sh = sheets.get(f.sheet);
      if (!sh) { problems.push(`${set.key}: frame ${k} uses unlisted sheet ${f.sheet}`); continue; }
      if (!okNum(f.sx) || !okNum(f.sy) || !okNum(f.w) || !okNum(f.h)) { problems.push(`${set.key}: frame ${k} has a non-finite or negative rectangle`); continue; }
      if (f.sx + f.w > sh.w || f.sy + f.h > sh.h) problems.push(`${set.key}: frame ${k} outside sheet ${f.sheet}`);
      if (!Number.isFinite(f.ox) || !Number.isFinite(f.oy)) problems.push(`${set.key}: frame ${k} has non-finite ox/oy`);
    }
  }
  for (const f of files) if (f !== 'index.json' && f !== 'size-report.json' && !referenced.has(f)) problems.push(`file not in index: ${f}`);

  // every item at every density the index lists, and no other density
  const listed = new Set<number>(index.densities as readonly number[]);
  const dens = new Map<string, Set<number>>();
  for (const set of index.sets) {
    if (!listed.has(set.density)) problems.push(`${set.key}: density ${set.density} not in the index densities`);
    const id = `${set.kind}:${set.item}`;
    const d = dens.get(id) ?? new Set<number>();
    d.add(set.density);
    dens.set(id, d);
  }
  // Card pictures are one density-2 set (always loaded, drawn at card size), whatever densities the bake holds.
  for (const [id, d] of dens) {
    if (id.startsWith('preview:')) {
      if (!d.has(2) || d.size !== 1) problems.push(`${id}: card pictures must be density 2 only`);
      continue;
    }
    for (const x of listed) if (!d.has(x)) problems.push(`${id}: missing density ${x}`);
  }

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

  // every placed object (ride, stall, scenery) has its shadow: same item and density, its turn or 'all'. An object
  // baked for every turn (rot 'all') takes shadows per turn instead (a path item's shadow is turned by its side), but
  // then one for every turn: a lost one would leave that side drawing today's shadow (fix round 1, M2). A shadow the
  // bake lost (empty picture) left the object drawing today's shadow in the game, which no other check saw.
  const shadows = new Map<string, Set<string>>();
  for (const set of index.sets) if (set.kind === 'shadow') {
    const id = `${set.item}:d${set.density}`;
    shadows.set(id, (shadows.get(id) ?? new Set<string>()).add(String(set.rot)));
  }
  for (const set of index.sets) {
    if (set.kind !== 'ride' && set.kind !== 'stall' && set.kind !== 'scenery') continue;
    const rots = shadows.get(`${set.item}:d${set.density}`);
    const ok = !!rots && (rots.has('all') || rots.has(String(set.rot)) || (set.rot === 'all' && ['0', '1', '2', '3'].every((r) => rots.has(r))));
    if (!ok) problems.push(`${set.key}: no shadow set`);
  }
  // The reader looks a frame key up at whichever density it draws (a density-4 set's twin stands in for it, the cap
  // lowers it), so a set's two densities list the same frame keys, even where density 2 has fewer pictures (rides).
  const byTurn = new Map<string, Set<string>>();
  for (const set of index.sets) if (set.density === 4) byTurn.set(`${set.kind}:${set.item}:r${set.rot}`, new Set(Object.keys(set.frames)));
  for (const set of index.sets) {
    if (set.density !== 2) continue;
    const up = byTurn.get(`${set.kind}:${set.item}:r${set.rot}`);
    if (!up) continue;
    const low = Object.keys(set.frames);
    const missing = [...up].filter((k) => !(k in set.frames));
    const extra = low.filter((k) => !up.has(k));
    if (missing.length) problems.push(`${set.key}: ${missing.length} frame keys of density 4 missing at density 2 (${missing.slice(0, 3).join(', ')})`);
    if (extra.length) problems.push(`${set.key}: ${extra.length} frame keys not at density 4 (${extra.slice(0, 3).join(', ')})`);
  }
  return problems;
}

declare const process: { argv: string[] } | undefined;
if (typeof process !== 'undefined' && /checkIndex\.ts$/.test(process.argv[1] ?? '')) {
  void import('./checkIndexCli').then((m) => m.main(process.argv[2]));
}
