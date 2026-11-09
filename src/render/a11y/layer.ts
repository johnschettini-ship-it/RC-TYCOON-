/**
 * Accessibility overlay (Phase 6 §4.7, §7). Owner: W4-F. Drawn last in `drawOverlay`, under the view rotation:
 * - the map cursor (`src/a11y/cursor.ts`): a dashed diamond on the cursor tile;
 * - a hatch pattern over the footprint of an invalid placement ghost and over a path line the build would refuse,
 *   so "not allowed" never rests on colour alone (the renderer adds the check / cross icon).
 */
import { getFlatRideDef } from '../../data/catalog';
import { mapCursor } from '../../a11y/cursor';
import { footprintTiles } from '../../sim/footprint';
import type { MapState } from '../../sim/map';
import type { World } from '../../sim/types';
import { displayPrefs } from '../../a11y/prefs';
import { STEP_PX, TILE_H, TILE_W } from '../iso';
import type { LayerFrame, WorldLayer } from '../layers';
import { CURSOR_COLOUR, GHOST_HATCH, GHOST_INVALID } from '../palette';
import type { ToolState } from '../types';
import { mapToViewContinuous } from '../view';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

/** Device-pixel corners (N, E, S, W) of map tile `i` on its ground, written to `out` as x0, y0, … x3, y3. */
export function tileCorners(map: MapState, i: number, f: Pick<LayerFrame, 'scale' | 'offX' | 'offY' | 'rotation'>, out: number[]): number[] {
  const x = i % map.width;
  const y = (i - x) / map.width;
  const h = map.heights[i] as number;
  const m = map.slope[i] as number;
  const pts: Array<[number, number, number]> = [
    [x, y, h + (m & 1 ? 1 : 0)],
    [x + 1, y, h + (m & 2 ? 1 : 0)],
    [x + 1, y + 1, h + (m & 4 ? 1 : 0)],
    [x, y + 1, h + (m & 8 ? 1 : 0)],
  ];
  out.length = 0;
  for (const [fx, fy, z] of pts) {
    const p = mapToViewContinuous(fx, fy, f.rotation, map.width, map.height);
    out.push((p.u - p.v) * HW * f.scale + f.offX, ((p.u + p.v) * HH - z * STEP_PX) * f.scale + f.offY);
  }
  return out;
}

/** Tiles of the ghost or drag that the build would refuse (empty when everything is allowed). */
export function invalidTiles(world: World, tool: ToolState): number[] {
  const map = world.state.map;
  const out: number[] = [];
  const g = tool.ghost;
  if (g && !g.valid) {
    const x = g.tile % map.width;
    const y = Math.floor(g.tile / map.width);
    if (g.kind === 'ride') {
      const def = getFlatRideDef(g.defId);
      const tiles = def ? footprintTiles(map, x, y, def.w, def.d, g.rotation) : null;
      out.push(...(tiles ?? [g.tile]));
    } else {
      out.push(g.tile);
    }
  }
  const d = tool.drag;
  if (d && d.reason && (tool.tool === 'footpath' || tool.tool === 'queue')) out.push(...d.tiles);
  const n = map.width * map.height;
  return out.filter((t) => t >= 0 && t < n);
}

const corners: number[] = [];

function diamondPath(ctx: CanvasRenderingContext2D, c: readonly number[]): void {
  ctx.beginPath();
  ctx.moveTo(c[0] as number, c[1] as number);
  ctx.lineTo(c[2] as number, c[3] as number);
  ctx.lineTo(c[4] as number, c[5] as number);
  ctx.lineTo(c[6] as number, c[7] as number);
  ctx.closePath();
}

/** Diagonal hatch lines clipped to the tiles. */
function drawHatch(ctx: CanvasRenderingContext2D, map: MapState, tiles: readonly number[], f: LayerFrame): void {
  const hc = displayPrefs().highContrast;
  ctx.save();
  ctx.beginPath();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const t of tiles) {
    const c = tileCorners(map, t, f, corners);
    ctx.moveTo(c[0] as number, c[1] as number);
    ctx.lineTo(c[2] as number, c[3] as number);
    ctx.lineTo(c[4] as number, c[5] as number);
    ctx.lineTo(c[6] as number, c[7] as number);
    ctx.closePath();
    for (let k = 0; k < 8; k += 2) {
      minX = Math.min(minX, c[k] as number);
      maxX = Math.max(maxX, c[k] as number);
      minY = Math.min(minY, c[k + 1] as number);
      maxY = Math.max(maxY, c[k + 1] as number);
    }
  }
  ctx.clip();
  const gap = Math.max(5, 8 * f.scale);
  ctx.lineWidth = Math.max(1.5, (hc ? 2.5 : 1.6) * f.scale);
  ctx.strokeStyle = GHOST_HATCH;
  ctx.beginPath();
  const span = maxY - minY;
  for (let x = minX - span; x < maxX; x += gap) {
    ctx.moveTo(x, maxY);
    ctx.lineTo(x + span, minY);
  }
  ctx.stroke();
  ctx.strokeStyle = GHOST_INVALID;
  ctx.lineWidth = Math.max(1, (hc ? 1.6 : 0.9) * f.scale);
  ctx.beginPath();
  for (let x = minX - span + gap / 2; x < maxX; x += gap) {
    ctx.moveTo(x, maxY);
    ctx.lineTo(x + span, minY);
  }
  ctx.stroke();
  ctx.restore();
}

function drawCursor(ctx: CanvasRenderingContext2D, map: MapState, tile: number, f: LayerFrame): void {
  const c = tileCorners(map, tile, f, corners);
  const hc = displayPrefs().highContrast;
  ctx.save();
  ctx.lineJoin = 'round';
  diamondPath(ctx, c);
  ctx.fillStyle = 'rgba(255,210,63,0.16)';
  ctx.fill();
  // A dark under-stroke keeps the dashes readable on light ground.
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(10,18,28,0.85)';
  ctx.lineWidth = Math.max(2, (hc ? 5 : 4) * f.scale);
  ctx.stroke();
  ctx.setLineDash([6 * f.scale, 4 * f.scale]);
  ctx.strokeStyle = CURSOR_COLOUR;
  ctx.lineWidth = Math.max(1.5, (hc ? 3 : 2) * f.scale);
  ctx.stroke();
  ctx.restore();
}

export function createA11yLayer(): WorldLayer {
  return {
    name: 'a11y',
    kinds: [],
    drawOverlay(ctx, world, tool, f) {
      const map = world.state.map;
      const bad = invalidTiles(world, tool);
      if (bad.length > 0) drawHatch(ctx, map, bad, f);
      if (mapCursor.on && mapCursor.tile >= 0 && mapCursor.tile < map.width * map.height) drawCursor(ctx, map, mapCursor.tile, f);
    },
  };
}
