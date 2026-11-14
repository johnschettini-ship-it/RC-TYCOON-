/**
 * The tint atlas (Task 4, F6 memory): tinted frames, one rectangle each, packed into a few shared pages, instead of a
 * whole tinted copy of every (sheet, colour). Only frames that are drawn get tinted, so the memory follows what is on
 * screen, not how many sets and colours exist (whole sheets projected to 117 MB at density 4 for 32 guest sets in 12
 * shirt colours).
 *
 * - Pages are `TINT_PAGE_PX` wide and `TINT_PAGE_ROWS` tall (1 MiB each), or as tall as a taller frame (a rail tile at
 *   density 4 is up to 348 px), at most `TINT_ATLAS_MAX_PAGES` of them and `TINT_ATLAS_MAX_BYTES` (12 MiB) in all. Each
 *   page is admitted to the set manager before it is made (`sets.admit('tint:<page>', bytes)`), so it counts in the
 *   one picture budget (`split().tints`), and released (`hold(id, 0)`) when it is freed.
 * - Frames are shelf-packed: a row ("shelf") as tall as the frame that opened it; a frame goes into a freed slot or the
 *   end of a shelf about its height, else a new shelf, else a new page.
 * - Full: the least recently used frame is evicted first, and its slot reused. A frame drawn this frame or the frame
 *   before is never evicted (no thrash when more frames are on screen than fit): the request is refused instead and
 *   the caller draws the frame untinted. A page left empty is freed.
 * - `request` only reserves the slot; `step(budgetMs)` tints queued frames while the frame's tint time is under the
 *   budget (at least one a frame, so every queue drains). Until then `get` returns undefined.
 * - `reclaim` is the set manager's reclaimer: whole pages not drawn this frame, least recently used first.
 */
import type { Sprite } from '../spriteCache';
import type { Decoded, SetManager } from './setManager';
import { tintRect, type CanvasLike, type Rect } from './tint';

/** Page width, px (and the largest frame side the atlas takes). */
export const TINT_PAGE_PX = 1024;
/** Page height, px, unless a taller frame opens the page. */
export const TINT_PAGE_ROWS = 256;
/** One page: 1 MiB. */
export const TINT_PAGE_BYTES = TINT_PAGE_PX * TINT_PAGE_ROWS * 4;
export const TINT_ATLAS_MAX_PAGES = 12;
/** 12 MiB at most, whatever the pages' heights. */
export const TINT_ATLAS_MAX_BYTES = TINT_ATLAS_MAX_PAGES * TINT_PAGE_BYTES;
/** Hold ids in the set manager: `tint:<page>`. Every hold id but `ground` is counted as tints by `split()`. */
export const TINT_HOLD_PREFIX = 'tint:';

/** Frame ids are below this; a (sheet, frame) pair is one number: sheetKey × FRAME_SPAN + frame. */
const FRAME_SPAN = 2 ** 28;
/** Frames drawn this many frames back or later are never evicted. */
const KEEP_RECENT = 1;
/** A frame may go in a shelf up to this much taller than itself (px, or a quarter of its height if more). */
const SHELF_SLACK = 4;

/** A frame's rectangle in its sheet, and the sprite fields the tinted sprite carries (default 0, 0, 1). */
export interface TintFrameRect extends Rect { ox?: number; oy?: number; scale?: number }

export interface TintAtlasOptions {
  /** Clock for the per-frame tint budget, ms (default `performance.now`). */
  now?: () => number;
  /** Told once per sheet whose tint failed (a canvas without a 2D context); the sheet is refused from then on. */
  onError?: (sheetKey: number, colour: number, err: unknown) => void;
}

