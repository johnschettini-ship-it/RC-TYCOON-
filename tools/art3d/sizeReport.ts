/**
 * Size report of a baked realistic-art index and the S5 projection (kill rule: app art <= 150 MB).
 *
 * Kinds used for the projection (the registry's catalogue kind, with two additions):
 *   ride / stall / scenery  the catalogue kind (index set kind of the same name)
 *   track                   one per track TYPE (TRACK_RIDES); a baked track item's rail, support and car sets all count
 *   path                    PATH_ITEMS (bench, bin, lamp)
 *   people                  STAFF
 *   show                    SHOW_SITES
 * Anything in the index that is not a catalogue item (ground, shadows, guests, facade, card pictures) is a fixed cost:
 * it is in the baked total and is never multiplied. A catalogue kind with no baked item yet uses its assumed mean (below).
 * Track is projected from the pieces: bytes per piece measured on the baked track item (its rail sets / distinct baked
 * pieces), times each type's piece count from the track defs, plus the baked supports and cars once per type. A
 * kind with no baked item uses ASSUMED_MEAN_BYTES (basis 'assumed', listed in assumedKinds); it never fails the gate.
 */
import { ALL_TRACK_PIECES, ALL_TRACK_TYPES } from '../../src/data/track';
import { FLAT_RIDES, PATH_ITEMS, SCENERY, SHOW_SITES, STALLS, STAFF, TRACK_RIDES } from '../../src/data/catalog';
import type { RealIndex, RealSetEntry } from '../../src/render/real/indexFormat';

/** S5: the app's art may not pass 150 MB. */
export const S5_LIMIT_BYTES = 150_000_000;

export type ProjectionKind = 'ride' | 'stall' | 'scenery' | 'track' | 'path' | 'people' | 'show';
/** Per-item bytes used ONLY while a kind has no baked item (basis 'assumed'). Replaced by the measured mean at the first baked item. */
export const ASSUMED_MEAN_BYTES: Readonly<Record<ProjectionKind, number>> = {
  ride: 2_000_000, // mean of the 3 baked flat rides (carousel 2.31, swing_tower 1.21, big_wheel 2.52 MB)
  stall: 40_000, // the baked snack_shack (0.04 MB)
  scenery: 50_000, // mean of the 10 baked scenery items (0.50 MB over 10 items)
  track: 1_300_000, // the baked steel_coaster as baked (0.67 rail + 0.02 support + 0.61 car MB); used only if no track is baked
  path: 50_000, // a bench or bin is a small prop: the scenery mean
  people: 250_000, // one staff costume at the size of the baked guest atlas (0.25 MB)
  show: 500_000, // a 2x2 animated site taken as a quarter of the ride mean
};

export interface CatalogueEntry {
  kind: ProjectionKind;
  id: string;
  /** Track types: how many pieces the type builds from (track defs). */
  pieces?: number;
}

export interface SizeReport {
  /**
   * decodedPerTurn: sheets and their tint masks, what one turn holds while it is tinted (transient);
   * residentPerTurn: the sheets only, what it holds once loaded (a mask is decoded only during a tint).
   */
  perItem: { id: string; kind: ProjectionKind | null; compressedBytes: number; decodedPerTurn: { d2: number; d4: number }; residentPerTurn: { d2: number; d4: number } }[];
  totalCompressed: number;
  projectedFull: number;
  /** Per kind: baked and catalogue counts, baked bytes and the per-item mean used for the unbaked ones. */
  byKind: Record<string, KindRow>;
  /** Kinds whose projection uses ASSUMED_MEAN_BYTES (no baked item). */
  assumedKinds: string[];
  /** Index files not found in `files`: any entry here is a failure. */
  missingFiles: string[];
  /** Track projection and its inputs; null when no track item is baked or the catalogue has no track types. */
  track: null | { bytesPerPiece: number; bakedPieces: number; fixedBytesPerType: number; types: { id: string; pieces: number; projectedBytes: number }[]; measuredBytes: number; projectedBytes: number };
}
export interface KindRow { baked: number; catalogue: number; bakedBytes: number; mean: number; basis: 'measured' | 'assumed'; projected: number }

/** Pieces a track type builds from: its set and groups, less excluded pieces (as piecesForEnd in the sim). */
export function pieceCount(typeId: string): number {
  const t = ALL_TRACK_TYPES.find((x) => x.id === typeId);
  if (!t) throw new Error(`pieceCount: no track type '${typeId}'`);
  return ALL_TRACK_PIECES.filter((p) => p.set === t.pieceSet && t.groups.includes(p.group) && !t.excludePieces.includes(p.id)).length;
}

