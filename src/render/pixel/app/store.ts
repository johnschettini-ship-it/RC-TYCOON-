/** Phase 8b stage 0b test (never merged): the picture store (pack indexes, sheet decode queue, palette swaps, budget). */
import type { Sprite } from '../../spriteCache';
import { decodeIndex, swapPalette, swapTableIndex, type PackIndex } from './format';

/** One pack of `virtual:tc-art`: its index URL (relative to the page) and hash. */
export interface PackRef {
  name: string;
  url: string;
  hash: string;
}

/** What the store needs from the outside world (the browser, or a test fake). */
export interface StoreIo {
  fetch(url: string): Promise<Uint8Array>;
  decode(png: Uint8Array): Promise<{ image: CanvasImageSource; close(): void }>;
  now(): number;
}

/** Decode options: slot colours stay exact (Review Focus 2). */
export const DECODE_OPTIONS: ImageBitmapOptions = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };

/** The browser io: `fetch`, `createImageBitmap` with `DECODE_OPTIONS`, `performance.now`. */
export function browserIo(): StoreIo {
  return {
    async fetch(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async decode(png) {
      const bmp = await createImageBitmap(new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }), DECODE_OPTIONS);
      return { image: bmp, close: () => bmp.close() };
    },
    now: () => performance.now(),
  };
}

/** Decodes running at once. */
export const MAX_IN_FLIGHT = 4;
/** Image pixels per world pixel of every picture (`ART_SCALE`). */
const PICTURE_SCALE = 0.5;
/** The pack that only the full ride frame set reads, and the one only the coarse set reads. */
const RIDES_FULL = 'rides-full';
const RIDES_COARSE = 'rides-coarse';
/** Entries per pack in a lookup value (`pack × ENTRY_SPAN + entry`). */
const ENTRY_SPAN = 1 << 24;

const QUEUED = 0;
const LOADING = 1;
const READY = 2;
const FAILED = 3;

interface LoadedPack {
  name: string;
  /** Folder URL of the sheets (ends with `/`). */
  dir: string;
  ix: PackIndex;
}

/** A plain sheet or one swap of it. */
interface SheetState {
  id: number;
  pack: number;
  sheet: number;
  /** Swap table index, −1 for the plain sheet. */
  table: number;
  status: number;
  image: CanvasImageSource | null;
  close: (() => void) | null;
  bytes: number;
  lastUsed: number;
  /** Sprites by entry index (made once, so a frame allocates nothing). */
  sprites: Map<number, Sprite>;
  /** Failed fetches or decodes so far (a sheet is tried twice, fix round 1 M3). */
  tries: number;
}

/** One finished decode (`window.__predrawnStats.decodeMs`). */
export interface DecodeRecord {
  file: string;
  w: number;
  h: number;
  ms: number;
}

/**
 * Pack indexes and their decoded sheets. `get` returns a picture of a decoded sheet (or of its palette swap); a
 * missing sheet is queued (at most `MAX_IN_FLIGHT` decodes at once) and counted in `missing`. `endFrame` evicts the
 * least recently used sheets not used in this frame or the frame before while the decoded bytes and the other bytes
 * are over the budget.
 */
export class PictureStore {
  private packs: LoadedPack[] = [];
  /** Kind → key → `pack × ENTRY_SPAN + entry`. */
  private lookup = new Map<number, Map<number, number>>();
  private states = new Map<number, SheetState>();
  /** The sheet state of each picture handed out (`keep`, fix round 1 I3). */
  private owner = new WeakMap<Sprite, SheetState>();
  private queue: SheetState[] = [];
  private inFlight = 0;
  private frame = 0;
  private sheetB = 0;
  private swapB = 0;
  private queuedN = 0;
  private decodedN = 0;
  private missingN = 0;
  private failedN = 0;
  /** Slowest main-thread palette swap (ms). */
  swapMainMsMax = 0;
  /** Called after each decode (stats). */
  onDecode: ((r: DecodeRecord) => void) | null = null;
  /** Called when a sheet cannot be fetched or decoded. */
  onError: ((file: string, err: unknown) => void) | null = null;
  /** Keys asked for that no index holds (debugging; kind × 2^48 would overflow, so pairs). */
  readonly unknown: Array<[number, number]> = [];

