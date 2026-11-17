/**
 * Pure validator of the baked realistic-art index (no node: imports, so the bake page or the game could import it).
 * The command line lives in checkIndexCli.ts; running this file directly forwards to it:
 *   npx tsx tools/art3d/checkIndex.ts <dir>
 */
import type { RealIndex, RealKind } from '../../src/render/real/indexFormat';
import { checkCoverFolder, checkTitleIndex, type TitleFiles } from './titleIndex';
import { reachedPoses } from './poses';
import { railTileRanges, typePieces } from './sizeReport';
import { STAGE1_TRACK, trackTypeOfItem } from './trackBudget';

const MAX_SHEET = 2048;
const NEEDS_ALL_ROTS: ReadonlySet<RealKind> = new Set<RealKind>(['ride', 'stall', 'scenery', 'car']);

/** `#rrggbb` (either case). */
const HEX = /^#[0-9a-f]{6}$/i;

const okNum = (n: number): boolean => Number.isFinite(n) && n >= 0;

/** The title folder (`title/` beside index.json): its index.json and its files (titleIndex.ts). */
export interface TitleFolder { index: unknown; files: TitleFiles }

/**
 * Returns a list of problems; empty means the index and the files agree. `files` lists the folder's entries; a
 * `title` entry is the title cover's folder, checked by checkCoverFolder when `title` is given (a problem when not);
 * a `title-panorama` entry is the earlier baked panorama (only baked on request), checked by checkTitleIndex.
 */
export function checkIndex(index: RealIndex, files: Set<string>, title?: TitleFolder, panorama?: TitleFolder): string[] {
  const problems: string[] = [];
  if (files.has('title')) {
    if (!title) problems.push('title: the title folder was not checked (no cover index given)');
    else for (const p of checkCoverFolder(title.index, title.files)) problems.push(`title: ${p}`);
  }
  if (files.has('title-panorama')) {
    if (!panorama) problems.push('title-panorama: the panorama folder was not checked (no title index given)');
    else for (const p of checkTitleIndex(panorama.index, panorama.files)) problems.push(`title-panorama: ${p}`);
  }
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
  for (const f of files) if (f !== 'index.json' && f !== 'size-report.json' && f !== 'title' && f !== 'title-panorama' && !referenced.has(f)) problems.push(`file not in index: ${f}`);

  // Ride colour choice: every ride sheet has a tint mask of the ride's colour part, and the ride records the part's
  // designed base colour, the same in every set (turns and densities), so a chosen colour can recolour it at load.
  const bases = new Map<string, Set<string>>();
  for (const set of index.sets) {
    if (set.kind !== 'ride') continue;
    const masks = new Set(set.sheets.flatMap((s) => (s.mask === undefined ? [] : [s.mask])));
    for (const s of set.sheets) if (!masks.has(s.file) && s.mask === undefined) problems.push(`${set.key}: sheet ${s.file} has no tint mask (ride colour)`);
    const b = set.baseColour;
    if (b === undefined) problems.push(`${set.key}: base colour missing (ride colour)`);
    else if (!HEX.test(b)) problems.push(`${set.key}: base colour '${b}' is not #rrggbb (ride colour)`);
    else {
      const id = `${set.kind}:${set.item}`;
      bases.set(id, (bases.get(id) ?? new Set<string>()).add(b.toLowerCase()));
    }
  }
  for (const [id, b] of bases) if (b.size > 1) problems.push(`${id}: base colours differ between its sets (${[...b].join(', ')})`);

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
  problems.push(...trackComplete(index));
  return problems;
}

/**
 * TRACK_COMPLETE (batch 5 Task 1): a baked track type has a rail frame for every (piece, rail tile, heading, density)
 * and a car frame for every reached pose, full and empty, at every density, in whichever of its sets (stage 1
 * `rail:<type>` or the class sets `rail:<type>~<class>`). The pieces are every piece the type builds, or the stage 1
 * list of a type declared in `STAGE1_TRACK`. Spin yaws and front-car variants are checked from Task 3, which bakes them.
 */
export function trackComplete(index: RealIndex): string[] {
  const problems: string[] = [];
  const types = new Set(index.sets.filter((s) => s.kind === 'rail' || s.kind === 'car').map((s) => trackTypeOfItem(s.item)));
  for (const type of [...types].sort()) {
    let pieces: readonly string[];
    try {
      pieces = STAGE1_TRACK[type]?.pieces ?? typePieces(type);
    } catch {
      problems.push(`TRACK_COMPLETE ${type}: not a track type`);
      continue;
    }
    const frames = (kind: RealKind, density: number, rot: number | 'all'): Set<string> => {
      const out = new Set<string>();
      for (const s of index.sets) if (s.kind === kind && s.density === density && s.rot === rot && trackTypeOfItem(s.item) === type) for (const k of Object.keys(s.frames)) out.add(k);
      return out;
    };
    const poses = reachedPoses(type, [...pieces]);
    for (const d of index.densities) {
      for (const h of [0, 1, 2, 3] as const) {
        const have = frames('rail', d, h);
        const lack: string[] = [];
        for (const pc of pieces) railTileRanges(pc, h).forEach((_, ti) => { if (!have.has(`${pc}:t${ti}`)) lack.push(`${pc}:t${ti}`); });
        if (lack.length) problems.push(`TRACK_COMPLETE rail:${type} d${d} r${h}: ${lack.length} rail frame(s) missing (${lack.slice(0, 4).join(', ')})`);
      }
      const have = frames('car', d, 'all');
      const lack: string[] = [];
      for (const p of poses) for (const occ of ['full', 'empty']) { const k = `y${p.yaw}:p${p.pitch}:r${p.roll}:${occ}`; if (!have.has(k)) lack.push(k); }
      if (lack.length) problems.push(`TRACK_COMPLETE car:${type} d${d}: ${lack.length} car frame(s) missing (${lack.slice(0, 4).join(', ')})`);
    }
  }
  return problems;
}

declare const process: { argv: string[] } | undefined;
if (typeof process !== 'undefined' && /checkIndex\.ts$/.test(process.argv[1] ?? '')) {
  void import('./checkIndexCli').then((m) => m.main(process.argv[2]));
}