export function catalogueEntries(): CatalogueEntry[] {
  return [
    ...FLAT_RIDES.map((d) => ({ kind: 'ride' as const, id: d.id })),
    ...STALLS.map((d) => ({ kind: 'stall' as const, id: d.id })),
    ...SCENERY.map((d) => ({ kind: 'scenery' as const, id: d.id })),
    ...TRACK_RIDES.map((d) => ({ kind: 'track' as const, id: d.id, pieces: pieceCount(d.id) })),
    ...PATH_ITEMS.map((d) => ({ kind: 'path' as const, id: d.id })),
    ...STAFF.map((d) => ({ kind: 'people' as const, id: d.id })),
    ...SHOW_SITES.map((d) => ({ kind: 'show' as const, id: d.id })),
  ];
}

/** Projection kind of an index set, or null for a fixed cost. */
function kindOf(s: RealSetEntry, cat: CatalogueEntry[]): ProjectionKind | null {
  const named = cat.find((c) => c.id === s.item && (c.kind === 'path' || c.kind === 'people' || c.kind === 'show'));
  if (named) return named.kind;
  if (s.kind === 'ride' || s.kind === 'stall' || s.kind === 'scenery') return s.kind;
  if (s.kind === 'rail' || s.kind === 'support' || s.kind === 'car') return 'track';
  return null;
}

