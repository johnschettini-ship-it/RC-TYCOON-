import { describe, expect, it } from 'vitest';
import { setKey, type RealIndex, type RealSetEntry, type SetKey } from '../../../../src/render/real/indexFormat';
import { SetManager, type Decoded, type SetIO } from '../../../../src/render/real/setManager';

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
});
