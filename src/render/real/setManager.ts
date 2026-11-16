/**
 * Decides which realistic-art sets are decoded in memory.
 *
 * Lessons from phone tests that shape this class:
 * 1. Decoding runs off the main thread (createImageBitmap behind `SetIO.decode`) and never blocks
 *    drawing: `use` only ever returns a set that is already ready.
 * 2. Compressed blobs are kept once read, so a turn never waits on a download.
 * 3. During a turn the old sets still count until they are freed, so a new decode only starts
 *    when the old sets plus everything in flight plus the new set fit the budget.
 * 4. Memory made outside the manager from ready sets (tint-atlas pages, ground chunks) is in the same
 *    budget: it is admitted before it is made (`admit`), counted while held (`hold`), and given back
 *    under pressure by the holders' reclaimers (`addReclaimer`), a ladder step before density drops.
 *
 * 5. Ride colours (flat ride colours Task 5): a ride set's masks are never decoded for its Original set (nor counted
 *    in its estimate). A coloured key (`setKey(..., colour)`, not in the index) is a set of its own made from the
 *    Original entry's files: its sheets are decoded, then each is tinted whole with its mask (`tintSheetShaded`), band
 *    by band within `TINT_FRAME_MS` a frame at `endFrame`, one coloured set at a time; only the tinted copy is kept and
 *    the base and mask are closed. Its decode is admitted at its peak (sheets + one mask + one tinted copy + the band
 *    scratch), so the peak never passes the budget, and once ready it costs what its Original set costs. While it
 *    tints, `interim` gives its pictures so far (the Original colours) to draw; a failed tint keeps them as the set
 *    (`tintFailed`, reported to `onError`).
 *
 * Protocol per frame: `beginFrame(n)`, then `want(...)` for every set the frame needs (wants do
 * not carry over to the next frame), `use(...)` for every set drawn, then `endFrame()`.
 */
import { colourOfKey, setKey, withColour, type RealIndex, type RealSetEntry, type SetKey } from './indexFormat';
import { TRACK_PALETTE } from '../track/colours';
import { hexRgb, TINT_FRAME_MS, tintSheetShaded, type CanvasLike, type TintJob } from './tint';

export interface Decoded { image: CanvasImageSource; bytes: number; close(): void }
export interface SetIO { read(file: string): Promise<Blob>; decode(blob: Blob): Promise<Decoded> }
export type SetState = 'none' | 'loading' | 'ready' | 'failed';
/**
 * A decoded set. A ride set lists only its picture sheets (its masks are not part of it). `tintFailed`: a coloured set
 * whose tint failed, drawn in its Original colours (the look lists it in `fallbacksUsed`).
 */
export type ReadySet = RealSetEntry & { images: CanvasImageSource[]; tintFailed?: boolean };

/** Rows of a sheet a coloured set's tint does per step (a 1604 px wide sheet: about 0.2 MiB a band). */
export const TINT_BAND_PX = 32;
/** A coloured set's tint runs one band regardless after this many frames without one (no starvation). */
export const TINT_FORCE_FRAMES = 8;
/** The least a band is estimated (and counted) to take, ms: a coarse clock measures bands as 0. */
const BAND_MS_FLOOR = 0.25;
/** The band time estimate shrinks by this on each frame no band runs (a slow band is not remembered for ever). */
const BAND_MS_DECAY = 0.75;

export interface SetManagerOptions {
  /** Canvas factory for coloured sets' tinted sheets and band scratch. Default: `OffscreenCanvas`, else a DOM canvas. */
  makeCanvas?: (w: number, h: number) => CanvasLike;
  /** Clock for the per-frame tint budget, ms (default `performance.now`). */
  now?: () => number;
  /** Rows per tint step (default `TINT_BAND_PX`). */
  tintBandPx?: number;
  /**
   * Ms the tint atlas has spent tinting this frame (`RealLook.tintSpentMs`): one `TINT_FRAME_MS` budget a frame is
   * shared, and a coloured set's band runs in what is left (one band at least only when nothing else ran). Can also be
   * set later with `shareTintBudget`.
   */
  tintSpentMs?: () => number;
  /**
   * Copies a finished tinted canvas to an ImageBitmap (default `createImageBitmap` where it exists; null keeps the
   * canvas).
   */
  toBitmap?: ((img: CanvasImageSource) => Promise<ImageBitmap>) | null;
}

function defaultCanvas(w: number, h: number): CanvasLike {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h) as unknown as CanvasLike;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c as unknown as CanvasLike;
}

/**
 * A ride set's picture sheets without their masks (the files other sheets name as `mask`), each without its `mask`
 * field; other kinds unchanged (track and guest masks tint frame by frame in the tint atlas, so they stay decoded).
 */
function pictureSheets(e: RealSetEntry): RealSetEntry['sheets'] {
  if (e.kind !== 'ride') return e.sheets;
  const masks = new Set(e.sheets.flatMap((s) => (s.mask === undefined ? [] : [s.mask])));
  return e.sheets.filter((s) => !masks.has(s.file)).map(({ file, w, h }) => ({ file, w, h }));
}
export interface CapEvent { frame: number; capped: boolean; pressureBytes: number }
/** Frees held memory nobody drew this frame, oldest first, until about `needBytes` are freed; returns the bytes freed. */
export type Reclaimer = (needBytes: number) => number;

