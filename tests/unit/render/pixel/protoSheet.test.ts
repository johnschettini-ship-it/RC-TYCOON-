/** Phase 8 stage 0 prototype (never merged): the rides and track sheet, `sheet-rides-track.png` (spec §11.3, §11.4, §11.5). */
import { afterEach, describe, expect, it } from 'vitest';
import { FLAT_RIDES } from '../../../../src/data/catalog/flatRides';
import { SLOT_RGBA, slotIndex } from '../../../../src/render/pixel/palette';
import { setArtStyle } from '../../../../src/render/pixel/style';
import { buildSheetSprites, writePng, type SheetSprite } from './protoKit';

afterEach(() => setArtStyle('classic'));

/** Sheet pixels per art pixel (§8.6 item 1, n = 2). */
const N = 2;
const PER_ROW = 6;

/** An art-pixel canvas of slot indices over the background slot. */
class Sheet {
  readonly slots: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
    bg: number,
  ) {
    this.slots = new Uint8Array(w * h).fill(bg);
  }

  /** Copy the opaque pixels of `s` with its top-left at (x, y). */
  put(s: SheetSprite['surface'], x: number, y: number): void {
    for (let j = 0; j < s.h; j++) {
      for (let i = 0; i < s.w; i++) {
        const v = s.pixel(i, j);
        if (v === 0) continue;
        const X = x + i;
        const Y = y + j;
        if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) throw new Error(`sheet pixel (${X}, ${Y}) outside ${this.w} × ${this.h}`);
        this.slots[Y * this.w + X] = v;
      }
    }
  }

  /** RGBA bytes at N sheet pixels per art pixel. */
  rgba(): Uint8Array {
    const W = this.w * N;
    const out = new Uint8Array(W * this.h * N * 4);
    for (let y = 0; y < this.h * N; y++) {
      for (let x = 0; x < W; x++) {
        const v = SLOT_RGBA[this.slots[Math.floor(y / N) * this.w + Math.floor(x / N)] as number] as number;
        const o = (y * W + x) * 4;
        out[o] = v & 255;
        out[o + 1] = (v >>> 8) & 255;
        out[o + 2] = (v >>> 16) & 255;
        out[o + 3] = 255;
      }
    }
    return out;
  }
}

describe.skipIf(!process.env.TC_PIXEL_SHEET || !process.env.TC_PROTO_OUT)('stage 0 sheet', () => {
  it('writes sheet-rides-track.png', () => {
    const { rides, track } = buildSheetSprites();
    expect(rides.map((r) => r.label)).toEqual(FLAT_RIDES.map((d) => d.id));
    expect(rides.length).toBe(18);
    expect(track.map((t) => t.rot)).toEqual([0, 1]);
    for (const t of track) {
      expect(t.slices.length).toBeGreaterThan(30);
      expect(t.cars.length).toBe(4);
    }

    // Top part: rides in catalog order, 6 per row, each cell the size of the largest ride image.
    // A ride sits in its cell centred across and on the cell's bottom edge.
    const cellW = Math.max(...rides.map((r) => r.surface.w));
    const cellH = Math.max(...rides.map((r) => r.surface.h));
    const rows = Math.ceil(rides.length / PER_ROW);
    // Bottom part: the two track views side by side, each cropped to the box of its draws.
    const views = track.map((t) => {
      const all = [...t.other, ...t.slices, ...t.cars];
      const x0 = Math.min(...all.map((s) => s.x));
      const y0 = Math.min(...all.map((s) => s.y));
      const x1 = Math.max(...all.map((s) => s.x + s.surface.w));
      const y1 = Math.max(...all.map((s) => s.y + s.surface.h));
      return { t, x0, y0, w: x1 - x0, h: y1 - y0 };
    });
    const trackW = views.reduce((a, v) => a + v.w, 0);
    const trackH = Math.max(...views.map((v) => v.h));
    const sheet = new Sheet(Math.max(PER_ROW * cellW, trackW), rows * cellH + trackH, slotIndex('g2'));

    rides.forEach((r, k) => {
      const cx = (k % PER_ROW) * cellW;
      const cy = Math.floor(k / PER_ROW) * cellH;
      sheet.put(r.surface, cx + Math.floor((cellW - r.surface.w) / 2), cy + cellH - r.surface.h);
    });
    let left = 0;
    for (const v of views) {
      // Each view's other, slices and cars, each group in draw order.
      for (const s of [...v.t.other, ...v.t.slices, ...v.t.cars]) sheet.put(s.surface, left + s.x - v.x0, rows * cellH + s.y - v.y0);
      left += v.w;
    }
    writePng(`${process.env.TC_PROTO_OUT}/sheet-rides-track.png`, sheet.w * N, sheet.h * N, sheet.rgba());
  });
});
