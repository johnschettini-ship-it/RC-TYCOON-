/** Types of RealLook: the public ones (see `./index.ts` for the contract) and the records its modules share. */
import type { Sprite } from '../../spriteCache';
import type { ViewRect } from '../../terrain';
import type { ViewRotation } from '../../view';
import type { World } from '../../../sim/types';
import type { RealFrame, RealKind, SetKey } from '../indexFormat';
import type { SetManager } from '../setManager';
import type { CanvasLike, TintJob } from '../tint';

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

/** One set tinted with one colour: its tinted sheets by sheet index, made on first use. */
export interface Tinted {
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
}

/** A frame found in a ready set: its sheet index and the untinted sprite (one object, reused every draw). */
export interface Resolved {
  f: RealFrame;
  si: number;
  sprite: Sprite;
}

/**
 * Per ready set (a reload gives a new `ReadySet`, so a new entry): sheet indices by file, each sheet's mask index
 * (−1 without one), and the frames looked up so far by a numeric code (`codes`) or, for rails, by piece and tile.
 * A missing frame is cached as its fallback id (`<set key>/<frame key>`).
 */
export interface SetMeta {
  maskOf: number[];
  codes: Map<number, Resolved | string>;
  rails: Map<string, (Resolved | string | undefined)[]>;
}
