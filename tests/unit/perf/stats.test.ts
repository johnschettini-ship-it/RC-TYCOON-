import { describe, expect, it } from 'vitest';
import { createPerfProbe, percentile, RingBuffer } from '../../../src/perf/stats';

/** A clock the test moves by hand; counts how often it is read. */
function fakeClock(): { now: () => number; t: number; reads: number } {
  const c = {
    t: 0,
    reads: 0,
    now: () => {
      c.reads++;
      return c.t;
    },
  };
  return c;
}

describe('percentile (nearest rank)', () => {
  it('p50 and p95 of 1 … 100', () => {
    const v = Array.from({ length: 100 }, (_, k) => 100 - k);
    expect(percentile(v, 0.5)).toBe(50);
    expect(percentile(v, 0.95)).toBe(95);
    expect(percentile(v, 1)).toBe(100);
  });

  it('small and empty inputs', () => {
    expect(percentile([], 0.95)).toBe(0);
    expect(percentile([7], 0.5)).toBe(7);
    expect(percentile([7], 0.95)).toBe(7);
    // 20 values: p95 is the 19th smallest, p50 the 10th.
    const v = Array.from({ length: 20 }, (_, k) => k + 1);
    expect(percentile(v, 0.95)).toBe(19);
    expect(percentile(v, 0.5)).toBe(10);
  });

  it('does not reorder its input', () => {
    const v = [3, 1, 2];
    percentile(v, 0.5);
    expect(v).toEqual([3, 1, 2]);
  });
});

describe('RingBuffer', () => {
  it('keeps the newest `capacity` values', () => {
    const r = new RingBuffer(4);
    for (let k = 1; k <= 6; k++) r.push(k);
    expect(r.count).toBe(4);
    expect(r.last(10)).toEqual([3, 4, 5, 6]);
    expect(r.last(2)).toEqual([5, 6]);
    r.clear();
    expect(r.count).toBe(0);
    expect(r.last(3)).toEqual([]);
  });
});

describe('perf probe (Phase 6 §4.6)', () => {
  it('is off by default and never reads the clock while off', () => {
    const c = fakeClock();
    const p = createPerfProbe(c.now);
    expect(p.enabled).toBe(false);
    p.frameStart(16);
    p.tickStart();
    p.tickEnd();
    p.countDraw(5);
    p.frameEnd();
    expect(c.reads).toBe(0);
    expect(p.snapshot()).toMatchObject({ fps: 0, frameP50: 0, frameP95: 0, tickP50: 0, tickP95: 0, drawCalls: 0 });
  });

  it('frame intervals from the frame timestamps give fps and p50 / p95', () => {
    const c = fakeClock();
    const p = createPerfProbe(c.now);
    p.enabled = true;
    // 19 intervals of 10 ms and one of 50 ms.
    let t = 1000;
    for (let k = 0; k <= 20; k++) {
      c.t = t;
      p.frameStart(t);
      c.t = t + 4;
      p.frameEnd();
      t += k === 10 ? 50 : 10;
    }
    const s = p.snapshot();
    expect(s.frames).toBe(20);
    expect(s.frameP50).toBe(10);
    expect(s.frameP95).toBe(10);
    expect(s.frameMax).toBe(50);
    expect(s.fps).toBeCloseTo(20 / 0.24, 5);
    expect(s.workP95).toBe(4);
  });

  it('tick times give tick p50 / p95', () => {
    const c = fakeClock();
    const p = createPerfProbe(c.now);
    p.enabled = true;
    for (let k = 1; k <= 20; k++) {
      c.t = 100 * k;
      p.tickStart();
      c.t = 100 * k + k / 10;
      p.tickEnd();
    }
    const s = p.snapshot();
    expect(s.ticks).toBe(20);
    expect(s.tickP50).toBeCloseTo(1.0, 9);
    expect(s.tickP95).toBeCloseTo(1.9, 9);
  });

  it('draw calls are the count of the last finished frame', () => {
    const c = fakeClock();
    const p = createPerfProbe(c.now);
    p.enabled = true;
    p.frameStart(0);
    p.countDraw();
    p.countDraw(9);
    p.frameEnd();
    p.frameStart(16);
    p.countDraw(3);
    expect(p.snapshot().drawCalls).toBe(10);
    p.frameEnd();
    expect(p.snapshot().drawCalls).toBe(3);
  });

  it('a gap longer than a second (hidden tab) is not a frame time', () => {
    const p = createPerfProbe(() => 0);
    p.enabled = true;
    p.frameStart(0);
    p.frameEnd();
    p.frameStart(5000);
    p.frameEnd();
    p.frameStart(5016);
    p.frameEnd();
    expect(p.snapshot().frames).toBe(1);
    expect(p.snapshot().frameMax).toBe(16);
  });

  it('frames with more than 50 ms of work count as long frames', () => {
    const c = fakeClock();
    const p = createPerfProbe(c.now);
    p.enabled = true;
    for (const work of [10, 60, 51, 50]) {
      p.frameStart(c.t);
      c.t += work;
      p.frameEnd();
    }
    expect(p.snapshot().longFrames).toBe(2);
  });

  it('`last` limits the window; reset forgets everything', () => {
    const c = fakeClock();
    const p = createPerfProbe(c.now);
    p.enabled = true;
    let t = 0;
    for (let k = 0; k < 10; k++) {
      p.frameStart(t);
      p.frameEnd();
      t += k < 5 ? 10 : 30;
    }
    expect(p.snapshot(3).frameP50).toBe(30);
    expect(p.snapshot().frameP50).toBe(10);
    p.reset();
    expect(p.snapshot().frames).toBe(0);
  });

  it('render time and sprite memory', () => {
    const c = fakeClock();
    const p = createPerfProbe(c.now, () => 3 * 1024 * 1024);
    p.enabled = true;
    p.frameStart(0);
    c.t = 1;
    p.renderStart();
    c.t = 8;
    p.renderEnd();
    p.frameEnd();
    const s = p.snapshot();
    expect(s.renderP95).toBe(7);
    expect(s.spriteCacheMb).toBe(3);
  });
});
