/** Phase 8b stage 0b test (never merged): paints a catalogue once and packs it into indexed PNG sheets and one index per pack. */
import { createHash } from 'node:crypto';
import {
  K_CAR,
  K_DECAL,
  K_DECK,
  K_ENTRANCE,
  K_FENCE,
  K_GATE,
  K_GHOST,
  K_GROUND,
  K_GUEST,
  K_PATH_ITEM,
  K_POST,
  K_RAIL,
  K_RIDE,
  K_SCENERY,
  K_SHADOW,
  K_SHOW,
  K_STAFF,
  K_STALL,
  K_SUPPORT,
} from '../../src/render/pixel/app/keys';
import { encodeIndex, type PackIndex, type PackSheet } from '../../src/render/pixel/app/format';
import { SLOT_NAMES, SLOT_RGBA } from '../../src/render/pixel/palette';
import { trackSwappable } from './catalogue/track';
import type { PictureSpec } from './catalogue/types';
import { packGroups } from './pack';
import { pictureHash, trim, type Picture } from './picture';
import { encodeIndexedPng, sheetName } from './png';
import { ghostTable, swapTable, type Role } from './ramps';

export interface ArtReport {
  packs: Record<string, { pictures: number; unique: number; sheets: number; pngBytes: number; decodedBytes: number }>;
  kinds: Record<string, { pictures: number; unique: number; pngBytes: number }>;
  /** PNG bytes of all sheets (indexes not counted). */
  totalPngBytes: number;
  /** Every art file (sheets and indexes) with both ride frame sets. */
  appArtBytesFull: number;
  /** Every art file without the pack `rides-full`. */
  appArtBytesCoarseOnly: number;
  buildMs: number;
}

export interface KeyRow {
  entry: number;
  kind: number;
  key: number;
  ref: PictureSpec['ref'];
}

export interface SheetBuild {
  files: Array<{ path: string; bytes: Uint8Array }>;
  packs: Array<{ name: string; index: string; hash: string }>;
  report: ArtReport;
  keys: Record<string, KeyRow[]>;
}

/** The pack that only the full frame set reads. */
export const FULL_RIDES_PACK = 'rides-full';

const KIND_NAMES: Readonly<Record<number, string>> = {
  [K_RIDE]: 'ride',
  [K_STALL]: 'stall',
  [K_SCENERY]: 'scenery',
  [K_PATH_ITEM]: 'pathItem',
  [K_DECAL]: 'decal',
  [K_FENCE]: 'fence',
  [K_ENTRANCE]: 'entrance',
  [K_SHOW]: 'show',
  [K_GUEST]: 'guest',
  [K_STAFF]: 'staff',
  [K_SHADOW]: 'shadow',
  [K_GHOST]: 'ghost',
  [K_RAIL]: 'rail',
  [K_SUPPORT]: 'support',
  [K_GATE]: 'gate',
  [K_CAR]: 'car',
  [K_DECK]: 'deck',
  [K_POST]: 'post',
  [K_GROUND]: 'ground',
};
const kindName = (k: number): string => KIND_NAMES[k] ?? `kind${k}`;

/** RGB per slot (slot 0 black; it is transparent through tRNS). */
export function paletteRgb(): Uint8Array {
  const out = new Uint8Array(SLOT_NAMES.length * 3);
  for (let s = 0; s < SLOT_NAMES.length; s++) {
    const v = SLOT_RGBA[s] as number;
    out[s * 3] = v & 255;
    out[s * 3 + 1] = (v >>> 8) & 255;
    out[s * 3 + 2] = (v >>> 16) & 255;
  }
  return out;
}

/** The 38 swap tables in the order of `swapTableIndex`: track, supports, car × 12 colours, then ghost valid, invalid. */
export function swapTables(): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const role of ['track', 'supports', 'car'] as Role[]) for (let c = 0; c < 12; c++) out.push(swapTable(role, c));
  out.push(ghostTable(true), ghostTable(false));
  return out;
}

