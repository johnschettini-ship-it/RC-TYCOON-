/**
 * Decides which realistic-art sets are decoded in memory.
 *
 * Lessons from phone tests that shape this class:
 * 1. Decoding runs off the main thread (createImageBitmap behind `SetIO.decode`) and never blocks
 *    drawing: `use` only ever returns a set that is already ready.
 * 2. Compressed blobs are kept once read, so a turn never waits on a download.
 * 3. During a turn the old sets still count until they are freed, so a new decode only starts
 *    when the old sets plus everything in flight plus the new set fit the budget.
 * 4. Memory made outside the manager from ready sets (tinted sheets, ground chunks) is in the same
 *    budget: it is admitted before it is made (`admit`), counted while held (`hold`), and given back
 *    under pressure by the holders' reclaimers (`addReclaimer`), a ladder step before density drops.
 *
 * Protocol per frame: `beginFrame(n)`, then `want(...)` for every set the frame needs (wants do
 * not carry over to the next frame), `use(...)` for every set drawn, then `endFrame()`.
 */
import { setKey, type RealIndex, type RealSetEntry, type SetKey } from './indexFormat';

export interface Decoded { image: CanvasImageSource; bytes: number; close(): void }
export interface SetIO { read(file: string): Promise<Blob>; decode(blob: Blob): Promise<Decoded> }
export type SetState = 'none' | 'loading' | 'ready' | 'failed';
export type ReadySet = RealSetEntry & { images: CanvasImageSource[] };
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
  /** Held bytes by holder id (`ground`, `<set key>#<colour>` for a tinted sheet). */
  held: Record<string, number>;
  /** Resident bytes by owner: decoded sets, tinted sheets, ground chunks. */
  split: MemorySplit;
  capped: boolean;
  demoted: SetKey[];
}

/** Resident bytes by owner. */
export interface MemorySplit { sets: number; tints: number; ground: number }

/** The holder id the ground uses; every other holder id is a tinted sheet. */
export const GROUND_HOLD = 'ground';

export type Priority = 'now' | 'ahead';

const MAX_IN_FLIGHT = 2;
const NEVER = Number.NEGATIVE_INFINITY;
/** Cap and demotions lift once the density-4 estimate stays under this share of the budget... */
const ROOM_SHARE = 0.75;
/** ...for this many consecutive frames. */
const ROOM_FRAMES = 60;

interface Rec {
  entry: RealSetEntry;
  /** Density-4 counterpart of a density-2 set, if the index has one. */
  up: Rec | null;
  /** Decoded size predicted from the index (w*h*4 per sheet), used to admit decodes. */
  estimate: number;
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
  /** Bytes the caller made from ready sets (tinted sheets, ground chunks), by holder id. */
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

  constructor(
    index: RealIndex,
    private readonly io: SetIO,
    private readonly budgetBytes: number,
    private readonly onError: (key: SetKey, err: unknown) => void,
  ) {
    for (const entry of index.sets) {
      this.recs.set(entry.key, {
        entry,
        up: null,
        estimate: entry.sheets.reduce((n, s) => n + s.w * s.h * 4, 0),
        state: 'none', inFlight: false, cancelled: false, decoded: [], bytes: 0, ready: null,
        wantFrame: NEVER, wantPri: 'ahead', lastUsed: NEVER, readyFrame: NEVER,
      });
    }
    for (const r of this.recs.values()) {
      const e = r.entry;
      if (e.density === 2) r.up = this.recs.get(setKey(e.kind, e.item, 4, e.rot)) ?? null;
    }
  }

  beginFrame(frame: number): void {
    this.frame = frame;
    this.refusedById.clear();
    this.refused = 0;
  }

