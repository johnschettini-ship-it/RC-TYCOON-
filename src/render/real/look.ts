/**
 * RealLook: turns world objects into `Sprite`s cut from the baked realistic-art sets.
 *
 * Per frame the caller runs: `sets.beginFrame(n)`, `look.prepare(...)` (wants every set the frame may draw), the
 * draw calls (`look.ride(...)` etc.), then `sets.endFrame()`. A getter returns
 *   - a `Sprite`: draw it with `blit`/`blitColumn` as today;
 *   - `null`: the set is still loading; skip the object this frame (counted by `incomplete()`);
 *   - `undefined`: draw today's art (item mapped to 'classic', set failed, or the bake lacks the set or frame).
 *
 * Sprites: `Sprite` has no source rectangle, so each drawn frame is copied out of its sheet into its own small
 * canvas (tinted there when the sheet has a mask). These frames are cached, held in the set manager's budget
 * (`SetManager.hold`), and freed when their set is freed or they go unused for `KEEP_FRAMES` prepares.
 *
 * Contract with the bake (Task 9), frame keys via `frameKey`:
 *   ride     set ride:<item>        frame [item, `f<frame>`, `occ0` | `occ1`]   (occupancy > 0 → occ1, full)
 *   stall    set stall:<item>       frame [item]
 *   scenery  set scenery:<item>     frame [item, `f<frame>`]                    (bench and bin are scenery items)
 *   shadow   set shadow:<item>      frame [item]
 *   guest    set guest:b<B>o<O>     frame [`f<facing 0-3>`, `w<walk>` | `sit`]  (rot 'all'; shirt mask)
 *   staff    set guest:staff_<type> frame [`f<facing 0-3>`, `w<walk>`]          (not baked in stage 1)
 *   rail     set rail:<item>        frame [pieceId, `t<tile>`]                  (track-colour mask, optional)
 *   car      set car:<item>         frame [`y<0-31>`, `p<0-23>`, `r<0-23>`, `full` | `empty`] (car-colour mask)
 *   ground   set ground:<terrain>   frame [`s<slopeMask>`, `v<variant>`]
 * A set with `rot: 'all'` serves every view rotation and is wanted once. Frame `ox`/`oy` are copied to the
 * sprite unchanged: `renderer.ts` `blit` puts the image's top-left at anchor − (ox, oy) × (device px per
 * sprite px), so the bake must write ox/oy as the anchor's position inside the frame, in density pixels.
 */
import { SHIRT_COLOURS } from '../palette';
import type { Sprite } from '../spriteCache';
import type { ViewRect } from '../terrain';
import { paletteColour } from '../track/colours';
import type { ViewRotation } from '../view';
import type { World } from '../../sim/types';
import { PathItem } from '../../sim/map';
import { realItem } from './fallbacks';
import { frameKey, setKey, type RealFrame, type RealIndex, type RealKind, type SetKey } from './indexFormat';
import type { Decoded, ReadySet, SetManager } from './setManager';
import { tintSheet, type CanvasLike } from './tint';

export interface RealLook {
  density(zoom: number, dpr: number): 2 | 4;
  prepare(world: World, rot: ViewRotation, view: ViewRect, zoom: number, dpr: number): void;
  ride(defId: string, rot: ViewRotation, frame: number, occupancy: number): Sprite | null | undefined;
  stall(defId: string, rot: ViewRotation): Sprite | null | undefined;
  scenery(defId: string, rot: ViewRotation, frame: number): Sprite | null | undefined;
  guest(guestId: number, shirt: number, walk: number, facing: number, sitting: boolean): Sprite | null | undefined;
  staff(staffType: string, facing: number, walk: number): Sprite | null | undefined;
  rail(trackType: string, pieceId: string, tile: number, rot: ViewRotation, colour: number): Sprite | null | undefined;
  car(trackType: string, yawStep: number, pitchStep: number, rollStep: number, full: boolean, colour: number): Sprite | null | undefined;
  shadow(kind: 'ride' | 'stall' | 'scenery', defId: string, rot: ViewRotation): Sprite | null | undefined;
  groundPiece(terrain: string, slopeMask: number, variant: number, rot: ViewRotation): Sprite | null | undefined;
  /** Objects skipped since the last `prepare` because their set was not ready. */
  incomplete(): number;
  /** Ids drawn with today's art: classic-mapped game ids, failed set keys, and missing `<set key>/<frame>`. */
  fallbacksUsed(): string[];
}

/** The part of `SetManager` RealLook uses (a structural type, so tests can pass a fake). */
export type RealSets = Pick<SetManager, 'want' | 'use' | 'state' | 'densityCap' | 'isDemoted' | 'hold'>;

export interface RealLookOptions {
  /** Canvas factory for cropped and tinted frames. Default: `OffscreenCanvas`, else a DOM canvas. */
  makeCanvas?: (w: number, h: number) => CanvasLike;
  /** Cap on cached frame bytes; least recently used frames not drawn this frame go first. Default 16 MB. */
  frameBudgetBytes?: number;
}

