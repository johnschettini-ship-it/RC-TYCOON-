/**
 * The derived light map `lightRaw` (Phase 4 §4.7). Owner: W3-F.
 *
 * `lightRaw: Uint16Array(width × height)` is never saved. It lives in a module-level `WeakMap<World, …>` and is
 * rebuilt in full on first use after a load (plan: Rules for every Wave 3 card, derived data). It does not change
 * with the clock. Sources and radii (Euclidean stamps, `./stamps.ts`):
 * | Source                                         | R |
 * | Path lamp (not broken, Phase 3 §4.4)            | 3 |
 * | Scenery with flag L, 1×1 (from its tile)        | 2 |
 * | Scenery with flag L, larger (from every tile)   | 3 |
 * | Open ride (each footprint or station tile)      | 2 |
 * | Open stall (master R11)                         | 1 |
 * | Park entrance                                   | 4 |
 *
 * Updates are incremental: a sync diffs the sources against the last stamped set and subtracts or adds only the
 * stamps that changed. Lamps, ground footpaths, and ride or stall status change without telling this module, so a
 * sync always diffs them (one pass over the tile arrays plus a merge walk over the id-sorted entity lists).
 *
 * Two sync modes keep the simulation deterministic:
 * - `syncLight` (every public query, the render, the UI): a full diff now. Always current.
 * - `syncLightForTick` (the per-guest night hook inside a tick): a full diff at the first query of a tick (or after
 *   `markLightDirty`), then the same map for the rest of that tick. Only called from inside `stepTick`, so a
 *   loaded game and an uninterrupted one see the same map at the same point of the same tick.
 * Footpath units for `litShare` (ground footpath tiles plus elevated footpaths) are counted alongside, so the
 * share is O(1) after a sync.
 */
import { getFlatRideDef, getSceneryDef } from '../../data/catalog';
import { getTrackPieceDef } from '../../data/track';
import { LIGHT_RADIUS, LIT_THRESHOLD } from '../../data/tuning/night';
import { extent, footprintTiles } from '../footprint';
import { Content, PathItem, type MapState } from '../map';
import type { ElevatedPath } from '../paths/types';
import type { Ride } from '../rides/types';
import type { Scenery } from '../scenery/types';
import type { Stall } from '../stalls/types';
import type { GameState, World } from '../types';
import { stampTable } from './stamps';

/** Light source kinds (render snapshot). */
export const LightKind = { Entrance: 0, Ride: 1, Station: 2, Stall: 3, Scenery: 4, Lamp: 5 } as const;
export type LightKindCode = (typeof LightKind)[keyof typeof LightKind];

const BROKEN = 1;
// Imported constants copied to module locals: the hot loops below read them per tile.
const LAMP = PathItem.Lamp;
const FOOTPATH = Content.Footpath;
const LIT = LIT_THRESHOLD;
const R_LAMP = LIGHT_RADIUS.pathLamp;
/** Entity record kinds (diff bookkeeping). */
const REC_RIDE = 0;
const REC_STALL = 1;
const REC_SCENERY = 2;
const REC_ELEVATED = 3;

interface Rec {
  id: number;
  /** −1 = not a light source (or not a footpath, for elevated paths); ≥ 0 = stamped. */
  sig: number;
  kind: number;
  /** Stamp origins (light sources) or the path tile (elevated footpaths). */
  tiles: number[];
  radius: number;
}