/** The set manager's state at one moment, for a bench row when a wait times out (R1). */
export interface SetSnapshot {
  frame: number;
  /** The decode the queue would start next, or null when the queue is empty. */
  queueHead: { key: SetKey; estimate: number; priority: Priority } | null;
  queued: number;
  inFlight: SetKey[];
  committed: number;
  pressure: number;
  resident: number;
  /** Bytes the frame asked to make (`admit`) and was refused for want of room. */
  refused: number;
  /** Held bytes by holder id (`ground`, `classic`, `tint:<page>` for a tint-atlas page). */
  held: Record<string, number>;
  /** Resident bytes by owner: decoded sets, tint-atlas pages, ground chunks, today's picture caches. */
  split: MemorySplit;
  capped: boolean;
  demoted: SetKey[];
}

/** Resident bytes by owner. */
export interface MemorySplit { sets: number; tints: number; ground: number; classic: number }

/** The holder id the ground uses. */
export const GROUND_HOLD = 'ground';
/**
 * The holder id of today's picture caches (terrain chunks, static layer, today's sprites), held by the renderer every
 * frame so the ladder sees all picture memory (spec §5.4 item 4). Since the owner decision of 2026-11-15 it grows only
 * through `admit`: the static layer counts at the canvas size from the first frame (admitted before it is made), and
 * today's sprites and chunks are admitted before they are made (src/render/canvas.ts classicGate). Every holder id
 * other than these two is a tint-atlas page (`tint:<page>`, `tint:scratch`).
 */
export const CLASSIC_HOLD = 'classic';

/**
 * The reserve the game keeps inside its 128 MiB budget for holds that grow without asking: `tint:scratch` (the tint
 * scratch canvas, at most about one tall frame), and `classic` where the renderer has no `admit` to call (tests).
 * Decodes and admits fill to the budget less this, so a frame's growth of those holds stays under the budget (final
 * review I1: they had pushed resident memory to 127.7–127.9 MiB headless and could cross 128). 2 MiB: the scratch
 * canvas grew by well under 1 MiB a frame in the Task 3 and 4b bench runs. `classic` itself no longer grows unasked
 * (owner decision 2026-11-15): the static layer (about 5 MiB on a phone, more than this reserve: it was the late jump
 * past it in the batch 1 `rides` scene) is counted at the canvas size from the first frame, and today's sprites are
 * admitted before they are made.
 */
export const HOLD_RESERVE_BYTES = 2 * 1024 * 1024;

export type Priority = 'now' | 'ahead';

const MAX_IN_FLIGHT = 2;
const NEVER = Number.NEGATIVE_INFINITY;
/** Cap and demotions lift once the density-4 estimate stays under this share of the budget... */
const ROOM_SHARE = 0.75;
/** ...for this many consecutive frames. */
const ROOM_FRAMES = 60;

interface Rec {
  /** As the set is served: a ride set without its masks, a coloured set under its own key. */
  entry: RealSetEntry;
  /** Each picture sheet's mask file (coloured sets only). */
  masks: (string | undefined)[];
  /** A coloured set's colour (`TRACK_PALETTE` index), null for an index set. */
  colour: number | null;
  /** Density-4 counterpart of a density-2 set, if the index has one. */
  up: Rec | null;
  /** Decoded size predicted from the index (w*h*4 per picture sheet): what the set holds once ready. */
  estimate: number;
  /**
   * What its load holds at its peak, admitted before it starts: `estimate`, plus for a coloured set one mask, one
   * tinted copy and the band scratch (the tint replaces one sheet at a time).
   */
  load: number;
  /** A coloured set's pictures so far while it tints (Original colours until each sheet's tint lands), else null. */
  interim: ReadySet | null;
  /** A coloured set's mask and tint job while one sheet tints. */
  extra: { mask: Decoded | null; job: TintJob | null; jobBytes: number };
  state: SetState;
  /** Queued or decoding; only meaningful while state is 'loading'. */
  inFlight: boolean;
  /** In flight but no longer wanted: its images are closed as soon as they land. */
  cancelled: boolean;
  decoded: Decoded[];
  /** Sum of Decoded.bytes held right now (partial while decoding). */
  bytes: number;
  ready: ReadySet | null;
  wantFrame: number;
  wantPri: Priority;
  lastUsed: number;
  readyFrame: number;
}

