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
 * it is in the baked total and is never multiplied. A catalogue kind with no baked item yet has no mean and adds 0.
 * Track is UNDERESTIMATED: one baked steel_coaster holds 18 of its pieces, and a full park needs every piece of 12 types.
 */
import { FLAT_RIDES, PATH_ITEMS, SCENERY, SHOW_SITES, STALLS, STAFF, TRACK_RIDES } from '../../src/data/catalog';
import type { RealIndex, RealSetEntry } from '../../src/render/real/indexFormat';

/** S5: the app's art may not pass 150 MB. */
export const S5_LIMIT_BYTES = 150_000_000;

export type ProjectionKind = 'ride' | 'stall' | 'scenery' | 'track' | 'path' | 'people' | 'show';
export interface CatalogueEntry { kind: ProjectionKind; id: string }

export interface SizeReport {
  perItem: { id: string; compressedBytes: number; decodedPerTurn: { d2: number; d4: number } }[];
  totalCompressed: number;
  projectedFull: number;
  /** Per kind: baked and catalogue counts, baked bytes and the per-item mean used for the unbaked ones. */
  byKind: Record<string, { baked: number; catalogue: number; bakedBytes: number; mean: number }>;
}

export function catalogueEntries(): CatalogueEntry[] {
  return [
    ...FLAT_RIDES.map((d) => ({ kind: 'ride' as const, id: d.id })),
    ...STALLS.map((d) => ({ kind: 'stall' as const, id: d.id })),
    ...SCENERY.map((d) => ({ kind: 'scenery' as const, id: d.id })),
    ...TRACK_RIDES.map((d) => ({ kind: 'track' as const, id: d.id })),
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
  interface Acc { id: string; kind: ProjectionKind | null; seen: Set<string>; bytes: number; decoded: { 2: Map<string, number>; 4: Map<string, number> } }
  const items = new Map<string, Acc>();
  const counted = new Set<string>();
  let totalCompressed = 0;
  for (const s of index.sets) {
    const k = kindOf(s, catalogue);
    const key = `${k ?? s.kind}:${s.item}`;
    const a = items.get(key) ?? { id: s.item, kind: k, seen: new Set<string>(), bytes: 0, decoded: { 2: new Map(), 4: new Map() } };
    items.set(key, a);
    const rotKey = String(s.rot);
    let dec = 0;
    for (const sh of s.sheets) {
      dec += sh.w * sh.h * 4;
      if (a.seen.has(sh.file)) continue;
      a.seen.add(sh.file);
      const n = files.get(sh.file) ?? 0;
      a.bytes += n;
      if (!counted.has(sh.file)) { counted.add(sh.file); totalCompressed += n; }
    }
    const m = a.decoded[s.density];
    m.set(rotKey, (m.get(rotKey) ?? 0) + dec);
  }
  // decodedPerTurn: what one turn of the item holds decoded at a density, i.e. its heaviest single rotation ('all' is whole)
  const peak = (m: Map<string, number>): number => Math.max(0, ...m.values());
  const perItem = [...items.values()].map((a) => ({ id: a.id, compressedBytes: a.bytes, decodedPerTurn: { d2: peak(a.decoded[2]), d4: peak(a.decoded[4]) } }));

  const byKind: SizeReport['byKind'] = {};
  const bakedIds = new Map<ProjectionKind, Set<string>>();
  for (const a of items.values()) {
    if (!a.kind) continue;
    const b = (byKind[a.kind] ??= { baked: 0, catalogue: 0, bakedBytes: 0, mean: 0 });
    b.baked++; b.bakedBytes += a.bytes;
    (bakedIds.get(a.kind) ?? bakedIds.set(a.kind, new Set()).get(a.kind)!).add(a.id);
  }
  let projectedFull = totalCompressed;
  for (const c of catalogue) (byKind[c.kind] ??= { baked: 0, catalogue: 0, bakedBytes: 0, mean: 0 }).catalogue++;
  for (const [kind, b] of Object.entries(byKind)) {
    b.mean = b.baked ? b.bakedBytes / b.baked : 0;
    const unbaked = catalogue.filter((c) => c.kind === kind && !bakedIds.get(kind as ProjectionKind)?.has(c.id)).length;
    projectedFull += unbaked * b.mean;
  }
  return { perItem, totalCompressed, projectedFull: Math.round(projectedFull), byKind };
}