class LightCache {
  readonly n: number;
  readonly w: number;
  readonly h: number;
  readonly raw: Uint16Array;
  /** 1 where a lamp stamp is applied. */
  readonly lamp: Uint8Array;
  /** 1 where a ground footpath is counted. */
  readonly ground: Uint8Array;
  /** Elevated footpaths counted per tile column. */
  readonly elev: Uint8Array;
  pathUnits = 0;
  litUnits = 0;
  entrance = -1;
  rides: Rec[] = [];
  stalls: Rec[] = [];
  scenery: Rec[] = [];
  elevated: Rec[] = [];
  /** Bumped by every stamp change (render caches key on it). */
  version = 0;
  /** Tick of the last `syncLightForTick` diff, −1 = none. */
  key = -1;
  dirty = false;
  snap: LightSourceList | null = null;
  /**
   * Word snapshots of `pathItem`, `pathItemFlags`, and `content` (4 tiles per 32-bit word): the tile scan skips
   * words that did not change since the last diff. Null when an array is not 4-byte aligned (byte scan instead).
   */
  words: WordScan | null = null;

  constructor(
    readonly state: GameState,
    readonly map: MapState,
  ) {
    this.w = map.width;
    this.h = map.height;
    this.n = map.width * map.height;
    this.raw = new Uint16Array(this.n);
    this.lamp = new Uint8Array(this.n);
    this.ground = new Uint8Array(this.n);
    this.elev = new Uint8Array(this.n);
  }
}

interface WordScan {
  items: Uint8Array;
  flags: Uint8Array;
  content: Uint8Array;
  items32: Uint32Array;
  flags32: Uint32Array;
  content32: Uint32Array;
  snapItems: Uint32Array;
  snapFlags: Uint32Array;
  snapContent: Uint32Array;
}

function wordView(a: Uint8Array): Uint32Array | null {
  return a.byteOffset % 4 === 0 ? new Uint32Array(a.buffer, a.byteOffset, a.length >> 2) : null;
}

/** Word views of the current map arrays (rebuilt when an array is replaced), or null when unaligned. */
function wordScan(c: LightCache): WordScan | null {
  const map = c.map;
  const ws = c.words;
  if (ws && ws.items === map.pathItem && ws.flags === map.pathItemFlags && ws.content === map.content) return ws;
  const items32 = wordView(map.pathItem);
  const flags32 = wordView(map.pathItemFlags);
  const content32 = wordView(map.content);
  if (!items32 || !flags32 || !content32) {
    c.words = null;
    return null;
  }
  const words = c.n >> 2;
  // Fresh zero snapshots: every word that is not all zero is diffed once, which the derived arrays need anyway.
  c.words = {
    items: map.pathItem,
    flags: map.pathItemFlags,
    content: map.content,
    items32,
    flags32,
    content32,
    snapItems: new Uint32Array(words),
    snapFlags: new Uint32Array(words),
    snapContent: new Uint32Array(words),
  };
  return c.words;
}

const caches = new WeakMap<World, LightCache>();

// ------------------------------------------------------------------ stamping

function stamp(c: LightCache, tile: number, radius: number, sign: 1 | -1): void {
  const t = stampTable(radius);
  const w = c.w;
  const x0 = tile % w;
  const y0 = (tile - x0) / w;
  const raw = c.raw;
  for (let k = 0; k < t.count; k++) {
    const x = x0 + (t.dx[k] as number);
    const y = y0 + (t.dy[k] as number);
    if (x < 0 || y < 0 || x >= w || y >= c.h) continue;
    const j = y * w + x;
    const old = raw[j] as number;
    const nv = old + sign * (t.value[k] as number);
    raw[j] = nv;
    const units = (c.ground[j] as number) + (c.elev[j] as number);
    if (units > 0) {
      const was = old >= LIT;
      const now = nv >= LIT;
      if (was !== now) c.litUnits += now ? units : -units;
    }
  }
  c.version++;
}

/** A footpath unit appears (+1) or goes (−1) on `tile`. */
function pathUnit(c: LightCache, tile: number, delta: 1 | -1): void {
  c.pathUnits += delta;
  if ((c.raw[tile] as number) >= LIT) c.litUnits += delta;
}

function applyRec(c: LightCache, rec: Rec, sign: 1 | -1): void {
  if (rec.sig < 0) return;
  if (rec.kind === REC_ELEVATED) {
    const t = rec.tiles[0] as number;
    c.elev[t] = (c.elev[t] as number) + sign;
    pathUnit(c, t, sign);
    return;
  }
  for (const t of rec.tiles) stamp(c, t, rec.radius, sign);
}

