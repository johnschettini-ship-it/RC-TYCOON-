/**
 * Calm (teal) and Buzz (orange) overlays (Phase 4 §4.6): path and ground tiles tinted by band, with a hatch density
 * per band so colour is not the only signal. Drawn in `drawGround` when `tool.overlay` is `calm` or `buzz`.
 * Owner: W3-E.
 *
 * One batched fill and one batched hatch stroke per band (at most 6 draw calls a frame). Tiles project through the
 * view rotation table (Phase 4 §4.8) and are culled against the visible rectangle. No allocation per frame: tile
 * buckets grow with the map size only.
 */
import { FIELD_BANDS } from '../../data/tuning/fields';
import { buzzRead, calmRead, displayFields } from '../../sim/fields/store';
import type { MapState } from '../../sim/map';
import { STEP_PX, TILE_H, TILE_W } from '../iso';
import type { LayerFrame, WorldLayer } from '../layers';
import type { ToolState } from '../types';
import { FIELD_OVERLAY_STYLE, bandIndex } from './style';

const HW = TILE_W / 2;
const HH = TILE_H / 2;
/** View corner offsets (u, v) of corners 0–3: top, right, bottom, left on screen. */
const CU = [0, 1, 1, 0] as const;
const CV = [0, 0, 1, 1] as const;

/** Device-pixel corners of the last `corners` call (top, right, bottom, left). */
const px = new Float64Array(4);
const py = new Float64Array(4);

/**
 * Corners of map tile `i` in device px under view rotation `r`. View corner j shows map corner (j − r) mod 4
 * (slope bits N = 1, E = 2, S = 4, W = 8). A wet tile is drawn flat at its water surface.
 */
function corners(map: MapState, i: number, r: number, f: LayerFrame): void {
  const w = map.width;
  const h = map.height;
  const x = i % w;
  const y = (i - x) / w;
  let u: number;
  let v: number;
  switch (r) {
    case 1:
      u = h - 1 - y;
      v = x;
      break;
    case 2:
      u = w - 1 - x;
      v = h - 1 - y;
      break;
    case 3:
      u = y;
      v = w - 1 - x;
      break;
    default:
      u = x;
      v = y;
  }
  const base = map.heights[i] as number;
  const water = map.water[i] as number;
  const slope = water > base ? 0 : (map.slope[i] as number);
  const z0 = water > base ? water : base;
  for (let j = 0; j < 4; j++) {
    const cu = u + (CU[j] as number);
    const cv = v + (CV[j] as number);
    const z = z0 + ((slope >> ((j - r + 4) & 3)) & 1);
    px[j] = ((cu - cv) * HW) * f.scale + f.offX;
    py[j] = ((cu + cv) * HH - z * STEP_PX) * f.scale + f.offY;
  }
}

/** True when tile `i` may be on screen (top corner in world px, plus the height of a slope). */
function visible(map: MapState, i: number, r: number, f: LayerFrame): boolean {
  const w = map.width;
  const h = map.height;
  const x = i % w;
  const y = (i - x) / w;
  let u: number;
  let v: number;
  switch (r) {
    case 1:
      u = h - 1 - y;
      v = x;
      break;
    case 2:
      u = w - 1 - x;
      v = h - 1 - y;
      break;
    case 3:
      u = y;
      v = w - 1 - x;
      break;
    default:
      u = x;
      v = y;
  }
  const z = Math.max(map.heights[i] as number, map.water[i] as number);
  const sx = (u - v) * HW;
  const sy = (u + v) * HH - z * STEP_PX;
  const view = f.view;
  return sx + HW >= view.x0 && sx - HW <= view.x1 && sy + TILE_H >= view.y0 && sy - 2 * STEP_PX <= view.y1;
}

export function createFieldOverlayLayer(): WorldLayer {
  /** Tiles to draw, by band 1–3 (segment k − 1 of length n). */
  let buckets = new Int32Array(0);
  const counts = new Int32Array(4);

  return {
    name: 'fieldOverlay',
    kinds: [],
    drawGround(ctx: CanvasRenderingContext2D, world, tool: ToolState, f: LayerFrame) {
      const overlay = tool.overlay;
      if (overlay !== 'calm' && overlay !== 'buzz') return;
      const c = displayFields(world);
      const map = world.state.map;
      const n = c.n;
      if (buckets.length < 3 * n) buckets = new Int32Array(3 * n);
      counts.fill(0);
      const r = f.rotation;
      const calm = overlay === 'calm';
      const low = FIELD_BANDS[0];
      for (let i = 0; i < n; i++) {
        const value = calm ? calmRead(c, map, i) : buzzRead(c, i);
        if (value < low || !visible(map, i, r, f)) continue;
        const b = bandIndex(value);
        buckets[(b - 1) * n + (counts[b] as number)] = i;
        counts[b] = (counts[b] as number) + 1;
      }
      const styles = FIELD_OVERLAY_STYLE[overlay];
      ctx.save();
      ctx.lineWidth = Math.max(1, f.scale);
      for (let b = 1; b <= 3; b++) {
        const count = counts[b] as number;
        if (count === 0) continue;
        const style = styles[b];
        if (style === undefined || style.fill === null) continue;
        const from = (b - 1) * n;
        // Tint: every tile of the band in one path.
        ctx.beginPath();
        for (let k = 0; k < count; k++) {
          corners(map, buckets[from + k] as number, r, f);
          ctx.moveTo(px[0] as number, py[0] as number);
          ctx.lineTo(px[1] as number, py[1] as number);
          ctx.lineTo(px[2] as number, py[2] as number);
          ctx.lineTo(px[3] as number, py[3] as number);
          ctx.closePath();
        }
        ctx.fillStyle = style.fill;
        ctx.fill();
        // Hatch: `hatch` lines per tile, parallel to the top-right edge (Calm) or the top-left edge (Buzz).
        const lines = style.hatch;
        ctx.beginPath();
        for (let k = 0; k < count; k++) {
          corners(map, buckets[from + k] as number, r, f);
          for (let m = 1; m <= lines; m++) {
            const t = m / (lines + 1);
            if (calm) {
              ctx.moveTo((px[0] as number) + ((px[3] as number) - (px[0] as number)) * t, (py[0] as number) + ((py[3] as number) - (py[0] as number)) * t);
              ctx.lineTo((px[1] as number) + ((px[2] as number) - (px[1] as number)) * t, (py[1] as number) + ((py[2] as number) - (py[1] as number)) * t);
            } else {
              ctx.moveTo((px[0] as number) + ((px[1] as number) - (px[0] as number)) * t, (py[0] as number) + ((py[1] as number) - (py[0] as number)) * t);
              ctx.lineTo((px[3] as number) + ((px[2] as number) - (px[3] as number)) * t, (py[3] as number) + ((py[2] as number) - (py[3] as number)) * t);
            }
          }
        }
        ctx.strokeStyle = style.stroke;
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}
