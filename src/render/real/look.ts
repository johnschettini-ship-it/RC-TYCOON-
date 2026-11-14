/**
 * RealLook: turns world objects into `Sprite`s cut from the baked realistic-art sets.
 *
 * Per frame the caller runs: `sets.beginFrame(n)`, `look.prepare(...)` (wants the sets of the objects inside the view
 * plus one screen, of the guests, the ground and the path items: spec §5.4.2(d)), the draw calls (`look.ride(...)` etc.;
 * a getter wants a set nobody wanted yet, so an object outside that scope never waits forever), then `sets.endFrame()`.
 * A getter returns
 *   - a `Sprite`: draw it with `blit`/`blitColumn` as today (its `scale` is the density of the set it came from);
 *   - `null`: the set is still loading; skip the object this frame (counted by `incomplete()`). The ladder's last step
 *     (spec §5.4.4): once its density-2 set has had no room to decode for `DEGRADE_FRAMES` prepares, the object
 *     draws today's art instead (`undefined`, counted by `degraded()`), so no object is skipped for ever;
 *   - `undefined`: draw today's art (item mapped to 'classic', set failed, or the bake lacks the set or frame).
 * At density 4, an object whose density-4 set is still loading draws from its density-2 set when that one is ready
 * (scaled; counted by `soft()`, not by `incomplete()`), so a turn or a zoom never waits for density 4 (spec §5.4).
 * `prepare` wants the current turn at the chosen density ('now'), with the density-2 twin of each density-4 set not
 * ready yet ('now', first), and the ahead turn at density 2 only ('ahead').
 *
 * Sprites are atlas sprites: `image` is the decoded sheet and `sx`/`sy` the frame's rectangle in it. Tinted sprites
 * (sheet with a mask) point into a copy of the whole sheet tinted per (sheet, colour) (spec §5.7), cached per
 * `${setKey}#${hex}` and held in the set manager's budget under that key. The copy is tinted band by band
 * (`startTint`) under a per-frame time budget (`TINT_FRAME_MS`, round 3 item 4): a frame whose rows are not tinted yet
 * draws its untinted picture meanwhile, counted by `soft()`. A tinted sheet is admitted before it is made
 * (`SetManager.admit`): with no room the getter returns `null` (not ready, the frame is incomplete) and the set
 * manager's ladder makes room. It is freed when its set is freed, when it goes unused for `KEEP_FRAMES` prepares, or
 * by `reclaim` (least recently used first) when the set manager needs the room.
 *
 * Contract with the bake (Task 9, tools/art3d/items/*.js), frame keys via `frameKey`; "turn" below is the set's rot:
 *   ride     set ride:<item>        frame [item, `f<frame>`, `occ0` | `occ1`]   (occupancy > 0 → occ1, full)
 *            anchor: top corner of the footprint's view-origin tile at base height; drawn in depth columns
 *   stall    set stall:<item>       frame [item]                                anchor: the tile's top corner
 *   scenery  set scenery:<item>     frame [item, `f<frame>`]                    (bench and bin are scenery items,
 *            frame = the side they stand on in the view; anchor: their base point on the path)
 *   shadow   set shadow:<item>      frame [item]                                anchor and turn of its object; a
 *            path item's shadow set is turned by its side (`shadow:bench:r<side>`), not by the view turn
 *   guest    set guest:b<B>o<O>     frame [`f<facing 0-3>`, `w<walk>` | `sit`]  (rot 'all'; shirt mask; anchor: feet)
 *   staff    set guest:staff_<type> frame [`f<facing 0-3>`, `w<walk>`]          (not baked in stage 1)
 *   rail     set rail:<item>        frame [pieceId, `t<tile>`]                  (track-colour mask)
 *            turn = the piece's heading in the view, (piece.dir + view turn) mod 4; tile = the slice's number among
 *            the piece's rail tiles; anchor: the tile's centre at the piece's ENTRY rail height (piece.z)
 *   car      set car:<item>         frame [`y<0-31>`, `p<0-23>`, `r<0-23>`, `full` | `empty`] (car-colour mask)
 *            steps from `quantisePose` (./pose.ts, shared with the bake); anchor: the car centre on the rail line
 *   support  set support:<item>     frames [`foot`], [`seg`], [`top`]           (support-colour mask)
 *            turn = the saddle's (track's) heading in the view. Stacked by the track layer (`supportStack`):
 *            `foot` at the ground point; `seg` (1 m, anchored at its bottom centre, drawn 1.1 m tall) once per
 *            metre of column; `top` (plate + post, 0.67 m) anchored `SUPPORT_TOP_BELOW_RAIL` m under the rail line
 *   ground   set ground:<terrain>   frame [`s<slopeMask>`, `v<variant>`]        anchor: the tile's top corner
 *            path and queue: frame [`j<join mask>`] (kerbs or rails on the sides without a join, view terms)
 * A set with `rot: 'all'` serves every view rotation and is wanted once. Rail, support and path-item shadow sets are
 * keyed by a heading, so every turn of them is wanted. A sheet's tint mask is listed as another sheet of the same set
 * (`sheets[i].mask` names its file); a sheet without a mask is drawn untinted.
 * Anchors and offsets: a frame's `ox`/`oy` in the index are the offset FROM the game anchor TO the frame's top-left
 * corner, in density px (so they are usually negative: the top-left is up and left of the anchor). A Sprite's
 * `ox`/`oy` are the anchor's position inside the image, the other way round: `sprite.ox = −frame.ox`,
 * `sprite.oy = −frame.oy`, because `blit` puts the top-left at anchor − sprite.ox.
 */