/** Car poses, as baked (Task 9): yaw in 32 steps, pitch and roll in 15° steps. */
export const CAR_YAW_STEPS = 32;
export const CAR_TILT_STEPS = 24;

/** Cached frames unused for this many prepares are freed. */
const KEEP_FRAMES = 120;
const DEFAULT_FRAME_BUDGET = 16 * 2 ** 20;
const HOLD_ID = 'realLook:frames';

/** F1: the smallest of {2, 4} ≥ zoom × dpr, else 4; then no more than the set manager's cap. */
export function pickDensity(zoom: number, dpr: number, cap: 2 | 4): 2 | 4 {
  const want = zoom * dpr <= 2 ? 2 : 4;
  return want < cap ? want : cap;
}

const mod = (n: number, m: number): number => ((Math.round(n) % m) + m) % m;

/** Quantise a car pose in radians to the baked steps. */
export function quantisePose(yaw: number, pitch: number, roll: number): { yaw: number; pitch: number; roll: number } {
  return {
    yaw: mod((yaw / (2 * Math.PI)) * CAR_YAW_STEPS, CAR_YAW_STEPS),
    pitch: mod((pitch / (2 * Math.PI)) * CAR_TILT_STEPS, CAR_TILT_STEPS),
    roll: mod((roll / (2 * Math.PI)) * CAR_TILT_STEPS, CAR_TILT_STEPS),
  };
}

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

