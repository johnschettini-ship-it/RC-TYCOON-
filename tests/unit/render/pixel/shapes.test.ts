/** Phase 8 stage 0 prototype (never merged): the primitive twins (spec §8.1 items 2 and 3, §5.4). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONE_SEGMENTS, CYLINDER_LIT_SHARE, pixelBox, pixelCone, pixelCylinder, pixelHead, pixelPyramid } from '../../../../src/render/pixel/art/shapes';
import { INK_SLOT, RAMPS, SLOT_NAMES, slotIndex, slotOf, tone } from '../../../../src/render/pixel/palette';
import { PixelSurface } from '../../../../src/render/pixel/surface';
import { box, pyramid } from '../../../../src/render/sprites/shapes';
import { Recorder } from '../content/recorder';
import { clearSurfaceArt, installSurfaceArt } from '../../../../src/render/pixel/surfaceArt';

// Phase 8b: the stage 0 branches run through the tool hook.
beforeEach(installSurfaceArt);
afterEach(clearSurfaceArt);

const BOX_B = { left: -40, right: 40, top: -60, bottom: 40 };
const toneIndex = (slot: number): number => Number((SLOT_NAMES[slot] as string).replace(/^\D+/, ''));
const rampOf = (slot: number): string => (SLOT_NAMES[slot] as string).replace(/\d+$/, '');

/** The opaque non-ink pixels of the side rows of the test box, split at the anchor column. */
function sideFaces(s: PixelSurface): { left: number[]; right: number[] } {
  const left: number[] = [];
  const right: number[] = [];
  for (let y = s.oy + 4; y <= s.oy + 11; y++) {
    for (let x = 0; x < s.w; x++) {
      const v = s.pixel(x, y);
      if (v === 0 || v === INK_SLOT) continue;
      if (x < s.ox) left.push(v);
      else if (x > s.ox) right.push(v);
    }
  }
  return { left, right };
}

/** The opaque non-ink rows of a surface, top to bottom. */
function rows(s: PixelSurface): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < s.h; y++) {
    const row: number[] = [];
    for (let x = 0; x < s.w; x++) {
      const v = s.pixel(x, y);
      if (v !== 0 && v !== INK_SLOT) row.push(v);
    }
    if (row.length > 0) out.push(row);
  }
  return out;
}

