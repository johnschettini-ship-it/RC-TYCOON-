/**
 * RealLook: turns world objects into `Sprite`s cut from the baked realistic-art sets.
 *
 * Per frame the caller runs: `sets.beginFrame(n)`, `look.prepare(...)` (wants every set the frame may draw), the
 * draw calls (`look.ride(...)` etc.), then `sets.endFrame()`. A getter returns
 *   - a `Sprite`: draw it with `blit`/`blitColumn` as today (its `scale` is the density of the set it came from);
 *   - `null`: the set is still loading; skip the object this frame (counted by `incomplete()`);
 *   - `undefined`: draw today's art (item mapped to 'classic', set failed, or the bake lacks the set or frame).
 * At density 4, an object whose density-4 set is still loading draws from its density-2 set when that one is ready
 * (scaled; counted by `soft()`, not by `incomplete()`), so a turn or a zoom never waits for density 4 (spec §5.4).
 * `prepare` wants the current turn at the chosen density ('now') and the ahead turn at density 2 only ('ahead').
 *
 * Sprites are atlas sprites: `image` is the decoded sheet and `sx`/`sy` the frame's rectangle in it. Tinted sprites
 * (sheet with a mask) point into a copy of the whole sheet tinted once per (sheet, colour) with `tintSheet`
 * (spec §5.7), cached per `${setKey}#${hex}` and held in the set manager's budget under that key. A tinted sheet is
 * admitted before it is made (`SetManager.admit`): with no room the getter returns `null` (not ready, the frame is
 * incomplete) and the set manager's ladder makes room. It is freed when its set is freed, when it goes unused for
 * `KEEP_FRAMES` prepares, or by `reclaim` (least recently used first) when the set manager needs the room.
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
import { CARD_SET } from './cards';
import { realItem } from './fallbacks';
import { CAR_TILT_STEPS, CAR_YAW_STEPS } from './pose';
import { frameKey, setKey, type RealIndex, type RealKind, type SetKey } from './indexFormat';
import type { Decoded, ReadySet, SetManager } from './setManager';
import { tintSheet, type CanvasLike } from './tint';

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
  /** Ids drawn with today's art: classic-mapped game ids, failed set keys, and missing `<set key>/<frame>`. */
  fallbacksUsed(): string[];
}

/** The stacked pieces of a baked support (see the header). */
export type SupportPart = 'foot' | 'seg' | 'top';

/** The part of `SetManager` RealLook uses (a structural type, so tests can pass a fake). */
export type RealSets = Pick<SetManager, 'want' | 'use' | 'state' | 'densityCap' | 'isDemoted' | 'hold' | 'admit'>;

export interface RealLookOptions {
  /** Canvas factory for tinted sheets. Default: `OffscreenCanvas`, else a DOM canvas. */
  makeCanvas?: (w: number, h: number) => CanvasLike;
  /** Told once per set whose tint failed (e.g. mask size differs from its sheet); `key` is `${setKey}#${hex}`. */
  onError?: (key: string, err: unknown) => void;
}

/** Car poses, as baked (Task 9): yaw in 32 steps, pitch and roll in 15° steps (one source: `./pose`). */
export { CAR_TILT_STEPS, CAR_YAW_STEPS, quantisePose } from './pose';

/** Tinted sheets unused for this many prepares are freed. */
const KEEP_FRAMES = 120;

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
  setKey: SetKey;
  /** The ready set's images when tinted; a reload gives a new array and invalidates the tint. */
  source: CanvasImageSource[];
  sheets: Map<number, Decoded>;
  bytes: number;
  lastFrame: number;
}

interface BuiltItem {
  kind: RealKind;
  item: string;
  everyTurn?: boolean;
  turn?: number;
}

const PATH_ITEM_IDS: Record<number, string> = { [PathItem.Bench]: 'bench', [PathItem.Bin]: 'bin', [PathItem.Lamp]: 'lamp' };

