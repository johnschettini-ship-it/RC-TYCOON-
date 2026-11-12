/** Phase 8b stage 0b test (never merged): the picture store (queue, decode limit, eviction, budget parts, swaps, frame sets). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { K_RAIL, K_RIDE } from '../../../../src/render/artHook';
import { encodeIndex, swapTableIndex, type PackIndex, type PackSheet } from '../../../../src/render/pixel/app/format';
import { browserIo, PictureStore, type StoreIo } from '../../../../src/render/pixel/app/store';
import { encodeIndexedPng } from '../../../../tools/sheets/png';

const SLOTS = 4;
const PALETTE = Uint8Array.from([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
/** 38 tables; table k maps slot 1 → slot 2 when k is odd (enough to see a swap happen). */
const SWAPS = Array.from({ length: 38 }, (_, k) => Uint8Array.from([0, k & 1 ? 2 : 1, 2, 3]));

/** A pack with one entry per sheet: sheet i is `w × h`, entry key `keys[i]` at (1, 2), anchor (3, 4). */
function pack(kind: number, keys: number[], w = 8, h = 8, swappable = 0): { index: Uint8Array; sheets: PackSheet[] } {
  const sheets: PackSheet[] = keys.map((_, i) => ({ file: `g-${i}.png`, w, h, swappable }));
  const n = keys.length;
  const ix: PackIndex = {
    palette: PALETTE,
    swaps: SWAPS,
    sheets,
    kind: new Uint8Array(n).fill(kind),
    key: Float64Array.from(keys),
    sheet: Uint16Array.from(keys.map((_, i) => i)),
    x: new Uint16Array(n).fill(1),
    y: new Uint16Array(n).fill(2),
    w: new Uint16Array(n).fill(4),
    h: new Uint16Array(n).fill(5),
    ox: new Int16Array(n).fill(3),
    oy: new Int16Array(n).fill(4),
  };
  return { index: encodeIndex(ix), sheets };
}

interface Pending {
  png: Uint8Array;
  resolve: () => void;
  fail: () => void;
}

/** A fake io: files from a map, decodes wait until the test resolves them; a manual clock. */
function fakeIo(files: Map<string, Uint8Array>): { io: StoreIo; fetched: string[]; pending: Pending[]; closed: number[]; clock: { t: number } } {
  const fetched: string[] = [];
  const pending: Pending[] = [];
  const closed: number[] = [];
  const clock = { t: 0 };
  let id = 0;
  const io: StoreIo = {
    fetch(url) {
      fetched.push(url);
      const b = files.get(url);
      return b ? Promise.resolve(b) : Promise.reject(new Error(`no file ${url}`));
    },
    decode(png) {
      const me = ++id;
      return new Promise((resolve, reject) => {
        pending.push({ png, resolve: () => resolve({ image: { me } as unknown as CanvasImageSource, close: () => closed.push(me) }), fail: () => reject(new Error('bad png')) });
      });
    },
    now: () => clock.t,
  };
  return { io, fetched, pending, closed, clock };
}

/** Let the store's promise chains run. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function png(w: number, h: number): Uint8Array {
  return encodeIndexedPng(w, h, new Uint8Array(w * h).fill(1), PALETTE);
}

/** One `objects` pack of `n` single-entry sheets of 8 × 8 (keys 100 …), plus optional ride packs. */
function setup(n: number, opts: { budget?: number; swappable?: number; kind?: number } = {}) {
  const files = new Map<string, Uint8Array>();
  const keys = Array.from({ length: n }, (_, i) => 100 + i);
  const p = pack(opts.kind ?? K_RIDE, keys, 8, 8, opts.swappable ?? 0);
  files.set('art/objects/index-a.bin', p.index);
  for (const s of p.sheets) files.set(`art/objects/${s.file}`, png(8, 8));
  const f = fakeIo(files);
  const store = new PictureStore(f.io, opts.budget ?? 1 << 30);
  return { ...f, store, keys, files };
}

