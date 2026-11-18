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
 * Track is projected by FRAME AREA (batch 5 Task 1), not by a flat cost per piece: a rail picture is one tile of one
 * piece at one heading, as wide as a tile and as tall as the tile's rail height range, so its area is modelled as
 * `w_d × (h0_d + dz × 9.8 × d)` px at density d (w_d, h0_d fitted on the baked rail frames, dz the tile's rail range in
 * metres from `pieceWorldTiles`), times compressed bytes per frame px measured on the baked rail sets. Cars likewise:
 * reached poses × full/empty (× 32 yaws for spinning types, × 2 for a front car) × the measured mean car frame, times
 * the measured car bytes per px. Supports: the baked mean per type. A baked type keeps its measured frames and adds
 * the model only for the frames it lacks. So a loop tile (16 m of rail range) costs several times a straight one, and
 * water and new types are projected from their own tiles, not at the steel coaster's cost per piece.
 * A kind with no baked item uses ASSUMED_MEAN_BYTES (basis 'assumed', listed in assumedKinds); it never fails the gate.
 *
 * Decoded track memory (`residentAllClasses`): what a built track ride of the type holds when it wants every set the
 * bake has for it: every heading of its rail and support sets plus its car sets (every class and yaw quadrant), and their masks (track masks
 * stay decoded: frames tint on demand in the tint atlas). `decodedPerTurn` and `residentPerTurn` of a track row are
 * the same total, not one rotation's peak: a track ride wants every heading its pieces face.
 */
import { ALL_TRACK_PIECES, ALL_TRACK_TYPES, getTrackTypeDef, typeBuildsPiece } from '../../src/data/track';
import { FLAT_RIDES, PATH_ITEMS, SCENERY, SHOW_SITES, STALLS, STAFF, TRACK_RIDES } from '../../src/data/catalog';
import type { RealIndex, RealSetEntry } from '../../src/render/real/indexFormat';
import { pieceWorldTiles } from '../../src/sim/rides/track/geometry';
import { carPoses, hasFrontCar } from './poses';
import { trackBudget, trackTypeOfItem } from './trackBudget';

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
  perItem: SizeItemRow[];
  totalCompressed: number;
  projectedFull: number;
  /** Per kind: baked and catalogue counts, baked bytes and the per-item mean used for the unbaked ones. */
  byKind: Record<string, KindRow>;
  /** Kinds whose projection uses ASSUMED_MEAN_BYTES (no baked item). */
  assumedKinds: string[];
  /** Index files not found in `files`: any entry here is a failure. */
  missingFiles: string[];
  /** Track projection and its inputs; null when no track item is baked or the catalogue has no track types. */
  track: null | TrackReport;
}

export interface SizeItemRow {
  id: string;
  kind: ProjectionKind | null;
  compressedBytes: number;
  /** Track rows: the whole ride (`residentAllClasses`), not one rotation (see the header). */
  decodedPerTurn: { d2: number; d4: number };
  residentPerTurn: { d2: number; d4: number };
  /** Track rows only: every set of the type (all headings and car quadrants, every class), masks included. */
  residentAllClasses?: { d2: number; d4: number };
  /** Track rows only: each density-4 set with its masks, largest first. */
  perSet?: { key: string; d4Bytes: number }[];
}

/** Frame-area model of a density (see the header): a rail frame is `w × (h0 + dz × pxPerM)` px. */
export interface RailAreaModel { w: number; h0: number; pxPerM: number }

export interface TrackTypeRow {
  id: string;
  /** Pieces the type builds (`typeBuildsPiece`), rail tiles over the 4 headings, and reached car poses. */
  pieces: number;
  railTiles: number;
  carPoses: number;
  /** Frames a complete bake of the type holds per density (rails: tiles × 4 headings; cars: poses × variants). */
  expectedFrames: { rail: number; car: number };
  baked: boolean;
  /** Measured compressed bytes (baked types), and the full type projected by frame area. */
  measuredBytes: number;
  projectedBytes: number;
  /** Full type at density 4, today's layout (every rail and car frame on a masked sheet), packed as the baked sheets. */
  projectedResidentD4: number;
}

