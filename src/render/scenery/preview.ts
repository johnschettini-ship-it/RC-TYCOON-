/** Picker preview of one scenery item (Phase 4 §7 item grid): the art scaled to fit a card canvas. Owner: W3-D. */
import { getSceneryDef } from '../../data/catalog';
import type { Dir } from '../../sim/map';
import { drawSceneryArt, sceneryArtBounds } from './art';
import { viewExtent } from './sprites';

/** Draw `defId` facing the viewer (sprite rotation 2; edge items on their front-left edge) into a w × h box. */
export function drawSceneryPreview(ctx: CanvasRenderingContext2D, defId: string, w: number, h: number, facing: Dir = 2): void {
  const def = getSceneryDef(defId);
  if (!def) return;
  const { ex, ey } = viewExtent(def, facing);
  const b = sceneryArtBounds(def, ex, ey);
  const bw = b.right - b.left;
  const bh = b.bottom - b.top;
  const s = Math.min(w / bw, h / bh) * 0.96;
  const ox = (w - bw * s) / 2 - b.left * s;
  const oy = (h - bh * s) / 2 - b.top * s;
  ctx.save();
  ctx.transform(s, 0, 0, s, ox, oy);
  drawSceneryArt(ctx, defId, { facing, ex, ey, wilted: false, part: 0, edge: def.edge ? facing : -1 });
  ctx.restore();
}