export function sizeReport(index: RealIndex, files: Map<string, number>, catalogue: CatalogueEntry[] = catalogueEntries()): SizeReport {
  const owner = new Map<string, ProjectionKind>();
  for (const c of catalogue) {
    const prev = owner.get(c.id);
    if (prev && prev !== c.kind) throw new Error(`catalogue id '${c.id}' is in two kinds (${prev}, ${c.kind})`);
    owner.set(c.id, c.kind);
  }
  interface Acc { id: string; kind: ProjectionKind | null; seen: Set<string>; bytes: number; byClass: { rail: number; support: number; car: number }; decoded: { 2: Map<string, number>; 4: Map<string, number> }; resident: { 2: Map<string, number>; 4: Map<string, number> } }
  const items = new Map<string, Acc>();
  const counted = new Set<string>();
  const missing = new Set<string>();
  const railPieces = new Set<string>();
  let totalCompressed = 0;
  for (const s of index.sets) {
    const k = kindOf(s, catalogue);
    const key = `${k ?? s.kind}:${s.item}`;
    const a = items.get(key) ?? { id: s.item, kind: k, seen: new Set<string>(), bytes: 0, byClass: { rail: 0, support: 0, car: 0 }, decoded: { 2: new Map(), 4: new Map() }, resident: { 2: new Map(), 4: new Map() } };
    items.set(key, a);
    if (s.kind === 'rail') for (const fk of Object.keys(s.frames)) railPieces.add(fk.split(':')[0] ?? fk);
    // every file of the set once: sheets and their masks (a mask has its sheet's size)
    const set = new Map<string, { w: number; h: number }>();
    for (const sh of s.sheets) { set.set(sh.file, sh); if (sh.mask !== undefined && !set.has(sh.mask)) set.set(sh.mask, sh); }
    const maskFiles = new Set(s.sheets.flatMap((sh) => (sh.mask === undefined ? [] : [sh.mask])));
    let dec = 0;
    let res = 0;
    for (const [file, d] of set) {
      dec += d.w * d.h * 4;
      if (!maskFiles.has(file)) res += d.w * d.h * 4;
      if (a.seen.has(file)) continue;
      a.seen.add(file);
      const n = files.get(file);
      if (n === undefined) missing.add(file);
      const b = n ?? 0;
      a.bytes += b;
      if (s.kind === 'rail' || s.kind === 'support' || s.kind === 'car') a.byClass[s.kind] += b;
      if (!counted.has(file)) { counted.add(file); totalCompressed += b; }
    }
    const m = a.decoded[s.density];
    const rotKey = String(s.rot);
    m.set(rotKey, (m.get(rotKey) ?? 0) + dec);
    const mr = a.resident[s.density];
    mr.set(rotKey, (mr.get(rotKey) ?? 0) + res);
  }
  // decodedPerTurn: what one turn of the item holds decoded at a density, i.e. its heaviest single rotation ('all' is whole)
  const peak = (m: Map<string, number>): number => Math.max(0, ...m.values());
  const perItem = [...items.values()].map((a) => ({
    id: a.id, kind: a.kind, compressedBytes: a.bytes,
    decodedPerTurn: { d2: peak(a.decoded[2]), d4: peak(a.decoded[4]) }, residentPerTurn: { d2: peak(a.resident[2]), d4: peak(a.resident[4]) },
  }));

  const byKind: Record<string, KindRow> = {};
  const row = (k: string): KindRow => (byKind[k] ??= { baked: 0, catalogue: 0, bakedBytes: 0, mean: 0, basis: 'measured', projected: 0 });
  const bakedIds = new Map<ProjectionKind, Set<string>>();
  for (const a of items.values()) {
    if (!a.kind) continue;
    const b = row(a.kind);
    b.baked++; b.bakedBytes += a.bytes;
    (bakedIds.get(a.kind) ?? bakedIds.set(a.kind, new Set()).get(a.kind)!).add(a.id);
  }
  for (const c of catalogue) row(c.kind).catalogue++;

  // track: bytes per piece measured on the baked track item(s), projected over every type's full piece list
  let track: SizeReport['track'] = null;
  const trackTypes = catalogue.filter((c) => c.kind === 'track');
  const trackItems = [...items.values()].filter((a) => a.kind === 'track');
  if (trackTypes.length && trackItems.length && railPieces.size) {
    const rail = trackItems.reduce((n, a) => n + a.byClass.rail, 0);
    const fixed = trackItems.reduce((n, a) => n + a.byClass.support + a.byClass.car, 0) / trackItems.length;
    const bpp = rail / trackItems.length / railPieces.size;
    const types = trackTypes.map((t) => ({ id: t.id, pieces: t.pieces ?? 0, projectedBytes: Math.round((t.pieces ?? 0) * bpp + fixed) }));
    const measured = trackItems.reduce((n, a) => n + a.bytes, 0);
    track = { bytesPerPiece: Math.round(bpp), bakedPieces: railPieces.size, fixedBytesPerType: Math.round(fixed), types, measuredBytes: measured, projectedBytes: types.reduce((n, t) => n + t.projectedBytes, 0) };
  }

  let projectedFull = totalCompressed;
  const assumedKinds: string[] = [];
  for (const [kind, b] of Object.entries(byKind)) {
    if (b.baked === 0) {
      if (b.catalogue === 0) continue;
      b.basis = 'assumed';
      assumedKinds.push(kind);
      b.mean = ASSUMED_MEAN_BYTES[kind as ProjectionKind] ?? 0;
    } else b.mean = b.bakedBytes / b.baked;
    const unbaked = catalogue.filter((c) => c.kind === kind && !bakedIds.get(kind as ProjectionKind)?.has(c.id)).length;
    b.projected = Math.round(unbaked * b.mean);
    projectedFull += b.projected;
  }
  if (track) {
    // replace the track rows: every type at its full piece list (the baked type's measured bytes stand in for part of it)
    const b = byKind.track!;
    projectedFull += track.projectedBytes - track.measuredBytes - b.projected;
    b.projected = track.projectedBytes - track.measuredBytes;
    b.mean = track.projectedBytes / track.types.length;
  }
  return { perItem, totalCompressed, projectedFull: Math.round(projectedFull), byKind, assumedKinds, missingFiles: [...missing].sort(), track };
}

const mb = (n: number): string => (n / 1e6).toFixed(2);
const mib = (n: number): string => (n / 1024 / 1024).toFixed(2);

// ------------------------------------------------------------------ per-ride size rules (batch 1, ride colour choice)

/** Compressed bytes a flat ride may take (sheets and tint masks; its shadow is not counted). */
export const RIDE_COMPRESSED_MAX = 2_500_000;
/** The four rides whose motion needs larger pictures (batch 1 rulings) may take 4 MB. */
export const BIG_RIDES: readonly string[] = ['bumper_cars', 'pendulum_ship', 'magic_carpet', 'thunder_disc'];
export const RIDE_COMPRESSED_MAX_BIG = 4_000_000;
/** What one turn of a ride may hold decoded at density 4 once loaded (its sheets; a mask is decoded only during a tint). */
export const RIDE_DECODED_TURN_MAX = 32 * 1024 * 1024;

