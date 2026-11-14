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

describe('bench mode and the scale park\'s alias sets (round 3 fix 4)', () => {
  it('benchMode: exactly the ?bench= values main.ts runs the bench for', async () => {
    const { benchMode } = await import('../../../../src/render/real/benchParam');
    expect(benchMode('?bench=1')).toBe('full');
    expect(benchMode('?art=real&bench=quick')).toBe('quick');
    expect(benchMode('?bench=scale')).toBe('scale');
    for (const q of ['', '?bench=', '?bench=0', '?bench=yes', '?art=real']) expect(benchMode(q)).toBeNull();
  });

  it('the boot adds alias sets only when the page runs the bench', async () => {
    const carousel = { ...index.sets[0]!, key: 'ride:carousel:d2:rall', kind: 'ride', item: 'carousel', frames: { 'carousel:f0:occ0': { sheet: 'g.webp', sx: 0, sy: 0, w: 1, h: 1, ox: 0, oy: 0 } } };
    const ix = { ...index, sets: [...index.sets, carousel] };
    const boot = async (benchAliases?: boolean) => (await bootReal({ fetch: async () => new Response(JSON.stringify(ix), { status: 200 }), show: () => undefined, storage: null, ...(benchAliases === undefined ? {} : { benchAliases }) }))!.sets as unknown as import('../../../../src/render/real/setManager').SetManager;
    const plain = await boot(false);
    expect(plain.state('ride:carousel@carousel:d2:rall')).toBe('none');
    const errors: unknown[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...a) => { errors.push(a); });
    plain.beginFrame(1);
    plain.want(['ride:carousel@carousel:d2:rall'], 'now');
    expect(errors.length).toBe(1); // unknown set
    const withAliases = await boot(true);
    withAliases.beginFrame(1);
    withAliases.want(['ride:carousel@carousel:d2:rall'], 'now');
    expect(errors.length).toBe(1);
    // Default (no ?bench= in a node test): none.
    const dflt = await boot();
    dflt.beginFrame(1);
    dflt.want(['ride:carousel@carousel:d2:rall'], 'now');
    expect(errors.length).toBe(2);
  });
});
