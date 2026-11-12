// tests/unit/render/pixel/palette.test.ts
import { describe, expect, it } from 'vitest';
import { COLOUR_MAP, QUEUE_SLOT } from '../../../../src/render/pixel/colourMap';
import { INK_SLOT, RAMPS, SLOT_NAMES, nearestInFamily, paletteStats, slotIndex, slotOf, tone } from '../../../../src/render/pixel/palette';

const ramp = (slot: number): string => (SLOT_NAMES[slot] as string).replace(/\d+$/, '');

describe('palette (§6.1 to §6.5)', () => {
  it('draft ramps, unique slot names, ink', () => {
    expect(RAMPS.g).toEqual(['#f0e07a', '#d6c85a', '#bdb24b', '#98993f', '#6f7f3a', '#4d6238']);
    expect(RAMPS.i).toEqual(['#6e4470', '#4a2c52', '#2a1a36']);
    expect(RAMPS.n).toEqual(['#f4f1ea', '#dcd6cc', '#bdb5ab', '#958d8a', '#6d6670', '#4d4856']);
    expect(RAMPS.y).toHaveLength(9);
    expect(new Set(SLOT_NAMES).size).toBe(SLOT_NAMES.length);
    expect(SLOT_NAMES[0]).toBe('');
    expect(SLOT_NAMES[INK_SLOT]).toBe('i3');
  });
  it('rule 0: a signal colour gives its signal slot; a shared colour gives the first in x, y, q, u order; #56b4e9 gives b2', () => {
    expect(slotOf(RAMPS.x[0] as string)).toBe(slotIndex('x1'));
    expect(slotOf(RAMPS.u[1] as string)).toBe(slotIndex('u2')); // #e69e66, not shared
    expect(slotOf('#d55e00')).toBe(slotIndex('x4')); // u3 (GHOST_INVALID) = x4
    expect(slotOf(RAMPS.u[2] as string)).toBe(slotIndex('x4'));
    expect(slotOf(RAMPS.q[2] as string)).toBe(slotIndex('x1')); // q3 (GHOST_VALID) = x1
    for (const r of ['x', 'y', 'q', 'u'] as const) {
      for (const c of RAMPS[r]) {
        if (c === '#56b4e9') continue;
        const first = (['x', 'y', 'q', 'u'] as const).flatMap((s) => RAMPS[s].map((v, k) => [v, `${s}${k + 1}`] as const)).find(([v]) => v === c)!;
        expect(slotOf(c), c).toBe(slotIndex(first[1]));
      }
    }
    const m = paletteStats.misses;
    expect(slotOf('#56b4e9')).toBe(slotIndex('b2'));
    expect(paletteStats.misses).toBe(m);
  });
  it('fixed entries and shirts (§6.4)', () => {
    const want: Record<string, string> = {
      '#6dbb4f': 'g2', '#64b049': 'g3', '#a9c0d2': QUEUE_SLOT, '#dcc79c': 's2', '#f2f6fa': 'e1', '#e6edf3': 'e2',
      '#9a7148': 'w2', '#7b5835': 'w3', '#c5ced8': 'n3', '#3b4250': 'n5', '#000000': 'i2',
      '#e8503a': 'o4', '#f39a2b': 'o3', '#f5d03b': 'o1', '#7cc04b': 'l2', '#2fb39a': 't2', '#3d9be0': 'b2',
      '#4f63d9': 'b3', '#8d5ad8': 'v2', '#d457a8': 'p2', '#f2f2f2': 'c1', '#a0522d': 'w2', '#30425a': 'i2',
    };
    for (const [css, slot] of Object.entries(want)) expect(SLOT_NAMES[slotOf(css)], css).toBe(slot);
    expect(QUEUE_SLOT).toBe('n3');
    const keys = Object.keys(COLOUR_MAP);
    expect(keys).toEqual([...keys].sort());
    for (const v of Object.values(COLOUR_MAP)) {
      expect(SLOT_NAMES).toContain(v);
      expect(v).not.toBe('i3');
    }
  });
  it('family rules a to e (§6.5)', () => {
    expect(['n', 'e', 'c']).toContain(ramp(nearestInFamily(0x808080))); // a
    expect(ramp(nearestInFamily(0x2050e0))).toBe('b'); // b: hue 226, only b2 (211) is within 30
    expect(ramp(nearestInFamily(0x33cc66))).toBe('t'); // c: hue 140, nearest mid tone t3 (174)
    expect(SLOT_NAMES[nearestInFamily(0x2a1a36)]).toBe('i2'); // d: dark plum, never i3
    for (let r = 0; r < 256; r += 37) for (let g = 0; g < 256; g += 37) for (let b = 0; b < 256; b += 37) {
      const s = nearestInFamily((r << 16) | (g << 8) | b);
      expect(['x', 'y', 'q', 'u']).not.toContain(ramp(s)); // e
      expect(s).not.toBe(INK_SLOT);
    }
  });
  it('a colour with no entry is a miss; an entry is not', () => {
    const m = paletteStats.misses;
    slotOf('#6dbb4f');
    expect(paletteStats.misses).toBe(m);
    slotOf('rgba(18, 52, 86, 0.4)');
    expect(paletteStats.misses).toBe(m + 1);
  });
  it('tone moves along one ramp and never reaches ink', () => {
    expect(tone('g2', 1)).toBe('g3');
    expect(tone('g6', 1)).toBe('g6');
    expect(tone('g1', -1)).toBe('g1');
    expect(tone('i2', 1)).toBe('i2');
  });
});
