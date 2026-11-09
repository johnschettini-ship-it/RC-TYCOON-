/** Picker preview of a show site (Phase 6 §7 picker): the art scaled to fit a card canvas. Owner: W4-C. */
import type { Dir } from '../../sim/map';
import { drawShowSiteArt, showArtBounds } from './art';

/** Draw `defId` facing the viewer (sprite rotation 2) into a w × h box. */
export function drawShowSitePreview(ctx: CanvasRenderingContext2D, defId: string, w: number, h: number, facing: Dir = 2): void {
  const b = showArtBounds(defId);
  const bw = b.right - b.left;
  const bh = b.bottom - b.top;
  const s = Math.min(w / bw, h / bh) * 0.94;
  const ox = (w - bw * s) / 2 - b.left * s;
  const oy = (h - bh * s) / 2 - b.top * s;
  ctx.save();
  ctx.transform(s, 0, 0, s, ox, oy);
  drawShowSiteArt(ctx, defId, facing);
  ctx.restore();
}