  constructor(
    private readonly io: StoreIo,
    public budgetBytes: number,
  ) {}

  /** Load the pack indexes: `rides-coarse` with `coarse`, else `rides-full`; every other pack always. */
  async load(packs: readonly PackRef[], coarse: boolean): Promise<void> {
    const wanted = packs.filter((p) => (p.name === RIDES_FULL ? !coarse : p.name === RIDES_COARSE ? coarse : true));
    const loaded = await Promise.all(
      wanted.map(async (p) => ({ name: p.name, dir: p.url.slice(0, p.url.lastIndexOf('/') + 1), ix: decodeIndex(await this.io.fetch(p.url)) })),
    );
    this.packs = loaded;
    this.lookup.clear();
    loaded.forEach((p, pi) => {
      const ix = p.ix;
      for (let e = 0; e < ix.kind.length; e++) {
        const kind = ix.kind[e] as number;
        let m = this.lookup.get(kind);
        if (!m) this.lookup.set(kind, (m = new Map()));
        m.set(ix.key[e] as number, pi * ENTRY_SPAN + e);
      }
    });
  }

  /** The loaded packs (name, sheet folder, index). */
  get loaded(): readonly LoadedPack[] {
    return this.packs;
  }

  get sheetBytes(): number {
    return this.sheetB;
  }
  get swapBytes(): number {
    return this.swapB;
  }
  /** Decoded bytes held now (plain sheets and swaps). */
  get totalBytes(): number {
    return this.sheetB + this.swapB;
  }
  /** Sheet decodes asked for since the start (plain and swaps). */
  get queued(): number {
    return this.queuedN;
  }
  /** Sheet decodes finished since the start. */
  get decoded(): number {
    return this.decodedN;
  }
  /** Pictures asked for in this frame that were not there. */
  get missing(): number {
    return this.missingN;
  }
  /** Sheets that failed to fetch or decode. */
  get failed(): number {
    return this.failedN;
  }
  /** Decoded images held now. */
  get images(): number {
    let n = 0;
    for (const s of this.states.values()) if (s.status === READY) n++;
    return n;
  }

  beginFrame(): void {
    this.frame++;
    this.missingN = 0;
  }

  /**
   * The picture `key` of `kind`; `swap` −1 for the plain sheet, else a track colour 0 to 11 (rails, supports, cars)
   * or 0 / 1 (ghost valid, invalid). Null while its sheet decodes (then queued and counted in `missing`).
   */
  get(kind: number, key: number, swap: number): Sprite | null {
    const loc = this.lookup.get(kind)?.get(key);
    if (loc === undefined) {
      this.missingN++;
      if (this.unknown.length < 64) this.unknown.push([kind, key]);
      return null;
    }
    const pi = Math.floor(loc / ENTRY_SPAN);
    const e = loc - pi * ENTRY_SPAN;
    const p = this.packs[pi] as LoadedPack;
    const ix = p.ix;
    const sheet = ix.sheet[e] as number;
    const sh = ix.sheets[sheet];
    if (!sh) {
      this.missingN++;
      return null;
    }
    const table = swap < 0 ? -1 : swapTableIndex(sh.swappable, swap);
    const id = (pi * 65536 + sheet) * 64 + table + 1;
    let st = this.states.get(id);
    if (!st) {
      st = { id, pack: pi, sheet, table, status: QUEUED, image: null, close: null, bytes: 0, lastUsed: this.frame, sprites: new Map(), tries: 0 };
      this.states.set(id, st);
      this.queue.push(st);
      this.queuedN++;
      this.pump();
    }
    st.lastUsed = this.frame;
    if (st.status !== READY || !st.image) {
      this.missingN++;
      return null;
    }
    let sp = st.sprites.get(e);
    if (!sp) {
      sp = { image: st.image, w: ix.w[e] as number, h: ix.h[e] as number, ox: ix.ox[e] as number, oy: ix.oy[e] as number, scale: PICTURE_SCALE, sx: ix.x[e] as number, sy: ix.y[e] as number };
      st.sprites.set(e, sp);
      this.owner.set(sp, st);
    }
    return sp;
  }

