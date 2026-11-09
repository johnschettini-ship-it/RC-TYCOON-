/**
 * Calm and Buzz field store (Phase 4 §4.6). Owner: W3-E.
 *
 * `calmRaw` / `buzzRaw` are derived `Uint16Array(width × height)` in a module-level `WeakMap<World, …>`, never in
 * `GameState` and never saved. The first read after a load (or of a new world) builds them in full from the sources;
 * after that every change is an incremental stamp: the old stamp of a source is subtracted and its new stamp added.
 *
 * Sources and how their changes are found:
 * - scenery (`state.scenery`, W3-D): diffed by id against the applied list (definition, position, rotation, edge,
 *   wilted). Callers still call `markFieldsDirty` so a change made inside a tick is seen at once.
 * - wet tiles and benches (`map.water`, `map.heights`, `map.pathItem`): byte snapshots compared 4 tiles at a time, so
 *   a water edit or a bench built by any command is found without a hook.
 * - open rides (status, tag, footprint, track tiles): diffed against the applied stamps.
 *
 * Sync points (determinism): a simulation read syncs at most once per tick (the first read of the tick) and again
 * after `markFieldsDirty`. Saves are written between ticks and a load rebuilds in full, so a loaded game reads the
 * same values as one that kept running. Display reads (overlay, legend) sync without moving the per-tick marker, so
 * drawing a frame never changes what the simulation reads.
 */
import { getFlatRideDef, getSceneryDef, getTrackRideDef, type SceneryDef } from '../../data/catalog';
import {
  FIELD_MAX,
  FIELD_RADIUS,
  FIELD_STRENGTH,
  FLAT_THRILL_INTENSITY_DIVISOR,
  LITTER_CALM_PENALTY,
  MESS_CALM_PENALTY,
  WILTED_CALM_DIVISOR,
} from '../../data/tuning/fields';
import { footprintTile } from '../footprint';
import { PathItem, type Dir, type MapState } from '../map';
import { pieceWorldTiles } from '../rides/track/geometry';
import type { TrackPieceInstance } from '../rides/track/types';
import type { Ride } from '../rides/types';
import { GARDEN_WILT_BELOW } from '../../data/tuning/scenery';
import type { Scenery } from '../scenery/types';
import { isWet } from '../terrain/corners';
import type { GameState, World } from '../types';
import { stamp } from './stamp';

const WET = 1;
const BENCH = 2;

/** Applied stamp of one scenery item. */
interface SceneryEntry {
  id: number;
  defId: string;
  def: SceneryDef | undefined;
  x: number;
  y: number;
  rotation: number;
  edge: number;
  wilted: boolean;
  /** Stamp parameters as applied: strengths, radius, footprint size. */
  calm: number;
  buzz: number;
  r: number;
  w: number;
  d: number;
}

/** Applied Buzz stamp of one ride (`s` 0 = none) and the signature of its tile set. */
interface RideEntry {
  id: number;
  key: string;
  s: number;
  r: number;
  tiles: number[];
  kind: Ride['kind'] | null;
  defId: string;
  x: number;
  y: number;
  rotation: number;
  pieces: readonly TrackPieceInstance[] | null;
  count: number;
  first: TrackPieceInstance | null;
  last: TrackPieceInstance | null;
}

export interface FieldCache {
  state: GameState;
  map: MapState;
  w: number;
  h: number;
  n: number;
  /** Raw fields (no penalties, no cap). */
  calm: Uint16Array;
  buzz: Uint16Array;
  /** Applied tile sources per tile: bit 1 wet, bit 2 bench. */
  tileBits: Uint8Array;
  /** Snapshots of `water`, `heights`, `pathItem` at the last sync, with 32-bit views for the 4-tile compare. */
  snap: [Uint8Array, Uint8Array, Uint8Array];
  snap32: [Uint32Array, Uint32Array, Uint32Array];
  /** 32-bit views of the live map arrays (rebuilt when the map replaces an array) and their sources. */
  live32: [Uint32Array | null, Uint32Array | null, Uint32Array | null];
  liveSrc: [Uint8Array | null, Uint8Array | null, Uint8Array | null];
  /** Applied lists, sorted by id like their state lists. */
  scenery: SceneryEntry[];
  rides: RideEntry[];
  /** Tick of the last simulation sync (−1: none yet). */
  syncTick: number;
  /** `markFieldsDirty` was called since the last sync. */
  stale: boolean;
}