/** Sheet `swappable` value of a group: ghosts 4, track groups by their role, all others 0. */
function swappableOf(pack: string, group: string): number {
  if (pack === 'ghosts') return 4;
  if (pack === 'track') return trackSwappable(group);
  return 0;
}

/** A file-name-safe form of a group id. */
const safe = (group: string): string => group.replace(/[^A-Za-z0-9_-]+/g, '_');

const sameSlots = (a: Picture, b: Picture): boolean => {
  if (a.w !== b.w || a.h !== b.h || a.ox !== b.ox || a.oy !== b.oy) return false;
  for (let i = 0; i < a.slots.length; i++) if (a.slots[i] !== b.slots[i]) return false;
  return true;
};

const hex10 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex').slice(0, 10);

interface GroupWork {
  id: string;
  pics: Picture[];
  /** Kind of each unique picture (first spec that made it). */
  picKind: number[];
  /** Per spec of the group: its unique picture. */
  specPic: number[];
  /** `pictureHash` → unique pictures with that hash. */
  byHash: Map<number, number[]>;
  specs: PictureSpec[];
}

/**
 * Paints every spec (trimmed), dedupes by `pictureHash` within a group (several keys may point at one placement),
 * packs each pack's groups and writes `art/<pack>/<group-safe>-<sheetName>.png` and `art/<pack>/index-<hash>.bin`.
 * `coarseOnly` leaves the pack `rides-full` out. Needs `installSurfaceArt()`.
 */
