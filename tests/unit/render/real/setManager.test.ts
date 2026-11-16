import { describe, expect, it } from 'vitest';
import { setKey, type RealIndex, type RealSetEntry, type SetKey } from '../../../../src/render/real/indexFormat';
import { CLASSIC_HOLD, HOLD_RESERVE_BYTES, SetManager, type Decoded, type SetIO, type SetManagerOptions } from '../../../../src/render/real/setManager';

const TINT_SCRATCH = 'tint:scratch';

/** Each sheet is 5x5 px, so 5*5*4 = 100 decoded bytes. */
const SHEET_BYTES = 100;

function entry(item: string, density: 2 | 4, sheets = 1): RealSetEntry {
  return {
    key: setKey('ride', item, density, 0),
    kind: 'ride',
    item,
    density,
    rot: 0,
    sheets: Array.from({ length: sheets }, (_, i) => ({ file: `${item}-d${density}-${i}.webp`, w: 5, h: 5 })),
    frames: {},
  };
}

function index(sets: RealSetEntry[]): RealIndex {
  return {
    format: 'real/1', pxPerMetreZoom1: 11.31, stepPxPerMetre: 9.8, densities: [2, 4], sets,
    bytes: { compressed: 0, decodedByDensity: { '2': 0, '4': 0 } },
  };
}

interface Pending { file: string; resolve: () => void; reject: (e: unknown) => void }

/** Fake IO: reads resolve at once (and are counted); decodes wait until the test settles them. */
class FakeIO implements SetIO {
  reads: string[] = [];
  decodes: string[] = [];
  pending: Pending[] = [];
  closed: string[] = [];
  private fileOf = new Map<Blob, string>();

  read(file: string): Promise<Blob> {
    this.reads.push(file);
    const b = new Blob([file]);
    this.fileOf.set(b, file);
    return Promise.resolve(b);
  }

  decode(blob: Blob): Promise<Decoded> {
    const file = this.fileOf.get(blob) ?? '?';
    this.decodes.push(file);
    return new Promise<Decoded>((res, rej) => {
      this.pending.push({
        file,
        resolve: () => res({ image: { file } as unknown as CanvasImageSource, bytes: SHEET_BYTES, close: () => { this.closed.push(file); } }),
        reject: rej,
      });
    });
  }

  inFlight(): string[] { return this.pending.map((p) => p.file); }

  async settle(file: string, fail?: unknown): Promise<void> {
    await flush(); // decode() is called only after the (async) read lands
    const i = this.pending.findIndex((p) => p.file === file);
    if (i < 0) throw new Error(`no pending decode for ${file}`);
    const [p] = this.pending.splice(i, 1);
    if (fail === undefined) p!.resolve(); else p!.reject(fail);
    await flush();
  }