// ------------------------------------------------------------------ sources

function rideStationTiles(state: GameState, ride: Ride, out: number[]): void {
  const data = state.track.rides[String(ride.id)];
  if (!data) return;
  const map = state.map;
  for (const p of data.pieces) {
    if (getTrackPieceDef(p.defId)?.special !== 'station') break;
    if (p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height) out.push(p.y * map.width + p.x);
  }
}

function rideRec(state: GameState, ride: Ride): Rec {
  const open = ride.status === 'open';
  const rec: Rec = { id: ride.id, sig: open ? 1 : -1, kind: REC_RIDE, tiles: [], radius: LIGHT_RADIUS.ride };
  if (!open) return rec;
  if (ride.kind === 'track') {
    rideStationTiles(state, ride, rec.tiles);
  } else {
    const def = getFlatRideDef(ride.defId);
    const tiles = def ? footprintTiles(state.map, ride.x, ride.y, def.w, def.d, ride.rotation) : null;
    if (tiles) rec.tiles = tiles;
  }
  return rec;
}

function stallRec(state: GameState, stall: Stall): Rec {
  const map = state.map;
  const inside = stall.x >= 0 && stall.y >= 0 && stall.x < map.width && stall.y < map.height;
  const on = stall.open && inside;
  return { id: stall.id, sig: on ? 1 : -1, kind: REC_STALL, tiles: on ? [stall.y * map.width + stall.x] : [], radius: LIGHT_RADIUS.stall };
}

function sceneryRec(state: GameState, item: Scenery): Rec {
  const def = getSceneryDef(item.defId);
  const rec: Rec = { id: item.id, sig: -1, kind: REC_SCENERY, tiles: [], radius: LIGHT_RADIUS.scenery1x1 };
  if (!def || !def.light) return rec;
  const map = state.map;
  if (def.edge) {
    if (item.x >= 0 && item.y >= 0 && item.x < map.width && item.y < map.height) rec.tiles.push(item.y * map.width + item.x);
  } else {
    const { ex, ey } = extent(def.w, def.d, item.rotation);
    for (let y = item.y; y < item.y + ey; y++) {
      for (let x = item.x; x < item.x + ex; x++) {
        if (x >= 0 && y >= 0 && x < map.width && y < map.height) rec.tiles.push(y * map.width + x);
      }
    }
    if (def.w * def.d > 1) rec.radius = LIGHT_RADIUS.sceneryLarge;
  }
  rec.sig = 1;
  return rec;
}

function elevatedRec(state: GameState, p: ElevatedPath): Rec {
  const map = state.map;
  const inside = p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;
  const on = p.kind === 'footpath' && inside;
  return { id: p.id, sig: on ? 1 : -1, kind: REC_ELEVATED, tiles: on ? [p.y * map.width + p.x] : [], radius: 0 };
}

/**
 * Merge walk of an id-sorted entity list against its records. `sigOf` is the cheap change signature of a known
 * entity (`undefined`: the record never changes while the entity lives). Returns the new record list (the same
 * array when nothing changed).
 */
function diffList<T extends { id: number }>(
  c: LightCache,
  recs: Rec[],
  list: readonly T[],
  sigOf: ((e: T) => number) | undefined,
  make: (e: T) => Rec,
): Rec[] {
  // `out` stays null while every record is kept as it is; the first change copies the kept prefix.
  let out: Rec[] | null = null;
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i] as T;
    while (j < recs.length && (recs[j] as Rec).id < e.id) {
      if (out === null) out = recs.slice(0, j);
      applyRec(c, recs[j] as Rec, -1);
      j++;
    }
    const r = j < recs.length && (recs[j] as Rec).id === e.id ? (recs[j] as Rec) : null;
    if (r !== null) {
      j++;
      if (sigOf === undefined || sigOf(e) === r.sig) {
        if (out !== null) out.push(r);
        continue;
      }
      if (out === null) out = recs.slice(0, j - 1);
      applyRec(c, r, -1);
    } else if (out === null) {
      out = recs.slice(0, j);
    }
    const nr = make(e);
    applyRec(c, nr, 1);
    out.push(nr);
  }
  if (j < recs.length) {
    if (out === null) out = recs.slice(0, j);
    for (; j < recs.length; j++) applyRec(c, recs[j] as Rec, -1);
  }
  return out ?? recs;
}