export interface TrackReport {
  /** Compressed bytes per frame px, measured on the baked rail and car sets (both densities, masks included). */
  railBytesPerPx: number;
  carBytesPerPx: number;
  /** Baked support bytes, mean per baked type. */
  supportBytesPerType: number;
  /** Sheet px per frame px of the baked rail and car sets (packing slack). */
  packing: number;
  rail: { d2: RailAreaModel; d4: RailAreaModel };
  /** Mean car frame px per density. */
  carFramePx: { d2: number; d4: number };
  types: TrackTypeRow[];
  measuredBytes: number;
  projectedBytes: number;
}
export interface KindRow { baked: number; catalogue: number; bakedBytes: number; mean: number; basis: 'measured' | 'assumed'; projected: number }

/** Pieces a track type builds (the sim's own rule, `typeBuildsPiece`: its set and groups less excludes, plus `alsoPieces`). */
export function typePieces(typeId: string): string[] {
  const t = ALL_TRACK_TYPES.find((x) => x.id === typeId);
  if (!t) throw new Error(`typePieces: no track type '${typeId}'`);
  return ALL_TRACK_PIECES.filter((p) => typeBuildsPiece(t, p)).map((p) => p.id);
}

export function pieceCount(typeId: string): number {
  return typePieces(typeId).length;
}

/** Rail height range (m) of each rail tile of `pieceId` built at heading `dir`, in rail-tile order (frame `t<i>`). */
export function railTileRanges(pieceId: string, dir: 0 | 1 | 2 | 3): number[] {
  return pieceWorldTiles({ defId: pieceId, x: 0, y: 0, z: 0, dir, chain: false, brakeSpeed: null, cost: 0 })
    .filter((t) => t.rail)
    .map((t) => t.railMax - t.railMin);
}