export function createRealLook(index: RealIndex, sets: RealSets, opts: RealLookOptions = {}): RealLook {
  const make = opts.makeCanvas ?? defaultCanvas;
  const keys = new Set<SetKey>(index.sets.map((e) => e.key));
  const itemsOf = (kind: RealKind): string[] => [...new Set(index.sets.filter((e) => e.kind === kind).map((e) => e.item))].sort();
  const guestItems = itemsOf('guest').filter((i) => !i.startsWith('staff_'));
  const groundItems = itemsOf('ground');

  let density: 2 | 4 = 2;
  let curRot: ViewRotation = 0;
  let frameNo = 0;
  let skipped = 0;
  let softDraws = 0;
  const fallbacks = new Set<string>();
  /** By `${setKey}#${hex}`, which is also the hold id in the set manager. */
  const tinted = new Map<string, Tinted>();
  /** Sets whose tint failed: drawn with today's art from then on. */
  const tintFailed = new Set<SetKey>();

  /** The set to use for (kind, item) at the current density and `rot`, or undefined when the bake has none. */
  function resolve(kind: RealKind, item: string, rot: ViewRotation): SetKey | undefined {
    return resolveAt(kind, item, rot, density);
  }

  /** As `resolve`, at density `want` (the density-4 set steps down when demoted or failed). */
  function resolveAt(kind: RealKind, item: string, rot: ViewRotation, want: 2 | 4): SetKey | undefined {
    let d = want;
    // A density-4 set freed for budget, or one that can never be decoded (failed, e.g. bigger than the budget): use
    // its density-2 set rather than today's art.
    const down = (k: SetKey): boolean => sets.isDemoted(k) || sets.state(k) === 'failed';
    if (d === 4 && (down(setKey(kind, item, 4, 'all')) || down(setKey(kind, item, 4, rot)))) d = 2;
    const all = setKey(kind, item, d, 'all');
    if (keys.has(all)) return all;
    const k = setKey(kind, item, d, rot);
    return keys.has(k) ? k : undefined;
  }

  function evict(id: string): void {
    const t = tinted.get(id);
    if (!t) return;
    for (const d of t.sheets.values()) d.close();
    tinted.delete(id);
    sets.hold(id, 0);
  }

  const wrap = (image: CanvasImageSource): Decoded => ({ image, bytes: 0, close() {} });

  /** `tintedSheet`'s answer when the budget has no room for the tinted sheet yet. */
  const NO_ROOM = 'no-room' as const;

  /**
   * Sheet `si` of a ready set tinted with `hex`; undefined when the sheet has no mask in the set (draw untinted);
   * null when tinting this set failed (draw today's art); NO_ROOM when the budget cannot take it now (not ready).
   */
  function tintedSheet(key: SetKey, rs: ReadySet, si: number, hex: string): CanvasImageSource | null | undefined | typeof NO_ROOM {
    if (tintFailed.has(key)) return null;
    const maskFile = rs.sheets[si]?.mask;
    if (maskFile === undefined) return undefined;
    const mask = rs.images[rs.sheets.findIndex((s) => s.file === maskFile)];
    const base = rs.images[si];
    if (!mask || !base) return undefined;
    const id = `${key}#${hex}`;
    let t = tinted.get(id);
    if (t && t.source !== rs.images) { evict(id); t = undefined; }
    if (!t) {
      t = { setKey: key, source: rs.images, sheets: new Map(), bytes: 0, lastFrame: frameNo };
      tinted.set(id, t);
    }
    t.lastFrame = frameNo;
    let d = t.sheets.get(si);
    if (!d) {
      // Room first: the tinted copy is as big as its sheet decoded. At density 2 it would be about 4 times that at 4.
      const size = base as unknown as { width: number; height: number };
      const want = t.bytes + size.width * size.height * 4;
      const up = rs.density === 2 ? 4 : 1;
      if (!sets.admit(id, want, want * up)) {
        if (t.sheets.size === 0) tinted.delete(id);
        return NO_ROOM;
      }
      try {
        d = tintSheet(wrap(base), wrap(mask), hexRgb(hex), make);
      } catch (err) {
        tintFailed.add(key);
        evict(id);
        opts.onError?.(id, err);
        return null;
      }
      t.sheets.set(si, d);
      t.bytes += d.bytes;
      sets.hold(id, t.bytes, t.bytes * up);
    }
    return d.image;
  }

  /**
   * The sprite for frame `parts` of set (kind, item) at view rotation `rot`. `id` is what `fallbacksUsed` lists
   * when the item is classic. `tint` is a `#rrggbb` colour for sheets with a mask (ignored without one).
   */
  function sprite(kind: RealKind, item: string | 'classic', id: string, rot: ViewRotation, parts: (string | number)[], tint: string | null): Sprite | null | undefined {
    if (item === 'classic') { fallbacks.add(id); return undefined; }
    const key = resolve(kind, item, rot);
    if (key === undefined) { fallbacks.add(`${kind}:${item}`); return undefined; }
    if (sets.state(key) === 'failed') { fallbacks.add(key); return undefined; }
    let rs = sets.use(key);
    if (!rs) {
      // Spec §5.4: never stop drawing, lower density first. A density-4 set not decoded yet draws from its density-2
      // twin when that one is ready (the ahead turn is wanted at density 2), scaled up, and the frame is not
      // incomplete. Not for ground pieces: a chunk is built once, so it waits for its own density.
      const twin = kind !== 'ground' && key.includes(':d4:') ? resolveAt(kind, item, rot, 2) : undefined;
      const low = twin !== undefined && sets.state(twin) === 'ready' ? sets.use(twin) : null;
      if (!low) { skipped++; return null; }
      rs = low;
      softDraws++;
    }
    const fk = frameKey(parts);
    const f = rs.frames[fk];
    const si = f ? rs.sheets.findIndex((s) => s.file === f.sheet) : -1;
    const sheet = rs.images[si];
    if (!f || !sheet) { fallbacks.add(`${key}/${fk}`); return undefined; }
    let image = sheet;
    if (tint !== null) {
      const t = tintedSheet(key, rs, si, tint);
      if (t === NO_ROOM) { skipped++; return null; }
      if (t === null) { fallbacks.add(`${key}#${tint}`); return undefined; }
      if (t !== undefined) image = t;
    }
    return { image, sx: f.sx, sy: f.sy, w: f.w, h: f.h, ox: -f.ox, oy: -f.oy, scale: rs.density };
  }

  function sweep(): void {
    for (const [id, t] of [...tinted.entries()]) {
      if (sets.state(t.setKey) !== 'ready' || t.lastFrame < frameNo - KEEP_FRAMES) evict(id);
    }
  }

  /** Game ids of every item kind built in the world, by RealKind. */
  /**
   * Built items: `turn` is the object's map rotation (its sprite turn is `(turn + view turn) mod 4`, as the renderer
   * draws it); `everyTurn` marks sets keyed by a heading that may be any turn (rails, supports, path-item shadows).
   */
  function builtItems(world: World): BuiltItem[] {
    const s = world.state;
    const out: BuiltItem[] = [];
    const add = (kind: RealKind, id: string, everyTurn = false, turn = 0): void => {
      const item = realItem(id);
      if (item !== 'classic') out.push({ kind, item, everyTurn, turn });
    };
    const withShadow = (kind: 'ride' | 'stall' | 'scenery', id: string, turn = 0): void => {
      add(kind, id, false, turn);
      add('shadow', id, false, turn);
    };
    for (const r of s.rides) {
      // Rails and supports are keyed by a heading in the view (piece, saddle), so any turn may be drawn.
      if (r.kind === 'track') { add('rail', r.defId, true); add('car', r.defId); add('support', r.defId, true); }
      else withShadow('ride', r.defId, r.rotation ?? 0);
    }
    for (const st of s.stalls) withShadow('stall', st.defId, st.rotation ?? 0);
    // Scenery turns like `itemView`: an edge item by its edge (0 when unset), any other by its rotation.
    for (const sc of s.scenery) withShadow('scenery', sc.defId, getSceneryDef(sc.defId)?.edge ? Math.max(0, sc.edge) : sc.rotation ?? 0);
    const seen = new Set<number>();
    const pi = s.map.pathItem;
    for (let i = 0; i < pi.length && seen.size < 3; i++) {
      const code = pi[i] as number;
      if (code !== 0 && !seen.has(code)) {
        seen.add(code);
        const id = PATH_ITEM_IDS[code];
        // A path item's shadow is keyed by the side it stands on, which may be any turn.
        if (id) { add('scenery', id); add('shadow', id, true); }
      }
    }
    for (const item of guestItems) out.push({ kind: 'guest', item });
    for (const m of s.staff.members) {
      const item = `staff_${m.type}`;
      if (keys.has(setKey('guest', item, 2, 'all')) || keys.has(setKey('guest', item, 4, 'all'))) out.push({ kind: 'guest', item });
    }
    for (const item of groundItems) out.push({ kind: 'ground', item });
    return out;
  }

  const look: RealLook = {
    density(zoom, dpr) {
      return pickDensity(zoom, dpr, sets.densityCap());
    },

    // `view` is accepted for the interface: every built kind may be on screen after a scroll, and the set
    // manager's ladder (ahead first, then off-screen density 4) handles memory pressure.
    prepare(world, rot, _view, zoom, dpr) {
      frameNo++;
      skipped = 0;
      softDraws = 0;
      density = look.density(zoom, dpr);
      curRot = rot;
      sweep();
      const ahead = ((rot + 1) % 4) as ViewRotation;
      const now = new Set<SetKey>();
      const later = new Set<SetKey>();
      for (const { kind, item, everyTurn, turn } of builtItems(world)) {
        if (everyTurn) {
          for (let r = 0; r < 4; r++) {
            const k = resolve(kind, item, r as ViewRotation);
            if (k !== undefined) now.add(k);
          }
          continue;
        }
        const t = turn ?? 0;
        const k = resolve(kind, item, ((t + rot) % 4) as ViewRotation);
        if (k !== undefined) now.add(k);
        // The ahead turn at density 2 only (cheap): after a turn its objects show at once from these sets and
        // sharpen when the turn's density-4 sets land. A set for every turn (rot 'all') is already wanted now.
        const ar = ((t + ahead) % 4) as ViewRotation;
        const a = resolve(kind, item, ar);
        if (a !== undefined && !now.has(a)) {
          const low = density === 4 ? resolveAt(kind, item, ar, 2) : a;
          if (low !== undefined) later.add(low);
        }
      }
      // The card pictures: one small set, always loaded (src/render/real/cards.ts).
      if (keys.has(CARD_SET)) now.add(CARD_SET);
      for (const k of now) later.delete(k);
      sets.want([...now], 'now');
      sets.want([...later], 'ahead');
    },

    ride(defId, rot, frame, occupancy) {
      const item = realItem(defId);
      return sprite('ride', item, defId, rot, [item, `f${frame}`, occupancy > 0 ? 'occ1' : 'occ0'], null);
    },

    stall(defId, rot) {
      const item = realItem(defId);
      return sprite('stall', item, defId, rot, [item], null);
    },

    scenery(defId, rot, frame) {
      const item = realItem(defId);
      return sprite('scenery', item, defId, rot, [item, `f${frame}`], null);
    },

    guest(guestId, shirt, walk, facing, sitting) {
      const body = mod(guestId, 2);
      const outfit = mod(Math.floor(guestId / 2), 4);
      const hex = SHIRT_COLOURS[mod(shirt, SHIRT_COLOURS.length)] as string;
      return sprite('guest', `b${body}o${outfit}`, 'guest', curRot, [`f${mod(facing, 4)}`, sitting ? 'sit' : `w${walk}`], hex);
    },

    staff(staffType, facing, walk) {
      return sprite('guest', `staff_${staffType}`, `staff:${staffType}`, curRot, [`f${mod(facing, 4)}`, `w${walk}`], null);
    },

    rail(trackType, pieceId, tile, heading, colour) {
      return sprite('rail', realItem(trackType), trackType, heading, [pieceId, `t${tile}`], paletteColour(colour));
    },

    car(trackType, yawStep, pitchStep, rollStep, full, colour) {
      const parts = [`y${mod(yawStep, CAR_YAW_STEPS)}`, `p${mod(pitchStep, CAR_TILT_STEPS)}`, `r${mod(rollStep, CAR_TILT_STEPS)}`, full ? 'full' : 'empty'];
      return sprite('car', realItem(trackType), trackType, curRot, parts, paletteColour(colour));
    },

    support(trackType, part, heading, colour) {
      return sprite('support', realItem(trackType), trackType, heading, [part], paletteColour(colour));
    },

    shadow(_kind, defId, rot) {
      const item = realItem(defId);
      return sprite('shadow', item, defId, rot, [item], null);
    },

    groundPiece(terrain, slopeMask, variant, rot, join) {
      const parts = join !== undefined && (terrain === 'path' || terrain === 'queue') ? [`j${join & 15}`] : [`s${slopeMask}`, `v${variant}`];
      return sprite('ground', terrain, `ground:${terrain}`, rot, parts, null);
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

    fallbacksUsed() {
      return [...fallbacks].sort();
    },
  };
  return look;
}