const rideSig = (r: Ride): number => (r.status === 'open' ? 1 : -1);
const stallSig = (s: Stall): number => (s.open ? 1 : -1);
const elevatedSig = (p: ElevatedPath): number => (p.kind === 'footpath' ? 1 : -1);

/** Diff every source against the stamped set (one pass over the tiles, merge walks over the entities). */
function diffAll(c: LightCache): void {
  const s = c.state;
  const map = c.map;
  // Entities.
  c.rides = diffList(c, c.rides, s.rides, rideSig, (r) => rideRec(s, r));
  c.stalls = diffList(c, c.stalls, s.stalls, stallSig, (st) => stallRec(s, st));
  c.scenery = diffList(c, c.scenery, s.scenery, undefined, (it) => sceneryRec(s, it));
  c.elevated = diffList(c, c.elevated, s.elevatedPaths, elevatedSig, (p) => elevatedRec(s, p));
  // Park entrance.
  const e = map.entranceTile;
  const entrance = e >= 0 && e < c.n && map.content[e] === Content.ParkEntrance ? e : -1;
  if (entrance !== c.entrance) {
    if (c.entrance >= 0) stamp(c, c.entrance, LIGHT_RADIUS.entrance, -1);
    if (entrance >= 0) stamp(c, entrance, LIGHT_RADIUS.entrance, 1);
    c.entrance = entrance;
  }
  // Lamps and ground footpaths.
  const items = map.pathItem;
  const flags = map.pathItemFlags;
  const content = map.content;
  const lamp = c.lamp;
  const ground = c.ground;
  const n = c.n;
  const ws = wordScan(c);
  let from = 0;
  if (ws !== null) {
    const a = ws.items32;
    const b = ws.flags32;
    const d = ws.content32;
    const sa = ws.snapItems;
    const sb = ws.snapFlags;
    const sd = ws.snapContent;
    const nw = sa.length;
    for (let k = 0; k < nw; k++) {
      const va = a[k] as number;
      const vb = b[k] as number;
      const vd = d[k] as number;
      if (va === sa[k] && vb === sb[k] && vd === sd[k]) continue;
      sa[k] = va;
      sb[k] = vb;
      sd[k] = vd;
      const i0 = k << 2;
      for (let i = i0; i < i0 + 4; i++) diffTile(c, items, flags, content, lamp, ground, i);
    }
    from = nw << 2;
  }
  for (let i = from; i < n; i++) diffTile(c, items, flags, content, lamp, ground, i);
  c.dirty = false;
}

/** Lamp and ground-footpath diff of one tile against the derived arrays. */
function diffTile(c: LightCache, items: Uint8Array, flags: Uint8Array, content: Uint8Array, lamp: Uint8Array, ground: Uint8Array, i: number): void {
  const on = items[i] === LAMP && ((flags[i] as number) & BROKEN) === 0 ? 1 : 0;
  if (on !== lamp[i]) {
    lamp[i] = on;
    stamp(c, i, R_LAMP, on ? 1 : -1);
  }
  const g = content[i] === FOOTPATH ? 1 : 0;
  if (g !== ground[i]) {
    ground[i] = g;
    pathUnit(c, i, g ? 1 : -1);
  }
}