const caches = new WeakMap<World, FieldCache>();

// ------------------------------------------------------------------ tile sources (wet, bench)

function tileBitsAt(map: MapState, i: number): number {
  return (isWet(map, i) ? WET : 0) | ((map.pathItem[i] as number) === PathItem.Bench ? BENCH : 0);
}

function applyTileBits(c: FieldCache, i: number, bits: number): void {
  const old = c.tileBits[i] as number;
  if (bits === old) return;
  const x = i % c.w;
  const y = (i - x) / c.w;
  const diff = bits ^ old;
  if (diff & WET) stamp(c.calm, c.w, c.h, x, y, FIELD_RADIUS.wetTile, bits & WET ? FIELD_STRENGTH.wetTile : -FIELD_STRENGTH.wetTile);
  if (diff & BENCH) stamp(c.calm, c.w, c.h, x, y, FIELD_RADIUS.bench, bits & BENCH ? FIELD_STRENGTH.bench : -FIELD_STRENGTH.bench);
  c.tileBits[i] = bits;
}

function liveView(c: FieldCache, k: 0 | 1 | 2, arr: Uint8Array): Uint32Array | null {
  if (c.liveSrc[k] === arr) return c.live32[k];
  c.liveSrc[k] = arr;
  c.live32[k] = arr.byteOffset % 4 === 0 && arr.length === c.n ? new Uint32Array(arr.buffer, arr.byteOffset, c.n >> 2) : null;
  return c.live32[k];
}

/** Re-check one tile: copy its snapshot bytes and apply a changed wet or bench state. */
function checkTile(c: FieldCache, map: MapState, i: number): void {
  c.snap[0][i] = map.water[i] as number;
  c.snap[1][i] = map.heights[i] as number;
  c.snap[2][i] = map.pathItem[i] as number;
  applyTileBits(c, i, tileBitsAt(map, i));
}

function syncTiles(c: FieldCache, map: MapState): void {
  const n = c.n;
  const water = map.water;
  const heights = map.heights;
  const items = map.pathItem;
  const vw = liveView(c, 0, water);
  const vh = liveView(c, 1, heights);
  const vi = liveView(c, 2, items);
  let from = 0;
  if (vw !== null && vh !== null && vi !== null) {
    const [sw, sh, si] = c.snap32;
    const words = n >> 2;
    for (let k = 0; k < words; k++) {
      if (((vw[k] as number) ^ (sw[k] as number)) | ((vh[k] as number) ^ (sh[k] as number)) | ((vi[k] as number) ^ (si[k] as number))) {
        const b = k << 2;
        checkTile(c, map, b);
        checkTile(c, map, b + 1);
        checkTile(c, map, b + 2);
        checkTile(c, map, b + 3);
      }
    }
    from = words << 2;
  }
  const [bw, bh, bi] = c.snap;
  for (let i = from; i < n; i++) {
    if (water[i] !== bw[i] || heights[i] !== bh[i] || items[i] !== bi[i]) checkTile(c, map, i);
  }
}

// ------------------------------------------------------------------ scenery

function sceneryEntry(item: Scenery): SceneryEntry {
  const e: SceneryEntry = { id: item.id, defId: '', def: undefined, x: 0, y: 0, rotation: 0, edge: -1, wilted: false, calm: 0, buzz: 0, r: 0, w: 1, d: 1 };
  readScenery(e, item);
  return e;
}

/** Copy the item's source facts into the entry and work out its stamp parameters (Phase 4 §4.6 rows 1–4). */
function readScenery(e: SceneryEntry, item: Scenery): void {
  if (e.defId !== item.defId || e.def === undefined) {
    e.defId = item.defId;
    e.def = getSceneryDef(item.defId);
  }
  e.x = item.x;
  e.y = item.y;
  e.rotation = item.rotation;
  e.edge = item.edge;
  const def = e.def;
  e.wilted = wilted(def, item);
  if (def === undefined) {
    e.calm = 0;
    e.buzz = 0;
    return;
  }
  if (def.edge) {
    e.w = 1;
    e.d = 1;
    e.r = FIELD_RADIUS.sceneryEdge;
  } else {
    const odd = (item.rotation & 1) === 1;
    e.w = odd ? def.d : def.w;
    e.d = odd ? def.w : def.d;
    e.r = e.w * e.d === 1 ? FIELD_RADIUS.scenery1x1 : FIELD_RADIUS.sceneryLarge;
  }
  e.calm = e.wilted ? Math.floor(def.calm / WILTED_CALM_DIVISOR) : def.calm;
  e.buzz = def.buzz;
}