import { SHIRT_COLOURS } from '../palette';
import type { Sprite } from '../spriteCache';
import type { ViewRect } from '../terrain';
import { paletteColour } from '../track/colours';
import type { ViewRotation } from '../view';
import type { World } from '../../sim/types';
import { PathItem } from '../../sim/map';
import { getSceneryDef } from '../../data/catalog/scenery';
import { getFlatRideDef } from '../../data/catalog/flatRides';
import { STEP_PX } from '../heightStep';
import { viewAffine, viewPointSX, viewPointSY, type ViewAffine } from '../view';
import { CARD_SET } from './cards';
import { realItem } from './fallbacks';
import { CAR_TILT_STEPS, CAR_YAW_STEPS } from './pose';
import { frameKey, type RealFrame, type RealIndex, type RealKind, type SetKey } from './indexFormat';
import type { Decoded, ReadySet, SetManager } from './setManager';
import { startTint, type CanvasLike, type TintJob } from './tint';

/**
 * Every getter returns a `Sprite` to draw, `null` when its set is not ready yet (skip the object this frame; counted
 * by `incomplete()`), or `undefined` to draw today's art (classic fallback: unbaked item, failed set, missing frame).
 */
export interface RealLook {
  density(zoom: number, dpr: number): 2 | 4;
  prepare(world: World, rot: ViewRotation, view: ViewRect, zoom: number, dpr: number): void;
  ride(defId: string, rot: ViewRotation, frame: number, occupancy: number): Sprite | null | undefined;
  stall(defId: string, rot: ViewRotation): Sprite | null | undefined;
  scenery(defId: string, rot: ViewRotation, frame: number): Sprite | null | undefined;
  guest(guestId: number, shirt: number, walk: number, facing: number, sitting: boolean): Sprite | null | undefined;
  staff(staffType: string, facing: number, walk: number): Sprite | null | undefined;
  /** A rail tile; `heading` is the piece's heading in the view, `(piece.dir + view turn) mod 4` (not the view turn). */
  rail(trackType: string, pieceId: string, tile: number, heading: ViewRotation, colour: number): Sprite | null | undefined;
  car(trackType: string, yawStep: number, pitchStep: number, rollStep: number, full: boolean, colour: number): Sprite | null | undefined;
  /** One piece of a stacked support (`foot`, `seg`, `top`), for the saddle's heading in the view (0-3). */
  support(trackType: string, part: SupportPart, heading: ViewRotation, colour: number): Sprite | null | undefined;
  /** An object's soft shadow; for a path item (bench, bin) `rot` is the side it stands on, in view terms. */
  shadow(kind: 'ride' | 'stall' | 'scenery', defId: string, rot: ViewRotation): Sprite | null | undefined;
  /** A ground piece; `join` (path and queue: the join mask in view terms, as `render/paths.ts`) picks the kerb piece. */
  groundPiece(terrain: string, slopeMask: number, variant: number, rot: ViewRotation, join?: number): Sprite | null | undefined;
  /**
   * Whether `groundPiece` with these arguments would give a picture now, with no side effect (no want, no count,
   * no fallback listed): RealGround asks it for tiles out of view (round 3 fix round 2).
   */
  groundReady?(terrain: string, slopeMask: number, variant: number, rot: ViewRotation, join?: number): boolean;
  /** Frees every tinted sheet (closes its canvases, releases its hold). The look stays usable. */
  dispose(): void;
  /**
   * The set manager's reclaimer: frees tinted sheets not drawn since the last `prepare`, least recently used first,
   * until about `needBytes` are freed. Returns the bytes freed.
   */
  reclaim(needBytes: number): number;
  /** The density the last `prepare` chose (after the set manager's cap). */
  currentDensity(): 2 | 4;
  /** Objects skipped since the last `prepare` because their set was not ready. */
  incomplete(): number;
  /**
   * Objects drawn since the last `prepare` from their density-2 set because the density-4 set they need was not ready
   * yet (a turn or a zoom shows at once and sharpens when the density-4 sets land). 0 means every object drew at the
   * density chosen for it.
   */
  soft(): number;
  /**
   * Objects drawn since the last `prepare` by the ladder's last step (spec §5.4.4, round 3 item 2): their set has had
   * no room to decode even at density 2 for `DEGRADE_FRAMES` prepares, so they draw today's art (undefined), or, for
   * a tinted sheet with no room, the untinted picture, rather than nothing. Not counted by `incomplete()`.
   */
  degraded?(): number;
  /** Ids drawn with today's art: classic-mapped game ids, failed set keys, and missing `<set key>/<frame>`. */
  fallbacksUsed(): string[];
  /**
   * View scope of the last `prepare` (spec §5.4.2(d)): built objects in the park, those inside the view plus one
   * screen of margin, and how many times the objects were walked to find them (a walk only when the park's objects
   * changed or the view left the scoped rectangle).
   */
  scope?(): { objects: number; inScope: number; walks: number };
  /**
   * Draws game ids from other baked items (game id → item), on top of the normal mapping (`./fallbacks.ts`); null puts
   * it back. The bench's scale park uses it for its alias sets (`./aliases.ts`, round 3 item 7).
   */
  setItemMap?(map: Readonly<Record<string, string>> | null): void;
}

