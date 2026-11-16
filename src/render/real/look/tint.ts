/**
 * Tinted frames for RealLook (spec §5.7, Task 4): a sheet with a mask (guest shirts, track, car and support colours)
 * is tinted one frame at a time, as the frame is drawn, into the shared tint atlas (`../tintAtlas.ts`); no whole sheet
 * is tinted. A frame not tinted yet draws its untinted picture (the caller counts it incomplete); a frame the atlas has
 * no room for draws untinted too (the caller counts it incomplete, then degraded after `DEGRADE_FRAMES`).
 */
import type { Sprite } from '../../spriteCache';
import type { SetKey } from '../indexFormat';
import type { Decoded, ReadySet } from '../setManager';
import { TINT_FRAME_MS, type CanvasLike } from '../tint';
import { TintAtlas } from '../tintAtlas';
import type { RealSets, Resolved, SetMeta } from './types';

/** Tinting budget per frame, ms (round 3 item 4): defined with the set manager's sheet tints in `../tint.ts`. */
export { TINT_FRAME_MS };

/** Tinted frames not drawn for this many prepares are freed (and pages left empty with them). */
const KEEP_FRAMES = 120;

/** `tint`'s answer for a frame queued but not tinted yet: draw it untinted this frame. */
export const TINT_WAIT = 'wait' as const;
/** `tint`'s answer when the atlas has no room for the frame now: draw it untinted. */
export const TINT_NO_ROOM = 'no-room' as const;

export interface LookTinter {
  /**
   * Frame `r` of ready set `key` tinted with `hex`: the tinted sprite; `r.sprite` itself when its sheet has no mask;
   * TINT_WAIT or TINT_NO_ROOM (draw `r.sprite`); null when tinting this set failed (draw today's art).
   */
  tint(key: SetKey, rs: ReadySet, r: Resolved, hex: string): Sprite | null | typeof TINT_WAIT | typeof TINT_NO_ROOM;
  /** Start of a prepare: the atlas's frame moves on; frames of sets no longer ready, or unused long, are freed. */
  beginFrame(): void;
  reclaim(needBytes: number): number;
  dispose(): void;
}

export interface TinterOptions {
  make: (w: number, h: number) => CanvasLike;
  now?: () => number;
  /** Told once per set whose tint failed; `key` is `${setKey}#${hex}`. */
  onError?: (key: string, err: unknown) => void;
}

const wrap = (image: CanvasImageSource): Decoded => ({ image, bytes: 0, close() {} });
const sizeOf = (img: CanvasImageSource): { w: number; h: number } => {
  const s = img as unknown as { width: number; height: number };
  return { w: s.width, h: s.height };
};

export function createTinter(sets: RealSets, metaOf: (rs: ReadySet) => SetMeta, opts: TinterOptions): LookTinter {
  /** Sheet ids by decoded sheet image (a reload decodes new images, so new ids), and each id's set. */
  const sheetIds = new WeakMap<CanvasImageSource, number>();
  const setOfSheet = new Map<number, SetKey>();
  let nextSheet = 0;
  /** Per set drawn tinted: the images its sheet ids were made for, and those ids. */
  const bySet = new Map<SetKey, { source: CanvasImageSource[]; sheets: number[] }>();
  /** Sets whose tint failed: drawn with today's art from then on. */
  const failed = new Set<SetKey>();
  const colours = new Map<string, number>();
  const hexOf = new Map<number, string>();

  const atlas = new TintAtlas(sets, opts.make, {
    now: opts.now,
    onError(sheet, colour, err) {
      const key = setOfSheet.get(sheet);
      if (key === undefined) return;
      failed.add(key);
      opts.onError?.(`${key}#${hexOf.get(colour) ?? colour.toString(16)}`, err);
    },
    // A page or the scratch canvas failed: no set is to blame; its frames are asked for again on later draws.
    onCanvasError: (err) => opts.onError?.('tint:canvas', err),
  });

  function colourOf(hex: string): number {
    let c = colours.get(hex);
    if (c === undefined) {
      c = parseInt(hex.slice(1, 7), 16);
      colours.set(hex, c);
      hexOf.set(c, hex);
    }
    return c;
  }

  function dropSet(key: SetKey): void {
    const t = bySet.get(key);
    if (!t) return;
    for (const id of t.sheets) { atlas.drop(id); setOfSheet.delete(id); }
    bySet.delete(key);
  }

  /** The id of sheet `base` of set `key` (made on first use), or null when its mask is not its size (the set fails). */
  function sheetId(key: SetKey, rs: ReadySet, base: CanvasImageSource, mask: CanvasImageSource, hex: string): number | null {
    const id = sheetIds.get(base);
    if (id !== undefined) return id;
    // A set decoded again: its old frames are of no use.
    const t0 = bySet.get(key);
    if (t0 && t0.source !== rs.images) dropSet(key);
    const b = sizeOf(base);
    const m = sizeOf(mask);
    if (b.w !== m.w || b.h !== m.h) {
      failed.add(key);
      opts.onError?.(`${key}#${hex}`, new Error(`tint mask is ${m.w}x${m.h}, base is ${b.w}x${b.h}`));
      return null;
    }
    let t = bySet.get(key);
    if (!t) bySet.set(key, (t = { source: rs.images, sheets: [] }));
    const n = nextSheet++;
    sheetIds.set(base, n);
    setOfSheet.set(n, key);
    t.sheets.push(n);
    return n;
  }

  return {
    tint(key, rs, r, hex) {
      if (failed.has(key)) return null;
      const meta = metaOf(rs);
      const mi = meta.maskOf[r.si] as number;
      const base = rs.images[r.si];
      const mask = mi < 0 ? undefined : rs.images[mi];
      if (!base || !mask) return r.sprite;
      const sheet = sheetId(key, rs, base, mask, hex);
      if (sheet === null) return null;
      const colour = colourOf(hex);
      if (r.tid === undefined) r.tid = meta.tids++;
      const hit = atlas.get(sheet, r.tid, colour);
      if (hit) return hit;
      const { f, sprite } = r;
      if (!atlas.request(sheet, r.tid, colour, wrap(base), wrap(mask), { x: f.sx, y: f.sy, w: f.w, h: f.h, ox: sprite.ox, oy: sprite.oy, scale: sprite.scale })) {
        return failed.has(key) ? null : TINT_NO_ROOM;
      }
      atlas.step(TINT_FRAME_MS);
      return atlas.get(sheet, r.tid, colour) ?? (failed.has(key) ? null : TINT_WAIT);
    },

    beginFrame() {
      atlas.beginFrame();
      for (const key of [...bySet.keys()]) if (sets.state(key) !== 'ready') dropSet(key);
      atlas.sweep(KEEP_FRAMES);
    },

    reclaim: (needBytes) => atlas.reclaim(needBytes),

    dispose() {
      atlas.dispose();
    },
  };
}