/**
 * Wilted (Phase 4 §4.5): a garden (`needsWater`) below the wilt line. The same rule as W3-D's `isWilted`, with the
 * definition the entry already holds (no catalog lookup per item per sync).
 */
function wilted(def: SceneryDef | undefined, item: Scenery): boolean {
  return def !== undefined && def.needsWater && item.waterLevel < GARDEN_WILT_BELOW;
}

/** True when the item still matches what the entry applied. */
function sceneryUnchanged(e: SceneryEntry, item: Scenery): boolean {
  return (
    e.x === item.x &&
    e.y === item.y &&
    e.rotation === item.rotation &&
    e.edge === item.edge &&
    e.defId === item.defId &&
    e.wilted === wilted(e.def, item)
  );
}

function stampScenery(c: FieldCache, e: SceneryEntry, sign: 1 | -1): void {
  if (e.calm === 0 && e.buzz === 0) return;
  for (let ty = e.y; ty < e.y + e.d; ty++) {
    if (ty < 0 || ty >= c.h) continue;
    for (let tx = e.x; tx < e.x + e.w; tx++) {
      if (tx < 0 || tx >= c.w) continue;
      if (e.calm !== 0) stamp(c.calm, c.w, c.h, tx, ty, e.r, sign * e.calm);
      if (e.buzz !== 0) stamp(c.buzz, c.w, c.h, tx, ty, e.r, sign * e.buzz);
    }
  }
}

function updateScenery(c: FieldCache, e: SceneryEntry, item: Scenery): void {
  if (sceneryUnchanged(e, item)) return;
  stampScenery(c, e, -1);
  readScenery(e, item);
  stampScenery(c, e, 1);
}

/**
 * Diff the scenery list against the applied entries, in place: the entries mirror the list order (sorted by id),
 * so a removed item is an entry whose id comes before the next item's, and a new item has no entry yet.
 */
function syncScenery(c: FieldCache, list: readonly Scenery[]): void {
  const entries = c.scenery;
  let j = 0;
  for (let k = 0; k < list.length; k++) {
    const item = list[k] as Scenery;
    let e = entries[j];
    while (e !== undefined && e.id < item.id) {
      stampScenery(c, e, -1);
      entries.splice(j, 1);
      e = entries[j];
    }
    if (e !== undefined && e.id === item.id) {
      updateScenery(c, e, item);
    } else {
      const fresh = sceneryEntry(item);
      stampScenery(c, fresh, 1);
      entries.splice(j, 0, fresh);
    }
    j++;
  }
  while (entries.length > j) stampScenery(c, entries.pop() as SceneryEntry, -1);
}

// ------------------------------------------------------------------ rides

/** Radius of the last `rideStrength` call (no allocation per call). */
let lastRadius = 0;

/**
 * Buzz strength of a ride now (Phase 4 §4.6 rows 7–10), 0 for none: only open rides with tag `thrill` or `family`.
 * Sets `lastRadius`.
 */
function rideStrength(world: World, ride: Ride, key: string): number {
  lastRadius = 0;
  if (ride.status !== 'open') return 0;
  if (ride.kind === 'flat') {
    const def = getFlatRideDef(ride.defId);
    if (def === undefined) return 0;
    lastRadius = FIELD_RADIUS.flatRide;
    if (def.tag === 'thrill') {
      const intensity = ride.stats?.intensity ?? def.intensity;
      return FIELD_STRENGTH.flatThrillBase + Math.floor(intensity / FLAT_THRILL_INTENSITY_DIVISOR);
    }
    return def.tag === 'family' ? FIELD_STRENGTH.flatFamily : 0;
  }
  const typeId = world.state.track.rides[key]?.typeId ?? ride.defId;
  const tag = getTrackRideDef(typeId)?.tag;
  if (tag === 'thrill') {
    lastRadius = FIELD_RADIUS.trackThrill;
    return FIELD_STRENGTH.trackThrill;
  }
  if (tag === 'family') {
    lastRadius = FIELD_RADIUS.trackFamily;
    return FIELD_STRENGTH.trackFamily;
  }
  return 0;
}

function rideEntry(ride: Ride): RideEntry {
  return { id: ride.id, key: String(ride.id), s: 0, r: 0, tiles: [], kind: null, defId: '', x: 0, y: 0, rotation: 0, pieces: null, count: 0, first: null, last: null };
}