  async settleAll(): Promise<void> {
    await flush();
    while (this.pending.length) await this.settle(this.pending[0]!.file);
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function setup(sets: RealSetEntry[], budget: number) {
  const io = new FakeIO();
  const errors: [SetKey, unknown][] = [];
  const m = new SetManager(index(sets), io, budget, (k, e) => errors.push([k, e]));
  return { io, m, errors };
}

const file = (e: RealSetEntry, i = 0): string => e.sheets[i]!.file;

describe('SetManager', () => {
  it('decodes a wanted set and reports ready', async () => {
    const A = entry('a', 2, 2);
    const { io, m } = setup([A], 128 * 2 ** 20);
    expect(m.state(A.key)).toBe('none');
    m.beginFrame(1);
    m.want([A.key], 'now');
    m.endFrame();
    expect(m.state(A.key)).toBe('loading');
    expect(m.use(A.key)).toBeNull();
    await io.settleAll();
    expect(m.state(A.key)).toBe('ready');
    const got = m.use(A.key);
    expect(got?.key).toBe(A.key);
    expect(got?.images).toHaveLength(2);
    expect(m.residentBytes()).toBe(2 * SHEET_BYTES);
    expect(m.peakBytes()).toBe(2 * SHEET_BYTES);
  });

  it('keeps compressed blobs once read, so a re-wanted set never reads again', async () => {
    const A = entry('a', 2);
    const { io, m } = setup([A], 1000);
    m.beginFrame(1); m.want([A.key], 'now'); m.endFrame();
    await io.settleAll();
    for (let f = 2; f <= 4; f++) { m.beginFrame(f); m.endFrame(); }
    expect(m.state(A.key)).toBe('none');
    expect(io.closed).toEqual([file(A)]);
    expect(m.residentBytes()).toBe(0);
    m.beginFrame(5); m.want([A.key], 'now'); m.endFrame();
    await io.settleAll();
    expect(m.state(A.key)).toBe('ready');
    expect(io.reads).toEqual([file(A)]);
    expect(io.decodes).toEqual([file(A), file(A)]);
  });

  it('ahead set decodes after now sets', async () => {
    const [A, B, C, X] = [entry('a', 2), entry('b', 2), entry('c', 2), entry('x', 2)];
    const { io, m } = setup([A, B, C, X], 1000);
    m.beginFrame(1);
    m.want([X.key], 'ahead');
    m.want([A.key, B.key, C.key], 'now');
    m.endFrame();
    await flush();
    expect(io.inFlight()).toEqual([file(A), file(B)]); // at most 2 in flight
    await io.settle(file(A));
    expect(io.inFlight()).toEqual([file(B), file(C)]);
    await io.settle(file(B));
    expect(io.inFlight()).toEqual([file(C), file(X)]);
    await io.settleAll();
    expect(io.decodes).toEqual([file(A), file(B), file(C), file(X)]);
    for (const e of [A, B, C, X]) expect(m.state(e.key)).toBe('ready');
  });

  it('turn is instant when the ahead set is ready', async () => {
    const [R0, R1] = [entry('r0', 2), entry('r1', 2)];
    const { io, m } = setup([R0, R1], 1000);
    m.beginFrame(1); m.want([R0.key], 'now'); m.want([R1.key], 'ahead'); m.endFrame();
    await io.settleAll();
    m.beginFrame(2);
    m.want([R1.key], 'now');
    expect(m.state(R1.key)).toBe('ready');
    expect(m.use(R1.key)?.images).toHaveLength(1);
    m.endFrame();
    expect(io.decodes).toEqual([file(R0), file(R1)]);
  });

  it('double turn before ahead ready', async () => {
    // Budget holds one 100-byte set plus half: R1 and R2 can never be resident together.
    const [R1, R2] = [entry('r1', 2), entry('r2', 2)];
    const budget = 150;
    const { io, m } = setup([R1, R2], budget);
    m.beginFrame(1); m.want([R1.key], 'now'); m.endFrame();
    await flush();
    expect(io.inFlight()).toEqual([file(R1)]);
    m.beginFrame(2); m.want([R2.key], 'now'); m.endFrame();
    await flush();
    // R2 waits: R1's decode still counts until it lands and is freed.
    expect(io.inFlight()).toEqual([file(R1)]);
    expect(m.state(R2.key)).toBe('loading');
    let f = 3;
    while (io.pending.length) {
      await io.settleAll();
      m.beginFrame(f++); m.want([R2.key], 'now'); m.endFrame();
      await flush();
    }
    expect(m.state(R2.key)).toBe('ready');
    expect(m.state(R1.key)).toBe('none');
    expect(io.closed).toEqual([file(R1)]);
    expect(m.residentBytes()).toBe(SHEET_BYTES);
    expect(m.peakBytes()).toBeLessThanOrEqual(budget);
    expect(m.densityCap()).toBe(4);
  });

  it('never frees a set used this or last frame', async () => {
    const [A, B, C] = [entry('a', 4), entry('b', 2), entry('c', 2)];
    const budget = 250;
    const { io, m } = setup([A, B, C], budget);
    m.beginFrame(1); m.want([A.key], 'now'); m.endFrame();
    await io.settleAll();
    // Frame 2: A is drawn but no longer wanted; B and C need room A is holding.
    m.beginFrame(2); expect(m.use(A.key)).not.toBeNull(); m.want([B.key, C.key], 'now'); m.endFrame();
    await flush();
    expect(m.state(A.key)).toBe('ready');
    m.beginFrame(3); m.want([B.key, C.key], 'now'); m.endFrame();
    await flush();
    expect(m.state(A.key)).toBe('ready'); // used last frame
    expect(m.peakBytes()).toBeLessThanOrEqual(budget);
    m.beginFrame(4); m.want([B.key, C.key], 'now'); m.endFrame();
    expect(m.state(A.key)).toBe('none');
    await io.settleAll();
    expect(m.state(B.key)).toBe('ready');
    expect(m.state(C.key)).toBe('ready');
    expect(m.peakBytes()).toBeLessThanOrEqual(budget);
    expect(m.densityCap()).toBe(4); // a set on its way out is not budget pressure
  });

  it('over budget: frees ahead first, then caps density to 2', async () => {
    const [A, D, X] = [entry('a', 4), entry('d', 4), entry('x', 4)];
    const [B, C, E] = [entry('b', 2), entry('c', 2), entry('e', 2)];
    const budget = 300;
    const { io, m } = setup([A, B, C, D, E, X], budget);
    m.beginFrame(1); m.want([A.key, D.key], 'now'); m.want([X.key], 'ahead'); m.endFrame();
    await io.settleAll();
    expect(m.residentBytes()).toBe(300);

    // 1. ahead goes first.
    m.beginFrame(2); m.use(A.key);
    m.want([A.key, D.key, B.key], 'now'); m.want([X.key], 'ahead'); m.endFrame();
    expect(m.state(X.key)).toBe('none');
    expect(io.closed).toEqual([file(X)]);
    expect(m.state(D.key)).toBe('ready');
    await io.settleAll();
    expect(m.state(B.key)).toBe('ready');
    expect(m.densityCap()).toBe(4);

    // 2. then density-4 sets of objects outside the view (wanted, but not drawn).
    m.beginFrame(3); m.use(A.key); m.use(B.key);
    m.want([A.key, D.key, B.key, C.key], 'now'); m.endFrame();
    expect(m.state(D.key)).toBe('none');
    expect(m.state(A.key)).toBe('ready');
    await io.settleAll();
    expect(m.state(C.key)).toBe('ready');
    expect(m.densityCap()).toBe(4);

    // 3. nothing left to free: draw density 2 everywhere.
    m.beginFrame(4); m.use(A.key); m.use(B.key); m.use(C.key);
    m.want([A.key, B.key, C.key, E.key], 'now'); m.endFrame();
    expect(m.densityCap()).toBe(2);
    expect(m.state(A.key)).toBe('ready'); // drawn this frame: kept until the caller switches
    m.beginFrame(5); m.use(B.key); m.use(C.key); m.want([B.key, C.key, E.key, D.key], 'now'); m.endFrame();
    expect(m.state(D.key)).toBe('none'); // density-4 wants ignored once capped
    m.beginFrame(6); m.use(B.key); m.use(C.key); m.want([B.key, C.key, E.key], 'now'); m.endFrame();
    expect(m.state(A.key)).toBe('none');
    await io.settleAll();
    expect(m.state(E.key)).toBe('ready');
    expect(m.peakBytes()).toBeLessThanOrEqual(budget);
  });

  it('decode failure marks set failed', async () => {
    const F = entry('f', 2, 2);
    const { io, m, errors } = setup([F], 1000);
    m.beginFrame(1); m.want([F.key], 'now'); m.endFrame();
    await io.settle(file(F, 0));
    await io.settle(file(F, 1), new Error('bad webp'));
    expect(m.state(F.key)).toBe('failed');
    expect(m.use(F.key)).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]![0]).toBe(F.key);
    expect(io.closed).toEqual([file(F, 0)]); // the partial sheet is freed
    expect(m.residentBytes()).toBe(0);
    m.beginFrame(2); m.want([F.key], 'now'); m.endFrame();
    await flush();
    expect(io.pending).toHaveLength(0);
    expect(io.decodes).toHaveLength(2);
    expect(m.state(F.key)).toBe('failed');
    expect(errors).toHaveLength(1);
  });

  it('density cap trips on a spike, lifts after the hysteresis window, and records events', async () => {
    const [A, B, C, E] = [entry('a', 2), entry('b', 2), entry('c', 2), entry('e', 2)];
    const A4 = entry('a', 4, 2); // density-4 counterpart of A: estimated 200 bytes
    const budget = 300; // lift threshold: 75% = 225
    const { io, m } = setup([A, B, C, E, A4], budget);
    m.beginFrame(1); m.want([A.key, B.key, C.key], 'now'); m.endFrame();
    await io.settleAll();
    m.beginFrame(2); m.use(A.key); m.use(B.key); m.use(C.key);
    m.want([A.key, B.key, C.key, E.key], 'now'); m.endFrame();
    expect(m.densityCap()).toBe(2);
    expect(m.capEvents()).toEqual([{ frame: 2, capped: true, pressureBytes: 400 }]);

    // The spike passes: only A is wanted, and A at density 4 (200) is under 75% of the budget.
    const quiet = (f: number, extra: SetKey[] = []): void => {
      m.beginFrame(f); m.use(A.key); m.want([A.key, ...extra], 'now'); m.endFrame();
    };
    for (let f = 3; f <= 30; f++) quiet(f);
    quiet(31, [B.key]); // density-4 estimate 200 + 100 = 300 >= 225: the window restarts
    for (let f = 32; f <= 90; f++) quiet(f);
    expect(m.densityCap()).toBe(2); // 59 quiet frames
    quiet(91);
    expect(m.densityCap()).toBe(4); // 60 quiet frames
    expect(m.capEvents()).toEqual([
      { frame: 2, capped: true, pressureBytes: 400 },
      { frame: 91, capped: false, pressureBytes: 200 },
    ]);
    m.beginFrame(92); m.want([A4.key], 'now'); m.endFrame();
    expect(m.state(A4.key)).toBe('loading'); // density-4 wants are accepted again
    await io.settleAll();
  });

  it('a density-4 set freed for budget stays freed when re-wanted, without capping', async () => {
    const [A, D] = [entry('a', 4), entry('d', 4)];
    const [B, C] = [entry('b', 2), entry('c', 2)];
    const budget = 300;
    const { io, m } = setup([A, B, C, D], budget);
    m.beginFrame(1); m.want([A.key, D.key, B.key], 'now'); m.endFrame();
    await io.settleAll();
    m.beginFrame(2); m.use(A.key); m.use(B.key); m.want([A.key, D.key, B.key], 'now'); m.endFrame();
    expect(m.state(D.key)).toBe('ready'); // no pressure yet
    m.beginFrame(3); m.use(A.key); m.use(B.key); m.want([A.key, D.key, B.key, C.key], 'now'); m.endFrame();
    expect(m.state(D.key)).toBe('none'); // ladder step 2
    expect(m.isDemoted(D.key)).toBe(true);
    await io.settleAll();

    // The caller re-wants D the very next frame: it stays freed and the cap does not trip.
    for (let f = 4; f <= 5; f++) {
      m.beginFrame(f); m.use(A.key); m.use(B.key); m.use(C.key);
      m.want([A.key, B.key, C.key, D.key], 'now'); m.endFrame();
      await flush();
      expect(m.state(D.key)).toBe('none');
      expect(m.densityCap()).toBe(4);
    }
    expect(io.decodes.filter((x) => x === file(D))).toHaveLength(1);
    expect(m.capEvents()).toEqual([]);

    // Demotions clear on the same rule as the cap: 60 frames under 75% of the budget.
    for (let f = 6; f <= 65; f++) { m.beginFrame(f); m.use(A.key); m.want([A.key], 'now'); m.endFrame(); }
    expect(m.isDemoted(D.key)).toBe(false);
    m.beginFrame(66); m.want([A.key, D.key], 'now'); m.endFrame();
    expect(m.state(D.key)).toBe('loading');
    await io.settleAll();
    expect(m.state(D.key)).toBe('ready');
  });
  it('held bytes (tinted and cropped frames) count in the budget', async () => {
    const [A, B] = [entry('a', 2), entry('b', 2)];
    const { io, m } = setup([A, B], 2 * SHEET_BYTES);
    m.beginFrame(1); m.want([A.key], 'now'); m.endFrame();
    await io.settleAll();
    m.hold('look', 150);
    expect(m.residentBytes()).toBe(SHEET_BYTES + 150);
    expect(m.peakBytes()).toBe(SHEET_BYTES + 150);
    // A held 150 leaves no room beside A for B: B waits.
    m.beginFrame(2); m.use(A.key); m.want([A.key, B.key], 'now'); m.endFrame();
    await flush();
    expect(io.inFlight()).toEqual([]);
    m.hold('look', 0);
    expect(m.residentBytes()).toBe(SHEET_BYTES);
    m.beginFrame(3); m.use(A.key); m.want([A.key, B.key], 'now'); m.endFrame();
    await io.settleAll();
    expect(m.state(B.key)).toBe('ready');
  });
});