function cacheOf(world: World): LightCache {
  const s = world.state;
  let c = caches.get(world);
  if (!c || c.state !== s || c.map !== s.map || c.n !== s.map.width * s.map.height) {
    c = new LightCache(s, s.map);
    caches.set(world, c);
  }
  return c;
}

// ------------------------------------------------------------------ public (module) API

/** Full diff now: the light map of the current state. Used by every public query, the render, and the UI. */
export function syncLight(world: World): LightCache {
  const c = cacheOf(world);
  diffAll(c);
  return c;
}

/**
 * The light map for the hot per-guest hook: a full diff at the first call of a tick (or after `markLightDirty`),
 * then the same map for the rest of the tick. Call only from inside `stepTick` (see the module comment).
 */
export function syncLightForTick(world: World): LightCache {
  const c = cacheOf(world);
  const tick = world.state.tick;
  if (c.key !== tick || c.dirty) {
    diffAll(c);
    c.key = tick;
  }
  return c;
}

/** A source may have changed: the next tick-keyed query diffs again. No-op before the first query. */
export function markLightCacheDirty(world: World): void {
  const c = caches.get(world);
  if (c) c.dirty = true;
}

/** Read value of a raw light sum: `min(255, raw)`. */
export function lightValue(raw: number): number {
  return raw > 255 ? 255 : raw;
}

/** Lit: `min(255, raw) ≥ 96`. */
export function litValue(raw: number): boolean {
  return raw >= LIT;
}

/** Light of `tile` in a synced cache (0 outside the map). */
export function lightOf(c: LightCache, tile: number): number {
  return tile >= 0 && tile < c.n ? lightValue(c.raw[tile] as number) : 0;
}

/** Lit footpath units / all footpath units in a synced cache (1 with no footpaths). */
export function litShareOf(c: LightCache): number {
  return c.pathUnits === 0 ? 1 : c.litUnits / c.pathUnits;
}

/** Footpath units (ground footpath tiles plus elevated footpaths) and the lit ones, after a full diff. */
export function footpathLightCounts(world: World): { paths: number; lit: number } {
  const c = syncLight(world);
  return { paths: c.pathUnits, lit: c.litUnits };
}

/** Change counter of the light map (any stamp added or removed). */
export function lightVersion(world: World): number {
  return syncLight(world).version;
}

/** The current light map (read only). */
export function lightRawNow(world: World): Uint16Array {
  return syncLight(world).raw;
}

/** The light map built from nothing (tests and checks; no cache). */
export function computeLightRaw(world: World): Uint16Array {
  const c = new LightCache(world.state, world.state.map);
  diffAll(c);
  return c.raw;
}

export type { LightCache };

// ------------------------------------------------------------------ render snapshot

/**
 * Light sources for the render: one entry per source (a ride or a 2 × 2 item is one entry with its footprint
 * extent), rebuilt only when the light map changed. `fx`, `fy` = map centre (continuous tile units); `ex`, `ey` =
 * footprint size in tiles; `z` = absolute height in steps, or −1 for the live ground height of `tile`.
 */
export interface LightSourceList {
  version: number;
  count: number;
  kind: Uint8Array;
  tile: Int32Array;
  radius: Uint8Array;
  fx: Float32Array;
  fy: Float32Array;
  ex: Float32Array;
  ey: Float32Array;
  z: Int16Array;
  /** Scenery: item height in m (emissive placement). */
  height: Uint8Array;
}

function emptySnap(cap: number): LightSourceList {
  return {
    version: -1,
    count: 0,
    kind: new Uint8Array(cap),
    tile: new Int32Array(cap),
    radius: new Uint8Array(cap),
    fx: new Float32Array(cap),
    fy: new Float32Array(cap),
    ex: new Float32Array(cap),
    ey: new Float32Array(cap),
    z: new Int16Array(cap),
    height: new Uint8Array(cap),
  };
}