/** Car picture variants per reached pose: full and empty, × 32 yaws for spinning types, × 2 with a front car. */
export function carFramesOf(typeId: string, pieces: readonly string[]): { poses: number; frames: number } {
  if (!getTrackTypeDef(typeId)) throw new Error(`carFramesOf: no track type '${typeId}'`);
  const n = carPoses(typeId, pieces).length;
  const front = hasFrontCar(typeId) ? 2 : 1;
  return { poses: n, frames: n * 2 * front };
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

const isTrackSet = (s: RealSetEntry): boolean => s.kind === 'rail' || s.kind === 'support' || s.kind === 'car';

/** Bytes a set holds decoded: its sheets and the masks they name (a mask has its sheet's size), each file once. */
export function setDecodedBytes(s: RealSetEntry): { all: number; sheets: number } {
  const files = new Map<string, { w: number; h: number }>();
  for (const sh of s.sheets) { files.set(sh.file, sh); if (sh.mask !== undefined && !files.has(sh.mask)) files.set(sh.mask, sh); }
  const masks = new Set(s.sheets.flatMap((sh) => (sh.mask === undefined ? [] : [sh.mask])));
  let all = 0;
  let sheets = 0;
  for (const [file, d] of files) {
    all += d.w * d.h * 4;
    if (!masks.has(file)) sheets += d.w * d.h * 4;
  }
  return { all, sheets };
}

export function sizeReport(index: RealIndex, files: Map<string, number>, catalogue: CatalogueEntry[] = catalogueEntries()): SizeReport {
  const owner = new Map<string, ProjectionKind>();
  for (const c of catalogue) {
    const prev = owner.get(c.id);
    if (prev && prev !== c.kind) throw new Error(`catalogue id '${c.id}' is in two kinds (${prev}, ${c.kind})`);
    owner.set(c.id, c.kind);
  }
  interface Acc {
    id: string; kind: ProjectionKind | null; seen: Set<string>; bytes: number; byClass: { rail: number; support: number; car: number };
    decoded: { 2: Map<string, number>; 4: Map<string, number> }; resident: { 2: Map<string, number>; 4: Map<string, number> };
    /** Track: all sets with masks per density, and each density-4 set. */
    all: { 2: number; 4: number }; perSet: { key: string; d4Bytes: number }[];
  }
  const items = new Map<string, Acc>();
  const counted = new Set<string>();
  const missing = new Set<string>();
  let totalCompressed = 0;
  for (const s of index.sets) {
    const k = kindOf(s, catalogue);
    // Track sets group by type: `rail:<type>~<class>` (Task 2 layout) and `rail:<type>` (stage 1) are one item.
    const id = isTrackSet(s) ? trackTypeOfItem(s.item) : s.item;
    const key = `${k ?? s.kind}:${id}`;
    const a: Acc = items.get(key) ?? { id, kind: k, seen: new Set<string>(), bytes: 0, byClass: { rail: 0, support: 0, car: 0 }, decoded: { 2: new Map(), 4: new Map() }, resident: { 2: new Map(), 4: new Map() }, all: { 2: 0, 4: 0 }, perSet: [] };
    items.set(key, a);
    // every file of the set once: sheets and their masks (a mask has its sheet's size)
    const set = new Map<string, { w: number; h: number }>();
    for (const sh of s.sheets) { set.set(sh.file, sh); if (sh.mask !== undefined && !set.has(sh.mask)) set.set(sh.mask, sh); }
    const { all: dec, sheets: res } = setDecodedBytes(s);
    a.all[s.density] += dec;
    if (s.density === 4 && isTrackSet(s)) a.perSet.push({ key: s.key, d4Bytes: dec });
    for (const [file] of set) {
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
  // decodedPerTurn: what one turn of the item holds decoded at a density, i.e. its heaviest single rotation ('all' is
  // whole). A track ride wants every heading its pieces face, and its masks stay decoded: its row is the whole type.
  const peak = (m: Map<string, number>): number => Math.max(0, ...m.values());
  const perItem: SizeItemRow[] = [...items.values()].map((a) => {
    if (a.kind === 'track') {
      const all = { d2: a.all[2], d4: a.all[4] };
      return { id: a.id, kind: a.kind, compressedBytes: a.bytes, decodedPerTurn: all, residentPerTurn: all, residentAllClasses: all, perSet: [...a.perSet].sort((x, y) => y.d4Bytes - x.d4Bytes) };
    }
    return {
      id: a.id, kind: a.kind, compressedBytes: a.bytes,
      decodedPerTurn: { d2: peak(a.decoded[2]), d4: peak(a.decoded[4]) }, residentPerTurn: { d2: peak(a.resident[2]), d4: peak(a.resident[4]) },
    };
  });

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

  // track: projected by frame area over every type's full piece list (see the header)
  const trackTypes = catalogue.filter((c) => c.kind === 'track');
  const trackItems = [...items.values()].filter((a) => a.kind === 'track');
  const track: SizeReport['track'] = trackTypes.length && trackItems.length ? trackProjection(index, trackItems.map((a) => ({ id: a.id, bytes: a.byClass })), trackTypes.map((t) => t.id)) : null;

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

/** Vertical px per metre of rail height at density d (F3: 9.8 px/m at zoom 1). */
const railPxPerM = (d: 2 | 4): number => 9.8 * d;

const tileRanges = new Map<string, number[]>();
function rangesOf(pieceId: string, dir: 0 | 1 | 2 | 3): number[] {
  const k = `${pieceId}/${dir}`;
  let r = tileRanges.get(k);
  if (!r) tileRanges.set(k, (r = railTileRanges(pieceId, dir)));
  return r;
}

/** `piece:t<i>` → [piece, i], or null for any other rail frame key (shadows, chain troughs). */
function railFrame(fk: string): [string, number] | null {
  const m = /^([^:]+):t(\d+)$/.exec(fk);
  return m ? [m[1] as string, Number(m[2])] : null;
}

/**
 * The track projection by frame area (see the header). `baked`: the baked track types with their compressed bytes
 * by set kind; `typeIds`: every track type of the catalogue.
 */
export function trackProjection(index: RealIndex, baked: { id: string; bytes: { rail: number; support: number; car: number } }[], typeIds: readonly string[]): TrackReport {
  const dens = [2, 4] as const;
  /** Baked rail frame px by `type|density|heading|frame key`, and car frame px and counts by type and density. */
  const railPx = new Map<string, number>();
  const carPx = new Map<string, { px: number; n: number }>();
  let railPxAll = 0, carPxAll = 0, sheetPxAll = 0, supportD4 = 0;
  const fit = { 2: { w: 0, h0: 0, n: 0 }, 4: { w: 0, h0: 0, n: 0 } };
  const carMean = { 2: { px: 0, n: 0 }, 4: { px: 0, n: 0 } };
  for (const s of index.sets) {
    if (!isTrackSet(s)) continue;
    const type = trackTypeOfItem(s.item);
    if (s.kind === 'support') { if (s.density === 4) supportD4 += setDecodedBytes(s).all; continue; }
    const masks = new Set(s.sheets.flatMap((sh) => (sh.mask === undefined ? [] : [sh.mask])));
    for (const sh of s.sheets) if (!masks.has(sh.file)) sheetPxAll += sh.w * sh.h;
    for (const [fk, f] of Object.entries(s.frames)) {
      const px = f.w * f.h;
      if (s.kind === 'car') {
        carPxAll += px;
        const c = carPx.get(`${type}|${s.density}`) ?? { px: 0, n: 0 };
        c.px += px; c.n++;
        carPx.set(`${type}|${s.density}`, c);
        carMean[s.density].px += px; carMean[s.density].n++;
        continue;
      }
      railPxAll += px;
      if (s.rot === 'all') continue;
      railPx.set(`${type}|${s.density}|${s.rot}|${fk}`, px);
      const rf = railFrame(fk);
      const dz = rf ? rangesOf(rf[0], s.rot)[rf[1]] : undefined;
      if (dz === undefined) continue;
      const m = fit[s.density];
      m.w += f.w; m.h0 += f.h - dz * railPxPerM(s.density); m.n++;
    }
  }
  const model = (d: 2 | 4): RailAreaModel => {
    const m = fit[d];
    const o = fit[d === 2 ? 4 : 2];
    // A bake with one density only: the other is the same picture at its scale.
    if (!m.n && o.n) return { w: (o.w / o.n) * (d / (d === 2 ? 4 : 2)), h0: (o.h0 / o.n) * (d / (d === 2 ? 4 : 2)), pxPerM: railPxPerM(d) };
    return { w: m.n ? m.w / m.n : 0, h0: m.n ? m.h0 / m.n : 0, pxPerM: railPxPerM(d) };
  };
  const rail = { d2: model(2), d4: model(4) };
  const meanCar = (d: 2 | 4): number => (carMean[d].n ? carMean[d].px / carMean[d].n : carMean[d === 2 ? 4 : 2].n ? (carMean[d === 2 ? 4 : 2].px / carMean[d === 2 ? 4 : 2].n) * (d === 2 ? 0.25 : 4) : 0);
  const carFramePx = { d2: meanCar(2), d4: meanCar(4) };
  const sum = (k: 'rail' | 'support' | 'car'): number => baked.reduce((n, b) => n + b.bytes[k], 0);
  const railBytesPerPx = railPxAll ? sum('rail') / railPxAll : 0;
  const carBytesPerPx = carPxAll ? sum('car') / carPxAll : 0;
  const supportBytesPerType = baked.length ? sum('support') / baked.length : 0;
  const packing = railPxAll + carPxAll ? sheetPxAll / (railPxAll + carPxAll) : 1;
  const supportD4PerType = baked.length ? supportD4 / baked.length : 0;

  const types: TrackTypeRow[] = typeIds.map((id) => {
    const b = baked.find((x) => x.id === id);
    const pieces = typePieces(id);
    let tiles = 0;
    const px = { 2: { rail: 0, railMissing: 0, car: 0, carMissing: 0 }, 4: { rail: 0, railMissing: 0, car: 0, carMissing: 0 } };
    for (const pc of pieces) {
      for (const dir of [0, 1, 2, 3] as const) {
        const r = rangesOf(pc, dir);
        tiles += r.length;
        r.forEach((dz, ti) => {
          for (const d of dens) {
            const have = railPx.get(`${id}|${d}|${dir}|${pc}:t${ti}`);
            const m = d === 2 ? rail.d2 : rail.d4;
            const area = have ?? m.w * (m.h0 + dz * m.pxPerM);
            px[d].rail += area;
            if (have === undefined) px[d].railMissing += area;
          }
        });
      }
    }
    const cars = carFramesOf(id, pieces);
    for (const d of dens) {
      const have = carPx.get(`${id}|${d}`) ?? { px: 0, n: 0 };
      const missing = Math.max(0, cars.frames - have.n) * (d === 2 ? carFramePx.d2 : carFramePx.d4);
      px[d].car = have.px + missing;
      px[d].carMissing = missing;
    }
    const missingRail = px[2].railMissing + px[4].railMissing;
    const missingCar = px[2].carMissing + px[4].carMissing;
    const measuredBytes = b ? b.bytes.rail + b.bytes.support + b.bytes.car : 0;
    const projectedBytes = Math.round(measuredBytes + missingRail * railBytesPerPx + missingCar * carBytesPerPx + (b ? 0 : supportBytesPerType));
    const projectedResidentD4 = Math.round((px[4].rail + px[4].car) * packing * 4 * 2 + supportD4PerType);
    return { id, pieces: pieces.length, railTiles: tiles, carPoses: cars.poses, expectedFrames: { rail: tiles, car: cars.frames }, baked: !!b, measuredBytes, projectedBytes, projectedResidentD4 };
  });
  return {
    railBytesPerPx, carBytesPerPx, supportBytesPerType: Math.round(supportBytesPerType), packing, rail, carFramePx, types,
    measuredBytes: types.reduce((n, t) => n + t.measuredBytes, 0), projectedBytes: types.reduce((n, t) => n + t.projectedBytes, 0),
  };
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

export interface RideSizeRow {
  id: string;
  /** Sheets and masks, bytes. */
  compressed: number;
  limit: number;
  /** One turn at density 4: the sheets (resident) and the sheets with their masks (during a tint). */
  residentD4: number;
  transientD4: number;
  problems: string[];
}

/** The per-ride size rules for `rides` (ride ids), from the ride kind's rows of a size report. */
export function rideSizeRows(r: SizeReport, rides: readonly string[]): RideSizeRow[] {
  return rides.map((id) => {
    const it = r.perItem.find((p) => p.id === id && p.kind === 'ride');
    const limit = BIG_RIDES.includes(id) ? RIDE_COMPRESSED_MAX_BIG : RIDE_COMPRESSED_MAX;
    if (!it) return { id, compressed: 0, limit, residentD4: 0, transientD4: 0, problems: [`${id}: not baked`] };
    const out: RideSizeRow = { id, compressed: it.compressedBytes, limit, residentD4: it.residentPerTurn.d4, transientD4: it.decodedPerTurn.d4, problems: [] };
    if (it.compressedBytes > limit) out.problems.push(`${id}: ${mb(it.compressedBytes)} MB compressed, over ${mb(limit)} MB`);
    if (it.residentPerTurn.d4 > RIDE_DECODED_TURN_MAX) out.problems.push(`${id}: ${mib(it.residentPerTurn.d4)} MiB decoded per turn at density 4, over ${mib(RIDE_DECODED_TURN_MAX)} MiB`);
    return out;
  });
}

/** Lines of the per-ride table. */
export function formatRideSizeRows(rows: readonly RideSizeRow[]): string[] {
  const out = ['ride                compressed MB (limit)  d4 per turn MiB resident  with masks (tint)'];
  for (const r of rows) out.push(`${r.id.padEnd(19)} ${mb(r.compressed).padStart(7)} (${mb(r.limit)})  ${mib(r.residentD4).padStart(24)}  ${mib(r.transientD4).padStart(17)}${r.problems.length ? '  OVER' : ''}`);
  return out;
}

// ------------------------------------------------------------------ per-type track size rules (batch 5)

export interface TrackSizeRow {
  id: string;
  compressed: number;
  compressedMax: number;
  /** Every set of the type with its masks (all headings and car quadrants, every class), per density. */
  residentAllClasses: { d2: number; d4: number };
  /** Density-4 sets over `setMaxD4`, with their bytes. */
  overSets: { key: string; d4Bytes: number }[];
  setMaxD4: number;
  problems: string[];
}

/** The track size rule (`trackBudget`) for every baked track type of a size report. */
export function trackSizeRows(r: SizeReport): TrackSizeRow[] {
  return r.perItem.filter((p) => p.kind === 'track').map((p) => {
    const b = trackBudget(p.id);
    const overSets = (p.perSet ?? []).filter((x) => x.d4Bytes > b.setMaxD4);
    const out: TrackSizeRow = { id: p.id, compressed: p.compressedBytes, compressedMax: b.compressedMax, residentAllClasses: p.residentAllClasses ?? { d2: 0, d4: 0 }, overSets, setMaxD4: b.setMaxD4, problems: [] };
    if (p.compressedBytes > b.compressedMax) out.problems.push(`${p.id}: ${mb(p.compressedBytes)} MB compressed, over ${mb(b.compressedMax)} MB`);
    for (const x of overSets) out.problems.push(`${x.key}: ${mib(x.d4Bytes)} MiB decoded with masks, over ${mib(b.setMaxD4)} MiB`);
    return out;
  });
}

/** Lines of the per-type track table. */
export function formatTrackSizeRows(rows: readonly TrackSizeRow[]): string[] {
  const out = ['track type          compressed MB (limit)  all sets d2 / d4 MiB (masks incl.)  sets over the d4 set limit'];
  for (const y of rows) {
    const over = y.overSets.map((x) => `${x.key} ${mib(x.d4Bytes)} MiB`).join('; ');
    out.push(`${y.id.padEnd(19)} ${mb(y.compressed).padStart(7)} (${mb(y.compressedMax)})  ${`${mib(y.residentAllClasses.d2)} / ${mib(y.residentAllClasses.d4)}`.padStart(34)}  ${over || 'none'}${y.problems.length ? '  OVER' : ''}`);
  }
  return out;
}

/** Lines of the per-kind table and the track inputs, for the bake and the command line. */
export function formatSizeReport(r: SizeReport): string[] {
  const out = ['kind      baked/catalogue  mean MB  basis     projected extra MB'];
  for (const [k, b] of Object.entries(r.byKind)) out.push(`${k.padEnd(9)} ${`${b.baked}/${b.catalogue}`.padStart(15)}  ${mb(b.mean).padStart(7)}  ${b.basis.padEnd(8)}  ${mb(b.projected).padStart(18)}`);
  if (r.track) {
    const t = r.track;
    out.push(`track (by frame area): rails ${(t.railBytesPerPx * 1e3).toFixed(1)} B per 1000 frame px, cars ${(t.carBytesPerPx * 1e3).toFixed(1)}; supports ${mb(t.supportBytesPerType)} MB per type; packing ${t.packing.toFixed(2)}; rail frame d4 ${t.rail.d4.w.toFixed(0)} x (${t.rail.d4.h0.toFixed(0)} + ${t.rail.d4.pxPerM.toFixed(1)}/m) px; car frame d4 ${t.carFramePx.d4.toFixed(0)} px`);
    out.push('type               pieces  rail frames  car poses  car frames  compressed MB (proj.)  d4 resident MiB (proj., masked)');
    for (const y of t.types) out.push(`${y.id.padEnd(18)} ${String(y.pieces).padStart(6)}  ${String(y.expectedFrames.rail).padStart(11)}  ${String(y.carPoses).padStart(9)}  ${String(y.expectedFrames.car).padStart(10)}  ${(y.baked ? `${mb(y.measuredBytes)} -> ` : '').padStart(8)}${mb(y.projectedBytes).padStart(6)}  ${mib(y.projectedResidentD4).padStart(10)}`);
    out.push(`whole track ${mb(t.projectedBytes)} MB projected (baked ${mb(t.measuredBytes)} MB)`);
  } else out.push('track: no baked track item, or no track types in the catalogue; track kind uses its assumed mean if it has no baked item');
  if (r.assumedKinds.length) out.push(`assumed means (no baked item yet): ${r.assumedKinds.join(', ')}`);
  if (r.missingFiles.length) out.push(`MISSING FILES (${r.missingFiles.length}): ${r.missingFiles.slice(0, 10).join(', ')}`);
  return out;
}