export class SetManager {
  private readonly recs = new Map<SetKey, Rec>();
  private readonly blobs = new Map<string, Promise<Blob>>();
  private readonly queue: Rec[] = [];
  private readonly unknownReported = new Set<SetKey>();
  private frame = 0;
  private inFlight = 0;
  private peak = 0;
  private capped = false;
  /** Density-4 sets freed for budget (ladder step 2); wants for them are ignored until there is room. */
  private readonly demoted = new Set<SetKey>();
  private roomFrames = 0;
  private readonly events: CapEvent[] = [];
  /** Bytes the caller made from ready sets (tint-atlas pages, ground chunks), by holder id. */
  private readonly held = new Map<string, number>();
  private heldTotal = 0;
  /** The same holds at density 4 (what they would grow to if the cap lifted), by holder id. */
  private readonly heldUp = new Map<string, number>();
  private heldUpTotal = 0;
  /** Bytes refused by `admit` this frame, by holder id (once each): demand the ladder must make room for. */
  private readonly refusedById = new Map<string, number>();
  private refused = 0;
  private readonly reclaimers: Reclaimer[] = [];
  private readonly tooBigReported = new Set<SetKey>();
  /** Bytes of the compressed blobs read so far (kept once read, never evicted). */
  private blobTotal = 0;
  /** Room for a new decode when the last `endFrame` ended (after its ladder and pump): see `starved`. */
  private lastRoom = Number.POSITIVE_INFINITY;
  /** The coloured set loading (one at a time), and the sheet tint `endFrame` steps for it. */
  private tinting: Rec | null = null;
  private tintRun: { job: TintJob; done: () => void } | null = null;
  private readonly makeCanvas: (w: number, h: number) => CanvasLike;
  private readonly now: () => number;
  private readonly bandPx: number;
  private tintSpent: () => number;
  /** How long the last tint band took, ms: the estimate for whether the next one fits the frame's budget. */
  private bandMs = 0;
  /** Frames (`endFrame`s with a tint in progress) since a band last ran. */
  private framesSinceBand = 0;
  private readonly makeBitmap: ((img: CanvasImageSource) => Promise<ImageBitmap>) | null;

  /**
   * What decodes, admits and the ladder work against: the budget less the reserve for memory held without asking
   * (`classic`, `tint:scratch`), so that growth lands inside the budget instead of above it (final review I1).
   */
  private readonly limit: number;

  /**
   * `budgetBytes` is the whole budget resident memory must stay under. `reserveBytes` of it is kept free of decodes and
   * admitted holds for the holds that grow without `admit` (`classic`, recorded after the frame, and `tint:scratch`):
   * see `HOLD_RESERVE_BYTES`.
   */
  constructor(
    index: RealIndex,
    private readonly io: SetIO,
    budgetBytes: number,
    private readonly onError: (key: SetKey, err: unknown) => void,
    reserveBytes = 0,
    opts: SetManagerOptions = {},
  ) {
    this.limit = budgetBytes - reserveBytes;
    this.makeCanvas = opts.makeCanvas ?? defaultCanvas;
    this.now = opts.now ?? (() => performance.now());
    this.bandPx = opts.tintBandPx ?? TINT_BAND_PX;
    this.tintSpent = opts.tintSpentMs ?? (() => 0);
    this.makeBitmap = opts.toBitmap !== undefined ? opts.toBitmap
      : typeof createImageBitmap === 'function' ? (img) => createImageBitmap(img as ImageBitmapSource) : null;
    for (const src of index.sets) {
      this.indexEntries.set(src.key, src);
      const sheets = pictureSheets(src);
      this.recs.set(src.key, this.newRec(sheets === src.sheets ? src : { ...src, sheets }, [], null));
    }
    for (const r of this.recs.values()) {
      const e = r.entry;
      if (e.density === 2) r.up = this.recs.get(setKey(e.kind, e.item, 4, e.rot)) ?? null;
    }
  }

  /** The index's entries as listed (masks included), by key: what `preloadAll` reads and coloured sets start from. */
  private readonly indexEntries = new Map<SetKey, RealSetEntry>();

  private newRec(entry: RealSetEntry, masks: (string | undefined)[], colour: number | null): Rec {
    const estimate = entry.sheets.reduce((n, s) => n + s.w * s.h * 4, 0);
    let load = estimate;
    if (colour !== null) {
      // Peak while one sheet tints: every sheet, its mask, its tinted copy and the band scratch.
      let most = 0;
      for (const s of entry.sheets) most = Math.max(most, 2 * s.w * s.h * 4 + s.w * Math.min(this.bandPx, s.h) * 4);
      load += most;
    }
    return {
      entry, masks, colour, up: null, estimate, load, interim: null, extra: { mask: null, job: null, jobBytes: 0 },
      state: 'none', inFlight: false, cancelled: false, decoded: [], bytes: 0, ready: null,
      wantFrame: NEVER, wantPri: 'ahead', lastUsed: NEVER, readyFrame: NEVER,
    };
  }

  /**
   * The record for `key`: an index set, or a coloured ride set made on first ask from its Original entry (a ride set
   * with a base colour and masks, and a `TRACK_PALETTE` colour); undefined for anything else.
   */
  private rec(key: SetKey, make = true): Rec | undefined {
    const r = this.recs.get(key);
    if (r || !make) return r;
    const c = colourOfKey(key);
    if (!c || TRACK_PALETTE[c.colour] === undefined) return undefined;
    const src = this.indexEntries.get(c.base);
    if (!src || src.kind !== 'ride' || !src.baseColour) return undefined;
    const sheets = pictureSheets(src);
    const masks = sheets.map((p) => src.sheets.find((s) => s.file === p.file)?.mask);
    if (!masks.some((m) => m !== undefined)) return undefined;
    const made = this.newRec({ ...src, key, sheets }, masks, c.colour);
    this.recs.set(key, made);
    if (src.density === 2) made.up = this.rec(withColour(setKey(src.kind, src.item, 4, src.rot), c.colour)) ?? null;
    else {
      const down = this.recs.get(withColour(setKey(src.kind, src.item, 2, src.rot), c.colour));
      if (down) down.up = made;
    }
    return made;
  }