describe('SetManager: memory held outside it (final review C1, I3, T5)', () => {
  it('admit: room beside the sets holds the bytes; no room refuses them and the refusal is pressure', async () => {
    const [A, A2] = [entry('a', 4, 2), entry('a', 2)];
    const { io, m } = setup([A, A2], 300);
    m.beginFrame(1); m.want([A.key], 'now'); m.endFrame();
    await io.settleAll();
    m.beginFrame(2); m.use(A.key); m.want([A.key], 'now');
    expect(m.admit('t1', 100)).toBe(true);
    expect(m.residentBytes()).toBe(300);
    // No room for 50 more: refused, nothing held, and the ladder sees 350 > 300 (asked twice, counted once).
    expect(m.admit('t2', 50)).toBe(false);
    expect(m.admit('t2', 50)).toBe(false);
    expect(m.snapshot().refused).toBe(50);
    expect(m.residentBytes()).toBe(300);
    m.endFrame();
    expect(m.densityCap()).toBe(2);
    expect(m.capEvents()).toEqual([{ frame: 2, capped: true, pressureBytes: 350 }]);
    // Shrinking or keeping a holding is always admitted.
    m.beginFrame(3);
    expect(m.admit('t1', 100)).toBe(true);
    expect(m.snapshot().refused).toBe(0);
  });

  it('tryAdmit: holds what fits like admit; what does not fit changes nothing and is no pressure (fix round 1, I2)', async () => {
    const [A, A2] = [entry('a', 4, 2), entry('a', 2)];
    const { io, m } = setup([A, A2], 300);
    m.beginFrame(1); m.want([A.key], 'now'); m.endFrame();
    await io.settleAll();
    m.beginFrame(2); m.use(A.key); m.want([A.key], 'now');
    expect(m.tryAdmit(CLASSIC_HOLD, 100)).toBe(true);
    expect(m.snapshot().held.classic).toBe(100);
    expect(m.tryAdmit(CLASSIC_HOLD, 150)).toBe(false);
    expect(m.snapshot().held.classic).toBe(100);
    expect(m.snapshot().refused).toBe(0);
    m.endFrame();
    expect(m.densityCap()).toBe(4);
    expect(m.capEvents()).toEqual([]);
  });

  it('the ladder reclaims held memory before it lowers any density', async () => {
    const A = entry('a', 4, 2);
    const { io, m } = setup([A], 300);
    m.beginFrame(1); m.want([A.key], 'now'); m.endFrame();
    await io.settleAll();
    const order: string[] = [];
    m.hold('ground', 150);
    m.addReclaimer((need) => { order.push(`ground ${need}`); m.hold('ground', 50); return 100; });
    m.addReclaimer((need) => { order.push(`tints ${need}`); return 0; });
    m.beginFrame(2); m.use(A.key); m.want([A.key], 'now'); m.endFrame();
    // 200 + 150 = 350: the ground gives back 100 and the second reclaimer is not needed.
    expect(order).toEqual(['ground 50']);
    expect(m.densityCap()).toBe(4);
    expect(m.capEvents()).toEqual([]);
    expect(m.split()).toEqual({ sets: 200, tints: 0, ground: 50, classic: 0 });
  });

  it('a reclaimer that throws is reported and the ladder goes on', async () => {
    const A = entry('a', 4, 2);
    const { io, m, errors } = setup([A], 300);
    m.beginFrame(1); m.want([A.key], 'now'); m.endFrame();
    await io.settleAll();
    m.hold('ground', 150);
    m.addReclaimer(() => { throw new Error('boom'); });
    m.beginFrame(2); m.use(A.key); m.want([A.key], 'now'); m.endFrame();
    expect(errors.map(([k]) => k)).toEqual(['reclaim']);
    expect(m.densityCap()).toBe(2);
  });

  it('the cap lifts only when held memory fits at its density-4 size too (I3)', async () => {
    const [A, B, A4] = [entry('a', 2), entry('b', 2), entry('a', 4, 2)];
    const budget = 400; // lift below 300
    const { io, m } = setup([A, B, A4], budget);
    m.beginFrame(1); m.want([A.key, B.key], 'now'); m.endFrame();
    await io.settleAll();
    m.hold('x', 250);
    m.beginFrame(2); m.use(A.key); m.use(B.key); m.want([A.key, B.key], 'now'); m.endFrame();
    expect(m.densityCap()).toBe(2);
    // Quiet: A (200 at density 4) + a held 25 that is 100 at density 4 = 300: not under 300, the cap stays.
    m.hold('x', 25, 100);
    for (let f = 3; f <= 80; f++) { m.beginFrame(f); m.use(A.key); m.want([A.key], 'now'); m.endFrame(); }
    expect(m.densityCap()).toBe(2);
    // The same holding counted at its own size would lift.
    m.hold('x', 25, 25);
    for (let f = 81; f <= 140; f++) { m.beginFrame(f); m.use(A.key); m.want([A.key], 'now'); m.endFrame(); }
    expect(m.densityCap()).toBe(4);
  });

  it('a now set that does not fit yet does not hold up smaller now sets behind it (T5 head of line)', async () => {
    const [A, Big, S] = [entry('a', 2, 2), entry('big', 2, 3), entry('s', 2)];
    const { io, m } = setup([A, Big, S], 400);
    m.beginFrame(1); m.want([A.key], 'now'); m.endFrame();
    await io.settleAll();
    m.beginFrame(2); m.use(A.key); m.want([A.key, Big.key, S.key], 'now'); m.endFrame();
    await flush();
    // 200 resident: Big (300) does not fit, S (100) does and starts.
    expect(io.decodes).toContain(file(S));
    expect(io.decodes).not.toContain(file(Big));
    expect(m.snapshot().queueHead).toEqual({ key: Big.key, estimate: 300, priority: 'now' });
    await io.settleAll();
    expect(m.state(S.key)).toBe('ready');
  });

  it('a set larger than the whole budget is reported once and drawn with today\'s art', async () => {
    const [Big, S] = [entry('big', 2, 5), entry('s', 2)];
    const { io, m, errors } = setup([Big, S], 300);
    for (let f = 1; f <= 3; f++) { m.beginFrame(f); m.want([Big.key, S.key], 'now'); m.endFrame(); }
    expect(m.state(Big.key)).toBe('failed');
    expect(errors.map(([k]) => k)).toEqual([Big.key]);
    await io.settleAll();
    expect(m.state(S.key)).toBe('ready');
  });

  it('preloadAll reads every listed sheet once, so no decode reads again', async () => {
    const [A, B] = [entry('a', 2, 2), entry('b', 4)];
    const { io, m } = setup([A, B], 1000);
    const seen: number[] = [];
    const got = await m.preloadAll((n) => seen.push(n));
    expect(got.files).toBe(3);
    expect(seen).toEqual([1, 2, 3]);
    expect(io.reads.sort()).toEqual([file(A, 0), file(A, 1), file(B)].sort());
    m.beginFrame(1); m.want([A.key, B.key], 'now'); m.endFrame();
    await io.settleAll();
    expect(io.reads).toHaveLength(3);
  });

  it('snapshot: queue head, committed, held by id, capped, demoted', async () => {
    const A = entry('a', 2);
    const { m } = setup([A], 1000);
    m.hold('ground', 30);
    m.hold('guest:b0o0:d2:rall#ff0000', 20);
    m.beginFrame(1); m.want([A.key], 'ahead');
    const snap = m.snapshot();
    expect(snap.queueHead).toEqual({ key: A.key, estimate: 100, priority: 'ahead' });
    expect(snap.held).toEqual({ ground: 30, 'guest:b0o0:d2:rall#ff0000': 20 });
    expect(snap.split).toEqual({ sets: 0, tints: 20, ground: 30, classic: 0 });
    expect(snap.committed).toBe(50);
    expect(snap.capped).toBe(false);
    expect(snap.demoted).toEqual([]);
  });

  it('resetPressure clears the cap, demotions and room count, and frees no set', async () => {
    const [A, B] = [entry('a', 2, 2), entry('b', 2, 2)];
    const { io, m } = setup([A, B], 300);
    m.beginFrame(1); m.want([A.key], 'now'); m.endFrame();
    await io.settleAll();
    m.beginFrame(2); m.use(A.key); m.want([A.key, B.key], 'now'); m.endFrame();
    expect(m.densityCap()).toBe(2);
    m.resetPressure();
    expect(m.densityCap()).toBe(4);
    expect(m.state(A.key)).toBe('ready');
    expect(m.capEvents().map((e) => e.capped)).toEqual([true, false]);
    await io.settleAll();
  });
});