  /**
   * A kept-last picture (keep-last branches, Test decision 11): marks its sheet used in this frame and returns it while
   * the sheet is still decoded; null when the sheet was evicted (its image may be closed) or `sp` is not the store's.
   */
  keep(sp: Sprite | null): Sprite | null {
    if (!sp) return null;
    const st = this.owner.get(sp);
    if (!st || st.status !== READY || this.states.get(st.id) !== st) return null;
    st.lastUsed = this.frame;
    return sp;
  }

  /** Count a picture the caller could not even ask for (no key, unknown colour) as missing (fix round 1 M2). */
  noteMissing(): void {
    this.missingN++;
  }

  /** Evict while over the budget: the least recently used sheets not used in this frame or the frame before. */
  endFrame(otherBytes: number): void {
    while (this.sheetB + this.swapB + otherBytes > this.budgetBytes) {
      let victim: SheetState | null = null;
      for (const s of this.states.values()) {
        if (s.status !== READY || s.lastUsed >= this.frame - 1) continue;
        if (!victim || s.lastUsed < victim.lastUsed) victim = s;
      }
      if (!victim) return;
      this.drop(victim);
    }
  }

  private drop(s: SheetState): void {
    s.close?.();
    if (s.table < 0) this.sheetB -= s.bytes;
    else this.swapB -= s.bytes;
    this.states.delete(s.id);
  }

  private pump(): void {
    while (this.inFlight < MAX_IN_FLIGHT && this.queue.length > 0) {
      const st = this.queue.shift() as SheetState;
      if (this.states.get(st.id) !== st) continue;
      st.status = LOADING;
      this.inFlight++;
      void this.decodeOne(st).finally(() => {
        this.inFlight--;
        this.pump();
      });
    }
  }

  private async decodeOne(st: SheetState): Promise<void> {
    const p = this.packs[st.pack] as LoadedPack;
    const sh = p.ix.sheets[st.sheet] as { file: string; w: number; h: number };
    try {
      let png = await this.io.fetch(p.dir + sh.file);
      if (st.table >= 0) {
        // The main-thread part of a swap: a new PLTE (Review Focus 5: a swap is its own decode and its own bytes).
        const t0 = this.io.now();
        png = swapPalette(png, p.ix.swaps[st.table] as Uint8Array, p.ix.palette);
        const ms = this.io.now() - t0;
        if (ms > this.swapMainMsMax) this.swapMainMsMax = ms;
      }
      const t0 = this.io.now();
      const img = await this.io.decode(png);
      const ms = this.io.now() - t0;
      if (this.states.get(st.id) !== st) {
        img.close();
        return;
      }
      st.image = img.image;
      st.close = img.close;
      st.status = READY;
      st.bytes = sh.w * sh.h * 4;
      if (st.table < 0) this.sheetB += st.bytes;
      else this.swapB += st.bytes;
      this.decodedN++;
      this.onDecode?.({ file: sh.file, w: sh.w, h: sh.h, ms });
    } catch (err) {
      if (this.states.get(st.id) !== st) return;
      st.tries++;
      if (st.tries < 2) {
        // Fix round 1 M3: one retry; the sheet goes to the back of the queue.
        st.status = QUEUED;
        this.queue.push(st);
        return;
      }
      st.status = FAILED;
      this.failedN++;
      this.onError?.(sh.file, err);
    }
  }
}