  /** Shares the per-frame tint budget with the tint atlas: `spentMs` is what it spent this frame (see the option). */
  shareTintBudget(spentMs: () => number): void {
    this.tintSpent = spentMs;
  }

  beginFrame(frame: number): void {
    this.frame = frame;
    this.refusedById.clear();
    this.refused = 0;
  }

  want(keys: SetKey[], priority: Priority): void {
    for (const key of keys) {
      const r = this.rec(key);
      if (!r) {
        if (!this.unknownReported.has(key)) {
          this.unknownReported.add(key);
          this.onError(key, new Error(`unknown set ${key}`));
        }
        continue;
      }
      if (r.state === 'failed') continue;
      if (this.capped && r.entry.density === 4) continue;
      if (this.demoted.has(key)) continue;
      if (r.load > this.limit) {
        // Can never fit, even alone: today's art draws it (state 'failed'), reported once.
        r.state = 'failed';
        if (!this.tooBigReported.has(key)) {
          this.tooBigReported.add(key);
          this.onError(key, new Error(`set ${key} needs ${r.load} bytes decoded, more than the ${this.limit} bytes the budget leaves for decodes`));
        }
        continue;
      }
      if (r.wantFrame !== this.frame) { r.wantFrame = this.frame; r.wantPri = priority; }
      else if (priority === 'now') r.wantPri = 'now';
      if (r.state === 'none') { r.state = 'loading'; this.queue.push(r); }
      else if (r.state === 'loading') r.cancelled = false;
    }
  }

  use(key: SetKey): ReadySet | null {
    const r = this.recs.get(key);
    if (!r || r.state !== 'ready') return null;
    r.lastUsed = this.frame;
    return r.ready;
  }

  /**
   * A coloured set still tinting: its pictures so far (the Original colours, each sheet swapped for its tinted copy
   * as it lands), marked used like `use`; null otherwise. Draw it counted as not ready (spec builder-check answer 1).
   */
  interim(key: SetKey): ReadySet | null {
    const r = this.recs.get(key);
    if (!r || r.state !== 'loading' || !r.interim || r.cancelled) return null;
    r.lastUsed = this.frame;
    return r.interim;
  }

  /** The ready set without marking it used (no protection from freeing): for a check, not a draw. */
  peek(key: SetKey): ReadySet | null {
    const r = this.recs.get(key);
    return r && r.state === 'ready' ? r.ready : null;
  }

  state(key: SetKey): SetState {
    return this.recs.get(key)?.state ?? 'none';
  }

  /**
   * True when `key` is queued and could not start at the last `endFrame` because it does not fit beside what is held,
   * decoded or in flight, after the whole ladder ran (spec §5.4.4's last step: the caller draws today's art for it
   * rather than nothing). A set that only waits its turn in the queue is not starved.
   */
  starved(key: SetKey): boolean {
    const r = this.recs.get(key);
    return !!r && r.state === 'loading' && !r.inFlight && r.load > this.lastRoom;
  }

  /**
   * Counts `bytes` made outside the set manager in the budget under `id`, replacing what `id` held before; 0 releases
   * it. Held bytes are resident, limit new decodes and add pressure. `upBytes` is what the same holding would take at
   * density 4 (default `bytes`): the cap lifts only when that fits too. Holders: RealLook's tint-atlas pages
   * (`tint:<page>`), RealGround's chunks (`ground`) and today's picture caches (`classic`, held by the renderer at what
   * it admitted) come through `admit` before they are made; the tint scratch canvas (`tint:scratch`) is held here
   * without asking, which is why decodes and admits leave `HOLD_RESERVE_BYTES` free.
   */
  hold(id: string, bytes: number, upBytes = bytes): void {
    this.heldTotal -= this.held.get(id) ?? 0;
    this.heldUpTotal -= this.heldUp.get(id) ?? 0;
    if (bytes > 0) {
      this.held.set(id, bytes);
      this.heldTotal += bytes;
      this.heldUp.set(id, upBytes);
      this.heldUpTotal += upBytes;
    } else {
      this.held.delete(id);
      this.heldUp.delete(id);
    }
    this.peak = Math.max(this.peak, this.residentBytes());
  }

  /**
   * Asks to raise `id`'s holding to `bytes` before making it. When it fits beside everything held, decoded or in
   * flight, it is held (as `hold`) and true is returned; otherwise nothing changes, the growth counts as pressure
   * this frame (so the ladder makes room) and false is returned: draw the object as not ready yet.
   */
  admit(id: string, bytes: number, upBytes = bytes): boolean {
    if (this.tryAdmit(id, bytes, upBytes)) return true;
    const grow = bytes - (this.held.get(id) ?? 0);
    const before = this.refusedById.get(id) ?? 0;
    if (grow > before) {
      this.refused += grow - before;
      this.refusedById.set(id, grow);
    }
    return false;
  }