/** The stacked pieces of a baked support (see the header). */
export type SupportPart = 'foot' | 'seg' | 'top';

/** The part of `SetManager` RealLook uses (a structural type, so tests can pass a fake). */
export type RealSets = Pick<SetManager, 'want' | 'use' | 'state' | 'densityCap' | 'isDemoted' | 'hold' | 'admit'> & Partial<Pick<SetManager, 'starved' | 'peek'>>;

export interface RealLookOptions {
  /** Canvas factory for tinted sheets. Default: `OffscreenCanvas`, else a DOM canvas. */
  makeCanvas?: (w: number, h: number) => CanvasLike;
  /** Told once per set whose tint failed (e.g. mask size differs from its sheet); `key` is `${setKey}#${hex}`. */
  onError?: (key: string, err: unknown) => void;
  /** Clock for the per-frame tint budget, ms (default `performance.now`). */
  now?: () => number;
}

/** Car poses, as baked (Task 9): yaw in 32 steps, pitch and roll in 15° steps (one source: `./pose`). */
export { CAR_TILT_STEPS, CAR_YAW_STEPS, quantisePose } from './pose';

/**
 * Tinting budget per frame, ms (round 3 item 4): new tinted sheets are made band by band (`startTint`) while a frame
 * has spent less than this on them (at least one band a frame); a frame whose rows are not tinted yet draws its
 * untinted picture, counted by `soft()`.
 */
export const TINT_FRAME_MS = 3;

/** Tinted sheets unused for this many prepares are freed. */
const KEEP_FRAMES = 120;

/**
 * The ladder's last step (spec §5.4.4: never drop an object): an object whose density-2 set has had no room to decode
 * (`starved`), or whose tinted sheet no room to be made, for this many prepares in a row draws today's art (or its
 * untinted picture) and counts in `degraded()`.
 */
export const DEGRADE_FRAMES = 30;

/** View scope (spec §5.4.2(d)): objects inside the view plus this many screens on each side are wanted. */
const SCOPE_MARGIN = 1;
/**
 * The scoped objects are found for this much more on each side (screens), and reused while the view with its margin
 * stays inside that rectangle and the view's size is within `SCOPE_RESIZE` of the size it was found for.
 */
const SCOPE_SLACK = 0.25;
const SCOPE_RESIZE = 0.2;
/** How often (prepares) the park is scanned for path item kinds (a new kind is also wanted when it is first drawn). */
const PATH_ITEM_SCAN_EVERY = 60;
/** Screen px (zoom 1) above an object's footprint that its picture may reach: rides, stalls; scenery uses its height. */
const RIDE_UP_PX = 420;
const STALL_UP_PX = 120;
const PX_PER_M = 11.31;

/** F1: the smallest of {2, 4} ≥ zoom × dpr, else 4; then no more than the set manager's cap. */
export function pickDensity(zoom: number, dpr: number, cap: 2 | 4): 2 | 4 {
  const want = zoom * dpr <= 2 ? 2 : 4;
  return want < cap ? want : cap;
}

const mod = (n: number, m: number): number => ((Math.round(n) % m) + m) % m;

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function defaultCanvas(w: number, h: number): CanvasLike {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h) as unknown as CanvasLike;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c as unknown as CanvasLike;
}

/** One set tinted with one colour: its tinted sheets by sheet index, made on first use. */
interface Tinted {
  /** `${setKey}#${hex}`: the hold id in the set manager. */
  id: string;
  hex: string;
  setKey: SetKey;
  /** The ready set's images when tinted; a reload gives a new array and invalidates the tint. */
  source: CanvasImageSource[];
  /** Tint jobs by sheet index: a job's sheet is tinted band by band under the per-frame budget (round 3 item 4). */
  sheets: Map<number, TintJob>;
  /** Sprites into the tinted sheets, by the untinted frame they copy (one object per frame, reused every draw). */
  sprites: Map<Resolved, Sprite>;
  bytes: number;
  lastFrame: number;
}

/** A set group `prepare` wants: an item record at a map turn (its sprite turn is `(turn + view turn) mod 4`), or at every heading. */
interface Combo {
  rec: ItemRec;
  everyTurn: boolean;
  turn: number;
}

/**
 * A built object for the view scope: its footprint centre (continuous map point), how far its picture reaches
 * around that point in screen px at zoom 1 (`rx` sideways, `up` above, `down` below; height in steps `z`), and the
 * combos it needs (`a`, `b`, `c`; −1 for none).
 */
