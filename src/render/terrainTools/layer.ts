/**
 * Land and water tool ghosts (Phase 4 §7): the brush outline with its cost, the marked corner, the level rectangle,
 * drawn from `tool.brush` in `drawOverlay`. Owner: W3-A.
 *
 * Each covered tile is outlined on its top face (its 4 corner heights), green when the command would succeed and
 * red when not (the bar shows the reason with an icon, so colour is never the only signal); the Water tool uses
 * blue. Corner mode adds a ring on the vertex. A cost label sits above the ghost. Map points go through the view
 * rotation (the `mapToViewContinuous` table, inlined to avoid allocations) and then the master 6.4 projection.
 * No allocations per frame: scratch numbers only; the label text and width are cached per value.
 */
import type { Dir, MapState } from '../../sim/map';
import type { World } from '../../sim/types';
import { STEP_PX, TILE_H, TILE_W } from '../iso';
import type { LayerFrame, WorldLayer } from '../layers';
import type { ToolState } from '../types';
import { isTerrainTool } from './toolState';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

export interface GhostColours {
  fill: string;
  stroke: string;
}

const LAND_OK: GhostColours = { fill: 'rgba(70,205,95,0.30)', stroke: '#7dff9a' };
const WATER_OK: GhostColours = { fill: 'rgba(80,170,255,0.32)', stroke: '#a8dcff' };
const BAD: GhostColours = { fill: 'rgba(235,60,60,0.38)', stroke: '#ff8a8a' };

export function terrainGhostColours(tool: 'land' | 'water', valid: boolean): GhostColours {
  if (!valid) return BAD;
  return tool === 'water' ? WATER_OK : LAND_OK;
}

/** Scratch result of `viewPoint` (reused; read it before the next call). */
const vp = { u: 0, v: 0 };

/** Continuous map point (fx, fy) in view terms: the `mapToViewContinuous` table of `render/view.ts` (W3-G). */
export function viewPoint(fx: number, fy: number, r: Dir, w: number, h: number): { u: number; v: number } {
  switch (r) {
    case 1:
      vp.u = h - fy;
      vp.v = fx;
      break;
    case 2:
      vp.u = w - fx;
      vp.v = h - fy;
      break;
    case 3:
      vp.u = fy;
      vp.v = w - fx;
      break;
    default:
      vp.u = fx;
      vp.v = fy;
  }
  return vp;
}

/** Device point of map point (fx, fy) at height z: written to `px`, `py`. */
let px = 0;
let py = 0;
function project(fx: number, fy: number, z: number, f: LayerFrame, map: MapState): void {
  const p = viewPoint(fx, fy, f.rotation, map.width, map.height);
  px = (p.u - p.v) * HW * f.scale + f.offX;
  py = ((p.u + p.v) * HH - z * STEP_PX) * f.scale + f.offY;
}

function cornerZ(map: MapState, i: number, bit: number): number {
  return (map.heights[i] as number) + (((map.slope[i] as number) & bit) !== 0 ? 1 : 0);
}

/** "$1,234" or "$2.50" (the HUD format; terrain costs are whole dollars). */
export function moneyLabel(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const dollars = String(Math.floor(abs / 100));
  let grouped = '';
  for (let k = 0; k < dollars.length; k++) {
    if (k > 0 && (dollars.length - k) % 3 === 0) grouped += ',';
    grouped += dollars[k];
  }
  const rest = abs % 100;
  return `${cents < 0 ? '−' : ''}$${grouped}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`;
}

let labelCost = -1;
let labelText = '';
let labelWidth = 0;
let labelFontScale = 0;
let labelFont = '';

export function createTerrainToolLayer(): WorldLayer {
  return {
    name: 'terrainTools',
    kinds: [],
    drawOverlay(ctx: CanvasRenderingContext2D, world: World, tool: ToolState, f: LayerFrame) {
      const b = tool.brush;
      if (!b || !isTerrainTool(tool.tool) || b.tiles.length === 0) return;
      const map = world.state.map;
      const n = map.width * map.height;
      const col = terrainGhostColours(tool.tool, b.valid);
      const lw = Math.max(1, 1.5 * f.scale);
      let top = Infinity;
      let left = Infinity;
      let right = -Infinity;
      for (let k = 0; k < b.tiles.length; k++) {
        const i = b.tiles[k] as number;
        if (i < 0 || i >= n) continue;
        const x = i % map.width;
        const y = (i - x) / map.width;
        ctx.beginPath();
        project(x, y, cornerZ(map, i, 1), f, map);
        ctx.moveTo(px, py);
        if (py < top) top = py;
        if (px < left) left = px;
        if (px > right) right = px;
        project(x + 1, y, cornerZ(map, i, 2), f, map);
        ctx.lineTo(px, py);
        if (py < top) top = py;
        if (px < left) left = px;
        if (px > right) right = px;
        project(x + 1, y + 1, cornerZ(map, i, 4), f, map);
        ctx.lineTo(px, py);
        if (py < top) top = py;
        if (px < left) left = px;
        if (px > right) right = px;
        project(x, y + 1, cornerZ(map, i, 8), f, map);
        ctx.lineTo(px, py);
        if (py < top) top = py;
        if (px < left) left = px;
        if (px > right) right = px;
        ctx.closePath();
        ctx.fillStyle = col.fill;
        ctx.fill();
        ctx.strokeStyle = col.stroke;
        ctx.lineWidth = lw;
        ctx.stroke();
      }
      const c = b.corner;
      if (c) {
        // The vertex height: the highest corner of the brush tiles that sit on it.
        let z = 0;
        for (let k = 0; k < b.tiles.length; k++) {
          const i = b.tiles[k] as number;
          if (i < 0 || i >= n) continue;
          const x = i % map.width;
          const y = (i - x) / map.width;
          const bit = c.x === x ? (c.y === y ? 1 : 8) : c.y === y ? 2 : 4;
          const h = cornerZ(map, i, bit);
          if (h > z) z = h;
        }
        project(c.x, c.y, z, f, map);
        const r = Math.max(4, 6 * f.dpr);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = col.stroke;
        ctx.fill();
        ctx.strokeStyle = '#13212e';
        ctx.lineWidth = Math.max(1, 2 * f.dpr);
        ctx.stroke();
      }
      if (b.cost > 0 && top !== Infinity) drawCost(ctx, b.cost, (left + right) / 2, top, f.dpr, col.stroke);
    },
  };
}

/** The cost tooltip: a small dark chip with the total, centred above the ghost. */
function drawCost(ctx: CanvasRenderingContext2D, cost: number, cx: number, top: number, dpr: number, accent: string): void {
  if (labelFontScale !== dpr) {
    labelFontScale = dpr;
    labelFont = `600 ${Math.round(13 * dpr)}px system-ui, sans-serif`;
    labelCost = -1;
  }
  ctx.font = labelFont;
  if (cost !== labelCost) {
    labelCost = cost;
    labelText = moneyLabel(cost);
    labelWidth = ctx.measureText(labelText).width;
  }
  const padX = 7 * dpr;
  const h = 20 * dpr;
  const w = labelWidth + 2 * padX;
  const x = cx - w / 2;
  const y = top - h - 8 * dpr;
  ctx.fillStyle = 'rgba(13,27,40,0.88)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, dpr);
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#f2f5f8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(labelText, cx, y + h / 2);
}