  /**
   * `admit` without the refusal: when it does not fit nothing changes and nothing counts as pressure. For memory the
   * caller can do without (today's static layer) or will try to make room for itself first (today's sprites).
   */
  tryAdmit(id: string, bytes: number, upBytes = bytes): boolean {
    const now = this.held.get(id) ?? 0;
    if (bytes <= now || this.committed() - now + bytes <= this.limit) {
      this.hold(id, bytes, upBytes);
      return true;
    }
    return false;
  }

  /** A holder's reclaimer: called by the ladder, in the order added, before any density is lowered. */
  addReclaimer(fn: Reclaimer): void {
    this.reclaimers.push(fn);
  }

  /** Reads every sheet listed in the index into the compressed-blob store (spec §5.4 item 1: nothing downloads in play). */
  async preloadAll(onProgress?: (done: number, total: number, bytes: number) => void): Promise<{ files: number; bytes: number }> {
    const files = [...new Set([...this.indexEntries.values()].flatMap((e) => e.sheets.map((s) => s.file)))];
    let done = 0;
    let bytes = 0;
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < files.length) {
        const f = files[next++] as string;
        const b = await this.read(f);
        bytes += b.size;
        onProgress?.(++done, files.length, bytes);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
    return { files: files.length, bytes };
  }

  /**
   * Clears the density cap, the demotions and the room count, so a new park (the bench's next scene) starts from the
   * same state; frees no set. A lifted cap is recorded as a cap event.
   */
  resetPressure(): void {
    if (this.capped) {
      this.capped = false;
      this.events.push({ frame: this.frame, capped: false, pressureBytes: this.pressure() });
    }
    this.demoted.clear();
    this.roomFrames = 0;
  }

  /**
   * Frees every set except `keep` (the park closes for the title screen: realistic title Task 2), drawn this frame or
   * not; queued sets leave the queue, decodes in flight are freed as they land; then every reclaimer runs for all it
   * holds. Compressed blobs stay (nothing downloads again). The next frames' wants decode the park again.
   */
  releaseAll(keep: SetKey[] = []): void {
    for (const r of this.recs.values()) {
      if (keep.includes(r.entry.key)) continue;
      r.wantFrame = NEVER;
      r.lastUsed = NEVER;
      if (r.state === 'ready') this.free(r);
      else if (r.state === 'loading') {
        if (r.inFlight) r.cancelled = true;
        else { this.dequeue(r); r.state = 'none'; }
      }
    }
    for (const reclaim of this.reclaimers) {
      try {
        reclaim(Number.POSITIVE_INFINITY);
      } catch (err) {
        this.onError('reclaim', err);
      }
    }
  }

  /** Resident bytes by owner: decoded sets, tint-atlas pages, ground chunks, today's picture caches. */
  split(): MemorySplit {
    let sets = 0;
    for (const r of this.recs.values()) sets += r.bytes;
    const ground = this.held.get(GROUND_HOLD) ?? 0;
    const classic = this.held.get(CLASSIC_HOLD) ?? 0;
    return { sets, tints: this.heldTotal - ground - classic, ground, classic };
  }

  snapshot(): SetSnapshot {
    const head = this.nextToLoad(Number.POSITIVE_INFINITY);
    return {
      frame: this.frame,
      queueHead: head ? { key: head.entry.key, estimate: head.load, priority: head.wantPri } : null,
      queued: this.queue.length,
      inFlight: [...this.recs.values()].filter((r) => r.inFlight).map((r) => r.entry.key),
      committed: this.committed(),
      pressure: this.pressure(),
      resident: this.residentBytes(),
      refused: this.refused,
      held: Object.fromEntries(this.held),
      split: this.split(),
      capped: this.capped,
      demoted: [...this.demoted],
    };
  }

  residentBytes(): number {
    let n = this.heldTotal;
    for (const r of this.recs.values()) n += r.bytes;
    return n;
  }

  peakBytes(): number {
    return this.peak;
  }

  densityCap(): 2 | 4 {
    return this.capped ? 2 : 4;
  }

  /** True for a density-4 set freed for budget: want its density-2 set instead. */
  isDemoted(key: SetKey): boolean {
    return this.demoted.has(key);
  }

  /** Every change of densityCap(), for the bench to report a capped run. */
  capEvents(): CapEvent[] {
    return this.events.map((e) => ({ ...e }));
  }

  endFrame(): void {
    this.stepTint();
    for (const r of this.recs.values()) if (!this.wanted(r)) this.drop(r);

    if (this.pressure() > this.limit) {
      // 1. ahead sets first.
      for (const r of this.recs.values()) if (this.wanted(r) && r.wantPri === 'ahead') this.drop(r);
    }
    // 2. held memory not drawn this frame: ground chunks off screen, least recently used tint-atlas pages.
    for (const reclaim of this.reclaimers) {
      const over = this.pressure() - this.limit;
      if (over <= 0) break;
      try {
        reclaim(over);
      } catch (err) {
        this.onError('reclaim', err);
      }
    }
    if (this.pressure() > this.limit) {
      // 3. density-4 sets of objects outside the view: wanted but not drawn, and resident long
      //    enough that the caller had a frame to draw them.
      for (const r of this.recs.values()) {
        if (r.state === 'ready' && r.entry.density === 4 && r.readyFrame < this.frame - 1 && this.drop(r)) {
          this.demoted.add(r.entry.key);
          this.roomFrames = 0;
        }
      }
    }
    const pressure = this.pressure();
    if (pressure > this.limit && !this.capped) {
      this.capped = true; // 4. density 2 everywhere.
      this.roomFrames = 0;
      this.events.push({ frame: this.frame, capped: true, pressureBytes: pressure });
    } else if (this.capped || this.demoted.size) this.checkRoom();
    if (this.capped) for (const r of this.recs.values()) if (r.entry.density === 4) this.drop(r);

    this.pump();
    this.lastRoom = this.limit - this.committed();
  }

