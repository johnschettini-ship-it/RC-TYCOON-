import { describe, expect, it } from 'vitest';
import { decodePicture, lastRowPicture, type PictureData } from '../../../src/ui/titleScreen/picture';
import sceneWide from '../../../src/ui/titleScreen/art/scene-wide.json';
import sceneTall from '../../../src/ui/titleScreen/art/scene-tall.json';
import logoLine from '../../../src/ui/titleScreen/art/logo-line.json';
import logoStack from '../../../src/ui/titleScreen/art/logo-stack.json';

const SKY = '#ffe9bf';

/** Each picture with its size, whether it may have transparent pixels, and one known pixel (from the PNG). */
const PICTURES: Array<{ name: string; data: PictureData; w: number; h: number; logo: boolean; known: { x: number; y: number; colour: string } }> = [
  { name: 'scene-wide', data: sceneWide as PictureData, w: 960, h: 400, logo: false, known: { x: 300, y: 140, colour: '#fbd08e' } },
  { name: 'scene-tall', data: sceneTall as PictureData, w: 450, h: 470, logo: false, known: { x: 146, y: 200, colour: '#7a4426' } },
  { name: 'logo-line', data: logoLine as PictureData, w: 496, h: 62, logo: true, known: { x: 60, y: 30, colour: '#f47a1c' } },
  { name: 'logo-stack', data: logoStack as PictureData, w: 176, h: 118, logo: true, known: { x: 88, y: 60, colour: '#6b45a8' } },
];

const hex = (bytes: Uint8ClampedArray, i: number): string =>
  `#${[bytes[i], bytes[i + 1], bytes[i + 2]].map((v) => (v ?? 0).toString(16).padStart(2, '0')).join('')}`;

describe('title pictures (data)', () => {
  for (const p of PICTURES) {
    describe(p.name, () => {
      it(`is ${p.w} x ${p.h} with one list of runs per row, each adding up to the width`, () => {
        expect(p.data.w).toBe(p.w);
        expect(p.data.h).toBe(p.h);
        expect(p.data.rows.length).toBe(p.h);
        for (const runs of p.data.rows) expect(runs.reduce((sum, run) => sum + (run[1] ?? 0), 0)).toBe(p.w);
      });
      it('uses only palette indices or -1, and -1 only in the logos', () => {
        let transparent = 0;
        for (const runs of p.data.rows) {
          for (const [i, n] of runs as Array<[number, number]>) {
            expect(Number.isInteger(i) && i >= -1 && i < p.data.palette.length).toBe(true);
            expect(n).toBeGreaterThan(0);
            if (i === -1) transparent += n;
          }
        }
        if (p.logo) expect(transparent).toBeGreaterThan(0);
        else expect(transparent).toBe(0);
        for (const c of p.data.palette) expect(c).toMatch(/^#[0-9a-f]{6}$/);
      });
      it('decodes to w * h * 4 bytes: alpha 255 for an opaque pixel, 0 for a transparent one', () => {
        const bytes = decodePicture(p.data);
        expect(bytes.length).toBe(p.w * p.h * 4);
        const k = (p.known.y * p.w + p.known.x) * 4;
        expect(hex(bytes, k)).toBe(p.known.colour);
        expect(bytes[k + 3]).toBe(255);
        // The colour comes from its palette entry.
        expect(p.data.palette).toContain(p.known.colour);
        if (p.logo) {
          // The top left corner of both logos is transparent.
          expect(bytes[3]).toBe(0);
        } else {
          for (let i = 3; i < bytes.length; i += 4) if (bytes[i] !== 255) throw new Error(`pixel ${(i - 3) / 4} is not opaque`);
        }
      });
    });
  }

  const row0 = (data: PictureData): string[] => {
    const bytes = decodePicture(data);
    return Array.from({ length: data.w }, (_, x) => hex(bytes, x * 4));
  };
  it('row 0 of scene-wide is all the sky colour', () => {
    expect(new Set(row0(sceneWide as PictureData))).toEqual(new Set([SKY]));
  });
  // The polished export (Task 15b) repaired row 0 of scene-tall (the old one had 61 haze pixels).
  it('row 0 of scene-tall is all the sky colour', () => {
    expect(new Set(row0(sceneTall as PictureData))).toEqual(new Set([SKY]));
  });

  it('the fill below a scene is its last row, each column with its own colour (G7)', () => {
    for (const data of [sceneWide, sceneTall] as PictureData[]) {
      const row = lastRowPicture(data);
      expect({ w: row.w, h: row.h }).toEqual({ w: data.w, h: 1 });
      const all = decodePicture(data);
      expect(Array.from(decodePicture(row))).toEqual(Array.from(all.subarray((data.h - 1) * data.w * 4)));
    }
    // The same object for the same picture (the canvas is made once).
    expect(lastRowPicture(sceneWide as PictureData)).toBe(lastRowPicture(sceneWide as PictureData));
  });

  it('bad picture data fails loudly, naming the row', () => {
    const palette = ['#ff0000', '#00ff00'];
    expect(() => decodePicture({ w: 2, h: 2, palette, rows: [[[0, 2]], [[0, 1], [2, 1]]] })).toThrow(/row 1.*palette index 2/);
    expect(() => decodePicture({ w: 2, h: 2, palette, rows: [[[0, 2]], [[0, 1], [-2, 1]]] })).toThrow(/row 1.*palette index -2/);
  });
  it('bad picture data fails loudly: the runs of a row must add up to the width', () => {
    const palette = ['#ff0000'];
    expect(() => decodePicture({ w: 3, h: 2, palette, rows: [[[0, 3]], [[0, 2]]] })).toThrow(/row 1.*2 px.*3/);
    expect(() => decodePicture({ w: 3, h: 2, palette, rows: [[[0, 4]], [[0, 3]]] })).toThrow(/row 0.*4 px.*3/);
  });
  it('bad picture data fails loudly: the number of rows must be the height', () => {
    expect(() => decodePicture({ w: 1, h: 3, palette: ['#ff0000'], rows: [[[0, 1]], [[0, 1]]] })).toThrow(/2 rows.*3/);
  });

  it('decodes runs in order, left to right, top to bottom', () => {
    const tiny: PictureData = { w: 3, h: 2, palette: ['#ff0000', '#00ff00'], rows: [[[0, 2], [-1, 1]], [[1, 1], [0, 2]]] };
    expect(Array.from(decodePicture(tiny))).toEqual([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 0, 255, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]);
  });
});
