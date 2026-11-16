/** Types of RealLook: the public ones (see `./index.ts` for the contract) and the records its modules share. */
import type { Sprite } from '../../spriteCache';
import type { ViewRect } from '../../terrain';
import type { ViewRotation } from '../../view';
import type { World } from '../../../sim/types';
import type { RealFrame, RealKind, SetKey } from '../indexFormat';
import type { SetManager } from '../setManager';
import type { CanvasLike } from '../tint';

/**
 * Every getter returns a `Sprite` to draw, `null` when its set is not ready yet (skip the object this frame; counted
 * by `incomplete()`), or `undefined` to draw today's art (classic fallback: unbaked item, failed set, missing frame).
 */
export interface RealLook {
  density(zoom: number, dpr: number): 2 | 4;
  prepare(world: World, rot: ViewRotation, view: ViewRect, zoom: number, dpr: number): void;
  /**
   * A flat ride; `colour` (a `TRACK_PALETTE` index, null or absent: Original) draws its coloured set (ride colours
   * Task 5). While that set is not ready the ride draws whatever pictures of it are decoded (the Original pictures it
   * is tinting, or its Original or another colour's set: a colour change keeps the old picture), counted incomplete;
   * a failed tint draws the Original pictures and lists the coloured set in `fallbacksUsed`.
   */
  ride(defId: string, rot: ViewRotation, frame: number, occupancy: number, colour?: number | null): Sprite | null | undefined;
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
   * The same ground piece from the other density's set when that one is decoded (density 2 first), or null: what
   * RealGround draws while `groundPiece` answers null (a zoom step, a lifted demotion), so a tile it lays is never
   * empty (Task 3). The set is only peeked: never used (pinned) or wanted; no count, no fallback listed. So it stands
   * in for about 2 frames after a step: once nobody wants or uses that set, the set manager frees it at an
   * `endFrame`, and RealGround draws its old chunk (if kept) or placeholders until the wanted set decodes.
   */
  groundStandIn?(terrain: string, slopeMask: number, variant: number, rot: ViewRotation, join?: number): Sprite | null;
  /**
   * Whether the bake has a ground set for `terrain` at this turn and the current density that has not failed (no
   * side effect): RealGround covers a chunk it has not drawn yet when every tile's terrain has one (Task 3).
   */
  groundBaked?(terrain: string, rot: ViewRotation): boolean;
  /** Frees the tint atlas (zeroes its pages, releases their holds). The look stays usable. */
  dispose(): void;
  /**
   * The set manager's reclaimer: frees tint-atlas pages not drawn since the last `prepare`, least recently used first,
   * until about `needBytes` are freed. Returns the bytes freed.
   */
  reclaim(needBytes: number): number;
  /** The density the last `prepare` chose (after the set manager's cap). */
  currentDensity(): 2 | 4;
  /**
   * Objects since the last `prepare` skipped because their set was not ready, or drawn untinted because their tinted
   * frame is not in the tint atlas yet (queued, or no room: after `DEGRADE_FRAMES` prepares those count in `degraded()`).
   */
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
   * a tinted frame the atlas has had no room for, the untinted picture, rather than nothing. Not counted by `incomplete()`.
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
export type RealSets = Pick<SetManager, 'want' | 'use' | 'state' | 'densityCap' | 'isDemoted' | 'hold' | 'admit'> & Partial<Pick<SetManager, 'starved' | 'peek' | 'interim'>>;

export interface RealLookOptions {
  /** Canvas factory for the tint atlas's pages and scratch canvas. Default: `OffscreenCanvas`, else a DOM canvas. */
  makeCanvas?: (w: number, h: number) => CanvasLike;
  /** Told once per set whose tint failed (e.g. mask size differs from its sheet, no 2D context); `key` is `${setKey}#${hex}`. */
  onError?: (key: string, err: unknown) => void;
  /** Clock for the per-frame tint budget, ms (default `performance.now`). */
  now?: () => number;
}

/** A set group `prepare` wants: an item record at a map turn (its sprite turn is `(turn + view turn) mod 4`), or at every heading. */
export interface Combo {
  rec: ItemRec;
  everyTurn: boolean;
  turn: number;
}

/**
 * A built object for the view scope: its footprint centre (continuous map point), how far its picture reaches
 * around that point in screen px at zoom 1 (`rx` sideways, `up` above, `down` below; height in steps `z`), and the
 * combos it needs (`a`, `b`, `c`; −1 for none).
 */
export interface ScopeObject {
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


/**
 * One baked (kind, item): its set keys by density and turn, made once from the index, so a getter or `prepare`
 * resolves a set without building a key string (round 3 item 5). `k2[r]`/`k4[r]`: the set for turn `r` at that
 * density (the `all` set when the bake has one), undefined when the bake has none.
 */
export interface ItemRec {
  kind: RealKind;
  item: string;
  k2: (SetKey | undefined)[];
  k4: (SetKey | undefined)[];
  /** What `fallbacksUsed` lists when a turn has no set: `<kind>:<item>`. */
  missId: string;
  /** A ride's coloured record (ride colours Task 5): its Original record; its keys are the Original keys `:c<colour>`. */
  base?: ItemRec;
}

/** A frame found in a ready set: its sheet index and the untinted sprite (one object, reused every draw). */
export interface Resolved {
  f: RealFrame;
  si: number;
  sprite: Sprite;
  /** The frame's id in the tint atlas (per ready set), given on its first tinted draw. */
  tid?: number;
  /**
   * By tint colour: since which prepare this frame has had no room in the tint atlas, and the last prepare it asked
   * (Task 4b: per frame, so frames of the same set and colour that do get room do not restart its wait).
   */
  noRoom?: Map<string, { from: number; last: number }>;
}

/**
 * Per ready set (a reload gives a new `ReadySet`, so a new entry): sheet indices by file, each sheet's mask index
 * (−1 without one), and the frames looked up so far by a numeric code (`codes`) or, for rails, by piece and tile.
 * A missing frame is cached as its fallback id (`<set key>/<frame key>`).
 */
export interface SetMeta {
  maskOf: number[];
  /** Tint-atlas frame ids given so far (`Resolved.tid`). */
  tids: number;
  codes: Map<number, Resolved | string>;
  rails: Map<string, (Resolved | string | undefined)[]>;
}
