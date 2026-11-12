/** Phase 8b stage 0b test (never merged): shelf packing of picture groups into sheets. */
import type { Picture } from './picture';

export interface PackedSheet {
  group: string;
  w: number;
  h: number;
  /** `pic`: index in the group's `pics`; `x`, `y`: the picture's top-left pixel in the sheet. */
  places: Array<{ pic: number; x: number; y: number }>;
}

const up4 = (v: number): number => Math.ceil(v / 4) * 4;

/**
 * Shelf packing per group: pictures sorted by height, then width, descending; a `gap` of transparent pixels around
 * every picture and at the sheet edge. A group never shares a sheet with another group and spans more sheets when
 * needed. Sheet size: the used box rounded up to a multiple of 4. A picture larger than `max − 2 × gap` throws.
 */
export function packGroups(groups: Array<{ id: string; pics: Picture[] }>, max = 2048, gap = 2): PackedSheet[] {
  const fit = max - 2 * gap;
  const out: PackedSheet[] = [];
  for (const g of groups) {
    g.pics.forEach((p, i) => {
      if (p.w > fit || p.h > fit) throw new Error(`packGroups: picture ${i} of group ${g.id} is ${p.w} × ${p.h}, above ${fit}`);
    });
    const order = g.pics.map((_, i) => i).sort((a, b) => {
      const pa = g.pics[a] as Picture;
      const pb = g.pics[b] as Picture;
      return pb.h - pa.h || pb.w - pa.w || a - b;
    });
    let sheet: PackedSheet | null = null;
    let x = gap;
    let y = gap;
    let shelf = 0;
    let usedW = 0;
    let usedH = 0;
    const close = (): void => {
      if (!sheet) return;
      sheet.w = Math.min(max, up4(usedW));
      sheet.h = Math.min(max, up4(usedH));
      out.push(sheet);
    };
    for (const i of order) {
      const p = g.pics[i] as Picture;
      if (sheet && x + p.w + gap > max) {
        // Next shelf.
        y += shelf + gap;
        x = gap;
        shelf = 0;
      }
      if (sheet && y + p.h + gap > max) {
        close();
        sheet = null;
      }
      if (!sheet) {
        sheet = { group: g.id, w: 0, h: 0, places: [] };
        x = gap;
        y = gap;
        shelf = 0;
        usedW = 0;
        usedH = 0;
      }
      sheet.places.push({ pic: i, x, y });
      usedW = Math.max(usedW, x + p.w + gap);
      usedH = Math.max(usedH, y + p.h + gap);
      shelf = Math.max(shelf, p.h);
      x += p.w + gap;
    }
    close();
  }
  return out;
}