/** The tile set of the entry still matches the ride (flat: definition and placement; track: its piece list). */
function sameTiles(world: World, e: RideEntry, ride: Ride): boolean {
  if (e.kind !== ride.kind || e.defId !== ride.defId) return false;
  if (ride.kind === 'flat') return e.x === ride.x && e.y === ride.y && e.rotation === ride.rotation;
  const pieces = world.state.track.rides[e.key]?.pieces ?? null;
  if (pieces === null) return e.pieces === null;
  return pieces === e.pieces && pieces.length === e.count && pieces[0] === e.first && pieces[pieces.length - 1] === e.last;
}

/** Recompute the tile set: flat footprint tiles, or the distinct tiles of every track piece; in-map only. */
function readRideTiles(world: World, e: RideEntry, ride: Ride): void {
  const map = world.state.map;
  e.kind = ride.kind;
  e.defId = ride.defId;
  e.x = ride.x;
  e.y = ride.y;
  e.rotation = ride.rotation;
  const tiles: number[] = [];
  if (ride.kind === 'flat') {
    e.pieces = null;
    e.count = 0;
    e.first = null;
    e.last = null;
    const def = getFlatRideDef(ride.defId);
    if (def !== undefined) {
      for (let r = 0; r < def.d; r++) {
        for (let col = 0; col < def.w; col++) {
          const t = footprintTile(ride.x, ride.y, def.w, def.d, ride.rotation as Dir, col, r);
          if (t.x >= 0 && t.y >= 0 && t.x < map.width && t.y < map.height) tiles.push(t.y * map.width + t.x);
        }
      }
    }
  } else {
    const pieces = world.state.track.rides[e.key]?.pieces ?? null;
    e.pieces = pieces;
    e.count = pieces?.length ?? 0;
    e.first = pieces?.[0] ?? null;
    e.last = pieces?.[pieces.length - 1] ?? null;
    const seen = new Set<number>();
    for (const p of pieces ?? []) {
      for (const t of pieceWorldTiles(p)) {
        if (t.x >= 0 && t.y >= 0 && t.x < map.width && t.y < map.height) seen.add(t.y * map.width + t.x);
      }
    }
    for (const t of seen) tiles.push(t);
    tiles.sort((a, b) => a - b);
  }
  e.tiles = tiles;
}

function stampTiles(c: FieldCache, tiles: readonly number[], r: number, s: number): void {
  for (let k = 0; k < tiles.length; k++) {
    const t = tiles[k] as number;
    const x = t % c.w;
    stamp(c.buzz, c.w, c.h, x, (t - x) / c.w, r, s);
  }
}

function updateRide(world: World, c: FieldCache, e: RideEntry, ride: Ride): void {
  const s = rideStrength(world, ride, e.key);
  const r = lastRadius;
  if (s === 0 && e.s === 0) return;
  const same = sameTiles(world, e, ride);
  if (s === e.s && r === e.r && same) return;
  if (e.s !== 0) stampTiles(c, e.tiles, e.r, -e.s);
  if (s !== 0) {
    if (!same) readRideTiles(world, e, ride);
    stampTiles(c, e.tiles, r, s);
  }
  e.s = s;
  e.r = r;
}

/** Diff the rides against the applied entries, in place (the same scheme as `syncScenery`). */
function syncRides(world: World, c: FieldCache): void {
  const rides = world.state.rides;
  const entries = c.rides;
  let j = 0;
  for (let k = 0; k < rides.length; k++) {
    const ride = rides[k] as Ride;
    let e = entries[j];
    while (e !== undefined && e.id < ride.id) {
      if (e.s !== 0) stampTiles(c, e.tiles, e.r, -e.s);
      entries.splice(j, 1);
      e = entries[j];
    }
    if (e === undefined || e.id !== ride.id) {
      e = rideEntry(ride);
      entries.splice(j, 0, e);
    }
    updateRide(world, c, e, ride);
    j++;
  }
  while (entries.length > j) {
    const gone = entries.pop() as RideEntry;
    if (gone.s !== 0) stampTiles(c, gone.tiles, gone.r, -gone.s);
  }
}

// ------------------------------------------------------------------ build and sync