function findElevated(list: readonly ElevatedPath[], id: number): ElevatedPath | undefined {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = list[mid] as ElevatedPath;
    if (p.id === id) return p;
    if (p.id < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

function findSceneryItem(list: readonly Scenery[], id: number): Scenery | undefined {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = list[mid] as Scenery;
    if (p.id === id) return p;
    if (p.id < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

function boundsOf(tiles: readonly number[], w: number): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const t of tiles) {
    const x = t % w;
    const y = (t - x) / w;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

function rebuildSnap(c: LightCache): LightSourceList {
  let count = c.entrance >= 0 ? 1 : 0;
  for (const list of [c.rides, c.stalls, c.scenery]) for (const r of list) if (r.sig >= 0 && r.tiles.length > 0) count++;
  const lamp = c.lamp;
  for (let i = 0; i < c.n; i++) if (lamp[i]) count++;
  let snap = c.snap;
  if (!snap || snap.kind.length < count) snap = emptySnap(Math.max(64, count * 2));
  const s = c.state;
  const map = c.map;
  const w = c.w;
  let k = 0;
  const put = (kind: LightKindCode, tile: number, radius: number, fx: number, fy: number, ex: number, ey: number, z: number, height: number): void => {
    const sn = snap as LightSourceList;
    sn.kind[k] = kind;
    sn.tile[k] = tile;
    sn.radius[k] = radius;
    sn.fx[k] = fx;
    sn.fy[k] = fy;
    sn.ex[k] = ex;
    sn.ey[k] = ey;
    sn.z[k] = z;
    sn.height[k] = height;
    k++;
  };
  if (c.entrance >= 0) {
    const x = c.entrance % w;
    put(LightKind.Entrance, c.entrance, LIGHT_RADIUS.entrance, x + 0.5, (c.entrance - x) / w + 0.5, 1, 1, -1, 0);
  }
  for (const r of c.rides) {
    if (r.sig < 0 || r.tiles.length === 0) continue;
    const b = boundsOf(r.tiles, w);
    let z = -1;
    let kind: LightKindCode = LightKind.Ride;
    const data = s.track.rides[String(r.id)];
    if (data) {
      kind = LightKind.Station;
      z = data.pieces[0]?.z ?? -1;
    }
    put(kind, r.tiles[0] as number, r.radius, (b.x0 + b.x1 + 1) / 2, (b.y0 + b.y1 + 1) / 2, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1, z, 0);
  }
  for (const r of c.stalls) {
    if (r.sig < 0 || r.tiles.length === 0) continue;
    const t = r.tiles[0] as number;
    const x = t % w;
    put(LightKind.Stall, t, r.radius, x + 0.5, (t - x) / w + 0.5, 1, 1, -1, 0);
  }
  for (const r of c.scenery) {
    if (r.sig < 0 || r.tiles.length === 0) continue;
    const item = findSceneryItem(s.scenery, r.id);
    const def = item ? getSceneryDef(item.defId) : undefined;
    const b = boundsOf(r.tiles, w);
    put(LightKind.Scenery, r.tiles[0] as number, r.radius, (b.x0 + b.x1 + 1) / 2, (b.y0 + b.y1 + 1) / 2, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1, item ? item.z : -1, def ? def.heightM : 0);
  }
  for (let i = 0; i < c.n; i++) {
    if (!lamp[i]) continue;
    const x = i % w;
    const level = map.pathItemLevel[i] as number;
    const ep = level !== 0 ? findElevated(s.elevatedPaths, level) : undefined;
    put(LightKind.Lamp, i, LIGHT_RADIUS.pathLamp, x + 0.5, (i - x) / w + 0.5, 1, 1, ep ? ep.z : -1, 0);
  }
  snap.count = k;
  snap.version = c.version;
  c.snap = snap;
  return snap;
}

/** Light sources of the current state for the render (full diff, snapshot rebuilt only after a change). */
export function lightSources(world: World): LightSourceList {
  const c = syncLight(world);
  if (c.snap !== null && c.snap.version === c.version) return c.snap;
  return rebuildSnap(c);
}