interface Shelf { y: number; h: number; x: number; free: { x: number; w: number }[]; count: number }
interface Page { id: number; canvas: CanvasLike; w: number; h: number; bytes: number; shelves: Shelf[]; nextY: number; entries: Set<Entry>; used: number }
interface Entry {
  key: number;
  colour: number;
  sheetKey: number;
  page: Page;
  shelf: Shelf;
  x: number;
  slotW: number;
  rect: TintFrameRect;
  /** Set while queued. */
  base: Decoded | null;
  mask: Decoded | null;
  sprite: Sprite | undefined;
  gone: boolean;
  used: number;
  prev: Entry | null;
  next: Entry | null;
}
interface Place { page: Page; shelf: Shelf; x: number; slotW: number }

const rgbOf = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

export class TintAtlas {
  private readonly frames = new Map<number, Map<number, Entry>>();
  private readonly bySheet = new Map<number, Set<Entry>>();
  private readonly failedSheets = new Set<number>();
  private pageList: Page[] = [];
  private total = 0;
  /** LRU list: head least recently used. */
  private head: Entry | null = null;
  private tail: Entry | null = null;
  private queue: Entry[] = [];
  private qHead = 0;
  private scratch: CanvasLike | null = null;
  private tick = 0;
  private spent = 0;
  private ranOne = false;
  private readonly now: () => number;