describe('SetManager: the ladder\'s last step (round 3 item 2)', () => {
  it('starved: a queued set that cannot fit after the ladder ran; not one that only waits, is in flight or fits', async () => {
    const [A, Big, S] = [entry('a', 2, 2), entry('big', 2, 3), entry('s', 2)];
    const { io, m } = setup([A, Big, S], 400);
    m.beginFrame(1); m.want([A.key], 'now'); m.endFrame();
    await io.settleAll();
    // A (200) is drawn every frame, so the ladder cannot free it: Big (300) never fits beside it.
    m.beginFrame(2); m.use(A.key); m.want([A.key, Big.key, S.key], 'now'); m.endFrame();
    expect(m.starved(Big.key)).toBe(true);
    expect(m.starved(S.key)).toBe(false); // in flight
    expect(m.starved(A.key)).toBe(false); // ready
    await io.settleAll();
    m.beginFrame(3); m.use(A.key); m.use(S.key); m.want([A.key, Big.key, S.key], 'now'); m.endFrame();
    expect(m.starved(Big.key)).toBe(true);
    // A is no longer drawn or wanted: freed, and Big fits and starts.
    m.beginFrame(4); m.want([Big.key], 'now'); m.endFrame();
    m.beginFrame(5); m.want([Big.key], 'now'); m.endFrame();
    expect(m.starved(Big.key)).toBe(false);
    await io.settleAll();
    expect(m.state(Big.key)).toBe('ready');
  });
});

describe('SetManager: compressed blobs (round 3 item 6)', () => {
  it('blobBytes counts each file read once (they are kept), outside the decode budget', async () => {
    const [A, B] = [entry('a', 2, 2), entry('b', 2)];
    const { io, m } = setup([A, B], 1000);
    await m.preloadAll();
    await flush();
    // FakeIO blobs hold the file name as text.
    const size = (f: string) => new Blob([f]).size;
    expect(m.blobBytes()).toBe(size(file(A, 0)) + size(file(A, 1)) + size(file(B)));
    m.beginFrame(1); m.want([A.key, B.key], 'now'); m.endFrame();
    await io.settleAll();
    expect(m.blobBytes()).toBe(size(file(A, 0)) + size(file(A, 1)) + size(file(B)));
    expect(m.residentBytes()).toBe(300);
  });
});

