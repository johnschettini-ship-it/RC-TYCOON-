/** Phase 8b stage 0b test (never merged): shelf packing of picture groups into sheets. */
import { describe, expect, it } from 'vitest';
import { packGroups } from '../../../../tools/sheets/pack';
import type { Picture } from '../../../../tools/sheets/picture';

const pic = (w: number, h: number): Picture => ({ w, h, ox: 0, oy: 0, slots: new Uint8Array(w * h).fill(1) });

type Sheets = ReturnType<typeof packGroups>;

/** Each sheet: places inside it with the gap to the edge, no two places closer than the gap, size a multiple of 4. */
function checkSheets(sheets: Sheets, groups: Array<{ id: string; pics: Picture[] }>, max: number, gap: number): void {
  for (const s of sheets) {
    expect(s.w % 4).toBe(0);
    expect(s.h % 4).toBe(0);
    expect(s.w).toBeLessThanOrEqual(max);
    expect(s.h).toBeLessThanOrEqual(max);
    const pics = groups.find((g) => g.id === s.group)!.pics;
    const rects = s.places.map((p) => ({ x: p.x, y: p.y, w: pics[p.pic]!.w, h: pics[p.pic]!.h }));
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(gap);
      expect(r.y).toBeGreaterThanOrEqual(gap);
      expect(r.x + r.w + gap).toBeLessThanOrEqual(s.w);
      expect(r.y + r.h + gap).toBeLessThanOrEqual(s.h);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        const apart = a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y;
        expect(apart, `places ${i} and ${j}`).toBe(true);
      }
    }
  }
  // Every picture of every group is placed exactly once.
  for (const g of groups) {
    const placed = sheets.filter((s) => s.group === g.id).flatMap((s) => s.places.map((p) => p.pic));
    expect(placed.sort((a, b) => a - b)).toEqual(g.pics.map((_, i) => i));
  }
}

describe('packGroups', () => {
  it('two groups never share a sheet; gap 2; no overlap; max size held', () => {
    const groups = [
      { id: 'a', pics: Array.from({ length: 40 }, () => pic(100, 80)) },
      { id: 'b', pics: Array.from({ length: 40 }, () => pic(100, 80)) },
    ];
    const sheets = packGroups(groups);
    expect(sheets.filter((s) => s.group === 'a').length).toBeGreaterThanOrEqual(1);
    expect(sheets.filter((s) => s.group === 'b').length).toBeGreaterThanOrEqual(1);
    for (const s of sheets) expect(['a', 'b']).toContain(s.group);
    checkSheets(sheets, groups, 2048, 2);
  });
  it('a group larger than one sheet spans sheets', () => {
    const groups = [{ id: 'big', pics: Array.from({ length: 600 }, () => pic(120, 120)) }];
    const sheets = packGroups(groups);
    expect(sheets.length).toBeGreaterThanOrEqual(2);
    checkSheets(sheets, groups, 2048, 2);
  });
  it('pictures are placed by height, then width, descending', () => {
    const groups = [{ id: 'g', pics: [pic(10, 10), pic(30, 20), pic(20, 40), pic(40, 20)] }];
    const [s] = packGroups(groups);
    expect(s!.places.map((p) => p.pic)).toEqual([2, 3, 1, 0]);
    checkSheets(packGroups(groups), groups, 2048, 2);
  });
  it('an oversized picture throws', () => expect(() => packGroups([{ id: 'a', pics: [pic(2045, 10)] }])).toThrow());
  it('a picture of exactly max − 2 × gap fits', () => {
    const groups = [{ id: 'a', pics: [pic(2044, 10)] }];
    const sheets = packGroups(groups);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.w).toBe(2048);
    checkSheets(sheets, groups, 2048, 2);
  });
});