  /**
   * Hysteresis: lift the cap and demotions after ROOM_FRAMES frames with room at density 4, held memory counted at
   * its density-4 size, and nothing refused.
   */
  private checkRoom(): void {
    const up = this.pressure(true);
    this.roomFrames = up < ROOM_SHARE * this.limit && this.refused === 0 ? this.roomFrames + 1 : 0;
    if (this.roomFrames < ROOM_FRAMES) return;
    this.roomFrames = 0;
    this.demoted.clear();
    if (this.capped) {
      this.capped = false;
      this.events.push({ frame: this.frame, capped: false, pressureBytes: up });
    }
  }

  private wanted(r: Rec): boolean {
    return r.wantFrame === this.frame;
  }

  private isProtected(r: Rec): boolean {
    return r.lastUsed >= this.frame - 1;
  }

  /** Frees, dequeues or cancels a set, unless it was drawn this frame or the frame before. */
  private drop(r: Rec): boolean {
    if (this.isProtected(r)) return false;
    r.wantFrame = NEVER;
    if (r.state === 'ready') this.free(r);
    else if (r.state === 'loading') {
      if (r.inFlight) r.cancelled = true;
      else { this.dequeue(r); r.state = 'none'; }
    }
    return true;
  }

  private free(r: Rec): void {
    for (const d of r.decoded) d.close();
    this.closeExtra(r);
    r.decoded = [];
    r.bytes = 0;
    r.ready = null;
    r.interim = null;
    r.state = 'none';
  }

  /** Closes a coloured set's mask and tint job in progress, and takes their bytes off it. */
  private closeExtra(r: Rec): void {
    const { mask, job } = r.extra;
    if (mask) { mask.close(); r.bytes -= mask.bytes; }
    if (job) { r.bytes -= r.extra.jobBytes; job.close(); }
    r.extra = { mask: null, job: null, jobBytes: 0 };
  }

  /**
   * Steps the sheet tint in progress while this frame has spent less than `TINT_FRAME_MS` on it (one band at least);
   * a tint whose set is no longer wanted stops at once (its load then frees it).
   */
  private stepTint(): void {
    const run = this.tintRun;
    if (!run) return;
    const owner = this.tinting;
    let finished = !owner || owner.cancelled;
    // One tint budget a frame, shared with the tint atlas: the bands get what it left (`budget`), each run only when
    // its estimate (the last band's measured time, at least BAND_MS_FLOOR so a coarse clock measuring 0 still
    // counts) fits. The first band of a frame runs regardless when the atlas spent nothing, or when no band has run
    // for TINT_FORCE_FRAMES frames: an atlas busy every frame (LRU churn) or a remembered slow band can then delay a
    // tint but never stop it, at a cost of one band over budget every TINT_FORCE_FRAMES frames. A frame with no band
    // lowers the estimate (×BAND_MS_DECAY), so one slow band (a GC pause) is soon forgotten.
    const other = Math.max(0, this.tintSpent());
    const budget = TINT_FRAME_MS - other;
    this.framesSinceBand++;
    const force = !finished && (other === 0 || this.framesSinceBand >= TINT_FORCE_FRAMES);
    let used = 0;
    let bands = 0;
    try {
      while (!finished && ((bands === 0 && force) || (budget > 0 && used + Math.max(this.bandMs, BAND_MS_FLOOR) <= budget))) {
        const t0 = this.now();
        finished = run.job.step();
        const dt = Math.max(0, this.now() - t0);
        this.bandMs = dt;
        used += Math.max(dt, BAND_MS_FLOOR);
        bands++;
      }
    } catch {
      finished = true; // the load sees the job not done and keeps its Original pictures
    }
    if (bands > 0) this.framesSinceBand = 0;
    else this.bandMs *= BAND_MS_DECAY;
    if (finished) {
      this.tintRun = null;
      run.done();
    }
  }

  private dequeue(r: Rec): void {
    const i = this.queue.indexOf(r);
    if (i >= 0) this.queue.splice(i, 1);
  }

  /** Bytes held or reserved, including sets on their way out: what a new decode must fit beside. */
  private committed(): number {
    let n = this.heldTotal;
    for (const r of this.recs.values()) n += r.inFlight ? Math.max(r.load, r.bytes) : r.bytes;
    return n;
  }

