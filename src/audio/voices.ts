/**
 * Voice bookkeeping (Phase 6 §4.1): the voice pool with stealing, the same-id cooldown, and a sliding-window rate
 * limit (`build_path` at most 8 per second). Owner: W4-A. Pure (times are numbers in ms), so it is unit-tested in Node.
 */
import type { SfxId } from './types';

export interface VoiceSlot<T> {
  key: number;
  id: SfxId;
  priority: number;
  startMs: number;
  /** When the voice is done (ms); `Infinity` for loops until released. */
  endMs: number;
  data: T;
}

/**
 * At most `max` voices. When full, a new sound steals the oldest voice whose priority is lower than or equal to its
 * own (ties in start time: the first acquired). If none exists, the new sound does not play.
 */
export class VoicePool<T> {
  private slots: VoiceSlot<T>[] = [];
  private nextKey = 1;

  constructor(readonly max: number) {}

  get size(): number {
    return this.slots.length;
  }

  active(): readonly VoiceSlot<T>[] {
    return this.slots;
  }

  /** Take a voice. Null = no voice free or stealable (do not play). `stolen` must be stopped by the caller. */
  acquire(id: SfxId, priority: number, startMs: number, endMs: number, data: T): { slot: VoiceSlot<T>; stolen: VoiceSlot<T> | null } | null {
    let stolen: VoiceSlot<T> | null = null;
    if (this.slots.length >= this.max) {
      let best = -1;
      for (let i = 0; i < this.slots.length; i++) {
        const s = this.slots[i] as VoiceSlot<T>;
        if (s.priority > priority) continue;
        const b = best < 0 ? null : (this.slots[best] as VoiceSlot<T>);
        if (b === null || s.startMs < b.startMs || (s.startMs === b.startMs && s.key < b.key)) best = i;
      }
      if (best < 0) return null;
      stolen = this.slots.splice(best, 1)[0] as VoiceSlot<T>;
    }
    const slot: VoiceSlot<T> = { key: this.nextKey++, id, priority, startMs, endMs, data };
    this.slots.push(slot);
    return { slot, stolen };
  }

  /** Remove and return the voices that ended at or before `nowMs`. */
  reap(nowMs: number): VoiceSlot<T>[] {
    const done: VoiceSlot<T>[] = [];
    const keep: VoiceSlot<T>[] = [];
    for (const s of this.slots) (s.endMs <= nowMs ? done : keep).push(s);
    if (done.length > 0) this.slots = keep;
    return done;
  }

  /** Free a voice (a loop that stopped). */
  release(key: number): void {
    const i = this.slots.findIndex((s) => s.key === key);
    if (i >= 0) this.slots.splice(i, 1);
  }

  has(key: number): boolean {
    return this.slots.some((s) => s.key === key);
  }
}

/** The same SFX id plays at most once per `gapMs`. */
export class Cooldown {
  private last = new Map<SfxId, number>();

  constructor(readonly gapMs: number) {}

  ready(id: SfxId, nowMs: number): boolean {
    const t = this.last.get(id);
    return t === undefined || nowMs - t >= this.gapMs || nowMs < t;
  }

  mark(id: SfxId, nowMs: number): void {
    this.last.set(id, nowMs);
  }
}

/** At most `max` events in any window of `windowMs` (sliding). */
export class RateLimiter {
  private times: number[] = [];

  constructor(
    readonly max: number,
    readonly windowMs: number,
  ) {}

  allow(nowMs: number): boolean {
    while (this.times.length > 0 && (this.times[0] as number) <= nowMs - this.windowMs) this.times.shift();
    if (this.times.length >= this.max) return false;
    this.times.push(nowMs);
    return true;
  }
}
