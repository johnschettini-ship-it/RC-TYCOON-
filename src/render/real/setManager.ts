/**
 * Decides which realistic-art sets are decoded in memory.
 *
 * Lessons from phone tests that shape this class:
 * 1. Decoding runs off the main thread (createImageBitmap behind `SetIO.decode`) and never blocks
 *    drawing: `use` only ever returns a set that is already ready.
 * 2. Compressed blobs are kept once read, so a turn never waits on a download.
 * 3. During a turn the old sets still count until they are freed, so a new decode only starts
 *    when the old sets plus everything in flight plus the new set fit the budget.
 *
 * Protocol per frame: `beginFrame(n)`, then `want(...)` for every set the frame needs (wants do
 * not carry over to the next frame), `use(...)` for every set drawn, then `endFrame()`.
 */
import type { RealIndex, RealSetEntry, SetKey } from './indexFormat';

export interface Decoded { image: CanvasImageSource; bytes: number; close(): void }
export interface SetIO { read(file: string): Promise<Blob>; decode(blob: Blob): Promise<Decoded> }
export type SetState = 'none' | 'loading' | 'ready' | 'failed';
export type ReadySet = RealSetEntry & { images: CanvasImageSource[] };

type Priority = 'now' | 'ahead';

const MAX_IN_FLIGHT = 2;
const NEVER = Number.NEGATIVE_INFINITY;

interface Rec {
  entry: RealSetEntry;
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

  constructor(
    index: RealIndex,
    private readonly io: SetIO,
    private readonly budgetBytes: number,
    private readonly onError: (key: SetKey, err: unknown) => void,
  ) {
    for (const entry of index.sets) {
      this.recs.set(entry.key, {
        entry,
        estimate: entry.sheets.reduce((n, s) => n + s.w * s.h * 4, 0),
        state: 'none', inFlight: false, cancelled: false, decoded: [], bytes: 0, ready: null,
        wantFrame: NEVER, wantPri: 'ahead', lastUsed: NEVER, readyFrame: NEVER,
      });
    }
  }

  beginFrame(frame: number): void {
    this.frame = frame;
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

  residentBytes(): number {
    let n = 0;
    for (const r of this.recs.values()) n += r.bytes;
    return n;
  }

  peakBytes(): number {
    return this.peak;
  }

  densityCap(): 2 | 4 {
    return this.capped ? 2 : 4;
  }

  endFrame(): void {
    for (const r of this.recs.values()) if (!this.wanted(r)) this.drop(r);

    if (this.pressure() > this.budgetBytes) {
      // 1. ahead sets first.
      for (const r of this.recs.values()) if (this.wanted(r) && r.wantPri === 'ahead') this.drop(r);
    }
    if (this.pressure() > this.budgetBytes) {
      // 2. density-4 sets of objects outside the view: wanted but not drawn, and resident long
      //    enough that the caller had a frame to draw them.
      for (const r of this.recs.values()) {
        if (r.state === 'ready' && r.entry.density === 4 && r.readyFrame < this.frame - 1) this.drop(r);
      }
    }
    if (this.pressure() > this.budgetBytes) this.capped = true; // 3. density 2 everywhere.
    if (this.capped) for (const r of this.recs.values()) if (r.entry.density === 4) this.drop(r);

    this.pump();
  }

  private wanted(r: Rec): boolean {
    return r.wantFrame === this.frame;
  }

  private isProtected(r: Rec): boolean {
    return r.lastUsed >= this.frame - 1;
  }

  /** Frees, dequeues or cancels a set, unless it was drawn this frame or the frame before. */
  private drop(r: Rec): void {
    if (this.isProtected(r)) return;
    r.wantFrame = NEVER;
    if (r.state === 'ready') this.free(r);
    else if (r.state === 'loading') {
      if (r.inFlight) r.cancelled = true;
      else { this.dequeue(r); r.state = 'none'; }
    }
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
    let n = 0;
    for (const r of this.recs.values()) n += r.inFlight ? Math.max(r.estimate, r.bytes) : r.bytes;
    return n;
  }

  /** What the wanted sets need; sets on their way out are not pressure, they free themselves. */
  private pressure(): number {
    let n = 0;
    for (const r of this.recs.values()) {
      if (!this.wanted(r)) continue;
      if (r.state === 'ready') n += r.bytes;
      else if (r.state === 'loading' && r.inFlight && !r.cancelled) n += Math.max(r.estimate, r.bytes);
      else if (r.state === 'loading' && !r.inFlight && r.wantPri === 'now') n += r.estimate;
    }
    return n;
  }

  private pump(): void {
    while (this.inFlight < MAX_IN_FLIGHT && this.queue.length) {
      const i = this.queue.findIndex((r) => r.wantPri === 'now');
      const next = this.queue[i >= 0 ? i : 0]!;
      if (this.committed() + next.estimate > this.budgetBytes) return;
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
      p = this.io.read(file);
      this.blobs.set(file, p);
      p.catch(() => { if (this.blobs.get(file) === p) this.blobs.delete(file); });
    }
    return p;
  }
}
