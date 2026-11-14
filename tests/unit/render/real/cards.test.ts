/**
 * Card pictures (stage 1 round 2, change 3): the baked card picture of a baked item, drawn by the card and picker
 * previews in the VITE_ART=real build when its set is ready; today's preview otherwise, and always for stand-ins.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setKey, type RealIndex, type RealSetEntry } from '../../../../src/render/real/indexFormat';
import { CARD_SET, cardPicture } from '../../../../src/render/real/cards';
import { createRealLook } from '../../../../src/render/real/look';
import type { ReadySet } from '../../../../src/render/real/setManager';
import { drawCardArt, setCardArt } from '../../../../src/render/cardArt';
import { bootReal } from '../../../../src/render/real/boot';
import { setStepPx } from '../../../../src/render/heightStep';
import { perfProbe } from '../../../../src/perf/stats';
import { createWorld } from '../../../../src/sim/world';

const SHEET = { file: 'cards.webp', w: 300, h: 200 };
const ENTRY: RealSetEntry = {
  key: CARD_SET, kind: 'preview', item: 'cards', density: 2, rot: 'all', sheets: [SHEET],
  frames: {
    carousel: { sheet: 'cards.webp', sx: 0, sy: 0, w: 160, h: 100, ox: 0, oy: 0 },
    oak_round: { sheet: 'cards.webp', sx: 160, sy: 0, w: 80, h: 114, ox: 0, oy: 0 },
    steel_coaster: { sheet: 'cards.webp', sx: 0, sy: 100, w: 140, h: 100, ox: 0, oy: 0 },
  },
};

interface Call { op: string; args: unknown[] }
function fakeCtx(): CanvasRenderingContext2D & { calls: Call[] } {
  const calls: Call[] = [];
  const rec = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); };
  return new Proxy({ calls } as unknown as CanvasRenderingContext2D & { calls: Call[] }, {
    get(t, k) {
      if (k === 'calls') return calls;
      if (k in t) return (t as unknown as Record<string | symbol, unknown>)[k];
      return rec(String(k));
    },
    set(t, k, v) {
      (t as unknown as Record<string | symbol, unknown>)[k] = v;
      return true;
    },
  });
}

const IMAGE = { width: 300, height: 200 } as unknown as CanvasImageSource;
const ready: ReadySet = { ...ENTRY, images: [IMAGE] };

afterEach(() => {
  setCardArt(null);
  vi.unstubAllEnvs();
  vi.resetModules();
  setStepPx(8);
  perfProbe.realMemory = null;
});

describe('card pictures', () => {
  it('the set key is preview:cards:d2:rall', () => {
    expect(CARD_SET).toBe(setKey('preview', 'cards', 2, 'all'));
  });

  it('draws the baked picture of a baked item, fitted and centred in the box with the padding', () => {
    const draw = cardPicture({ use: (k) => (k === CARD_SET ? ready : null) });
    const ctx = fakeCtx();
    expect(draw(ctx, 'carousel', 168, 120, 7.2)).toBe(true);
    const d = ctx.calls.find((c) => c.op === 'drawImage')!;
    const [img, sx, sy, sw, sh, dx, dy, dw, dh] = d.args as [unknown, ...number[]];
    expect(img).toBe(IMAGE);
    expect([sx, sy, sw, sh]).toEqual([0, 0, 160, 100]);
    // Limited by width: (168 - 14.4) / 160 = 0.96.
    expect(dw).toBeCloseTo(153.6, 5);
    expect(dh).toBeCloseTo(96, 5);
    expect(dx).toBeCloseTo(7.2, 5);
    expect(dy).toBeCloseTo((120 - 96) / 2, 5);
    expect(ctx.calls.some((c) => c.op === 'clearRect')).toBe(true);
  });

  it('a stand-in (teacup_twirl draws as the carousel in the park), a classic item, a missing frame or a set not ready: today\'s preview', () => {
    const draw = cardPicture({ use: (k) => (k === CARD_SET ? ready : null) });
    const ctx = fakeCtx();
    expect(draw(ctx, 'teacup_twirl', 168, 120, 7)).toBe(false);
    expect(draw(ctx, 'mini_railway', 168, 120, 7)).toBe(false);
    expect(draw(ctx, 'drop_tower', 168, 120, 7)).toBe(false);
    expect(draw(ctx, 'big_wheel', 168, 120, 7)).toBe(false); // baked item, no frame in this set
    expect(cardPicture({ use: () => null })(ctx, 'carousel', 168, 120, 7)).toBe(false);
    expect(ctx.calls).toEqual([]);
  });

  it('RealLook wants the card set every frame (now) when the bake has it', () => {
    const index: RealIndex = { format: 'real/1', pxPerMetreZoom1: 11.31, stepPxPerMetre: 9.8, densities: [2, 4], sets: [ENTRY], bytes: { compressed: 0, decodedByDensity: { '2': 0, '4': 0 } } };
    const wants: { keys: string[]; p: string }[] = [];
    const look = createRealLook(index, {
      want: (keys, p) => { wants.push({ keys: [...keys], p }); },
      use: () => null, state: () => 'none', densityCap: () => 4, isDemoted: () => false, hold: () => undefined, admit: () => true,
    });
    look.prepare(createWorld({ seed: 1, parkName: 'C', mapSize: 16 }), 0, { x0: 0, y0: 0, x1: 1, y1: 1 }, 2, 2.625);
    expect(wants.find((w) => w.p === 'now')?.keys).toContain(CARD_SET);
    expect(wants.find((w) => w.p === 'ahead')?.keys).not.toContain(CARD_SET);
  });
});

describe('previews in the VITE_ART=real build', () => {
  async function previews(env: string) {
    vi.resetModules();
    vi.stubEnv('VITE_ART', env);
    const art = await import('../../../../src/render/cardArt');
    const { drawPreview } = await import('../../../../src/render/renderer');
    const { drawTrackPreview } = await import('../../../../src/render/track/preview');
    const { drawSceneryPreview } = await import('../../../../src/render/scenery/preview');
    const seen: string[] = [];
    art.setCardArt((_c, id) => { seen.push(id); return id !== 'teacup_twirl'; });
    return { drawPreview, drawTrackPreview, drawSceneryPreview, seen };
  }

  it('card, track and scenery previews ask for the card picture first and draw nothing else when it drew', async () => {
    const p = await previews('real');
    for (const [fn, id] of [[p.drawPreview, 'carousel'], [p.drawTrackPreview, 'steel_coaster'], [p.drawSceneryPreview, 'oak_round']] as const) {
      const ctx = fakeCtx();
      fn(ctx, id, 168, 120);
      expect(ctx.calls).toEqual([]);
    }
    expect(p.seen).toEqual(['carousel', 'steel_coaster', 'oak_round']);
    // No card picture: today's preview draws.
    const ctx = fakeCtx();
    p.drawPreview(ctx, 'teacup_twirl', 168, 120);
    expect(ctx.calls.length).toBeGreaterThan(5);
  });

  it('the website build never asks', async () => {
    const p = await previews('');
    const ctx = fakeCtx();
    p.drawPreview(ctx, 'carousel', 168, 120);
    expect(p.seen).toEqual([]);
    expect(ctx.calls.length).toBeGreaterThan(5);
  });
});

describe('boot', () => {
  it('decodes the card set before the game starts and gives the previews its drawer', async () => {
    const index = { format: 'real/1', pxPerMetreZoom1: 11.31, stepPxPerMetre: 9.8, densities: [2, 4], sets: [ENTRY], bytes: { compressed: 1, decodedByDensity: { '2': 1, '4': 0 } } };
    const r = await bootReal({
      fetch: async (u) => (u.endsWith('index.json') ? new Response(JSON.stringify(index), { status: 200 }) : new Response(new Blob(['x']), { status: 200 })),
      decode: async () => ({ image: IMAGE, bytes: 300 * 200 * 4, close() {} }),
      show: () => { throw new Error('no error expected'); },
      storage: null,
    });
    expect((r?.sets as unknown as { state(k: string): string }).state(CARD_SET)).toBe('ready');
    expect(drawCardArt(fakeCtx(), 'carousel', 168, 120, 7)).toBe(true);
    expect(drawCardArt(fakeCtx(), 'teacup_twirl', 168, 120, 7)).toBe(false);
  });
});