interface ScopeObject {
  fx: number;
  fy: number;
  z: number;
  rx: number;
  up: number;
  down: number;
  a: number;
  b: number;
  c: number;
}

const PATH_ITEM_IDS: Record<number, string> = { [PathItem.Bench]: 'bench', [PathItem.Bin]: 'bin', [PathItem.Lamp]: 'lamp' };

/**
 * One baked (kind, item): its set keys by density and turn, made once from the index, so a getter or `prepare`
 * resolves a set without building a key string (round 3 item 5). `k2[r]`/`k4[r]`: the set for turn `r` at that
 * density (the `all` set when the bake has one), undefined when the bake has none.
 */
interface ItemRec {
  kind: RealKind;
  item: string;
  k2: (SetKey | undefined)[];
  k4: (SetKey | undefined)[];
  /** What `fallbacksUsed` lists when a turn has no set: `<kind>:<item>`. */
  missId: string;
}

/** A frame found in a ready set: its sheet index and the untinted sprite (one object, reused every draw). */
interface Resolved {
  f: RealFrame;
  si: number;
  sprite: Sprite;
}

/**
 * Per ready set (a reload gives a new `ReadySet`, so a new entry): sheet indices by file, each sheet's mask index
 * (−1 without one), and the frames looked up so far by a numeric code (`codes`) or, for rails, by piece and tile.
 * A missing frame is cached as its fallback id (`<set key>/<frame key>`).
 */
interface SetMeta {
  maskOf: number[];
  codes: Map<number, Resolved | string>;
  rails: Map<string, (Resolved | string | undefined)[]>;
}