interface CropCtx {
  drawImage(img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
}

interface CachedFrame {
  setKey: SetKey;
  /** The ready set's images when the frame was cut; a reload gives a new array and invalidates the frame. */
  source: CanvasImageSource[];
  image: CanvasImageSource;
  bytes: number;
  lastFrame: number;
  close(): void;
}

const PATH_ITEM_IDS: Record<number, string> = { [PathItem.Bench]: 'bench', [PathItem.Bin]: 'bin', [PathItem.Lamp]: 'lamp' };

export function createRealLook(index: RealIndex, sets: RealSets, opts: RealLookOptions = {}): RealLook {
  const make = opts.makeCanvas ?? defaultCanvas;
  const frameBudget = opts.frameBudgetBytes ?? DEFAULT_FRAME_BUDGET;
  const keys = new Set<SetKey>(index.sets.map((e) => e.key));
  const itemsOf = (kind: RealKind): string[] => [...new Set(index.sets.filter((e) => e.kind === kind).map((e) => e.item))].sort();
  const guestItems = itemsOf('guest').filter((i) => !i.startsWith('staff_'));
  const groundItems = itemsOf('ground');

  let density: 2 | 4 = 2;
  let curRot: ViewRotation = 0;
  let frameNo = 0;
  let skipped = 0;
  const fallbacks = new Set<string>();
  const cache = new Map<string, CachedFrame>();
  let cacheBytes = 0;

  /** The set to use for (kind, item) at the current density and `rot`, or undefined when the bake has none. */
  function resolve(kind: RealKind, item: string, rot: ViewRotation): SetKey | undefined {
    let d = density;
    if (d === 4 && (sets.isDemoted(setKey(kind, item, 4, 'all')) || sets.isDemoted(setKey(kind, item, 4, rot)))) d = 2;
    const all = setKey(kind, item, d, 'all');
    if (keys.has(all)) return all;
    const k = setKey(kind, item, d, rot);
    return keys.has(k) ? k : undefined;
  }

  function evict(c: string): void {
    const f = cache.get(c);
    if (!f) return;
    f.close();
    cache.delete(c);
    cacheBytes -= f.bytes;
  }

  function fitBudget(incoming: number): void {
    if (cacheBytes + incoming <= frameBudget) return;
    const old = [...cache.entries()].filter(([, f]) => f.lastFrame < frameNo).sort((a, b) => a[1].lastFrame - b[1].lastFrame);
    for (const [c] of old) {
      if (cacheBytes + incoming <= frameBudget) break;
      evict(c);
    }
  }

  function crop(img: CanvasImageSource, f: RealFrame): CanvasLike {
    const c = make(f.w, f.h);
    (c.getContext('2d') as CropCtx).drawImage(img, f.sx, f.sy, f.w, f.h, 0, 0, f.w, f.h);
    return c;
  }

  function release(c: CanvasLike): void {
    c.width = 0;
    c.height = 0;
  }

  /** Cut (and tint) frame `fk` of a ready set. Returns undefined when the frame's sheet is missing. */
  function cut(key: SetKey, rs: ReadySet, fk: string, f: RealFrame, tint: string | null): CachedFrame | undefined {
    const si = rs.sheets.findIndex((s) => s.file === f.sheet);
    const base = rs.images[si];
    if (!base) return undefined;
    const maskFile = rs.sheets[si]?.mask;
    const mi = maskFile === undefined ? -1 : rs.sheets.findIndex((s) => s.file === maskFile);
    const maskImg = rs.images[mi];
    const bytes = f.w * f.h * 4;
    if (tint !== null && maskImg) {
      const a = crop(base, f);
      const m = crop(maskImg, f);
      const asDecoded = (c: CanvasLike): Decoded => ({ image: c as unknown as CanvasImageSource, bytes, close: () => release(c) });
      const da = asDecoded(a);
      const dm = asDecoded(m);
      const out = tintSheet(da, dm, hexRgb(tint), make);
      da.close();
      dm.close();
      return { setKey: key, source: rs.images, image: out.image, bytes: out.bytes, lastFrame: frameNo, close: () => out.close() };
    }
    const c = crop(base, f);
    return { setKey: key, source: rs.images, image: c as unknown as CanvasImageSource, bytes, lastFrame: frameNo, close: () => release(c) };
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
    const rs = sets.use(key);
    if (!rs) { skipped++; return null; }
    const fk = frameKey(parts);
    const f = rs.frames[fk];
    if (!f) { fallbacks.add(`${key}/${fk}`); return undefined; }
    const ck = tint === null ? `${key}|${fk}` : `${key}|${fk}|${tint}`;
    let cf = cache.get(ck);
    if (cf && cf.source !== rs.images) { evict(ck); cf = undefined; }
    if (!cf) {
      fitBudget(f.w * f.h * 4);
      cf = cut(key, rs, fk, f, tint);
      if (!cf) { fallbacks.add(`${key}/${fk}`); return undefined; }
      cache.set(ck, cf);
      cacheBytes += cf.bytes;
      sets.hold(HOLD_ID, cacheBytes);
    }
    cf.lastFrame = frameNo;
    return { image: cf.image, w: f.w, h: f.h, ox: f.ox, oy: f.oy, scale: rs.density };
  }

  function sweep(): void {
    for (const [c, f] of [...cache.entries()]) {
      if (sets.state(f.setKey) !== 'ready' || f.lastFrame < frameNo - KEEP_FRAMES) evict(c);
    }
    sets.hold(HOLD_ID, cacheBytes);
  }

  /** Game ids of every item kind built in the world, by RealKind. */
  function builtItems(world: World): { kind: RealKind; item: string }[] {
    const s = world.state;
    const out: { kind: RealKind; item: string }[] = [];
    const add = (kind: RealKind, id: string): void => {
      const item = realItem(id);
      if (item !== 'classic') out.push({ kind, item });
    };
    const withShadow = (kind: 'ride' | 'stall' | 'scenery', id: string): void => {
      add(kind, id);
      add('shadow', id);
    };
    for (const r of s.rides) {
      if (r.kind === 'track') { add('rail', r.defId); add('car', r.defId); }
      else withShadow('ride', r.defId);
    }
    for (const st of s.stalls) withShadow('stall', st.defId);
    for (const sc of s.scenery) withShadow('scenery', sc.defId);
    const seen = new Set<number>();
    const pi = s.map.pathItem;
    for (let i = 0; i < pi.length && seen.size < 3; i++) {
      const code = pi[i] as number;
      if (code !== 0 && !seen.has(code)) {
        seen.add(code);
        const id = PATH_ITEM_IDS[code];
        if (id) withShadow('scenery', id);
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
      density = look.density(zoom, dpr);
      curRot = rot;
      sweep();
      const ahead = ((rot + 1) % 4) as ViewRotation;
      const now = new Set<SetKey>();
      const later = new Set<SetKey>();
      for (const { kind, item } of builtItems(world)) {
        const k = resolve(kind, item, rot);
        if (k !== undefined) now.add(k);
        const a = resolve(kind, item, ahead);
        if (a !== undefined) later.add(a);
      }
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

    rail(trackType, pieceId, tile, rot, colour) {
      return sprite('rail', realItem(trackType), trackType, rot, [pieceId, `t${tile}`], paletteColour(colour));
    },

    car(trackType, yawStep, pitchStep, rollStep, full, colour) {
      const parts = [`y${mod(yawStep, CAR_YAW_STEPS)}`, `p${mod(pitchStep, CAR_TILT_STEPS)}`, `r${mod(rollStep, CAR_TILT_STEPS)}`, full ? 'full' : 'empty'];
      return sprite('car', realItem(trackType), trackType, curRot, parts, paletteColour(colour));
    },

    shadow(_kind, defId, rot) {
      const item = realItem(defId);
      return sprite('shadow', item, defId, rot, [item], null);
    },

    groundPiece(terrain, slopeMask, variant, rot) {
      return sprite('ground', terrain, `ground:${terrain}`, rot, [`s${slopeMask}`, `v${variant}`], null);
    },

    incomplete() {
      return skipped;
    },

    fallbacksUsed() {
      return [...fallbacks].sort();
    },
  };
  return look;
}
