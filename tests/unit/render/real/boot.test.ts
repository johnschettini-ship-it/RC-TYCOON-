import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootReal, REAL_DECODE_BUDGET_BYTES } from '../../../../src/render/real/boot';
import { setStepPx, STEP_PX } from '../../../../src/render/heightStep';
import { REAL_STEP_PX } from '../../../../src/render/artStyle';
import { perfProbe } from '../../../../src/perf/stats';
import { text } from '../../../../src/data/strings';

afterEach(() => {
  setStepPx(8);
  perfProbe.realMemory = null;
  vi.restoreAllMocks();
});

const index = {
  format: 'real/1',
  pxPerMetreZoom1: 11.31,
  stepPxPerMetre: 9.8,
  densities: [2, 4],
  sets: [{ key: 'ground:grass:d2:rall', kind: 'ground', item: 'grass', density: 2, rot: 'all', sheets: [{ file: 'g.webp', w: 4, h: 4 }], frames: {} }],
  bytes: { compressed: 1, decodedByDensity: { '2': 64, '4': 256 } },
};

describe('realistic boot', () => {
  it('no baked art: one error line, today\'s look and height step', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const shown: string[] = [];
    const r = await bootReal({ fetch: async () => new Response('', { status: 404 }), show: (m) => shown.push(m), storage: null });
    expect(r).toBeNull();
    expect(shown).toEqual([text('ui.realArt.loadFailed')]);
    expect(shown[0]).not.toBe('ui.realArt.loadFailed');
    expect(STEP_PX).toBe(8);
  });

  it('a network error falls back the same way', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const shown: string[] = [];
    const r = await bootReal({ fetch: () => Promise.reject(new Error('offline')), show: (m) => shown.push(m), storage: null });
    expect(r).toBeNull();
    expect(shown.length).toBe(1);
  });

  it('with an index: look, set manager and ground; real height step; memory on the perf probe', async () => {
    const urls: string[] = [];
    const r = await bootReal({
      fetch: async (u) => {
        urls.push(u);
        return new Response(JSON.stringify(index), { status: 200 });
      },
      show: () => { throw new Error('no error expected'); },
      storage: null,
    });
    expect(urls).toEqual(['art/real/index.json']);
    expect(r?.look).toBeDefined();
    expect(r?.sets).toBeDefined();
    expect(r?.ground).toBeDefined();
    expect(STEP_PX).toBe(REAL_STEP_PX);
    expect(perfProbe.realMemory?.()).toEqual([0, 0]);
    expect(REAL_DECODE_BUDGET_BYTES).toBe(128 * 1024 * 1024);
  });
});
