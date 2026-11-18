/**
 * Pure validator of the baked realistic-art index (no node: imports, so the bake page or the game could import it).
 * The command line lives in checkIndexCli.ts; running this file directly forwards to it:
 *   npx tsx tools/art3d/checkIndex.ts <dir>
 */
import type { RealIndex, RealKind } from '../../src/render/real/indexFormat';
import { checkCoverFolder, checkTitleIndex, type TitleFiles } from './titleIndex';
import { carPoses, hasFrontCar } from './poses';
import { railTileRanges, typePieces } from './sizeReport';
import { trackTypeOfItem } from './trackBudget';
import { TRACK_CLASSES, carQuadrant, pieceClass, poseClassOf, poseCode } from '../../src/render/real/trackClasses';
import { getTrackPieceDef } from '../../src/data/track';

const MAX_SHEET = 2048;
/**
 * Piece groups whose rail frames have parts that never take the track colour (station decks, brake and block-brake
 * fins, water channels): they must sit on a masked sheet, never on an alpha-tint one (batch 5 tint rule).
 */
export const UNTINTED_GROUPS: readonly string[] = ['S', 'Br', 'BB', 'W'];
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
      if (f.density !== undefined && (f.density !== 2 || set.density === 2 || !UNTINTED_PART.test(k))) problems.push(`${set.key}: frame ${k} has density ${String(f.density)}; only an untinted track frame of a density-4 set may be kept at density 2`);
    }
  }
  // Track class sets and alpha tint (batch 5 Task 2): a `<type>~<class>` item names a known class and only rail and car
  // sets have classes; an alpha-tint sheet is a rail sheet without a mask (cars and supports keep masks).
  for (const set of index.sets) {
    const cls = set.item.includes('~') ? set.item.slice(set.item.indexOf('~') + 1) : null;
    if (cls !== null && (set.kind !== 'rail' && set.kind !== 'car')) problems.push(`${set.key}: only rail and car sets have track classes`);
    if (cls !== null && !(TRACK_CLASSES as readonly string[]).includes(cls)) problems.push(`${set.key}: unknown track class '${cls}'`);
    // Never tint station decks, brake fins or water (review fix): their frames sit on a masked sheet.
    if (set.kind === 'rail') {
      const alphaSheets = new Set(set.sheets.filter((s) => s.tint === 'alpha').map((s) => s.file));
      for (const [k, f] of Object.entries(set.frames)) {
        const g = getTrackPieceDef(k.split(':')[0] ?? '')?.group;
        if (g !== undefined && UNTINTED_GROUPS.includes(g) && alphaSheets.has(f.sheet)) problems.push(`${set.key}: frame ${k} (group ${g}: untinted parts) is on alpha-tint sheet ${f.sheet}; it needs a masked sheet`);
      }
    }
    // Untinted track extras (batch 5 Tasks 4-5: shadows `…:sh`, chain troughs `…:chain`) sit on plain sheets (no mask,
    // no tint, not a mask), and every other frame of a track set on a tinted one (a mask, or alpha-tint).
    if (set.kind === 'rail' || set.kind === 'support' || set.kind === 'car') {
      const masks = new Set(set.sheets.flatMap((s) => (s.mask === undefined ? [] : [s.mask])));
      const plain = new Set(set.sheets.filter((s) => s.mask === undefined && s.tint === undefined && !masks.has(s.file)).map((s) => s.file));
      for (const [k, f] of Object.entries(set.frames)) {
        const extra = UNTINTED_PART.test(k);
        if (extra && !plain.has(f.sheet)) problems.push(`${set.key}: frame ${k} (untinted) is on tinted sheet ${f.sheet}; it needs a plain sheet`);
        else if (!extra && plain.has(f.sheet)) problems.push(`${set.key}: frame ${k} is on plain sheet ${f.sheet}; only shadows and chain troughs are untinted`);
      }
    }
    for (const s of set.sheets) {
      if (s.tint === undefined) continue;
      if (s.tint !== 'alpha') problems.push(`${set.key}: sheet ${s.file} has unknown tint '${String(s.tint)}'`);
      else if (set.kind !== 'rail') problems.push(`${set.key}: sheet ${s.file} is alpha-tinted; only rail sheets may be`);
      else if (s.mask !== undefined) problems.push(`${set.key}: sheet ${s.file} is alpha-tinted and has a mask`);
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
 * TRACK_COMPLETE (batch 5 Task 1; review fix; Task 3): a baked track type has a rail frame for every (piece it builds,
 * rail tile, heading, density) and a car frame for every pose it bakes (`carPoses`: its reached poses, all 32 yaws of
 * them on a spinning type), full and empty (and `front` for a type with a front car), at every density, in the set the
 * game looks it up in:
 *   - class layout (`rail:<type>~<class>`): a rail frame in its piece's class set (`pieceClass`), a car frame in its
 *     pose's class set (`poseClassOf`: a spun yaw no piece reaches is `base`) at its yaw quadrant (`carQuadrant`,
 *     `car:<type>~<class>:r<q>`); a frame filed in another class's or quadrant's set is missing, since the game never
 *     finds it;
 *   - stage 1 layout (`rail:<type>`, `car:<type>`, which the game still reads): the one set per heading (and the one car
 *     set).
 * A type may not have both layouts (the game would load both). A rail tile cut into stacked sub-frames
 * (`<piece>:t<i>:u<k>`) is a problem: the reader draws one picture per tile and never looks a sub-frame up (Task 3
 * review P2), so such a tile is both missing and carrying frames nothing draws.
 */
/** A track frame that is never tinted (batch 5): a shadow (`…:sh`, Task 4) or a chain trough (`…:chain`, Task 5). */
const UNTINTED_PART = /:(sh|chain)$/;
/** Every frame of a support set of a class-layout type: the parts and their shadows. */
const SUPPORT_FRAMES = ['foot', 'seg', 'top', 'foot:sh', 'seg:sh', 'top:sh'];

export function trackComplete(index: RealIndex): string[] {
  const problems: string[] = [];
  const types = new Set(index.sets.filter((s) => s.kind === 'rail' || s.kind === 'car').map((s) => trackTypeOfItem(s.item)));
  for (const type of [...types].sort()) {
    let pieces: readonly string[];
    try {
      pieces = typePieces(type);
    } catch {
      problems.push(`TRACK_COMPLETE ${type}: not a track type`);
      continue;
    }
    const ofType = index.sets.filter((s) => (s.kind === 'rail' || s.kind === 'car') && trackTypeOfItem(s.item) === type);
    const classed = (kind: RealKind): boolean => ofType.some((s) => s.kind === kind && s.item !== type);
    const plain = (kind: RealKind): boolean => ofType.some((s) => s.kind === kind && s.item === type);
    for (const kind of ['rail', 'car'] as const) if (classed(kind) && plain(kind)) problems.push(`TRACK_COMPLETE ${type}: ${kind} sets in both layouts (${kind}:${type} and ${kind}:${type}~<class>)`);
    /** Frame keys of the set (`item`, density, turn). */
    const frames = new Map<string, Set<string>>();
    for (const s of ofType) {
      const k = `${s.kind}|${s.item}|${s.density}|${s.rot}`;
      const f = frames.get(k) ?? new Set<string>();
      for (const fk of Object.keys(s.frames)) f.add(fk);
      frames.set(k, f);
    }
    const has = (kind: string, item: string, d: number, rot: number | 'all', fk: string): boolean => frames.get(`${kind}|${item}|${d}|${rot}`)?.has(fk) ?? false;
    const railItem = (pc: string): string => (classed('rail') ? `${type}~${pieceClass(pc)}` : type);
    const carItem = (code: number): string => (classed('car') ? `${type}~${poseClassOf(type, code)}` : type);
    /** The set a car frame is in: its yaw quadrant's in the class layout, the one `rall` set in the stage 1 layout. */
    const carRot = (yaw: number): number | 'all' => (classed('car') ? carQuadrant(yaw) : 'all');
    // A support set of a class-layout type holds every part and its shadow (Task 4).
    if (classed('rail')) {
      for (const s of index.sets.filter((x) => x.kind === 'support' && x.item === type)) {
        const l = SUPPORT_FRAMES.filter((fk) => !(fk in s.frames));
        if (l.length) problems.push(`TRACK_COMPLETE support:${type} d${s.density} r${s.rot}: ${l.length} support frame(s) missing (${l.join(', ')})`);
      }
    }
    const poses = carPoses(type, pieces);
    const occs = hasFrontCar(type) ? ['full', 'empty', 'full:front', 'empty:front'] : ['full', 'empty'];
    for (const d of index.densities) {
      for (const h of [0, 1, 2, 3] as const) {
        const lack = new Map<string, string[]>();
        for (const pc of pieces) {
          const item = railItem(pc);
          railTileRanges(pc, h).forEach((_, ti) => {
            const fk = `${pc}:t${ti}`;
            if (!has('rail', item, d, h, fk)) (lack.get(item) ?? lack.set(item, []).get(item)!).push(fk);
          });
        }
        for (const [item, l] of lack) problems.push(`TRACK_COMPLETE rail:${item} d${d} r${h}: ${l.length} rail frame(s) missing (${l.slice(0, 4).join(', ')})`);
        // the class layout (batch 5) bakes every rail tile's shadow (Task 4)
        if (classed('rail')) {
          const noShadow = new Map<string, string[]>();
          for (const pc of pieces) {
            const item = railItem(pc);
            railTileRanges(pc, h).forEach((_, ti) => {
              const fk = `${pc}:t${ti}:sh`;
              if (has('rail', item, d, h, `${pc}:t${ti}`) && !has('rail', item, d, h, fk)) (noShadow.get(item) ?? noShadow.set(item, []).get(item)!).push(fk);
            });
          }
          for (const [item, l] of noShadow) problems.push(`TRACK_COMPLETE rail:${item} d${d} r${h}: ${l.length} rail shadow(s) missing (${l.slice(0, 4).join(', ')})`);
          // and every rail tile's chain trough of a chainable piece (Task 5)
          const noTrough = new Map<string, string[]>();
          for (const pc of pieces) {
            if (!getTrackPieceDef(pc)?.chainable) continue;
            const item = railItem(pc);
            railTileRanges(pc, h).forEach((_, ti) => {
              const fk = `${pc}:t${ti}:chain`;
              if (has('rail', item, d, h, `${pc}:t${ti}`) && !has('rail', item, d, h, fk)) (noTrough.get(item) ?? noTrough.set(item, []).get(item)!).push(fk);
            });
          }
          for (const [item, l] of noTrough) problems.push(`TRACK_COMPLETE rail:${item} d${d} r${h}: ${l.length} chain trough(s) missing (${l.slice(0, 4).join(', ')})`);
        }
        for (const s of ofType) {
          if (s.kind !== 'rail' || s.density !== d || s.rot !== h) continue;
          const subs = Object.keys(s.frames).filter((fk) => /:u\d+$/.test(fk));
          if (subs.length) problems.push(`TRACK_COMPLETE rail:${s.item} d${d} r${h}: sub-frame(s) the reader never draws (${subs.slice(0, 4).join(', ')})`);
        }
      }
      const lack = new Map<string, string[]>();
      for (const p of poses) {
        const item = carItem(poseCode(p.yaw, p.pitch, p.roll));
        const rot = carRot(p.yaw);
        const where = rot === 'all' ? item : `${item} d${d} r${rot}`;
        for (const occ of occs) {
          const fk = `y${p.yaw}:p${p.pitch}:r${p.roll}:${occ}`;
          if (!has('car', item, d, rot, fk)) (lack.get(where) ?? lack.set(where, []).get(where)!).push(fk);
        }
      }
      for (const [where, l] of lack) problems.push(`TRACK_COMPLETE car:${where.includes(' ') ? where : `${where} d${d}`}: ${l.length} car frame(s) missing (${l.slice(0, 4).join(', ')})`);
    }
  }
  return problems;
}

declare const process: { argv: string[] } | undefined;
if (typeof process !== 'undefined' && /checkIndex\.ts$/.test(process.argv[1] ?? '')) {
  void import('./checkIndexCli').then((m) => m.main(process.argv[2]));
}
