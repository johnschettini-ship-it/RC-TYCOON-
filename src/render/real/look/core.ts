/**
 * The machinery every kind shares: item records, set lookup, the density ladder (twin, starved, degraded) and the
 * counters. Tinted frames come from `./tint.ts` (the shared tint atlas). Kind modules (`rides`, `track`, `people`,
 * `ground`, `scenery`) get a `LookCore` and return their part of `RealLook`; `index.ts` joins them. The contract is in
 * `./index.ts`.
 */
import type { Sprite } from '../../spriteCache';
import type { ViewRotation } from '../../view';
import { realItem } from '../fallbacks';
import { CAR_TILT_STEPS } from '../pose';
import { frameKey, type RealIndex, type RealKind, type SetKey } from '../indexFormat';
import type { ReadySet } from '../setManager';
import type { CanvasLike } from '../tint';
import { createTinter, TINT_NO_ROOM, TINT_WAIT } from './tint';
import type { ItemRec, RealLookOptions, RealSets, Resolved, SetMeta, SupportPart } from './types';

/**
 * The ladder's last step (spec §5.4.4: never drop an object): an object whose density-2 set has had no room to decode
 * (`starved`), or whose tinted frame no room in the tint atlas, for this many prepares in a row draws today's art (or
 * its untinted picture) and counts in `degraded()`.
 */
export const DEGRADE_FRAMES = 30;
/**
 * A tinted frame refused room keeps its no-room wait when it is drawn again within this many prepares of its last draw
 * (a walk frame comes round every few prepares); a longer gap (it went off screen) starts the wait again.
 */
export const NO_ROOM_GAP = 8;

/** F1: the smallest of {2, 4} ≥ zoom × dpr, else 4; then no more than the set manager's cap. */
export function pickDensity(zoom: number, dpr: number, cap: 2 | 4): 2 | 4 {
  const want = zoom * dpr <= 2 ? 2 : 4;
  return want < cap ? want : cap;
}

export const mod = (n: number, m: number): number => ((Math.round(n) % m) + m) % m;

function defaultCanvas(w: number, h: number): CanvasLike {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h) as unknown as CanvasLike;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c as unknown as CanvasLike;
}

/** The frame key for a numeric code, per kind (built once per frame on its first lookup, never per draw). */
export function frameName(kind: RealKind, item: string, code: number): string {
  switch (kind) {
    case 'ride':
      return frameKey([item, `f${code >> 1}`, code & 1 ? 'occ1' : 'occ0']);
    case 'scenery':
      return frameKey([item, `f${code}`]);
    case 'guest':
      return frameKey([`f${code >> 4}`, (code & 15) === 15 ? 'sit' : `w${code & 15}`]);
    case 'car': {
      const full = code & 1;
      const r = (code >> 1) % CAR_TILT_STEPS;
      const p = Math.floor((code >> 1) / CAR_TILT_STEPS) % CAR_TILT_STEPS;
      const y = Math.floor((code >> 1) / (CAR_TILT_STEPS * CAR_TILT_STEPS));
      return frameKey([`y${y}`, `p${p}`, `r${r}`, full ? 'full' : 'empty']);
    }
    case 'support':
      return SUPPORT_PARTS[code] as string;
    case 'ground':
      return code < 0 ? `j${-1 - code}` : frameKey([`s${code >> 2}`, `v${code & 3}`]);
    default:
      // stall, shadow: the item alone.
      return item;
  }
}

export const SUPPORT_PARTS: readonly SupportPart[] = ['foot', 'seg', 'top'];
/** What a kind module uses; one per `createRealLook`. */
export interface LookCore {
  /** Whether the index has this set key. */
  has(key: SetKey): boolean;
  readonly groundItems: readonly string[];
  readonly guestItems: readonly string[];
  /** The density and view turn the last `prepare` chose. */
  readonly density: 2 | 4;
  readonly curRot: ViewRotation;
  readonly frameNo: number;
  recOf(kind: RealKind, item: string): ItemRec | undefined;
  gameRec(kind: RealKind, defId: string): ItemRec | null;
  /** Guests by body x 4 + outfit. */
  readonly guestRecs: readonly ItemRec[];
  groundRec(terrain: string): ItemRec;
  staffRec(type: string): ItemRec;
  resolveAt(rec: ItemRec, rot: ViewRotation, want: 2 | 4): SetKey | undefined;
  twinOf(rec: ItemRec, rot: ViewRotation, key: SetKey): SetKey | undefined;
  metaOf(rs: ReadySet): SetMeta;
  lookup(rs: ReadySet, key: SetKey, fk: string): Resolved | string;
  sprite(kind: RealKind, rec: ItemRec | null, classicId: string, rot: ViewRotation, code: number, piece: string | null, tint: string | null): Sprite | null | undefined;
  /** Start of a `prepare`: the frame counter, the counters and the tint budget reset, the density and turn set, stale tinted frames swept. */
  beginFrame(rot: ViewRotation, density: 2 | 4): void;
  setItemMap(map: Readonly<Record<string, string>> | null): void;
  dispose(): void;
  reclaim(needBytes: number): number;
  incomplete(): number;
  soft(): number;
  degraded(): number;
  fallbacksUsed(): string[];
}