export function buildSheets(specs: Iterable<PictureSpec>, opts: { coarseOnly?: boolean }): SheetBuild {
  const t0 = performance.now();
  const palette = paletteRgb();
  const swaps = swapTables();
  // pack → group id → work, in the order of first appearance.
  const packs = new Map<string, Map<string, GroupWork>>();
  const seen = new Map<string, Set<number>>();
  for (const spec of specs) {
    if (opts.coarseOnly && spec.pack === FULL_RIDES_PACK) continue;
    const dupKey = `${spec.pack}:${spec.kind}`;
    const keys = seen.get(dupKey) ?? new Set<number>();
    seen.set(dupKey, keys);
    if (keys.has(spec.key)) throw new Error(`buildSheets: key ${spec.key} of kind ${spec.kind} twice in pack ${spec.pack}`);
    keys.add(spec.key);
    let groups = packs.get(spec.pack);
    if (!groups) packs.set(spec.pack, (groups = new Map()));
    let g = groups.get(spec.group);
    if (!g) groups.set(spec.group, (g = { id: spec.group, pics: [], picKind: [], specPic: [], specs: [], byHash: new Map() }));
    const pic = trim(spec.paint());
    const hv = pictureHash(pic);
    // Hash first, then the slots, so a hash collision never merges two different pictures.
    const same = g.byHash.get(hv) ?? [];
    let at = same.find((i) => sameSlots(g.pics[i] as Picture, pic)) ?? -1;
    if (at < 0) {
      at = g.pics.length;
      g.pics.push(pic);
      g.picKind.push(spec.kind);
      g.byHash.set(hv, [...same, at]);
    }
    g.specPic.push(at);
    g.specs.push(spec);
  }

  const files: SheetBuild['files'] = [];
  const outPacks: SheetBuild['packs'] = [];
  const keys: SheetBuild['keys'] = {};
  const report: ArtReport = { packs: {}, kinds: {}, totalPngBytes: 0, appArtBytesFull: 0, appArtBytesCoarseOnly: 0, buildMs: 0 };
  const kindRow = (k: number): ArtReport['kinds'][string] => (report.kinds[kindName(k)] ??= { pictures: 0, unique: 0, pngBytes: 0 });

  for (const [pack, groups] of packs) {
    const works = [...groups.values()];
    const packed = packGroups(works.map((g) => ({ id: g.id, pics: g.pics })));
    const sheets: PackSheet[] = [];
    // Placement of each unique picture: group → pic → (sheet, x, y).
    const place = new Map<string, Array<{ sheet: number; x: number; y: number }>>();
    let pngBytes = 0;
    let decodedBytes = 0;
    for (const s of packed) {
      const g = groups.get(s.group) as GroupWork;
      const slots = new Uint8Array(s.w * s.h);
      const places = place.get(s.group) ?? [];
      place.set(s.group, places);
      const sheetIdx = sheets.length;
      let area = 0;
      const areaOfKind = new Map<number, number>();
      for (const p of s.places) {
        const pic = g.pics[p.pic] as Picture;
        for (let y = 0; y < pic.h; y++) slots.set(pic.slots.subarray(y * pic.w, (y + 1) * pic.w), (p.y + y) * s.w + p.x);
        places[p.pic] = { sheet: sheetIdx, x: p.x, y: p.y };
        const a = pic.w * pic.h;
        area += a;
        const k = g.picKind[p.pic] as number;
        areaOfKind.set(k, (areaOfKind.get(k) ?? 0) + a);
      }
      const file = `${safe(s.group)}-${sheetName(slots, palette)}.png`;
      const png = encodeIndexedPng(s.w, s.h, slots, palette);
      files.push({ path: `art/${pack}/${file}`, bytes: png });
      sheets.push({ file, w: s.w, h: s.h, swappable: swappableOf(pack, s.group) });
      pngBytes += png.length;
      decodedBytes += s.w * s.h * 4;
      // PNG bytes of a sheet go to its kinds by picture area.
      for (const [k, a] of areaOfKind) kindRow(k).pngBytes += area > 0 ? (png.length * a) / area : png.length / areaOfKind.size;
    }
    const n = works.reduce((sum, g) => sum + g.specs.length, 0);
    const ix: PackIndex = {
      palette,
      swaps,
      sheets,
      kind: new Uint8Array(n),
      key: new Float64Array(n),
      sheet: new Uint16Array(n),
      x: new Uint16Array(n),
      y: new Uint16Array(n),
      w: new Uint16Array(n),
      h: new Uint16Array(n),
      ox: new Int16Array(n),
      oy: new Int16Array(n),
    };
    const rows: KeyRow[] = [];
    let e = 0;
    let unique = 0;
    for (const g of works) {
      unique += g.pics.length;
      for (const k of g.picKind) kindRow(k).unique++;
      const places = place.get(g.id) as Array<{ sheet: number; x: number; y: number }>;
      g.specs.forEach((spec, i) => {
        const pi = g.specPic[i] as number;
        const pic = g.pics[pi] as Picture;
        const pl = places[pi] as { sheet: number; x: number; y: number };
        ix.kind[e] = spec.kind;
        ix.key[e] = spec.key;
        ix.sheet[e] = pl.sheet;
        ix.x[e] = pl.x;
        ix.y[e] = pl.y;
        ix.w[e] = pic.w;
        ix.h[e] = pic.h;
        ix.ox[e] = pic.ox;
        ix.oy[e] = pic.oy;
        rows.push({ entry: e, kind: spec.kind, key: spec.key, ref: spec.ref });
        kindRow(spec.kind).pictures++;
        e++;
      });
    }
    const indexBytes = encodeIndex(ix);
    const hash = hex10(indexBytes);
    const index = `art/${pack}/index-${hash}.bin`;
    files.push({ path: index, bytes: indexBytes });
    outPacks.push({ name: pack, index, hash });
    keys[pack] = rows;
    report.packs[pack] = { pictures: n, unique, sheets: sheets.length, pngBytes, decodedBytes };
    report.totalPngBytes += pngBytes;
    report.appArtBytesFull += pngBytes + indexBytes.length;
    if (pack !== FULL_RIDES_PACK) report.appArtBytesCoarseOnly += pngBytes + indexBytes.length;
  }
  for (const k of Object.values(report.kinds)) k.pngBytes = Math.round(k.pngBytes);
  report.buildMs = Math.round(performance.now() - t0);
  return { files, packs: outPacks, report, keys };
}