/**
 * Size-rule breaches that are known and decided elsewhere: reported, not failed. Every entry names the rule and why it
 * is not fixed here; an entry nobody can give a reason for is not an exception.
 */
export const RIDE_SIZE_ALLOW: Readonly<Record<string, { rule: 'compressed' | 'decoded'; reason: string }>> = {
  swing_tower: {
    rule: 'decoded',
    reason: 'over since batch 1 (35.8 MiB per turn at d4, 20 pictures, final-fix report): its pictures are not changed by the ride colour masks (masks are not resident); cutting it is the controller\'s call',
  },
};

export interface RideSizeRow {
  id: string;
  /** Sheets and masks, bytes. */
  compressed: number;
  limit: number;
  /** One turn at density 4: the sheets (resident) and the sheets with their masks (during a tint). */
  residentD4: number;
  transientD4: number;
  problems: string[];
  /** Breaches RIDE_SIZE_ALLOW lists, with its reason. */
  allowed: string[];
}

/** The per-ride size rules for `rides` (ride ids), from the ride kind's rows of a size report. */
export function rideSizeRows(r: SizeReport, rides: readonly string[]): RideSizeRow[] {
  return rides.map((id) => {
    const it = r.perItem.find((p) => p.id === id && p.kind === 'ride');
    const limit = BIG_RIDES.includes(id) ? RIDE_COMPRESSED_MAX_BIG : RIDE_COMPRESSED_MAX;
    if (!it) return { id, compressed: 0, limit, residentD4: 0, transientD4: 0, problems: [`${id}: not baked`], allowed: [] };
    const out: RideSizeRow = { id, compressed: it.compressedBytes, limit, residentD4: it.residentPerTurn.d4, transientD4: it.decodedPerTurn.d4, problems: [], allowed: [] };
    const allow = RIDE_SIZE_ALLOW[id];
    const breach = (rule: 'compressed' | 'decoded', text: string): void => {
      if (allow?.rule === rule) out.allowed.push(`${text} (allowed: ${allow.reason})`);
      else out.problems.push(text);
    };
    if (it.compressedBytes > limit) breach('compressed', `${id}: ${mb(it.compressedBytes)} MB compressed, over ${mb(limit)} MB`);
    if (it.residentPerTurn.d4 > RIDE_DECODED_TURN_MAX) breach('decoded', `${id}: ${mib(it.residentPerTurn.d4)} MiB decoded per turn at density 4, over ${mib(RIDE_DECODED_TURN_MAX)} MiB`);
    return out;
  });
}

/** Lines of the per-ride table. */
export function formatRideSizeRows(rows: readonly RideSizeRow[]): string[] {
  const out = ['ride                compressed MB (limit)  d4 per turn MiB resident  with masks (tint)'];
  for (const r of rows) out.push(`${r.id.padEnd(19)} ${mb(r.compressed).padStart(7)} (${mb(r.limit)})  ${mib(r.residentD4).padStart(24)}  ${mib(r.transientD4).padStart(17)}${r.problems.length ? '  OVER' : r.allowed.length ? '  allowed' : ''}`);
  return out;
}

/** Lines of the per-kind table and the track inputs, for the bake and the command line. */
export function formatSizeReport(r: SizeReport): string[] {
  const out = ['kind      baked/catalogue  mean MB  basis     projected extra MB'];
  for (const [k, b] of Object.entries(r.byKind)) out.push(`${k.padEnd(9)} ${`${b.baked}/${b.catalogue}`.padStart(15)}  ${mb(b.mean).padStart(7)}  ${b.basis.padEnd(8)}  ${mb(b.projected).padStart(18)}`);
  if (r.track) {
    out.push(`track: ${mb(r.track.bytesPerPiece)} MB/piece measured over ${r.track.bakedPieces} baked pieces + ${mb(r.track.fixedBytesPerType)} MB supports and cars per type; ${r.track.types.map((t) => `${t.id} ${t.pieces}p`).join(', ')}; whole track ${mb(r.track.projectedBytes)} MB (baked ${mb(r.track.measuredBytes)} MB)`);
  } else out.push('track: no baked track item, or no track types in the catalogue; track kind uses its assumed mean if it has no baked item');
  if (r.assumedKinds.length) out.push(`assumed means (no baked item yet): ${r.assumedKinds.join(', ')}`);
  if (r.missingFiles.length) out.push(`MISSING FILES (${r.missingFiles.length}): ${r.missingFiles.slice(0, 10).join(', ')}`);
  return out;
}