  /**
   * What the wanted sets need; sets on their way out are not pressure, they free themselves.
   * With `atDensity4`, a wanted density-2 set counts at its density-4 counterpart's estimated size
   * when density 4 is being withheld from it (cap on, or that counterpart demoted), and held memory at its
   * density-4 size. Bytes `admit` refused this frame are pressure too.
   */
  private pressure(atDensity4 = false): number {
    let n = (atDensity4 ? this.heldUpTotal : this.heldTotal) + this.refused;
    let room: number | undefined;
    // Coloured sets tint one at a time (review fix round 1, item 1): a queued one counts at its settled size, and the
    // tint's extra (a mask, a tinted copy, the band scratch) once, for the set tinting or, when none is, the largest
    // queued. Each counting its whole `load` made a few queued coloured sets look like more than the budget and capped
    // (cancelling the tint) a park that fits. Admission still asks for the whole `load` before a tint starts.
    let tintCounted = false;
    let tintExtra = 0;
    for (const r of this.recs.values()) {
      if (!this.wanted(r)) continue;
      // A density-2 twin wanted beside its density-4 set while that one decodes (a turn, a zoom in) is on its way
      // out: it stands in until the density-4 set lands, then nobody wants it. Counting both made the new view's
      // demand look like more than its steady need and capped turns that fit (Task 3 fix round 3). Counted again
      // when the density-4 set could not start even with the sets on their way out gone (the old turn's: not
      // wanted any more), so the ladder still makes room for it.
      if (r.entry.density === 2 && this.isTwin(r, (room ??= this.roomBesideOutgoing()))) continue;
      let need = 0;
      if (r.state === 'ready') need = r.bytes;
      else if (r.state === 'loading' && r.inFlight && !r.cancelled) {
        need = Math.max(r.load, r.bytes);
        if (r.colour !== null) tintCounted = true;
      } else if (r.state === 'loading' && !r.inFlight && r.wantPri === 'now') {
        need = r.estimate;
        if (r.colour !== null) tintExtra = Math.max(tintExtra, r.load - r.estimate);
      }
      if (need > 0 && atDensity4 && r.up && (this.capped || this.demoted.has(r.up.entry.key))) need = r.up.estimate;
      n += need;
    }
    return tintCounted ? n : n + tintExtra;
  }

  /**
   * `r` is a wanted density-2 twin of a density-4 set wanted now that is still loading and can start (in flight, or
   * its estimate fits `room`).
   */
  private isTwin(r: Rec, room: number): boolean {
    const up = r.up;
    if (r.entry.density !== 2 || !up || this.capped || this.demoted.has(up.entry.key)) return false;
    if (!this.wanted(up) || up.wantPri !== 'now' || up.state !== 'loading' || up.cancelled) return false;
    return up.inFlight || up.load <= room;
  }

  /**
   * Room for a new decode once the sets on their way out are gone: ready sets nobody wanted and nobody drew this frame
   * (after a turn, the old turn's sets; they are freed as soon as they are no longer drawn, spec §5.4 item 3). A set
   * drawn this frame without a want (a late draw) is not on its way out: `drop` protects it.
   */
  private roomBesideOutgoing(): number {
    let out = 0;
    for (const r of this.recs.values()) if (r.state === 'ready' && !this.wanted(r) && r.lastUsed < this.frame) out += r.bytes;
    return this.limit - this.committed() + out;
  }

  /**
   * The next set to decode within `room` bytes: the first queued 'now' set that fits (a big one that does not fit
   * yet does not hold up smaller ones behind it); ahead sets only while no 'now' set waits. A coloured set waits while
   * another one loads (tints run one at a time).
   */
  private nextToLoad(room: number): Rec | undefined {
    const nows = this.queue.filter((r) => r.wantPri === 'now');
    return (nows.length ? nows : this.queue).find((r) => r.load <= room && (r.colour === null || !this.tinting));
  }

  private pump(): void {
    while (this.inFlight < MAX_IN_FLIGHT && this.queue.length) {
      const next = this.nextToLoad(this.limit - this.committed());
      if (!next) return;
      this.dequeue(next);
      void this.load(next);
    }
  }

  private async load(r: Rec): Promise<void> {
    this.inFlight++;
    r.inFlight = true;
    r.cancelled = false;
    if (r.colour !== null) this.tinting = r;
    try {
      for (const sheet of r.entry.sheets) {
        if (r.cancelled) break;
        const d = await this.io.decode(await this.read(sheet.file));
        r.decoded.push(d);
        r.bytes += d.bytes;
        this.peak = Math.max(this.peak, this.residentBytes());
      }
      let tintFailed = false;
      if (!r.cancelled && r.colour !== null) tintFailed = await this.tint(r);
      if (r.cancelled) this.free(r);
      else {
        r.state = 'ready';
        r.readyFrame = this.frame;
        r.interim = null;
        r.ready = { ...r.entry, images: r.decoded.map((d) => d.image), ...(tintFailed ? { tintFailed } : {}) };
      }
    } catch (err) {
      this.free(r);
      r.state = 'failed';
      this.onError(r.entry.key, err);
    } finally {
      if (this.tinting === r) this.tinting = null;
      r.inFlight = false;
      r.cancelled = false;
      this.inFlight--;
      this.pump();
    }
  }