describe('PictureStore', () => {
  it('get returns null and queues once, then the sprite after decode', async () => {
    const t = setup(1);
    await t.store.load([{ name: 'objects', url: 'art/objects/index-a.bin', hash: 'a' }], false);
    t.store.beginFrame();
    expect(t.store.get(K_RIDE, 100, -1)).toBeNull();
    expect(t.store.missing).toBe(1);
    expect(t.store.queued).toBe(1);
    expect(t.store.get(K_RIDE, 100, -1)).toBeNull();
    expect(t.store.queued).toBe(1);
    await settle();
    expect(t.pending.length).toBe(1);
    t.pending[0]!.resolve();
    await settle();
    expect(t.store.decoded).toBe(1);
    t.store.beginFrame();
    const sp = t.store.get(K_RIDE, 100, -1);
    expect(sp).not.toBeNull();
    expect(sp).toMatchObject({ sx: 1, sy: 2, w: 4, h: 5, ox: 3, oy: 4, scale: 0.5 });
    expect(t.store.missing).toBe(0);
    // An unknown key is missing too (Review Focus 3) and never queues.
    expect(t.store.get(K_RIDE, 999, -1)).toBeNull();
    expect(t.store.missing).toBe(1);
    expect(t.store.queued).toBe(1);
  });

  it('at most 4 decodes in flight', async () => {
    const t = setup(6);
    await t.store.load([{ name: 'objects', url: 'art/objects/index-a.bin', hash: 'a' }], false);
    t.store.beginFrame();
    for (const k of t.keys) t.store.get(K_RIDE, k, -1);
    await settle();
    // The index plus 4 sheets.
    expect(t.fetched.length).toBe(1 + 4);
    expect(t.pending.length).toBe(4);
    t.pending[0]!.resolve();
    await settle();
    expect(t.fetched.length).toBe(1 + 5);
    for (const p of t.pending.slice(1)) p.resolve();
    await settle();
    for (const p of t.pending.slice(5)) p.resolve();
    await settle();
    expect(t.store.decoded).toBe(6);
  });

  it('a sheet used this frame or the frame before is never evicted', async () => {
    const bytes = 8 * 8 * 4;
    const t = setup(3, { budget: 2 * bytes });
    await t.store.load([{ name: 'objects', url: 'art/objects/index-a.bin', hash: 'a' }], false);
    const decodeNext = async (): Promise<void> => {
      await settle();
      t.pending[t.pending.length - 1]!.resolve();
      await settle();
    };
    // Frame 1 uses A.
    t.store.beginFrame();
    t.store.get(K_RIDE, 100, -1);
    await decodeNext();
    t.store.get(K_RIDE, 100, -1);
    t.store.endFrame(0);
    // Frame 2 uses B.
    t.store.beginFrame();
    t.store.get(K_RIDE, 101, -1);
    await decodeNext();
    t.store.get(K_RIDE, 101, -1);
    t.store.endFrame(0);
    // Frame 3 needs C: over budget, A goes, B stays.
    t.store.beginFrame();
    t.store.get(K_RIDE, 102, -1);
    await decodeNext();
    expect(t.store.get(K_RIDE, 102, -1)).not.toBeNull();
    t.store.endFrame(0);
    expect(t.closed).toEqual([1]);
    expect(t.store.sheetBytes).toBe(2 * bytes);
    t.store.beginFrame();
    expect(t.store.get(K_RIDE, 101, -1)).not.toBeNull();
    expect(t.store.get(K_RIDE, 100, -1)).toBeNull();
    // Nothing that may go: the store stays over the budget rather than evict a sheet in use.
    t.store.endFrame(10 * bytes);
    expect(t.closed).toEqual([1]);
  });

  it('keep holds a kept-last picture against eviction; without keep it goes and keep returns null (fix round 1, I3)', async () => {
    const bytes = 8 * 8 * 4;
    const run = async (useKeep: boolean) => {
      const t = setup(3, { budget: 2 * bytes });
      await t.store.load([{ name: 'objects', url: 'art/objects/index-a.bin', hash: 'a' }], false);
      const decodeNext = async (): Promise<void> => {
        await settle();
        t.pending[t.pending.length - 1]!.resolve();
        await settle();
      };
      t.store.beginFrame();
      t.store.get(K_RIDE, 100, -1);
      await decodeNext();
      const a = t.store.get(K_RIDE, 100, -1);
      t.store.endFrame(0);
      // Frames 2 and 3: B and C; A is only kept (keep-last), not asked for.
      t.store.beginFrame();
      t.store.get(K_RIDE, 101, -1);
      await decodeNext();
      t.store.get(K_RIDE, 101, -1);
      if (useKeep) expect(t.store.keep(a)).toBe(a);
      t.store.endFrame(0);
      t.store.beginFrame();
      t.store.get(K_RIDE, 102, -1);
      await decodeNext();
      t.store.get(K_RIDE, 102, -1);
      const kept = useKeep ? t.store.keep(a) : null;
      t.store.endFrame(0);
      return { t, a, kept };
    };
    const held = await run(true);
    expect(held.kept).toBe(held.a);
    // A was used (kept) in this frame, B in the one before: nothing may go yet.
    expect(held.t.closed).toEqual([]);
    // Frame 4: C asked for, A kept again: B (last used two frames ago) goes, A stays.
    held.t.store.beginFrame();
    held.t.store.get(K_RIDE, 102, -1);
    expect(held.t.store.keep(held.a)).toBe(held.a);
    held.t.store.endFrame(0);
    expect(held.t.closed).toEqual([2]);
    expect(held.t.store.keep(held.a)).toBe(held.a);
    const gone = await run(false);
    expect(gone.t.closed).toEqual([1]);
    expect(gone.t.store.keep(gone.a)).toBeNull();
    // A sprite the store never handed out is not kept.
    expect(gone.t.store.keep({ image: {} as CanvasImageSource, w: 1, h: 1, ox: 0, oy: 0, scale: 0.5 })).toBeNull();
    expect(gone.t.store.keep(null)).toBeNull();
  });

  it('a failed sheet is tried once more, then counted as failed (fix round 1, M3)', async () => {
    const t = setup(1);
    await t.store.load([{ name: 'objects', url: 'art/objects/index-a.bin', hash: 'a' }], false);
    t.store.beginFrame();
    t.store.get(K_RIDE, 100, -1);
    await settle();
    t.pending[0]!.fail();
    await settle();
    expect(t.store.failed).toBe(0);
    expect(t.pending.length).toBe(2);
    t.pending[1]!.fail();
    await settle();
    expect(t.store.failed).toBe(1);
    expect(t.pending.length).toBe(2);
  });

  it('noteMissing counts a picture with no key as missing (fix round 1, M2)', () => {
    const t = setup(1);
    t.store.beginFrame();
    t.store.noteMissing();
    expect(t.store.missing).toBe(1);
  });

  it('budget parts add up', async () => {
    const bytes = 8 * 8 * 4;
    const t = setup(3, { budget: 2 * bytes + 100 });
    await t.store.load([{ name: 'objects', url: 'art/objects/index-a.bin', hash: 'a' }], false);
    for (let f = 0; f < 3; f++) {
      t.store.beginFrame();
      t.store.get(K_RIDE, 100 + f, -1);
      await settle();
      t.pending[f]!.resolve();
      await settle();
      t.store.get(K_RIDE, 100 + f, -1);
      t.store.endFrame(100);
      expect(t.store.sheetBytes + t.store.swapBytes).toBe(t.store.totalBytes);
      expect(t.store.sheetBytes + t.store.swapBytes + 100).toBeLessThanOrEqual(2 * bytes + 100);
    }
    // Three decoded, one evicted: the evicted sheet left `sheetBytes`.
    expect(t.store.decoded).toBe(3);
    expect(t.closed.length).toBe(1);
    expect(t.store.sheetBytes).toBe(2 * bytes);
    expect(t.store.swapBytes).toBe(0);
  });

  it('a swap is a separate decode and counts in swapBytes', async () => {
    const t = setup(1, { swappable: 1, kind: K_RAIL });
    await t.store.load([{ name: 'objects', url: 'art/objects/index-a.bin', hash: 'a' }], false);
    t.store.beginFrame();
    t.store.get(K_RAIL, 100, -1);
    await settle();
    t.pending[0]!.resolve();
    await settle();
    expect(t.store.get(K_RAIL, 100, -1)).not.toBeNull();
    // Colour 7 of role rt (table 7: odd, so slot 1 becomes slot 2).
    expect(t.store.get(K_RAIL, 100, 7)).toBeNull();
    await settle();
    expect(t.pending.length).toBe(2);
    // The swapped PNG differs from the plain one only in PLTE: entry 1 holds the RGB of slot 2.
    const swapped = t.pending[1]!.png;
    const plain = t.files.get('art/objects/g-0.png') as Uint8Array;
    expect(swapped.length).toBe(plain.length);
    expect(swapTableIndex(1, 7)).toBe(7);
    let diff = 0;
    for (let i = 0; i < plain.length; i++) if (plain[i] !== swapped[i]) diff++;
    expect(diff).toBeGreaterThan(0);
    t.pending[1]!.resolve();
    await settle();
    const sp = t.store.get(K_RAIL, 100, 7);
    expect(sp).not.toBeNull();
    expect(sp?.image).not.toBe(t.store.get(K_RAIL, 100, -1)?.image);
    expect(t.store.sheetBytes).toBe(8 * 8 * 4);
    expect(t.store.swapBytes).toBe(8 * 8 * 4);
    expect(t.store.decoded).toBe(2);
    expect(t.store.swapMainMsMax).toBeGreaterThanOrEqual(0);
  });

  it('the coarse set reads only rides-coarse', async () => {
    const files = new Map<string, Uint8Array>();
    files.set('art/rides-coarse/index-c.bin', pack(K_RIDE, [1]).index);
    files.set('art/rides-full/index-f.bin', pack(K_RIDE, [1, 2]).index);
    files.set('art/objects/index-o.bin', pack(K_RAIL, [5]).index);
    const refs = [
      { name: 'rides-full', url: 'art/rides-full/index-f.bin', hash: 'f' },
      { name: 'rides-coarse', url: 'art/rides-coarse/index-c.bin', hash: 'c' },
      { name: 'objects', url: 'art/objects/index-o.bin', hash: 'o' },
    ];
    const a = fakeIo(files);
    await new PictureStore(a.io, 1 << 30).load(refs, true);
    expect(a.fetched.sort()).toEqual(['art/objects/index-o.bin', 'art/rides-coarse/index-c.bin']);
    const b = fakeIo(files);
    await new PictureStore(b.io, 1 << 30).load(refs, false);
    expect(b.fetched.sort()).toEqual(['art/objects/index-o.bin', 'art/rides-full/index-f.bin']);
  });

  describe('browser io', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('browser decode options', async () => {
      const spy = vi.fn(async () => ({ close: () => {} }));
      vi.stubGlobal('createImageBitmap', spy);
      await browserIo().decode(png(2, 2));
      expect(spy).toHaveBeenCalledTimes(1);
      const call = spy.mock.calls[0] as unknown as [Blob, ImageBitmapOptions];
      expect(call[0]).toBeInstanceOf(Blob);
      expect(call[0].type).toBe('image/png');
      expect(call[1]).toEqual({ premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    });
  });
});