  want(keys: SetKey[], priority: Priority): void {
    for (const key of keys) {
      const r = this.recs.get(key);
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
      if (r.estimate > this.budgetBytes) {
        // Can never fit, even alone: today's art draws it (state 'failed'), reported once.
        r.state = 'failed';
        if (!this.tooBigReported.has(key)) {
          this.tooBigReported.add(key);
          this.onError(key, new Error(`set ${key} needs ${r.estimate} bytes decoded, more than the whole budget of ${this.budgetBytes}`));
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
    return !!r && r.state === 'loading' && !r.inFlight && r.estimate > this.lastRoom;
  }

  /**
   * Counts `bytes` made outside the set manager (RealLook's tinted sheets, RealGround's chunks) in the budget under
   * `id`, replacing what `id` held before; 0 releases it. Held bytes are resident, limit new decodes and add
   * pressure. `upBytes` is what the same holding would take at density 4 (default `bytes`): the cap lifts only when
   * that fits too.
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
    const now = this.held.get(id) ?? 0;
    if (bytes <= now || this.committed() - now + bytes <= this.budgetBytes) {
      this.hold(id, bytes, upBytes);
      return true;
    }
    const grow = bytes - now;
    const before = this.refusedById.get(id) ?? 0;
    if (grow > before) {
      this.refused += grow - before;
      this.refusedById.set(id, grow);
    }
    return false;
  }

  /** A holder's reclaimer: called by the ladder, in the order added, before any density is lowered. */
  addReclaimer(fn: Reclaimer): void {
    this.reclaimers.push(fn);
  }

  /** Reads every sheet listed in the index into the compressed-blob store (spec §5.4 item 1: nothing downloads in play). */
  async preloadAll(onProgress?: (done: number, total: number, bytes: number) => void): Promise<{ files: number; bytes: number }> {
    const files = [...new Set([...this.recs.values()].flatMap((r) => r.entry.sheets.map((s) => s.file)))];
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

  /** Resident bytes by owner: decoded sets, tinted sheets, ground chunks. */
  split(): MemorySplit {
    let sets = 0;
    for (const r of this.recs.values()) sets += r.bytes;
    const ground = this.held.get(GROUND_HOLD) ?? 0;
    return { sets, tints: this.heldTotal - ground, ground };
  }

  snapshot(): SetSnapshot {
    const head = this.nextToLoad(Number.POSITIVE_INFINITY);
    return {
      frame: this.frame,
      queueHead: head ? { key: head.entry.key, estimate: head.estimate, priority: head.wantPri } : null,
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
    for (const r of this.recs.values()) if (!this.wanted(r)) this.drop(r);

    if (this.pressure() > this.budgetBytes) {
      // 1. ahead sets first.
      for (const r of this.recs.values()) if (this.wanted(r) && r.wantPri === 'ahead') this.drop(r);
    }
    // 2. held memory not drawn this frame: ground chunks off screen, least recently used tinted sheets.
    for (const reclaim of this.reclaimers) {
      const over = this.pressure() - this.budgetBytes;
      if (over <= 0) break;
      try {
        reclaim(over);
      } catch (err) {
        this.onError('reclaim', err);
      }
    }
    if (this.pressure() > this.budgetBytes) {
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
    if (pressure > this.budgetBytes && !this.capped) {
      this.capped = true; // 4. density 2 everywhere.
      this.roomFrames = 0;
      this.events.push({ frame: this.frame, capped: true, pressureBytes: pressure });
    } else if (this.capped || this.demoted.size) this.checkRoom();
    if (this.capped) for (const r of this.recs.values()) if (r.entry.density === 4) this.drop(r);

    this.pump();
    this.lastRoom = this.budgetBytes - this.committed();
  }

  /**
   * Hysteresis: lift the cap and demotions after ROOM_FRAMES frames with room at density 4, held memory counted at
   * its density-4 size, and nothing refused.
   */
  private checkRoom(): void {
    const up = this.pressure(true);
    this.roomFrames = up < ROOM_SHARE * this.budgetBytes && this.refused === 0 ? this.roomFrames + 1 : 0;
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
    r.decoded = [];
    r.bytes = 0;
    r.ready = null;
    r.state = 'none';
  }

  private dequeue(r: Rec): void {
    const i = this.queue.indexOf(r);
    if (i >= 0) this.queue.splice(i, 1);
  }

  /** Bytes held or reserved, including sets on their way out: what a new decode must fit beside. */
  private committed(): number {
    let n = this.heldTotal;
    for (const r of this.recs.values()) n += r.inFlight ? Math.max(r.estimate, r.bytes) : r.bytes;
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
    for (const r of this.recs.values()) {
      if (!this.wanted(r)) continue;
      let need = 0;
      if (r.state === 'ready') need = r.bytes;
      else if (r.state === 'loading' && r.inFlight && !r.cancelled) need = Math.max(r.estimate, r.bytes);
      else if (r.state === 'loading' && !r.inFlight && r.wantPri === 'now') need = r.estimate;
      if (need > 0 && atDensity4 && r.up && (this.capped || this.demoted.has(r.up.entry.key))) need = r.up.estimate;
      n += need;
    }
    return n;
  }

  /**
   * The next set to decode within `room` bytes: the first queued 'now' set that fits (a big one that does not fit
   * yet does not hold up smaller ones behind it); ahead sets only while no 'now' set waits.
   */
  private nextToLoad(room: number): Rec | undefined {
    const nows = this.queue.filter((r) => r.wantPri === 'now');
    return (nows.length ? nows : this.queue).find((r) => r.estimate <= room);
  }

  private pump(): void {
    while (this.inFlight < MAX_IN_FLIGHT && this.queue.length) {
      const next = this.nextToLoad(this.budgetBytes - this.committed());
      if (!next) return;
      this.dequeue(next);
      void this.load(next);
    }
  }

  private async load(r: Rec): Promise<void> {
    this.inFlight++;
    r.inFlight = true;
    r.cancelled = false;
    try {
      for (const sheet of r.entry.sheets) {
        if (r.cancelled) break;
        const d = await this.io.decode(await this.read(sheet.file));
        r.decoded.push(d);
        r.bytes += d.bytes;
        this.peak = Math.max(this.peak, this.residentBytes());
      }
      if (r.cancelled) this.free(r);
      else {
        r.state = 'ready';
        r.readyFrame = this.frame;
        r.ready = { ...r.entry, images: r.decoded.map((d) => d.image) };
      }
    } catch (err) {
      this.free(r);
      r.state = 'failed';
      this.onError(r.entry.key, err);
    } finally {
      r.inFlight = false;
      r.cancelled = false;
      this.inFlight--;
      this.pump();
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