  /**
   * Tints coloured set `r`'s decoded sheets one at a time: decode its mask, run the band job from `endFrame`, then keep
   * the tinted copy (as an ImageBitmap where the browser has `createImageBitmap`) and close the base and the mask.
   * Returns true when a tint failed (a canvas without a 2D context, a mask that will not decode): the sheets already
   * tinted are decoded again from their Original files (kept blobs), so the whole set draws Original, and the failure
   * is reported. Everything here stays inside the peak admitted for the load (`load`).
   *
   * The load keeps its decode slot (`MAX_IN_FLIGHT`) for the whole tint, which spans frames: while a coloured set
   * tints only one other decode runs. Kept as is (review fix round 1, item 7): freeing the slot during the tint wait
   * would let a fourth decode start when the tint resumes.
   */
  private async tint(r: Rec): Promise<boolean> {
    const target = hexRgb(TRACK_PALETTE[r.colour as number] as string);
    const baseRgb = hexRgb(r.entry.baseColour as string);
    const show = (): void => { r.interim = { ...r.entry, images: r.decoded.map((d) => d.image) }; };
    const tinted: boolean[] = [];
    show();
    for (let i = 0; i < r.decoded.length; i++) {
      const maskFile = r.masks[i];
      if (maskFile === undefined) continue;
      if (r.cancelled) return false;
      const base = r.decoded[i] as Decoded;
      try {
        const mask = await this.io.decode(await this.read(maskFile));
        r.extra.mask = mask;
        r.bytes += mask.bytes;
        if (r.cancelled) return false;
        const job = tintSheetShaded(base, mask, baseRgb, target, this.makeCanvas, this.bandPx);
        r.extra.job = job;
        r.extra.jobBytes = job.bytes;
        r.bytes += job.bytes;
        this.peak = Math.max(this.peak, this.residentBytes());
        await new Promise<void>((done) => { this.tintRun = { job, done }; });
        if (r.cancelled) return false;
        if (!job.done) throw new Error(`tint of ${r.entry.key} sheet ${i} failed`);
        const out = job.result();
        r.bytes -= r.extra.jobBytes;
        r.extra = { mask: r.extra.mask, job: null, jobBytes: 0 };
        this.closeExtra(r);
        // Swap, close and show in one step: `interim` must never hand out a closed picture (a detached bitmap
        // throws in drawImage), and frames run while the bitmap copy below is awaited.
        r.decoded[i] = out;
        base.close();
        r.bytes += out.bytes - base.bytes;
        show();
        tinted[i] = true;
        await this.toBitmap(r, i, show);
      } catch (err) {
        this.closeExtra(r);
        this.onError(r.entry.key, err);
        await this.untint(r, tinted, show);
        return true;
      }
    }
    return false;
  }

  /**
   * Sheet `i` of `r` (a tinted canvas) copied to an ImageBitmap, the canvas then freed: the same bytes, held as a bitmap
   * the browser draws without a canvas behind it. Both are held (and counted) for the moment of the copy, inside the
   * peak admitted. Without `createImageBitmap`, or when it fails, the canvas stays.
   */
  private async toBitmap(r: Rec, i: number, show: () => void): Promise<void> {
    const make = this.makeBitmap;
    const d = r.decoded[i] as Decoded;
    if (!make) return;
    r.bytes += d.bytes;
    this.peak = Math.max(this.peak, this.residentBytes());
    let bmp: ImageBitmap;
    try {
      bmp = await make(d.image);
    } catch {
      if (r.decoded[i] === d) r.bytes -= d.bytes; // (a set freed meanwhile has its bytes at 0 already)
      return;
    }
    if (r.decoded[i] !== d) { bmp.close?.(); return; } // freed meanwhile: `free` closed the canvas and zeroed the bytes
    r.decoded[i] = { image: bmp, bytes: d.bytes, close: () => bmp.close?.() };
    show();
    d.close();
    r.bytes -= d.bytes;
  }

  /**
   * After a failed tint: sheets already tinted get their Original pictures back, decoded again from the kept blobs one
   * at a time (each new decode before its tinted copy closes: one sheet more, inside the admitted peak, as the mask
   * and the tint job are closed by then). Each swap is shown at once (`interim` never holds a closed picture). A sheet
   * whose Original file will not decode again keeps its tinted picture, reported: the set stays usable (flagged
   * `tintFailed` by the caller), never 'failed' for it.
   */
  private async untint(r: Rec, tinted: boolean[], show: () => void): Promise<void> {
    for (let j = 0; j < tinted.length; j++) {
      if (!tinted[j] || r.cancelled) continue;
      const file = (r.entry.sheets[j] as { file: string }).file;
      let d: Decoded;
      try {
        d = await this.io.decode(await this.read(file));
      } catch (err) {
        this.onError(r.entry.key, err);
        continue;
      }
      if (r.cancelled) { d.close(); return; }
      r.bytes += d.bytes;
      this.peak = Math.max(this.peak, this.residentBytes());
      const old = r.decoded[j] as Decoded;
      r.decoded[j] = d;
      show();
      old.close();
      r.bytes -= old.bytes;
    }
  }

  private read(file: string): Promise<Blob> {
    let p = this.blobs.get(file);
    if (!p) {
      const q = this.io.read(file);
      p = q;
      this.blobs.set(file, q);
      q.then((b) => { if (this.blobs.get(file) === q) this.blobTotal += b.size; }, () => { if (this.blobs.get(file) === q) this.blobs.delete(file); });
    }
    return p;
  }

  /** Compressed bytes held (every file read so far: they are kept, spec §5.4 item 1), outside the decode budget. */
  blobBytes(): number {
    return this.blobTotal;
  }
}