describe('primitive twins (§8.1 items 2, 3)', () => {
  it('box on a surface draws the twin', () => {
    const s1 = new PixelSurface(BOX_B);
    const s2 = new PixelSurface(BOX_B);
    box(s1 as never, 0.2, 0.2, 0.8, 0.8, 0, 20, '#f3e0be', '#d3b894', '#a48a78');
    pixelBox(s2, 0.2, 0.2, 0.8, 0.8, 0, 20, '#f3e0be', '#d3b894', '#a48a78');
    s1.finish();
    s2.finish();
    expect(s1.hash()).toBe(s2.hash());
  });

  it('box on a recorder stays Classic', () => {
    const rec = new Recorder();
    box(rec.ctx(), 0.2, 0.2, 0.8, 0.8, 0, 20, '#f3e0be', '#d3b894', '#a48a78');
    expect(rec.ops.filter((o) => o.startsWith('fill(')).length).toBe(3);
  });

  it('pixelBox: left face lighter than right face', () => {
    const s = new PixelSurface(BOX_B);
    expect(s.oy).toBe(32);
    pixelBox(s, 0.2, 0.2, 0.8, 0.8, 0, 20, '#6dbb4f', '#dcc79c', '#9a7148');
    s.finish();
    const { left, right } = sideFaces(s);
    expect(left.length).toBeGreaterThanOrEqual(10);
    expect(right.length).toBeGreaterThanOrEqual(10);
    expect(left.every((v) => v === slotIndex('s2'))).toBe(true);
    expect(right.every((v) => v === slotIndex('s3'))).toBe(true);
  });

  it('pixelBox: a darker right colour on the ramp of the left is kept', () => {
    const s = new PixelSurface(BOX_B);
    pixelBox(s, 0.2, 0.2, 0.8, 0.8, 0, 20, '#6dbb4f', '#dcc79c', RAMPS.s[3] as string);
    s.finish();
    const { left, right } = sideFaces(s);
    expect(left.length).toBeGreaterThanOrEqual(10);
    expect(right.length).toBeGreaterThanOrEqual(10);
    expect(left.every((v) => v === slotIndex('s2'))).toBe(true);
    expect(right.every((v) => v === slotIndex('s4'))).toBe(true);
  });

  it('pixelPyramid is the twin of pyramid on a surface', () => {
    const s1 = new PixelSurface(BOX_B);
    const s2 = new PixelSurface(BOX_B);
    pyramid(s1 as never, 0.2, 0.2, 0.8, 0.8, 10, 40, '#9a7148', '#dcc79c', '#7b5835');
    pixelPyramid(s2, 0.2, 0.2, 0.8, 0.8, 10, 40, '#9a7148', '#dcc79c', '#7b5835');
    s1.finish();
    s2.finish();
    expect(s1.hash()).toBe(s2.hash());
  });

  it('pixelHead: hair on the top row, skin on the bottom row', () => {
    const s = new PixelSurface({ left: -16, right: 16, top: -16, bottom: 16 });
    pixelHead(s, 0, 0, 6, '#f3e0be', '#3b2a20');
    s.finish();
    const r = rows(s);
    expect(slotOf('#3b2a20')).not.toBe(slotOf('#f3e0be'));
    expect(r[0]).toContain(slotOf('#3b2a20'));
    expect(r[r.length - 1]).toContain(slotOf('#f3e0be'));
  });

  it('pixelCylinder is lit to 60 % of its width', () => {
    const s = new PixelSurface({ left: -40, right: 40, top: -40, bottom: 40 });
    pixelCylinder(s, 0.5, 0.5, 0.4, 0, 20, '#3d9be0', '#f2f2f2');
    s.finish();
    const lit = slotOf('#3d9be0');
    const dark = slotIndex(tone('b2', 1));
    expect(SLOT_NAMES[lit]).toBe('b2');
    let L = 0;
    let D = 0;
    const r = s.oy + 5;
    for (let x = 0; x < s.w; x++) {
      const v = s.pixel(x, r);
      if (v === lit) L++;
      else if (v === dark) D++;
    }
    expect(L).toBeGreaterThan(0);
    expect(D).toBeGreaterThan(0);
    expect(Math.abs(L - CYLINDER_LIT_SHARE * (L + D))).toBeLessThanOrEqual(1);
  });

  it('pixelCone: 16 segments, lit on the screen left', () => {
    expect(CONE_SEGMENTS).toBe(16);
    const B = { left: -48, right: 48, top: -56, bottom: 24 };
    const colours = ['#e8503a', '#f2f2f2'];
    const a = new PixelSurface(B);
    pixelCone(a, 0.5, 0.5, 0.8, 20, 60, colours, 12);
    a.finish();
    const b = new PixelSurface(B);
    pixelCone(b, 0.5, 0.5, 0.8, 20, 60, colours, 16);
    b.finish();
    expect(a.hash()).toBe(b.hash());
    const seen = new Set<number>();
    const leftT: number[] = [];
    const rightT: number[] = [];
    for (let y = 0; y < a.h; y++) {
      for (let x = 0; x < a.w; x++) {
        const v = a.pixel(x, y);
        seen.add(v);
        if (v === 0 || v === INK_SLOT || rampOf(v) !== 'o') continue;
        if (x < a.ox) leftT.push(toneIndex(v));
        else if (x > a.ox) rightT.push(toneIndex(v));
      }
    }
    expect(seen.has(slotIndex('o4'))).toBe(true);
    expect(seen.has(slotIndex(tone('o4', 1)))).toBe(true);
    expect(leftT.length).toBeGreaterThan(0);
    expect(rightT.length).toBeGreaterThan(0);
    const mean = (xs: number[]): number => xs.reduce((p, q) => p + q, 0) / xs.length;
    expect(mean(leftT)).toBeLessThanOrEqual(mean(rightT));
  });

  it('a twin paints only slots: surface.misses is 0 for map colours', () => {
    const s = new PixelSurface({ left: -40, right: 40, top: -60, bottom: 40 });
    box(s as never, 0.2, 0.2, 0.8, 0.8, 0, 20, '#6dbb4f', '#dcc79c', '#9a7148');
    s.finish();
    expect(s.misses).toBe(0);
  });
});