/** The frame key for a numeric code, per kind (built once per frame on its first lookup, never per draw). */
function frameName(kind: RealKind, item: string, code: number): string {
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

const SUPPORT_PARTS: readonly SupportPart[] = ['foot', 'seg', 'top'];
const SUPPORT_CODE: Record<SupportPart, number> = { foot: 0, seg: 1, top: 2 };

export function createRealLook(index: RealIndex, sets: RealSets, opts: RealLookOptions = {}): RealLook {
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
      m = { maskOf, codes: new Map(), rails: new Map() };
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
  /** Tinting time spent this frame (ms) and whether a band was tinted yet (round 3 item 4). */
  let tintSpent = 0;
  let tintBandThisFrame = false;
  const clock = opts.now ?? ((): number => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  /** Since which prepare a set (its density-2 set) has been starved, or a tint (by set, then colour) refused room. */
  const starvedSince = new Map<SetKey, number>();
  const noRoomSince = new Map<SetKey, Map<string, number>>();
  /** True once `since` (set now when absent) is `DEGRADE_FRAMES` prepares old. */
  const longWait = (m: Map<string, number>, id: string): boolean => {
    const since = m.get(id);
    if (since === undefined) { m.set(id, frameNo); return DEGRADE_FRAMES <= 0; }
    return frameNo - since >= DEGRADE_FRAMES;
  };
  const fallbacks = new Set<string>();
  /** By `${setKey}#${hex}`, which is also the hold id in the set manager. */
  const tinted = new Map<string, Tinted>();
  /** The same tinted sheets by set key, then colour: found without building the id. */
  const tintIndex = new Map<SetKey, Map<string, Tinted>>();
  /** Sets whose tint failed: drawn with today's art from then on. */
  const tintFailed = new Set<SetKey>();

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

  function evict(id: string): void {
    const t = tinted.get(id);
    if (!t) return;
    for (const j of t.sheets.values()) j.close();
    tinted.delete(id);
    tintIndex.get(t.setKey)?.delete(t.hex);
    sets.hold(id, 0);
  }

  const wrap = (image: CanvasImageSource): Decoded => ({ image, bytes: 0, close() {} });

  /** `tintedSheet`'s answer when the budget has no room for the tinted sheet yet. */
  const NO_ROOM = 'no-room' as const;
  /** `tintedSheet`'s answer when this frame's tint budget is spent before the sheet was started. */
  const DEFERRED = 'deferred' as const;

  /**
   * Sheet `si` of a ready set tinted with `hex`; undefined when the sheet has no mask in the set (draw untinted);
   * null when tinting this set failed (draw today's art); NO_ROOM when the budget cannot take it now (not ready).
   */
  function tintedSheet(key: SetKey, rs: ReadySet, si: number, hex: string): Tinted | null | undefined | typeof NO_ROOM | typeof DEFERRED {
    if (tintFailed.has(key)) return null;
    const mi = metaOf(rs).maskOf[si] as number;
    if (mi < 0) return undefined;
    const mask = rs.images[mi];
    const base = rs.images[si];
    if (!mask || !base) return undefined;
    let byHex = tintIndex.get(key);
    let t = byHex?.get(hex);
    if (t && t.source !== rs.images) { evict(t.id); t = undefined; }
    if (!t) {
      const id = `${key}#${hex}`;
      t = { id, hex, setKey: key, source: rs.images, sheets: new Map(), sprites: new Map(), bytes: 0, lastFrame: frameNo };
      tinted.set(id, t);
      if (!byHex) tintIndex.set(key, (byHex = new Map()));
      byHex.set(hex, t);
    }
    t.lastFrame = frameNo;
    if (!t.sheets.has(si)) {
      // Room first: the tinted copy is as big as its sheet decoded. At density 2 it would be about 4 times that at 4.
      const size = base as unknown as { width: number; height: number };
      const want = t.bytes + size.width * size.height * 4;
      const up = rs.density === 2 ? 4 : 1;
      // The frame's tint budget is spent: start this sheet on a later frame (draw untinted meanwhile, as `soft`).
      if (tintBandThisFrame && tintSpent >= TINT_FRAME_MS) {
        if (t.sheets.size === 0) evict(t.id);
        return DEFERRED;
      }
      if (!sets.admit(t.id, want, want * up)) {
        if (t.sheets.size === 0) evict(t.id);
        return NO_ROOM;
      }
      let job: TintJob;
      try {
        job = startTint(wrap(base), wrap(mask), hexRgb(hex), make);
      } catch (err) {
        return fail(key, t.id, err);
      }
      t.sheets.set(si, job);
      t.bytes += job.out.bytes;
      sets.hold(t.id, t.bytes, t.bytes * up);
    }
    const job = t.sheets.get(si) as TintJob;
    // Tint bands while this frame's budget lasts; at least one band a frame, so every sheet finishes.
    while (!job.done && (tintSpent < TINT_FRAME_MS || !tintBandThisFrame)) {
      const t0 = clock();
      try {
        job.step();
      } catch (err) {
        return fail(key, t.id, err);
      }
      tintBandThisFrame = true;
      tintSpent += clock() - t0;
    }
    return t;
  }

  /** Tinting set `key` failed: today's art for it from now on, reported once. */
  function fail(key: SetKey, id: string, err: unknown): null {
    tintFailed.add(key);
    evict(id);
    opts.onError?.(id, err);
    return null;
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
    /** The set actually drawn from (the twin on the soft path): tinted sheets are cached and swept under it. */
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
        // prepares (the ladder ran and still cannot fit it): today's art, never nothing. Ground pieces wait: a chunk
        // with a piece missing or not decoded is never "covered" (`RealGround.covers`), so today's terrain is still
        // built and drawn under it and the tile shows today's ground meanwhile.
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
    const t = tintedSheet(drawKey, rs, r.si, tint);
    if (t === NO_ROOM) {
      // No room for the tinted sheet for DEGRADE_FRAMES prepares: the untinted picture (the last step), not nothing.
      let byHex = noRoomSince.get(drawKey);
      if (!byHex) noRoomSince.set(drawKey, (byHex = new Map()));
      if (longWait(byHex, tint)) { degradedDraws++; return r.sprite; }
      skipped++;
      return null;
    }
    if (noRoomSince.size) noRoomSince.get(drawKey)?.delete(tint);
    if (t === DEFERRED) { softDraws++; return r.sprite; }
    if (t === null) { fallbacks.add(`${key}#${tint}`); return undefined; }
    if (t === undefined) return r.sprite;
    const job = t.sheets.get(r.si) as TintJob;
    // The frame's rows not tinted yet (the sheet tints over a few frames): its untinted picture meanwhile, as a soft draw.
    if (job.rows < r.f.sy + r.f.h) { softDraws++; return r.sprite; }
    let sp = t.sprites.get(r);
    if (!sp) t.sprites.set(r, (sp = { ...r.sprite, image: job.out.image }));
    return sp;
  }

  function sweep(): void {
    for (const [id, t] of [...tinted.entries()]) {
      if (sets.state(t.setKey) !== 'ready' || t.lastFrame < frameNo - KEEP_FRAMES) evict(id);
    }
    // Waits of sets that are no longer queued, and refusals of sets no longer ready, are over.
    for (const k of starvedSince.keys()) if (sets.state(k) !== 'loading') starvedSince.delete(k);
    for (const k of noRoomSince.keys()) if (sets.state(k) !== 'ready') noRoomSince.delete(k);
  }

  // ---- View scope (spec §5.4.2(d), round 3 item 1). The park's objects are indexed once per change of its object
  // lists (`objectSig`), each with the set groups (combos) it needs; the objects inside the view plus one screen are
  // found again only when the view leaves the rectangle they were found for, so `prepare` does not walk every object
  // (or build any string) each frame. Guests, ground and path items are always wanted; a set first asked for by a
  // getter (an object outside the scoped rectangle, a placement ghost) is wanted then, so nothing is left waiting.
  const combos: Combo[] = [];
  const comboIds = new Map<ItemRec, number[]>();
  function combo(rec: ItemRec, turn: number, everyTurn = false): number {
    let byTurn = comboIds.get(rec);
    if (!byTurn) comboIds.set(rec, (byTurn = []));
    const slot = everyTurn ? 4 : turn & 3;
    let id = byTurn[slot];
    if (id === undefined) {
      id = combos.length;
      combos.push({ rec, turn: turn & 3, everyTurn });
      byTurn[slot] = id;
    }
    return id;
  }
  const gameCombo = (kind: RealKind, defId: string, turn: number, everyTurn = false): number => {
    const rec = gameRec(kind, defId);
    return rec ? combo(rec, turn, everyTurn) : -1;
  };
  let objects: ScopeObject[] = [];
  /** Always wanted: ground (first: its sets decode first, so the ground is laid before the objects), guests, staff, path items. */
  let always: number[] = [];
  let objectSig: unknown[] = [];
  let lastPathScan = -PATH_ITEM_SCAN_EVERY;
  let pathCombos: number[] = [];
  let scopeWalks = 0;
  /** The scoped combos, the rectangle they were found for, its view size and rotation. */
  let scoped: number[] = [];
  let scopedRect = { x0: 0, y0: 0, x1: -1, y1: -1 };
  let scopedSize = { w: 0, h: 0 };
  let scopedRot = -1;
  let scopedObjects = 0;
  let marks = new Uint8Array(0);
  const affine: ViewAffine = viewAffine(0, 1, 1);

  /** What changes when the park's built objects change (not guests): lists, their last ids, track piece counts. */
  function sigOf(world: World): unknown[] {
    const s = world.state;
    let pieces = 0;
    for (const r of s.rides) if (r.kind === 'track') pieces += s.track.rides[String(r.id)]?.pieces.length ?? 0;
    return [s, s.map, s.rides.length, s.rides.at(-1)?.id, s.stalls.length, s.stalls.at(-1)?.id, s.scenery.length, s.scenery.at(-1)?.id, pieces, s.staff.members.length];
  }

  function indexObjects(world: World): void {
    const s = world.state;
    objects = [];
    const obj = (fx: number, fy: number, z: number, span: number, up: number, a: number, b: number, c = -1): void => {
      if (a < 0 && b < 0 && c < 0) return;
      if (!Number.isFinite(fx) || !Number.isFinite(fy)) return;
      objects.push({ fx, fy, z: Number.isFinite(z) ? z : 0, rx: span * 16 + 16, up: span * 8 + up, down: span * 8 + 16, a, b, c });
    };
    const zAt = (x: number, y: number): number => (s.map.heights[y * s.map.width + x] as number | undefined) ?? 0;
    for (const r of s.rides) {
      if (r.kind === 'track') {
        // Rails and supports are keyed by a heading in the view (piece, saddle), so every heading of them is wanted.
        const pieces = s.track.rides[String(r.id)]?.pieces ?? [];
        if (!pieces.length) continue;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, top = 0;
        for (const p of pieces) {
          x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + 1); y1 = Math.max(y1, p.y + 1); top = Math.max(top, p.z);
        }
        // Pieces reach a tile or two past their entry tile; heights are metres.
        x0 -= 2; y0 -= 2; x1 += 2; y1 += 2;
        obj((x0 + x1) / 2, (y0 + y1) / 2, 0, x1 - x0 + y1 - y0, top * PX_PER_M + 64, gameCombo('rail', r.defId, 0, true), gameCombo('car', r.defId, 0), gameCombo('support', r.defId, 0, true));
        continue;
      }
      const def = getFlatRideDef(r.defId);
      const w = def?.w ?? 3;
      const d = def?.d ?? 3;
      const t = r.rotation ?? 0;
      obj(r.x + w / 2, r.y + d / 2, zAt(r.x, r.y), w + d, RIDE_UP_PX, gameCombo('ride', r.defId, t), gameCombo('shadow', r.defId, t));
    }
    for (const st of s.stalls) {
      const t = st.rotation ?? 0;
      obj(st.x + 0.5, st.y + 0.5, zAt(st.x, st.y), 2, STALL_UP_PX, gameCombo('stall', st.defId, t), gameCombo('shadow', st.defId, t));
    }
    for (const sc of s.scenery) {
      const def = getSceneryDef(sc.defId);
      // Scenery turns like `itemView`: an edge item by its edge (0 when unset), any other by its rotation.
      const t = def?.edge ? Math.max(0, sc.edge) : sc.rotation ?? 0;
      const w = def?.w ?? 1;
      const d = def?.d ?? 1;
      obj(sc.x + w / 2, sc.y + d / 2, sc.z ?? zAt(sc.x, sc.y), w + d, (def?.heightM ?? 4) * PX_PER_M + 16, gameCombo('scenery', sc.defId, t), gameCombo('shadow', sc.defId, t));
    }
    always = [];
    for (const item of groundItems) always.push(combo(recOf('ground', item) as ItemRec, 0));
    for (const item of guestItems) always.push(combo(recOf('guest', item) as ItemRec, 0));
    const staffSeen = new Set<string>();
    for (const m of s.staff.members) {
      if (staffSeen.has(m.type)) continue;
      staffSeen.add(m.type);
      const rec = staffRec(m.type);
      if (rec.k2.length || rec.k4.length) always.push(combo(rec, 0));
    }
    if (marks.length < combos.length) marks = new Uint8Array(combos.length * 2);
    scopedRot = -1;
    scopeWalks++;
  }

  /** Path item kinds in the park (bench, bin, lamp), scanned every `PATH_ITEM_SCAN_EVERY` prepares. */
  function scanPathItems(world: World): void {
    const seen = new Set<number>();
    const pi = world.state.map.pathItem;
    pathCombos = [];
    for (let i = 0; i < pi.length && seen.size < 3; i++) {
      const code = pi[i] as number;
      if (code !== 0 && !seen.has(code)) {
        seen.add(code);
        const id = PATH_ITEM_IDS[code];
        // A path item's shadow is keyed by the side it stands on, which may be any turn.
        if (id) for (const c of [gameCombo('scenery', id, 0), gameCombo('shadow', id, 0, true)]) if (c >= 0) pathCombos.push(c);
      }
    }
    if (marks.length < combos.length) marks = new Uint8Array(combos.length * 2);
  }

  /** The combos of the objects inside `view` plus `SCOPE_MARGIN` screens, reused while the view stays in the found rectangle. */
  function scope(world: World, rot: ViewRotation, view: ViewRect): number[] {
    const vw = view.x1 - view.x0;
    const vh = view.y1 - view.y0;
    const nx0 = view.x0 - vw * SCOPE_MARGIN;
    const ny0 = view.y0 - vh * SCOPE_MARGIN;
    const nx1 = view.x1 + vw * SCOPE_MARGIN;
    const ny1 = view.y1 + vh * SCOPE_MARGIN;
    const fits = scopedRot === rot && nx0 >= scopedRect.x0 && ny0 >= scopedRect.y0 && nx1 <= scopedRect.x1 && ny1 <= scopedRect.y1
      && Math.abs(vw / scopedSize.w - 1) <= SCOPE_RESIZE && Math.abs(vh / scopedSize.h - 1) <= SCOPE_RESIZE;
    if (fits) return scoped;
    const m = SCOPE_MARGIN + SCOPE_SLACK;
    const x0 = view.x0 - vw * m;
    const y0 = view.y0 - vh * m;
    const x1 = view.x1 + vw * m;
    const y1 = view.y1 + vh * m;
    const map = world.state.map;
    viewAffine(rot, map.width, map.height, affine);
    marks.fill(0);
    let n = 0;
    const out: number[] = [];
    for (const o of objects) {
      const sx = viewPointSX(affine, o.fx, o.fy);
      const sy = viewPointSY(affine, o.fx, o.fy, o.z);
      if (sx + o.rx < x0 || sx - o.rx > x1 || sy + o.down < y0 || sy - o.up > y1) continue;
      n++;
      const { a, b, c } = o;
      if (a >= 0 && !marks[a]) { marks[a] = 1; out.push(a); }
      if (b >= 0 && !marks[b]) { marks[b] = 1; out.push(b); }
      if (c >= 0 && !marks[c]) { marks[c] = 1; out.push(c); }
    }
    scopeWalks++;
    scoped = out;
    scopedObjects = n;
    scopedRect = { x0, y0, x1, y1 };
    scopedSize = { w: vw, h: vh };
    scopedRot = rot;
    return out;
  }

  /** Staff of `type`: its record (no sets when not baked: `fallbacksUsed` lists `guest:staff_<type>`). */
  function staffRec(type: string): ItemRec {
    let r = staffRecs.get(type);
    if (!r) staffRecs.set(type, (r = recOrMissing('guest', `staff_${type}`)));
    return r;
  }

  const look: RealLook = {
    density(zoom, dpr) {
      return pickDensity(zoom, dpr, sets.densityCap());
    },

    prepare(world, rot, view, zoom, dpr) {
      frameNo++;
      skipped = 0;
      softDraws = 0;
      degradedDraws = 0;
      lateWanted.clear();
      tintSpent = 0;
      tintBandThisFrame = false;
      density = look.density(zoom, dpr);
      curRot = rot;
      sweep();
      const sig = sigOf(world);
      if (sig.length !== objectSig.length || sig.some((v, i) => v !== objectSig[i])) {
        objectSig = sig;
        indexObjects(world);
        lastPathScan = -PATH_ITEM_SCAN_EVERY;
      }
      if (frameNo - lastPathScan >= PATH_ITEM_SCAN_EVERY) {
        lastPathScan = frameNo;
        scanPathItems(world);
      }
      const inView = scope(world, rot, view);
      const ahead = ((rot + 1) % 4) as ViewRotation;
      const now = new Set<SetKey>();
      const later = new Set<SetKey>();
      // While a density-4 set is not ready, its density-2 twin is wanted too, first (a quarter of the size, so it
      // decodes first): the object draws from it at once (a turn the other way, a zoom in), and if the budget caps
      // the density, the sets it then needs are already there. Not for ground pieces (they never step down).
      const twins = new Set<SetKey>();
      const addNow = (rec: ItemRec, r: ViewRotation): void => {
        const k = resolveAt(rec, r, density);
        if (k === undefined) return;
        now.add(k);
        if (sets.state(k) === 'ready') return;
        const tw = twinOf(rec, r, k);
        if (tw !== undefined) twins.add(tw);
      };
      const want = (ids: readonly number[]): void => {
        for (const id of ids) {
          const { rec, everyTurn, turn } = combos[id] as Combo;
          if (everyTurn) {
            for (let r = 0; r < 4; r++) addNow(rec, r as ViewRotation);
            continue;
          }
          addNow(rec, ((turn + rot) % 4) as ViewRotation);
          // The ahead turn at density 2 only (cheap), for the same objects: after a turn they show at once from these
          // sets and sharpen when the turn's density-4 sets land. A set for every turn (rot 'all') is already wanted.
          const ar = ((turn + ahead) % 4) as ViewRotation;
          const a = resolveAt(rec, ar, density);
          if (a !== undefined && !now.has(a)) {
            const low = density === 4 ? resolveAt(rec, ar, 2) : a;
            if (low !== undefined) later.add(low);
          }
        }
      };
      // Ground first (its sets decode first), then the objects in scope, then guests, staff and path items.
      want(always.slice(0, groundItems.length));
      want(inView);
      want(always.slice(groundItems.length));
      want(pathCombos);
      // The card pictures: one small set, always loaded (src/render/real/cards.ts).
      if (keys.has(CARD_SET)) now.add(CARD_SET);
      for (const k of twins) now.delete(k);
      for (const k of [...now, ...twins]) later.delete(k);
      if (twins.size) sets.want([...twins], 'now');
      sets.want([...now], 'now');
      sets.want([...later], 'ahead');
    },

    ride(defId, rot, frame, occupancy) {
      return sprite('ride', gameRec('ride', defId), defId, rot, ((frame & 0xffff) << 1) | (occupancy > 0 ? 1 : 0), null, null);
    },

    stall(defId, rot) {
      return sprite('stall', gameRec('stall', defId), defId, rot, 0, null, null);
    },

    scenery(defId, rot, frame) {
      return sprite('scenery', gameRec('scenery', defId), defId, rot, frame, null, null);
    },

    guest(guestId, shirt, walk, facing, sitting) {
      const body = mod(guestId, 2);
      const outfit = mod(Math.floor(guestId / 2), 4);
      const hex = SHIRT_COLOURS[mod(shirt, SHIRT_COLOURS.length)] as string;
      return sprite('guest', guestRecs[body * 4 + outfit] as ItemRec, '', curRot, (mod(facing, 4) << 4) | (sitting ? 15 : walk & 15), null, hex);
    },

    staff(staffType, facing, walk) {
      return sprite('guest', staffRec(staffType), '', curRot, (mod(facing, 4) << 4) | (walk & 15), null, null);
    },

    rail(trackType, pieceId, tile, heading, colour) {
      return sprite('rail', gameRec('rail', trackType), trackType, heading, tile, pieceId, paletteColour(colour));
    },

    car(trackType, yawStep, pitchStep, rollStep, full, colour) {
      const code = (((mod(yawStep, CAR_YAW_STEPS) * CAR_TILT_STEPS + mod(pitchStep, CAR_TILT_STEPS)) * CAR_TILT_STEPS + mod(rollStep, CAR_TILT_STEPS)) << 1) | (full ? 1 : 0);
      return sprite('car', gameRec('car', trackType), trackType, curRot, code, null, paletteColour(colour));
    },

    support(trackType, part, heading, colour) {
      return sprite('support', gameRec('support', trackType), trackType, heading, SUPPORT_CODE[part], null, paletteColour(colour));
    },

    shadow(_kind, defId, rot) {
      return sprite('shadow', gameRec('shadow', defId), defId, rot, 0, null, null);
    },

    groundReady(terrain, slopeMask, variant, rot, join) {
      const key = resolveAt(groundRec(terrain), rot, density);
      if (key === undefined || sets.state(key) !== 'ready') return false;
      const rs = sets.peek ? sets.peek(key) : null;
      if (!rs) return false;
      const code = join !== undefined && (terrain === 'path' || terrain === 'queue') ? -1 - (join & 15) : (slopeMask << 2) | (variant & 3);
      const meta = metaOf(rs);
      let r = meta.codes.get(code);
      if (r === undefined) meta.codes.set(code, (r = lookup(rs, key, frameName('ground', terrain, code))));
      return typeof r !== 'string';
    },

    groundPiece(terrain, slopeMask, variant, rot, join) {
      const code = join !== undefined && (terrain === 'path' || terrain === 'queue') ? -1 - (join & 15) : (slopeMask << 2) | (variant & 3);
      return sprite('ground', groundRec(terrain), '', rot, code, null, null);
    },

    dispose() {
      for (const id of [...tinted.keys()]) evict(id);
    },

    reclaim(needBytes) {
      let freed = 0;
      const idle = [...tinted.entries()].filter(([, t]) => t.lastFrame < frameNo).sort((a, b) => a[1].lastFrame - b[1].lastFrame);
      for (const [id, t] of idle) {
        if (freed >= needBytes) break;
        freed += t.bytes;
        evict(id);
      }
      return freed;
    },

    currentDensity() {
      return density;
    },

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

    scope() {
      return { objects: objects.length, inScope: scopedObjects, walks: scopeWalks };
    },

    setItemMap(map) {
      itemMap = map;
      byGameId.clear();
      // The objects' set groups change with the mapping: index the park again on the next prepare.
      objectSig = [];
    },
  };
  return look;
}