describe('a view turn near the budget (Task 3 fix round 3)', () => {
  /** A ride's set at a turn: density 4 has 4 sheets (400 B), density 2 two (200 B). */
  function turnEntry(item: string, density: 2 | 4, rot: 0 | 1): RealSetEntry {
    const sheets = density === 4 ? 4 : 2;
    return {
      key: setKey('ride', item, density, rot), kind: 'ride', item, density, rot,
      sheets: Array.from({ length: sheets }, (_, i) => ({ file: `${item}-d${density}-r${rot}-${i}.webp`, w: 5, h: 5 })),
      frames: {},
    };
  }

  it('two turns together exceed the budget, each alone fits: the turn completes with no cap or demotion, and the old turn is freed', async () => {
    const items = ['a', 'b'];
    const all = items.flatMap((it) => [turnEntry(it, 2, 0), turnEntry(it, 4, 0), turnEntry(it, 2, 1), turnEntry(it, 4, 1)]);
    // One turn at density 4: 800 B. Both turns: 1600 B. Budget 1000 B.
    const { io, m } = setup(all, 1000);
    const k = (it: string, d: 2 | 4, r: 0 | 1) => setKey('ride', it, d, r);
    let frame = 0;
    /** As RealLook's prepare and draw: the turn's density-4 set, with its density-2 twin first while it loads; drawn from what is ready. */
    const step = async (r: 0 | 1): Promise<void> => {
      m.beginFrame(++frame);
      for (const it of items) {
        const d4 = k(it, 4, r);
        if (m.state(d4) === 'ready') { m.want([d4], 'now'); m.use(d4); continue; }
        m.want([k(it, 2, r), d4], 'now');
        m.use(k(it, 2, r));
      }
      m.endFrame();
      await io.settleAll();
    };
    for (let f = 0; f < 4; f++) await step(0);
    expect(items.map((it) => m.state(k(it, 4, 0)))).toEqual(['ready', 'ready']);
    // The turn: the old turn's sets are still resident (drawn last frame) when the new turn is wanted.
    for (let f = 0; f < 8; f++) await step(1);
    expect(m.capEvents()).toEqual([]);
    expect(m.snapshot().demoted).toEqual([]);
    expect(m.densityCap()).toBe(4);
    expect(items.map((it) => m.state(k(it, 4, 1)))).toEqual(['ready', 'ready']);
    // The old turn's sets are freed, and so are the twins once their density-4 sets landed.
    expect(items.flatMap((it) => [m.state(k(it, 4, 0)), m.state(k(it, 2, 1))])).toEqual(['none', 'none', 'none', 'none']);
    expect(m.peakBytes()).toBeLessThanOrEqual(1000);
  });

  it('a twin that leaves its density-4 set no room still counts, so the ladder acts (no silent wait)', async () => {
    const all = [turnEntry('a', 2, 0), turnEntry('a', 4, 0)];
    // 600 B for both, 500 B budget: the twin (200 B) lands first and the density-4 set (400 B) cannot start beside it.
    const { io, m } = setup(all, 500);
    const d2 = setKey('ride', 'a', 2, 0);
    const d4 = setKey('ride', 'a', 4, 0);
    for (let f = 1; f <= 6; f++) {
      m.beginFrame(f);
      if (m.state(d4) === 'ready') { m.want([d4], 'now'); m.use(d4); } else { m.want([d2, d4], 'now'); m.use(d2); }
      m.endFrame();
      await io.settleAll();
    }
    expect(m.capEvents().length).toBeGreaterThan(0);
    expect(m.densityCap()).toBe(2);
  });
});


describe('a reserve for holds that grow without asking (final review I1)', () => {
  const MiB = 2 ** 20;
  /** 130 sets of 1 MiB each (one 512 × 512 sheet), decoded at once. */
  function full(reserve: number) {
    const sets = Array.from({ length: 130 }, (_, i): RealSetEntry => ({
      key: setKey('ride', `r${i}`, 2, 0), kind: 'ride', item: `r${i}`, density: 2, rot: 0,
      sheets: [{ file: `r${i}.webp`, w: 512, h: 512 }], frames: {},
    }));
    const io: SetIO = {
      read: (f) => Promise.resolve(new Blob([f])),
      decode: () => Promise.resolve({ image: {} as CanvasImageSource, bytes: MiB, close: () => undefined }),
    };
    const m = new SetManager(index(sets), io, 128 * MiB, () => undefined, reserve);
    return { m, keys: sets.map((s) => s.key) };
  }

  async function pumpFull(m: SetManager, keys: SetKey[]): Promise<void> {
    for (let f = 1; f <= 40; f++) {
      m.beginFrame(f);
      m.want(keys, 'now');
      for (const k of keys) m.use(k);
      m.hold(CLASSIC_HOLD, 5 * MiB); // today's static layer, steady
      m.endFrame();
      await flush();
    }
  }

  it('a classic jump and a scratch growth after a full pump keep resident memory within 128 MiB', async () => {
    expect(HOLD_RESERVE_BYTES).toBe(2 * MiB);
    const { m, keys } = full(HOLD_RESERVE_BYTES);
    await pumpFull(m, keys);
    // Full: decodes filled the budget less the reserve, and an admit that would cross it is refused.
    expect(m.snapshot().committed).toBe(126 * MiB);
    expect(m.admit('tint:0', MiB)).toBe(false);
    // After the frame: today's sprites grow 1.5 MiB, the tint scratch canvas 0.4 MiB, both without asking.
    m.beginFrame(41);
    m.hold(TINT_SCRATCH, 0.4 * MiB);
    m.hold(CLASSIC_HOLD, 6.5 * MiB);
    expect(m.residentBytes()).toBeLessThanOrEqual(128 * MiB);
    expect(m.peakBytes()).toBeLessThanOrEqual(128 * MiB);
  });

  it('without the reserve the same growth lands above 128 MiB', async () => {
    const { m, keys } = full(0);
    await pumpFull(m, keys);
    expect(m.snapshot().committed).toBe(128 * MiB);
    m.hold(TINT_SCRATCH, 0.4 * MiB);
    m.hold(CLASSIC_HOLD, 6.5 * MiB);
    expect(m.residentBytes()).toBeGreaterThan(128 * MiB);
  });
});

describe('room beside the outgoing sets (final review minor 1)', () => {
  it('a set drawn this frame without a want is not outgoing: its twin still counts as pressure', async () => {
    const X = entry('x', 2, 2);
    const A2 = entry('a', 2, 2);
    const A4 = entry('a', 4, 4);
    const run = async (drawX: boolean): Promise<number> => {
      // 600 B: X (200) and the twin (200) leave 200 B, too little for the density-4 set (400).
      const { io, m } = setup([X, A2, A4], 600);
      m.beginFrame(1);
      m.want([X.key, A2.key], 'now');
      m.endFrame();
      await io.settleAll();
      m.beginFrame(2);
      m.want([A2.key, A4.key], 'now');
      if (drawX) m.use(X.key); // a late draw: drawn, not wanted
      m.use(A2.key);
      return m.snapshot().pressure;
    };
    // X not drawn: on its way out, so the density-4 set can start once it goes and the twin is not counted.
    expect(await run(false)).toBe(400);
    // X drawn: it stays, the density-4 set has no room beside it, so the twin counts and the ladder sees all 600 B.
    expect(await run(true)).toBe(600);
  });
});