  constructor(
    private readonly sets: Pick<SetManager, 'admit' | 'hold'>,
    private readonly make: (w: number, h: number) => CanvasLike,
    private readonly opts: TintAtlasOptions = {},
  ) {
    this.now = opts.now ?? ((): number => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  /** Start of a frame: the LRU clock moves on and the frame's tint time resets. */
  beginFrame(): void {
    this.tick++;
    this.spent = 0;
    this.ranOne = false;
  }

  /** The tinted frame, or undefined when it is not tinted (yet). Marks it used this frame. */
  get(sheetKey: number, frame: number, colour: number): Sprite | undefined {
    const e = this.frames.get(sheetKey * FRAME_SPAN + frame)?.get(colour);
    if (!e) return undefined;
    this.touch(e);
    return e.sprite;
  }

  /**
   * Reserves a slot for (sheet, frame, colour) and queues its tint (`step` makes it); `colour` is 0xrrggbb. True when
   * the frame is queued or there already; false when there is no room this frame (atlas full of frames drawn this
   * frame or the one before, the set manager refused a page, the frame is bigger than a page, or the sheet failed).
   */
  request(sheetKey: number, frame: number, colour: number, base: Decoded, mask: Decoded, rect: TintFrameRect): boolean {
    if (this.failedSheets.has(sheetKey)) return false;
    const key = sheetKey * FRAME_SPAN + frame;
    let byColour = this.frames.get(key);
    const had = byColour?.get(colour);
    if (had) { this.touch(had); return true; }
    if (rect.w > TINT_PAGE_PX || rect.h > TINT_PAGE_PX || rect.w <= 0 || rect.h <= 0) return false;
    let at: Place | null;
    try {
      at = this.alloc(rect.w, rect.h);
    } catch (err) {
      this.fail(sheetKey, colour, err);
      return false;
    }
    if (!at) return false;
    const e: Entry = {
      key, colour, sheetKey, page: at.page, shelf: at.shelf, x: at.x, slotW: at.slotW, rect, base, mask,
      sprite: undefined, gone: false, used: this.tick, prev: null, next: null,
    };
    if (!byColour) this.frames.set(key, (byColour = new Map()));
    byColour.set(colour, e);
    let s = this.bySheet.get(sheetKey);
    if (!s) this.bySheet.set(sheetKey, (s = new Set()));
    s.add(e);
    at.page.entries.add(e);
    at.shelf.count++;
    this.touch(e);
    this.queue.push(e);
    return true;
  }

  /**
   * Tints queued frames while this frame's tint time is under `budgetMs` (counted across calls since `beginFrame`),
   * and at least one a frame.
   */
  step(budgetMs: number): void {
    while (this.qHead < this.queue.length && (!this.ranOne || this.spent < budgetMs)) {
      const e = this.queue[this.qHead++] as Entry;
      if (e.gone) continue;
      const t0 = this.now();
      try {
        const { w, h } = e.rect;
        const s = this.scratch;
        if (!s || s.width < w || s.height < h) {
          if (s) s.width = s.height = 0;
          this.scratch = null;
          this.scratch = this.make(Math.max(w, s?.width ?? 0), Math.max(h, s?.height ?? 0));
        }
        tintRect(e.base as Decoded, e.mask as Decoded, e.rect, rgbOf(e.colour), e.page.canvas, e.x, e.shelf.y, this.scratch as CanvasLike);
        e.sprite = {
          image: e.page.canvas as unknown as CanvasImageSource, sx: e.x, sy: e.shelf.y, w, h,
          ox: e.rect.ox ?? 0, oy: e.rect.oy ?? 0, scale: e.rect.scale ?? 1,
        };
        e.base = e.mask = null;
      } catch (err) {
        this.fail(e.sheetKey, e.colour, err);
      }
      this.ranOne = true;
      this.spent += this.now() - t0;
    }
    if (this.qHead >= this.queue.length) { this.queue = []; this.qHead = 0; }
  }

  /** Frees every frame of a sheet (its set was freed or decoded again); pages left empty are freed. */
  drop(sheetKey: number): void {
    const s = this.bySheet.get(sheetKey);
    if (!s) return;
    for (const e of [...s]) this.evict(e);
    this.bySheet.delete(sheetKey);
  }

  /** Frees frames not drawn for more than `keepFrames` frames; pages left empty are freed. */
  sweep(keepFrames: number): void {
    while (this.head && this.head.used < this.tick - keepFrames) this.evict(this.head);
  }

  /** The set manager's reclaimer: whole pages not drawn this frame, least recently used first, until `needBytes`. */
  reclaim(needBytes: number): number {
    let freed = 0;
    const idle = this.pageList.filter((p) => p.used < this.tick).sort((a, b) => a.used - b.used);
    for (const p of idle) {
      if (freed >= needBytes) break;
      freed += p.bytes;
      for (const e of [...p.entries]) this.evict(e);
      if (this.pageList.includes(p)) this.freePage(p);
    }
    return freed;
  }

  /** Bytes of the pages made (what the set manager holds for the atlas). */
  bytes(): number {
    return this.total;
  }

  pages(): number {
    return this.pageList.length;
  }

  /** Whether tinting this sheet failed (it is refused from then on). */
  failed(sheetKey: number): boolean {
    return this.failedSheets.has(sheetKey);
  }

  /** Frees every page and the scratch canvas. The atlas stays usable. */
  dispose(): void {
    while (this.head) this.evict(this.head);
    for (const p of [...this.pageList]) this.freePage(p);
    if (this.scratch) this.scratch.width = this.scratch.height = 0;
    this.scratch = null;
    this.queue = [];
    this.qHead = 0;
  }

  private touch(e: Entry): void {
    e.used = this.tick;
    if (e.page.used < this.tick) e.page.used = this.tick;
    if (this.tail === e) return;
    this.unlink(e);
    e.prev = this.tail;
    if (this.tail) this.tail.next = e;
    this.tail = e;
    if (!this.head) this.head = e;
  }

  private unlink(e: Entry): void {
    if (e.prev) e.prev.next = e.next;
    else if (this.head === e) this.head = e.next;
    if (e.next) e.next.prev = e.prev;
    else if (this.tail === e) this.tail = e.prev;
    e.prev = e.next = null;
  }

  private evict(e: Entry): void {
    if (e.gone) return;
    e.gone = true;
    e.base = e.mask = null;
    this.unlink(e);
    const byColour = this.frames.get(e.key);
    if (byColour) {
      byColour.delete(e.colour);
      if (!byColour.size) this.frames.delete(e.key);
    }
    this.bySheet.get(e.sheetKey)?.delete(e);
    const { page, shelf } = e;
    page.entries.delete(e);
    if (--shelf.count === 0) { shelf.x = 0; shelf.free = []; }
    else shelf.free.push({ x: e.x, w: e.slotW });
    if (!page.entries.size) this.freePage(page);
  }

  private freePage(p: Page): void {
    const i = this.pageList.indexOf(p);
    if (i < 0) return;
    this.pageList.splice(i, 1);
    this.total -= p.bytes;
    // Zero the size first: browsers free a canvas's pixels only once it is 0 x 0 or collected.
    p.canvas.width = p.canvas.height = 0;
    this.sets.hold(TINT_HOLD_PREFIX + p.id, 0);
  }

  /** A slot for a w × h frame, evicting least recently used frames (not drawn this frame or the one before) as needed. */
  private alloc(w: number, h: number): Place | null {
    for (;;) {
      const at = this.fit(w, h) ?? this.newPage(w, h);
      if (at) return at;
      const lru = this.head;
      if (!lru || lru.used >= this.tick - KEEP_RECENT) return null;
      this.evict(lru);
    }
  }

  /** In a page made already: a freed slot or a shelf's end about the frame's height, else a new shelf, else any fit. */
  private fit(w: number, h: number): Place | null {
    const slack = Math.max(SHELF_SLACK, h >> 2);
    for (let tight = 1; tight >= 0; tight--) {
      for (const page of this.pageList) {
        if (h > page.h) continue;
        for (const shelf of page.shelves) {
          if (shelf.h < h || (tight && shelf.h > h + slack)) continue;
          const free = shelf.free;
          for (let i = 0; i < free.length; i++) {
            const slot = free[i] as { x: number; w: number };
            if (slot.w < w) continue;
            free.splice(i, 1);
            // Keep the rest of a wide slot for another frame.
            if (slot.w - w >= SHELF_SLACK) { free.push({ x: slot.x + w, w: slot.w - w }); return { page, shelf, x: slot.x, slotW: w }; }
            return { page, shelf, x: slot.x, slotW: slot.w };
          }
          if (shelf.x + w <= page.w) {
            const x = shelf.x;
            shelf.x += w;
            return { page, shelf, x, slotW: w };
          }
        }
        if (tight && page.nextY + h <= page.h) {
          const shelf: Shelf = { y: page.nextY, h, x: w, free: [], count: 0 };
          page.nextY += h;
          page.shelves.push(shelf);
          return { page, shelf, x: 0, slotW: w };
        }
      }
    }
    return null;
  }

  /** A new page for a w × h frame (as tall as the frame if taller than a page row band), within the caps and admitted. */
  private newPage(w: number, h: number): Place | null {
    const ph = Math.max(TINT_PAGE_ROWS, h);
    const bytes = TINT_PAGE_PX * ph * 4;
    if (this.pageList.length >= TINT_ATLAS_MAX_PAGES || this.total + bytes > TINT_ATLAS_MAX_BYTES) return null;
    let id = 0;
    while (this.pageList.some((p) => p.id === id)) id++;
    const hold = TINT_HOLD_PREFIX + id;
    if (!this.sets.admit(hold, bytes)) return null;
    let canvas: CanvasLike;
    try {
      canvas = this.make(TINT_PAGE_PX, ph);
    } catch (err) {
      this.sets.hold(hold, 0);
      throw err;
    }
    const shelf: Shelf = { y: 0, h, x: w, free: [], count: 0 };
    const page: Page = { id, canvas, w: TINT_PAGE_PX, h: ph, bytes, shelves: [shelf], nextY: h, entries: new Set(), used: this.tick };
    this.pageList.push(page);
    this.total += bytes;
    return { page, shelf, x: 0, slotW: w };
  }

  /** Tinting this sheet failed: its frames are freed and it is refused from now on, reported once. */
  private fail(sheetKey: number, colour: number, err: unknown): void {
    if (this.failedSheets.has(sheetKey)) return;
    this.failedSheets.add(sheetKey);
    this.drop(sheetKey);
    this.opts.onError?.(sheetKey, colour, err);
  }
}