/** Full build from the current state (first use, a load, a new map). */
function buildCache(world: World): FieldCache {
  const s = world.state;
  const map = s.map;
  const w = map.width;
  const h = map.height;
  const n = w * h;
  const snap: [Uint8Array, Uint8Array, Uint8Array] = [new Uint8Array(n), new Uint8Array(n), new Uint8Array(n)];
  snap[0].set(map.water.subarray(0, n));
  snap[1].set(map.heights.subarray(0, n));
  snap[2].set(map.pathItem.subarray(0, n));
  const c: FieldCache = {
    state: s,
    map,
    w,
    h,
    n,
    calm: new Uint16Array(n),
    buzz: new Uint16Array(n),
    tileBits: new Uint8Array(n),
    snap,
    snap32: [new Uint32Array(snap[0].buffer, 0, n >> 2), new Uint32Array(snap[1].buffer, 0, n >> 2), new Uint32Array(snap[2].buffer, 0, n >> 2)],
    live32: [null, null, null],
    liveSrc: [null, null, null],
    scenery: [],
    rides: [],
    syncTick: -1,
    stale: false,
  };
  for (let i = 0; i < n; i++) {
    const bits = tileBitsAt(map, i);
    if (bits !== 0) applyTileBits(c, i, bits);
  }
  for (const item of s.scenery) {
    const e = sceneryEntry(item);
    stampScenery(c, e, 1);
    c.scenery.push(e);
  }
  for (const ride of s.rides) {
    const e = rideEntry(ride);
    updateRide(world, c, e, ride);
    c.rides.push(e);
  }
  return c;
}

function syncCache(world: World, c: FieldCache): void {
  syncTiles(c, world.state.map);
  syncScenery(c, world.state.scenery);
  syncRides(world, c);
  c.stale = false;
}

function current(world: World, c: FieldCache | undefined): c is FieldCache {
  if (c === undefined) return false;
  const s = world.state;
  return c.state === s && c.map === s.map && c.w === s.map.width && c.h === s.map.height;
}

/** Fields for simulation reads: synced at the first read of each tick and after `markFieldsDirty`. */
export function simFields(world: World): FieldCache {
  let c = caches.get(world);
  const tick = world.state.tick;
  if (!current(world, c)) {
    c = buildCache(world);
    caches.set(world, c);
    c.syncTick = tick;
    return c;
  }
  if (c.stale || c.syncTick !== tick) {
    syncCache(world, c);
    c.syncTick = tick;
  }
  return c;
}

/**
 * Fields for display (overlay, legend): synced now, including ride changes made while the game is paused. Leaves
 * the per-tick marker alone, so the simulation still syncs at its own next read.
 */
export function displayFields(world: World): FieldCache {
  let c = caches.get(world);
  if (!current(world, c)) {
    c = buildCache(world);
    caches.set(world, c);
    return c;
  }
  syncCache(world, c);
  return c;
}

/** A source may have changed: the next read syncs, even inside the same tick. */
export function markStale(world: World): void {
  const c = caches.get(world);
  if (c !== undefined) c.stale = true;
}

// ------------------------------------------------------------------ reads

/** Calm read value: `min(255, raw − 8 × litter − 16 × mess)`, floored at 0. */
export function calmRead(c: FieldCache, map: MapState, i: number): number {
  const v = (c.calm[i] as number) - LITTER_CALM_PENALTY * (map.litter[i] as number) - MESS_CALM_PENALTY * (map.mess[i] as number);
  return v <= 0 ? 0 : v > FIELD_MAX ? FIELD_MAX : v;
}

/** Buzz read value: `min(255, raw)`. */
export function buzzRead(c: FieldCache, i: number): number {
  const v = c.buzz[i] as number;
  return v > FIELD_MAX ? FIELD_MAX : v;
}

/** Display read of one field at `tile` (0 outside the map). */
export function displayFieldValue(world: World, field: 'calm' | 'buzz', tile: number): number {
  const c = displayFields(world);
  if (tile < 0 || tile >= c.n) return 0;
  return field === 'calm' ? calmRead(c, world.state.map, tile) : buzzRead(c, tile);
}

/** The raw fields the simulation reads now (tests and benchmarks; do not write). */
export function fieldsRaw(world: World): { calm: Uint16Array; buzz: Uint16Array } {
  const c = simFields(world);
  return { calm: c.calm, buzz: c.buzz };
}

/** Raw fields built in full from the current state, without touching the cache (tests: incremental = rebuild). */
export function rebuildFieldsRaw(world: World): { calm: Uint16Array; buzz: Uint16Array } {
  const c = buildCache(world);
  return { calm: c.calm, buzz: c.buzz };
}