describe('ride colours (Task 5): coloured sets are tinted once at load', () => {
  /** A canvas holding pixels (enough for the band tint in node). */
  class Pix {
    data: Uint8ClampedArray;
    /** Closed (an ImageBitmap's `close`): drawing it throws, as a detached bitmap does. */
    detached = false;
    constructor(public width: number, public height: number, fill?: number[]) {
      this.data = new Uint8ClampedArray(width * height * 4);
      if (fill) for (let i = 0; i < this.data.length; i += 4) this.data.set(fill, i);
    }
    getContext(): unknown {
      const self = this;
      return {
        drawImage(src: Pix, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number) {
          if (src.detached || src.width === 0) throw new Error('InvalidStateError: drawing a closed picture');
          for (let y = 0; y < sh; y++) self.data.set(src.data.subarray(((sy + y) * src.width + sx) * 4, ((sy + y) * src.width + sx + sw) * 4), ((dy + y) * self.width + dx) * 4);
        },
        getImageData(x: number, y: number, w: number, h: number) {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let r = 0; r < h; r++) data.set(self.data.subarray(((y + r) * self.width + x) * 4, ((y + r) * self.width + x + w) * 4), r * w * 4);
          return { width: w, height: h, data };
        },
        putImageData(img: { width: number; height: number; data: Uint8ClampedArray }, x: number, y: number) {
          for (let r = 0; r < img.height; r++) self.data.set(img.data.subarray(r * img.width * 4, (r + 1) * img.width * 4), ((y + r) * self.width + x) * 4);
        },
      };
    }
  }
  const W = 4;
  const H = 100;
  const BAND = 32;
  /** Decoded bytes of one sheet (and of one mask, and of one tinted copy). */
  const SHEET = W * H * 4;
  const SCRATCH = W * BAND * 4;
  const RED = [0x8a, 0x1c, 0x1c, 255];
  const LEMON = [0xf2, 0xc2, 0x30];
  const SKY = [0x3d, 0x9b, 0xe0];

  function rideEntry(item: string, density: 2 | 4, n = 1): RealSetEntry {
    const sheets: RealSetEntry['sheets'] = [];
    for (let i = 0; i < n; i++) {
      const f = `${item}-d${density}-${i}`;
      sheets.push({ file: `${f}.webp`, w: W, h: H, mask: `${f}-mask.png` }, { file: `${f}-mask.png`, w: W, h: H });
    }
    return { key: setKey('ride', item, density, 0), kind: 'ride', item, density, rot: 0, sheets, frames: {}, baseColour: '#8a1c1c' };
  }

  /** Decodes land at once: sheets are the base red, masks full weight. */
  class PixIO implements SetIO {
    decodes: string[] = [];
    closed: string[] = [];
    /** Files whose decode fails; `file#n`: only its n-th decode (1-based). */
    fail = new Set<string>();
    /** `file#n`: its n-th decode waits for this promise. */
    wait = new Map<string, Promise<void>>();
    read(file: string): Promise<Blob> { return Promise.resolve(new Blob([file])); }
    async decode(blob: Blob): Promise<Decoded> {
      const file = await blob.text();
      this.decodes.push(file);
      const nth = `${file}#${this.decodes.filter((f) => f === file).length}`;
      await this.wait.get(nth);
      if (this.fail.has(file) || this.fail.has(nth)) throw new Error(`cannot decode ${file}`);
      const img = new Pix(W, H, file.endsWith('-mask.png') ? [255, 255, 255, 255] : RED);
      return { image: img as unknown as CanvasImageSource, bytes: SHEET, close: () => { img.detached = true; this.closed.push(file); } };
    }
  }

  function setupColours(sets: RealSetEntry[], budget: number, makeCanvas?: (w: number, h: number) => unknown, more: SetManagerOptions = {}) {
    const io = new PixIO();
    const errors: [SetKey, unknown][] = [];
    let t = 0;
    // Each clock read moves 3 ms: a frame's TINT_FRAME_MS (3 ms) is spent after one band.
    const m = new SetManager(index(sets), io, budget, (k, e) => errors.push([k, e]), 0, {
      makeCanvas: (makeCanvas ?? ((w: number, h: number) => new Pix(w, h))) as never,
      now: () => (t += 3),
      tintBandPx: BAND,
      toBitmap: null,
      ...more,
    });
    let frame = 0;
    const step = async (keys: SetKey[]): Promise<void> => {
      m.beginFrame(++frame);
      m.want(keys, 'now');
      for (const k of keys) m.use(k) ?? m.interim(k);
      m.endFrame();
      await flush();
      await flush();
    };
    return { io, m, errors, step };
  }
  const pixel = (img: CanvasImageSource): number[] => Array.from((img as unknown as Pix).data.subarray(0, 3));

  it('an Original ride set never decodes its masks: resident and estimate exclude them', async () => {
    const A = rideEntry('carousel', 2);
    // Room for the sheet alone: the masks are not part of an Original set's cost.
    const { io, m, step } = setupColours([A], SHEET);
    await step([A.key]);
    expect(m.state(A.key)).toBe('ready');
    expect(io.decodes).toEqual([`carousel-d2-0.webp`]);
    expect(m.residentBytes()).toBe(SHEET);
    const rs = m.use(A.key)!;
    expect(rs.images).toHaveLength(1);
    expect(rs.sheets).toEqual([{ file: 'carousel-d2-0.webp', w: W, h: H }]);
  });

  it('a coloured set draws the Original pictures while tinting, then the tinted ones; afterwards it costs what Original costs', async () => {
    const A = rideEntry('carousel', 2);
    const key = setKey('ride', 'carousel', 2, 0, 2);
    const { io, m, step } = setupColours([A], 1e9);
    await step([key]);
    expect(m.state(key)).toBe('loading');
    expect(m.use(key)).toBeNull();
    const during = m.interim(key);
    expect(during).not.toBeNull();
    expect(pixel(during!.images[0]!)).toEqual(RED.slice(0, 3));
    let frames = 1;
    while (m.state(key) !== 'ready' && frames < 50) { await step([key]); frames++; if (m.state(key) !== 'ready') expect(m.interim(key)).not.toBeNull(); }
    // 100 rows in bands of 32, one band a frame: four frames of tinting, never one long frame.
    expect(frames).toBeGreaterThanOrEqual(4);
    const rs = m.use(key)!;
    expect(rs.key).toBe(key);
    expect(rs.images).toHaveLength(1);
    expect(pixel(rs.images[0]!).map((c, i) => Math.abs(c - LEMON[i]!) <= 1)).toEqual([true, true, true]);
    expect(m.interim(key)).toBeNull();
    // Base and mask closed: resident is exactly the Original set's size.
    expect(io.closed.sort()).toEqual(['carousel-d2-0-mask.png', 'carousel-d2-0.webp']);
    expect(m.residentBytes()).toBe(SHEET);
    // The peak was the base, the mask, the tinted copy and the band scratch, together.
    expect(m.peakBytes()).toBe(3 * SHEET + SCRATCH);
  });

  it('the tint peak is admitted before it starts and never passes the budget', async () => {
    const A = rideEntry('carousel', 2);
    const key = setKey('ride', 'carousel', 2, 0, 2);
    const peak = 3 * SHEET + SCRATCH;
    const tight = setupColours([A], peak - 1);
    for (let f = 0; f < 5; f++) await tight.step([key]);
    expect(tight.m.state(key)).not.toBe('ready');
    expect(tight.io.decodes).toEqual([]);
    expect(tight.m.peakBytes()).toBe(0);
    const fits = setupColours([A], peak);
    for (let f = 0; f < 10; f++) await fits.step([key]);
    expect(fits.m.state(key)).toBe('ready');
    expect(fits.m.peakBytes()).toBeLessThanOrEqual(peak);
  });

  it('the same ride in two colours is two sets, tinted one after the other', async () => {
    const A = rideEntry('carousel', 2);
    const lemon = setKey('ride', 'carousel', 2, 0, 2);
    const sky = setKey('ride', 'carousel', 2, 0, 4);
    const { io, m, step } = setupColours([A], 1e9);
    let both = 0;
    for (let f = 0; f < 30; f++) {
      await step([lemon, sky]);
      if (m.interim(lemon) && m.interim(sky)) both++;
    }
    expect(both).toBe(0);
    expect(m.state(lemon)).toBe('ready');
    expect(m.state(sky)).toBe('ready');
    expect(pixel(m.use(sky)!.images[0]!).map((c, i) => Math.abs(c - SKY[i]!) <= 1)).toEqual([true, true, true]);
    expect(m.use(lemon)!.images[0]).not.toBe(m.use(sky)!.images[0]);
    expect(m.residentBytes()).toBe(2 * SHEET);
    // One tint at a time: the peak is one tint beside the other (finished) set.
    expect(m.peakBytes()).toBeLessThanOrEqual(SHEET + 3 * SHEET + SCRATCH);
    expect(io.decodes.filter((f) => f.endsWith('mask.png'))).toHaveLength(2);
  });

  it('a failed tint (canvas without a 2D context) keeps the Original pictures as the set, flagged and reported', async () => {
    const A = rideEntry('carousel', 2);
    const key = setKey('ride', 'carousel', 2, 0, 2);
    const { io, m, errors, step } = setupColours([A], 1e9, (w, h) => ({ width: w, height: h, getContext: () => null }));
    for (let f = 0; f < 5; f++) await step([key]);
    expect(m.state(key)).toBe('ready');
    const rs = m.use(key)!;
    expect(rs.tintFailed).toBe(true);
    expect(pixel(rs.images[0]!)).toEqual(RED.slice(0, 3));
    expect(errors.map(([k]) => k)).toEqual([key]);
    expect(io.closed).toEqual(['carousel-d2-0-mask.png']);
    expect(m.residentBytes()).toBe(SHEET);
  });

  it('a coloured set no longer wanted mid-tint frees its base, mask and tinted copy', async () => {
    const A = rideEntry('carousel', 2);
    const key = setKey('ride', 'carousel', 2, 0, 2);
    const { io, m, step } = setupColours([A], 1e9);
    await step([key]);
    await step([key]);
    expect(m.interim(key)).not.toBeNull();
    for (let f = 0; f < 4; f++) await step([]);
    expect(m.state(key)).toBe('none');
    expect(m.residentBytes()).toBe(0);
    expect(io.closed.sort()).toEqual(['carousel-d2-0-mask.png', 'carousel-d2-0.webp']);
  });

  it('a coloured density-2 set\'s density-4 counterpart is the coloured density-4 set; unknown colour keys are refused', async () => {
    const A2 = rideEntry('carousel', 2);
    const A4 = rideEntry('carousel', 4);
    const { m, errors, step } = setupColours([A2, A4], 1e9);
    const k2 = setKey('ride', 'carousel', 2, 0, 3);
    const k4 = setKey('ride', 'carousel', 4, 0, 3);
    for (let f = 0; f < 12; f++) await step([k2, k4]);
    expect(m.state(k2)).toBe('ready');
    expect(m.state(k4)).toBe('ready');
    // A set without a base colour (a stall), or a colour outside the palette, is an unknown set.
    await step([setKey('ride', 'carousel', 2, 0, 99)]);
    expect(errors.map(([k]) => k)).toEqual([setKey('ride', 'carousel', 2, 0, 99)]);
  });

  it('fix 1: queued coloured sets count at their settled size; the tint peak once: no false cap, no cancelled tint', async () => {
    // Density 4: a cap would drop them. a: 3 sheets (settled 3 sheets, load +2 sheets + scratch); b: 1 sheet.
    const A = rideEntry('a', 4, 3);
    const B = rideEntry('b', 4, 1);
    const keys = [setKey('ride', 'a', 4, 0, 2), setKey('ride', 'a', 4, 0, 4), setKey('ride', 'b', 4, 0, 2)];
    const settled = 3 * SHEET + 3 * SHEET + SHEET;
    const tintPeak = 2 * SHEET + SCRATCH;
    // Room for everything settled and one tint on top; the three loads summed (20736 B) would not fit.
    const budget = settled + tintPeak + 100;
    expect(3 * SHEET + tintPeak + 3 * SHEET + tintPeak + SHEET + tintPeak).toBeGreaterThan(budget);
    const { io, m, step } = setupColours([A, B], budget);
    for (let f = 0; f < 60; f++) {
      await step(keys);
      expect(m.densityCap()).toBe(4);
    }
    for (const k of keys) expect(m.state(k)).toBe('ready');
    expect(m.capEvents()).toEqual([]);
    expect(m.peakBytes()).toBeLessThanOrEqual(budget);
    // Every base was decoded once: no tint was cancelled and restarted.
    expect(io.decodes.filter((f) => f === 'a-d4-0.webp')).toHaveLength(2);
  });

  it('fix 3: a tint failing on a later sheet puts the sheets already tinted back to their Original pictures', async () => {
    const A = rideEntry('carousel', 2, 2);
    const key = setKey('ride', 'carousel', 2, 0, 2);
    const { io, m, errors, step } = setupColours([A], 1e9);
    io.fail.add('carousel-d2-1-mask.png');
    for (let f = 0; f < 12; f++) await step([key]);
    expect(m.state(key)).toBe('ready');
    const rs = m.use(key)!;
    expect(rs.tintFailed).toBe(true);
    expect(rs.images.map(pixel)).toEqual([RED.slice(0, 3), RED.slice(0, 3)]);
    expect(errors.map(([k]) => k)).toEqual([key]);
    expect(m.residentBytes()).toBe(2 * SHEET);
    expect(m.peakBytes()).toBeLessThanOrEqual(2 * SHEET + 2 * SHEET + SCRATCH);
  });

  it('fix 4: one tint budget a frame: the tint atlas\'s time this frame comes off the set manager\'s; a band only when nothing else ran', async () => {
    const A = rideEntry('carousel', 2);
    const key = setKey('ride', 'carousel', 2, 0, 2);
    let spent = 3;
    const { m, step } = setupColours([A], 1e9, undefined, { tintSpentMs: () => spent });
    for (let f = 0; f < 10; f++) await step([key]);
    // The atlas used the whole budget every frame: no band ran.
    expect(m.state(key)).toBe('loading');
    spent = 0;
    for (let f = 0; f < 10; f++) await step([key]);
    expect(m.state(key)).toBe('ready');
  });

  it('fix 6: a finished sheet becomes an ImageBitmap and its canvas is freed, at the same bytes', async () => {
    const A = rideEntry('carousel', 2);
    const key = setKey('ride', 'carousel', 2, 0, 2);
    const made: Pix[] = [];
    const bitmaps: { from: Pix; closed: boolean }[] = [];
    const { m, step } = setupColours([A], 1e9, (w, h) => { const c = new Pix(w, h); made.push(c); return c; }, {
      toBitmap: async (img) => { const b = { from: img as unknown as Pix, closed: false, close() { this.closed = true; } }; bitmaps.push(b); return b as unknown as ImageBitmap; },
    });
    for (let f = 0; f < 10; f++) await step([key]);
    const rs = m.use(key)!;
    expect(bitmaps).toHaveLength(1);
    expect(rs.images[0]).toBe(bitmaps[0]);
    expect(made[0]!.width).toBe(0); // the tinted canvas, freed once copied
    expect(m.residentBytes()).toBe(SHEET);
    for (let f = 0; f < 4; f++) await step([]);
    expect(bitmaps[0]!.closed).toBe(true);
  });

  /** Every picture `interim` hands out can be drawn (none closed). */
  const drawable = (m: SetManager, key: SetKey): boolean => {
    const rs = m.interim(key);
    if (!rs) return true;
    const probe = new Pix(1, 1).getContext() as { drawImage(src: unknown, ...a: number[]): void };
    try { for (const img of rs.images) probe.drawImage(img, 0, 0, 1, 1, 0, 0); return true; } catch { return false; }
  };

  it('round 2 P1: while a finished sheet is copied to an ImageBitmap, interim never hands out the closed base', async () => {
    const A = rideEntry('carousel', 2, 2);
    const key = setKey('ride', 'carousel', 2, 0, 2);
    let release: (() => void) | null = null;
    const { m, step } = setupColours([A], 1e9, undefined, {
      toBitmap: (img) => new Promise<ImageBitmap>((res) => {
        const b = new Pix(W, H);
        b.data.set((img as unknown as Pix).data);
        release = () => res(b as unknown as ImageBitmap);
      }),
    });
    let bad = 0;
    for (let f = 0; f < 40; f++) {
      await step([key]);
      if (!drawable(m, key)) bad++;
      if (release && f % 3 === 2) { const r = release as () => void; release = null; r(); }
    }
    expect(bad).toBe(0);
    expect(m.state(key)).toBe('ready');
  });

  it('round 2 P1: while a failed tint decodes Original sheets again, interim never hands out a closed tinted copy', async () => {
    const A = rideEntry('carousel', 2, 3);
    const key = setKey('ride', 'carousel', 2, 0, 2);
    const { io, m, step } = setupColours([A], 1e9);
    io.fail.add('carousel-d2-2-mask.png');
    let open!: () => void;
    io.wait.set('carousel-d2-1.webp#2', new Promise<void>((res) => { open = res; }));
    let bad = 0;
    for (let f = 0; f < 30; f++) {
      await step([key]);
      if (!drawable(m, key)) bad++;
      if (f === 20) open();
    }
    expect(bad).toBe(0);
    const rs = m.use(key)!;
    expect(rs.tintFailed).toBe(true);
    expect(rs.images.map(pixel)).toEqual([RED.slice(0, 3), RED.slice(0, 3), RED.slice(0, 3)]);
  });

  it('round 2 P2: a re-decode failing after a failed tint keeps that sheet tinted; the set is ready, flagged and reported, not failed', async () => {
    const A = rideEntry('carousel', 2, 2);
    const key = setKey('ride', 'carousel', 2, 0, 2);
    const { io, m, errors, step } = setupColours([A], 1e9);
    io.fail.add('carousel-d2-1-mask.png');
    io.fail.add('carousel-d2-0.webp#2');
    for (let f = 0; f < 12; f++) await step([key]);
    expect(m.state(key)).toBe('ready');
    const rs = m.use(key)!;
    expect(rs.tintFailed).toBe(true);
    expect(pixel(rs.images[0]!).map((c, i) => Math.abs(c - LEMON[i]!) <= 1)).toEqual([true, true, true]);
    expect(pixel(rs.images[1]!)).toEqual(RED.slice(0, 3));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every(([k]) => k === key)).toBe(true);
    expect(m.residentBytes()).toBe(2 * SHEET);
  });

  it('round 2 P2: with tint time left but less than a band (by the last band\'s time), no band runs', async () => {
    const A = rideEntry('carousel', 2);
    const key = setKey('ride', 'carousel', 2, 0, 2);
    // The atlas spent 1 ms: 2 ms left. A band takes 3 ms (the test clock), so after the first band is measured
    // no further band fits.
    // (Round 3: the estimate decays on frames with no band, so bands come back every other frame or so.)
    const made: Pix[] = [];
    const { m, step } = setupColours([A], 1e9, (w, h) => { const c = new Pix(w, h); made.push(c); return c; }, { tintSpentMs: () => 1 });
    const rows = (): number => { const c = made[0]; let n = 0; if (c) for (let y = 0; y < c.height; y++) if (c.data[y * c.width * 4 + 3]) n++; return n; };
    const per: number[] = [];
    let last = 0;
    for (let f = 0; f < 30 && m.state(key) !== 'ready'; f++) { await step([key]); const n = rows(); per.push(n - last); last = n; }
    // Never more than one band a frame, and never in the frame right after a band (3 ms measured > 2 ms left).
    expect(Math.max(...per)).toBeLessThanOrEqual(BAND);
    for (let i = 1; i < per.length; i++) if (per[i - 1]! > 0) expect(per[i]).toBe(0);
  });

  describe('round 3: no tint starvation', () => {
    /** Rows of the tinted canvas written so far (alpha set). */
    const rowsDone = (c: Pix | undefined): number => {
      if (!c) return 0;
      let n = 0;
      for (let y = 0; y < c.height; y++) if (c.data[(y * c.width) * 4 + 3]) n++;
      return n;
    };
    const recorder = () => {
      const made: Pix[] = [];
      return { made, make: (w: number, h: number) => { const c = new Pix(w, h); made.push(c); return c; } };
    };

    it('an atlas spending the whole budget every frame still lets a band run every 8 frames', async () => {
      const A = rideEntry('carousel', 2);
      const key = setKey('ride', 'carousel', 2, 0, 2);
      const rec = recorder();
      const { m, step } = setupColours([A], 1e9, rec.make, { tintSpentMs: () => 3 });
      const bandFrames: number[] = [];
      let last = 0;
      for (let f = 1; f <= 60 && m.state(key) !== 'ready'; f++) {
        await step([key]);
        const n = rowsDone(rec.made[0]);
        if (n > last) { bandFrames.push(f); last = n; }
      }
      expect(m.state(key)).toBe('ready');
      expect(bandFrames.length).toBeGreaterThanOrEqual(3);
      const gaps = bandFrames.slice(1).map((f, i) => f - bandFrames[i]!);
      for (const g of gaps) expect(g).toBe(8);
    });

    it('one slow band (a GC pause) is not remembered for ever: the estimate decays and the set finishes', async () => {
      const A = rideEntry('carousel', 2);
      const key = setKey('ride', 'carousel', 2, 0, 2);
      let t = 0;
      let inc = 7.5; // two clock reads a band: the first band measures 15 ms
      let slow = true;
      const rec = recorder();
      const { m, step } = setupColours([A], 1e9, rec.make, { now: () => (t += inc), tintSpentMs: () => (slow ? 0 : 0.5) });
      let frames = 0;
      for (; frames < 40 && m.state(key) !== 'ready'; frames++) {
        await step([key]);
        // After the slow band: bands take 0.5 ms, and the atlas spends 0.5 ms every frame.
        if (slow && rowsDone(rec.made[0]) > 0) { slow = false; inc = 0.25; }
      }
      expect(slow).toBe(false);
      expect(m.state(key)).toBe('ready');
      // Faster than the 8-frame rule alone (3 more bands at 8 frames each): the estimate decayed.
      expect(frames).toBeLessThan(20);
    });

    it('a coarse clock (bands measure 0 ms) runs at most budget / 0.25 bands a frame', async () => {
      const A = rideEntry('carousel', 2);
      const key = setKey('ride', 'carousel', 2, 0, 2);
      const rec = recorder();
      const { m, step } = setupColours([A], 1e9, rec.make, { now: () => 1000, tintBandPx: 1 });
      const perFrame: number[] = [];
      let last = 0;
      for (let f = 0; f < 30 && m.state(key) !== 'ready'; f++) {
        await step([key]);
        const n = rowsDone(rec.made[0]);
        perFrame.push(n - last);
        last = n;
      }
      expect(Math.max(...perFrame)).toBeLessThanOrEqual(3 / 0.25);
      expect(Math.max(...perFrame)).toBeGreaterThan(1);
    });

    it('with no budget left (atlas spent 3 ms) a coarse clock runs no band between the 8-frame bands', async () => {
      const A = rideEntry('carousel', 2);
      const key = setKey('ride', 'carousel', 2, 0, 2);
      const rec = recorder();
      const { step } = setupColours([A], 1e9, rec.make, { now: () => 1000, tintBandPx: 1, tintSpentMs: () => 3 });
      const perFrame: number[] = [];
      let last = 0;
      for (let f = 0; f < 20; f++) {
        await step([key]);
        const n = rowsDone(rec.made[0]);
        perFrame.push(n - last);
        last = n;
      }
      expect(Math.max(...perFrame)).toBe(1);
      expect(perFrame.filter((n) => n > 0).length).toBeLessThanOrEqual(3);
    });
  });
});