export function createLookCore(index: RealIndex, sets: RealSets, opts: RealLookOptions = {}): LookCore {
  const make = opts.makeCanvas ?? defaultCanvas;
  const keys = new Set<SetKey>(index.sets.map((e) => e.key));
  const itemsOf = (kind: RealKind): string[] => [...new Set(index.sets.filter((e) => e.kind === kind).map((e) => e.item))].sort();
  const groundItems = itemsOf('ground');

  /** Item records by kind, then item. */
  const recs = new Map<RealKind, Map<string, ItemRec>>();
  for (const e of index.sets) {
    let byItem = recs.get(e.kind);
    if (!byItem) recs.set(e.kind, (byItem = new Map()));
    let r = byItem.get(e.item);
    if (!r) byItem.set(e.item, (r = { kind: e.kind, item: e.item, k2: [], k4: [], missId: `${e.kind}:${e.item}` }));
    const at = e.density === 4 ? r.k4 : r.k2;
    for (let t = 0; t < 4; t++) {
      // The `all` set serves every turn and wins over a turned one (as the bake never ships both).
      if (e.rot === 'all') at[t] = e.key;
      else if (e.rot === t && (at[t] === undefined || !at[t]!.endsWith(':rall'))) at[t] = e.key;
    }
  }
  const recOf = (kind: RealKind, item: string): ItemRec | undefined => recs.get(kind)?.get(item);
  /** A record for a baked item the index has no set of (every turn misses: `fallbacksUsed` lists `<kind>:<item>`). */
  const missing = (kind: RealKind, item: string): ItemRec => ({ kind, item, k2: [], k4: [], missId: `${kind}:${item}` });
  const recOrMissing = (kind: RealKind, item: string): ItemRec => recOf(kind, item) ?? missing(kind, item);
  /** Guests by body × 4 + outfit. */
  const guestRecs: ItemRec[] = [];
  for (let b = 0; b < 2; b++) for (let o = 0; o < 4; o++) guestRecs[b * 4 + o] = recOrMissing('guest', `b${b}o${o}`);
  /** Ground records by terrain, made on first use. */
  const groundRecs = new Map<string, ItemRec>();
  const groundRec = (terrain: string): ItemRec => {
    let r = groundRecs.get(terrain);
    if (!r) groundRecs.set(terrain, (r = recOrMissing('ground', terrain)));
    return r;
  };
  const guestItems = itemsOf('guest').filter((i) => !i.startsWith('staff_'));
  /** Game id → baked item on top of `realItem` (the bench's scale park), or null. */
  let itemMap: Readonly<Record<string, string>> | null = null;
  /** Game id → its record per kind (null: today's art), filled on first use. */
  const byGameId = new Map<RealKind, Map<string, ItemRec | null>>();
  /** Staff records by staff type (`guest:staff_<type>`), made on first use. */
  const staffRecs = new Map<string, ItemRec>();
  function gameRec(kind: RealKind, defId: string): ItemRec | null {
    let m = byGameId.get(kind);
    if (!m) byGameId.set(kind, (m = new Map()));
    let r = m.get(defId);
    if (r === undefined) {
      const item = itemMap?.[defId] ?? realItem(defId);
      r = item === 'classic' ? null : recOrMissing(kind, item);
      m.set(defId, r);
    }
    return r;
  }
  const metas = new WeakMap<ReadySet, SetMeta>();
  function metaOf(rs: ReadySet): SetMeta {
    let m = metas.get(rs);
    if (!m) {
      const sheetOf = new Map<string, number>();
      rs.sheets.forEach((s, i) => sheetOf.set(s.file, i));
      const maskOf = rs.sheets.map((s) => (s.mask === undefined ? -1 : sheetOf.get(s.mask) ?? -1));
      m = { maskOf, tids: 0, codes: new Map(), rails: new Map() };
      metas.set(rs, m);
    }
    return m;
  }
  /** Frame `fk` of a ready set: resolved (sheet found) or its fallback id. */
  function lookup(rs: ReadySet, key: SetKey, fk: string): Resolved | string {
    const f = rs.frames[fk];
    const si = f ? rs.sheets.findIndex((s) => s.file === f.sheet) : -1;
    if (!f || !rs.images[si]) return `${key}/${fk}`;
    return { f, si, sprite: { image: rs.images[si] as CanvasImageSource, sx: f.sx, sy: f.sy, w: f.w, h: f.h, ox: -f.ox, oy: -f.oy, scale: rs.density } };
  }

  let density: 2 | 4 = 2;
  let curRot: ViewRotation = 0;
  let frameNo = 0;
  let skipped = 0;
  let softDraws = 0;
  let degradedDraws = 0;
  /** Sets a getter wanted this frame (`sprite`, once per set a frame). */
  const lateWanted = new Set<SetKey>();
  /** Since which prepare a set (its density-2 set) has been starved. (A tinted frame's wait for room is on its `Resolved`.) */
  const starvedSince = new Map<SetKey, number>();
  /** True once `since` (set now when absent) is `DEGRADE_FRAMES` prepares old. */
  const longWait = (m: Map<string, number>, id: string): boolean => {
    const since = m.get(id);
    if (since === undefined) { m.set(id, frameNo); return DEGRADE_FRAMES <= 0; }
    return frameNo - since >= DEGRADE_FRAMES;
  };
  const fallbacks = new Set<string>();
  const tinter = createTinter(sets, metaOf, { make, now: opts.now, onError: opts.onError });

  /**
   * The density-2 twin to draw (and want) while `key`, the density-4 set for (rec, rot), is not ready; undefined
   * when `key` is not a density-4 set or for ground pieces (a chunk is built once, so it waits for its own density).
   */
  function twinOf(rec: ItemRec, rot: ViewRotation, key: SetKey): SetKey | undefined {
    if (rec.kind === 'ground') return undefined;
    const t = resolveAt(rec, rot, 2);
    return t !== key ? t : undefined;
  }

  /** The set for (rec, rot) at density `want` (the density-4 set steps down when demoted or failed). */
  function resolveAt(rec: ItemRec, rot: ViewRotation, want: 2 | 4): SetKey | undefined {
    if (want === 2) return rec.k2[rot];
    const k = rec.k4[rot];
    // A density-4 set freed for budget, or one that can never be decoded (failed, e.g. bigger than the budget): use
    // its density-2 set rather than today's art.
    if (k === undefined || (!sets.isDemoted(k) && sets.state(k) !== 'failed')) return k;
    return rec.k2[rot];
  }

  /**
   * The sprite for frame `code` (or rail `piece`, tile `code`) of the set for `rec` at view rotation `rot`. `rec` null
   * is today's art (`classicId` is what `fallbacksUsed` lists). `tint` is a `#rrggbb` colour for sheets with a mask
   * (ignored without one).
   */
  function sprite(kind: RealKind, rec: ItemRec | null, classicId: string, rot: ViewRotation, code: number, piece: string | null, tint: string | null): Sprite | null | undefined {
    if (rec === null) { fallbacks.add(classicId); return undefined; }
    const key = resolveAt(rec, rot, density);
    if (key === undefined) { fallbacks.add(rec.missId); return undefined; }
    if (sets.state(key) === 'failed') { fallbacks.add(key); return undefined; }
    let rs = sets.use(key);
    /** The set actually drawn from (the twin on the soft path): tinted frames are kept and swept under it. */
    let drawKey = key;
    if (!rs) {
      // A set this frame draws but may not have wanted (an object outside the scoped rectangle, a placement ghost, a
      // path item kind not scanned yet): wanted again every frame it is drawn and not ready, with its density-2 twin,
      // so a decode that spans frames is not dropped at endFrame (want() of a loading set keeps it and clears a cancel).
      // Once per set a frame.
      if (!lateWanted.has(key)) {
        lateWanted.add(key);
        const tw = twinOf(rec, rot, key);
        sets.want(tw !== undefined && sets.state(tw) !== 'ready' && sets.state(tw) !== 'failed' ? [tw, key] : [key], 'now');
      }
      // Spec §5.4: never stop drawing, lower density first. A density-4 set not decoded yet draws from its density-2
      // twin when that one is ready (the ahead turn is wanted at density 2), scaled up, and the frame is not
      // incomplete. Not for ground pieces: a chunk is built once, so it waits for its own density.
      const twin = twinOf(rec, rot, key);
      const low = twin !== undefined && sets.state(twin) === 'ready' ? sets.use(twin) : null;
      if (!low) {
        // The last step: the density-2 set this object would step down to has had no room for DEGRADE_FRAMES
        // prepares (the ladder ran and still cannot fit it): today's art, never nothing. Ground pieces wait (null, never
        // degraded): RealGround draws a stand-in for a piece not decoded (the old-scale chunk, the other density's
        // piece via `groundStandIn`, or a flat placeholder) and leaves the ground incomplete; only a piece the bake
        // lacks uncovers the chunk, so today's terrain draws it.
        const floor = twin ?? key;
        if (kind !== 'ground' && sets.starved?.(floor)) {
          if (longWait(starvedSince, floor)) { degradedDraws++; return undefined; }
        } else if (starvedSince.size) starvedSince.delete(floor);
        skipped++;
        return null;
      }
      rs = low;
      drawKey = twin as SetKey;
      softDraws++;
    }
    if (starvedSince.size) { starvedSince.delete(drawKey); starvedSince.delete(key); }
    const meta = metaOf(rs);
    let r: Resolved | string | undefined;
    if (piece === null) {
      r = meta.codes.get(code);
      if (r === undefined) meta.codes.set(code, (r = lookup(rs, key, frameName(kind, rec.item, code))));
    } else {
      let row = meta.rails.get(piece);
      if (!row) meta.rails.set(piece, (row = []));
      r = row[code];
      if (r === undefined) row[code] = r = lookup(rs, key, frameKey([piece, `t${code}`]));
    }
    if (typeof r === 'string') { fallbacks.add(r); return undefined; }
    if (tint === null) return r.sprite;
    const t = tinter.tint(drawKey, rs, r, tint);
    if (t === TINT_NO_ROOM) {
      // No room in the tint atlas: the untinted picture, never nothing; incomplete, then degraded (the last step) once
      // THIS frame has been refused for DEGRADE_FRAMES prepares (Task 4b: per frame, so the wait settles even while
      // other frames of its set and colour get room). A draw within NO_ROOM_GAP prepares of the last keeps the wait
      // (a walk frame drawn every few prepares still reaches degraded); a frame off screen for longer starts again.
      let w = r.noRoom;
      if (!w) r.noRoom = w = new Map();
      let since = w.get(tint);
      if (!since || since.last < frameNo - NO_ROOM_GAP) w.set(tint, (since = { from: frameNo, last: frameNo }));
      else since.last = frameNo;
      if (frameNo - since.from >= DEGRADE_FRAMES) degradedDraws++;
      else skipped++;
      return r.sprite;
    }
    if (r.noRoom) r.noRoom.delete(tint);
    // Queued, not tinted yet (the per-frame budget is spent): the untinted picture this frame, counted incomplete.
    if (t === TINT_WAIT) { skipped++; return r.sprite; }
    if (t === null) { fallbacks.add(`${key}#${tint}`); return undefined; }
    return t;
  }

  function sweep(): void {
    tinter.beginFrame();
    // Waits of sets that are no longer queued are over.
    for (const k of starvedSince.keys()) if (sets.state(k) !== 'loading') starvedSince.delete(k);
  }

  /** Staff of `type`: its record (no sets when not baked: `fallbacksUsed` lists `guest:staff_<type>`). */
  function staffRec(type: string): ItemRec {
    let r = staffRecs.get(type);
    if (!r) staffRecs.set(type, (r = recOrMissing('guest', `staff_${type}`)));
    return r;
  }

  return {
    has: (key) => keys.has(key),
    groundItems,
    guestItems,
    get density() { return density; },
    get curRot() { return curRot; },
    get frameNo() { return frameNo; },
    recOf,
    gameRec,
    guestRecs,
    groundRec,
    staffRec,
    resolveAt,
    twinOf,
    metaOf,
    lookup,
    sprite,

    beginFrame(rot, d) {
      frameNo++;
      skipped = 0;
      softDraws = 0;
      degradedDraws = 0;
      lateWanted.clear();
      density = d;
      curRot = rot;
      sweep();
    },

    setItemMap(map) {
      itemMap = map;
      byGameId.clear();
    },

    dispose() {
      tinter.dispose();
    },

    reclaim: (needBytes) => tinter.reclaim(needBytes),

    incomplete() {
      return skipped;
    },

    soft() {
      return softDraws;
    },

    degraded() {
      return degradedDraws;
    },

    fallbacksUsed() {
      return [...fallbacks].sort();
    },
  };
}
