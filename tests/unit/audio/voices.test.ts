/** Voice stealing, same-id cooldown, and the `build_path` rate limit (Phase 6 §4.1, §4.2, §8). W4-A. */
import { describe, expect, it } from 'vitest';
import { Cooldown, RateLimiter, VoicePool } from '../../../src/audio/voices';
import { BUILD_PATH_MAX_PER_S, MAX_SFX_VOICES, SFX_COOLDOWN_MS } from '../../../src/data/tuning/audio';

describe('voice pool (24 voices, steal the oldest of lower or equal priority)', () => {
  it('fills free voices first', () => {
    const pool = new VoicePool<string>(3);
    for (const name of ['a', 'b', 'c']) {
      const r = pool.acquire('ui_click', 1, 0, 100, name);
      expect(r).not.toBeNull();
      expect(r?.stolen).toBeNull();
    }
    expect(pool.size).toBe(3);
  });

  it('when full, steals the oldest voice with lower or equal priority', () => {
    const pool = new VoicePool<string>(3);
    pool.acquire('breakdown', 4, 0, 10_000, 'old-high');
    pool.acquire('cash_in', 1, 10, 10_000, 'old-low');
    pool.acquire('ride_bell', 2, 20, 10_000, 'mid');
    const r = pool.acquire('ride_bell', 2, 30, 10_000, 'new');
    expect(r?.stolen?.data).toBe('old-low');
    expect(pool.active().map((v) => v.data)).toEqual(['old-high', 'mid', 'new']);
  });

  it('equal priority counts: the oldest equal voice is stolen', () => {
    const pool = new VoicePool<string>(2);
    pool.acquire('splash', 3, 0, 10_000, 'first');
    pool.acquire('splash', 3, 5, 10_000, 'second');
    expect(pool.acquire('demolish', 3, 6, 10_000, 'third')?.stolen?.data).toBe('first');
  });

  it('with no voice of lower or equal priority the new sound does not play', () => {
    const pool = new VoicePool<string>(2);
    pool.acquire('breakdown', 4, 0, 10_000, 'x');
    pool.acquire('award', 4, 1, 10_000, 'y');
    expect(pool.acquire('splash', 3, 2, 10_000, 'z')).toBeNull();
    expect(pool.active().map((v) => v.data)).toEqual(['x', 'y']);
  });

  it('a tie in start time steals the first acquired', () => {
    const pool = new VoicePool<string>(2);
    pool.acquire('cash_in', 1, 0, 10_000, 'one');
    pool.acquire('cash_in', 1, 0, 10_000, 'two');
    expect(pool.acquire('cash_in', 1, 0, 10_000, 'three')?.stolen?.data).toBe('one');
  });

  it('reap frees voices that ended; loops (end ∞) stay until released', () => {
    const pool = new VoicePool<string>(3);
    pool.acquire('cash_in', 1, 0, 100, 'short');
    const loop = pool.acquire('coaster_rumble', 2, 0, Infinity, 'loop');
    expect(pool.reap(99).map((v) => v.data)).toEqual([]);
    expect(pool.reap(100).map((v) => v.data)).toEqual(['short']);
    expect(pool.reap(1e12)).toEqual([]);
    expect(pool.size).toBe(1);
    pool.release(loop?.slot.key ?? -1);
    expect(pool.size).toBe(0);
  });

  it('the game pool holds 24 voices; the 25th sound steals', () => {
    const pool = new VoicePool<number>(MAX_SFX_VOICES);
    for (let i = 0; i < 24; i++) expect(pool.acquire('cash_in', 1, i, 10_000, i)?.stolen).toBeNull();
    expect(pool.acquire('cash_in', 1, 24, 10_000, 24)?.stolen?.data).toBe(0);
    expect(pool.size).toBe(24);
  });
});

describe('same-id cooldown (60 ms)', () => {
  it('blocks the same id for 60 ms, other ids are independent', () => {
    const cd = new Cooldown(SFX_COOLDOWN_MS);
    expect(cd.ready('cash_in', 1_000)).toBe(true);
    cd.mark('cash_in', 1_000);
    expect(cd.ready('cash_in', 1_059)).toBe(false);
    expect(cd.ready('ride_bell', 1_001)).toBe(true);
    expect(cd.ready('cash_in', 1_060)).toBe(true);
  });
});

describe('rate limit (`build_path` at most 8 per second)', () => {
  it('allows 8 in any 1 s window', () => {
    const rl = new RateLimiter(BUILD_PATH_MAX_PER_S, 1_000);
    const allowed = Array.from({ length: 20 }, (_, i) => rl.allow(i * 50));
    expect(allowed.filter(Boolean)).toHaveLength(8);
    expect(allowed.slice(0, 8).every(Boolean)).toBe(true);
    // The window slides: the first allowed was at 0 ms, so 1,000 ms frees one slot.
    expect(rl.allow(1_000)).toBe(true);
    expect(rl.allow(1_001)).toBe(false);
  });

  it('a steady 8 per second all pass', () => {
    const rl = new RateLimiter(8, 1_000);
    for (let i = 0; i < 40; i++) expect(rl.allow(i * 125)).toBe(true);
  });
});
