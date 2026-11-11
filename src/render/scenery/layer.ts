/**
 * Scenery layer (Phase 4 §4.5, §7, §4.8): 85 procedural items in 4 view rotations, wilted garden art, edge items,
 * arches split around the guests walking under them, and the scenery tool ghost (the colour-blind safe blue or
 * vermillion of `../palette.ts`, with a reason icon; outlines doubled with high contrast).
 * Owner: W3-D.
 *
 * Depth (master 6.4, §4.8 `u + v`): a 1 × 1 item sorts at its tile centre; a multi-tile item is cut into
 * `ex + ey` screen columns, each sorting at the front-most footprint tile that covers it (as flat rides do); an edge
 * item sorts at its edge midpoint; an arch draws its back post and beam at `+0.6` and its front post at `+1.4`
 * (like the park entrance), so guests on the path pass between them.
 * The frame loop allocates nothing: scratch objects are reused, sprite keys are numbers.
 */
import { getSceneryDef } from '../../data/catalog';
import { GARDEN_WILT_BELOW } from '../../data/tuning/scenery';
import { cornerHeights } from '../iso';
import type { Dir } from '../../sim/map';
import type { World } from '../../sim/types';
import { footprintColumns, Layer, type ColumnTile } from '../depth';
import { LAYER_KIND, type LayerFrame, type LayerSink, type WorldLayer } from '../layers';
import { ghostFill, ghostLineWidth, ghostStroke } from '../palette';
import { blitArt, blitArtColumn } from '../pixel/grid';
import type { Sprite } from '../spriteCache';
import { drawGhostIcon } from '../sprites/props';
import type { ToolState } from '../types';
import { ART_HEADROOM_PX } from './art';
import { sceneryGhostOf } from './ghost';
import { itemView, newItemView, viewU, viewV } from './place';
import { sceneryFrame, scenerySpriteKey, ScenerySprites, viewExtent } from './sprites';

const HW = 32;
const HH = 16;
const STEP = 8;

/** `sub` codes for centre items: ≥ 0 = screen column of a multi-tile sprite. */
const SUB_WHOLE = -1;
const SUB_ARCH_BACK = -2;
const SUB_ARCH_FRONT = -3;

export function createSceneryLayer(): WorldLayer {
  const sprites = new ScenerySprites();
  const iv = newItemView();
  const columnsMemo = new Map<number, ColumnTile[]>();

  function columns(ex: number, ey: number): ColumnTile[] {
    const k = ex * 64 + ey;
    let c = columnsMemo.get(k);
    if (!c) {
      c = footprintColumns(ex, ey);
      columnsMemo.set(k, c);
    }
    return c;
  }

  function devX(f: LayerFrame, wx: number): number {
    return wx * f.scale + f.offX;
  }
  function devY(f: LayerFrame, wy: number): number {
    return wy * f.scale + f.offY;
  }

  function blit(ctx: CanvasRenderingContext2D, f: LayerFrame, sp: Sprite, ax: number, ay: number): void {
    // Phase 8 stage 0 prototype (§5.5 stage 1b): whole copies on the art grid in Pixel.
    if (f.art) {
      blitArt(ctx, sp, ax, ay, f.art);
      return;
    }
    const s = f.scale / sp.scale;
    const x0 = Math.round(devX(f, ax) - sp.ox * s);
    const y0 = Math.round(devY(f, ay) - sp.oy * s);
    const x1 = Math.round(devX(f, ax) + (sp.w - sp.ox) * s);
    const y1 = Math.round(devY(f, ay) + (sp.h - sp.oy) * s);
    ctx.drawImage(sp.image, x0, y0, x1 - x0, y1 - y0);
  }

  /**
   * The vertical strip [colL, colR) (world x) of a sprite anchored at (ax, ay). `ends` (Pixel only): bit 1 extends the
   * strip to the left edge of the image, bit 2 to the right edge (§7.7).
   */
  function blitColumn(ctx: CanvasRenderingContext2D, f: LayerFrame, sp: Sprite, ax: number, ay: number, colL: number, colR: number, ends = 0): void {
    if (f.art) {
      blitArtColumn(ctx, sp, ax, ay, colL, colR, f.art, ends);
      return;
    }
    const s = f.scale / sp.scale;
    const dx0 = Math.round(devX(f, colL));
    const dx1 = Math.round(devX(f, colR));
    if (dx1 <= dx0) return;
    let s0 = sp.ox + (colL - ax) * sp.scale;
    let s1 = sp.ox + (colR - ax) * sp.scale;
    if (s0 < 0) s0 = 0;
    if (s1 > sp.w) s1 = sp.w;
    if (s1 <= s0) return;
    const y0 = Math.round(devY(f, ay) - sp.oy * s);
    const y1 = Math.round(devY(f, ay) + (sp.h - sp.oy) * s);
    ctx.drawImage(sp.image, s0, 0, s1 - s0, sp.h, dx0, y0, dx1 - dx0, y1 - y0);
  }

  return {
    name: 'scenery',
    kinds: [LAYER_KIND.scenery, LAYER_KIND.sceneryEdge],

    collect(world: World, sink: LayerSink, _tool: ToolState, f: LayerFrame): void {
      // One sprite-cache frame per render frame (collect runs once per frame, before any drawItem).
      sprites.beginFrame();
      const s = world.state;
      const list = s.scenery;
      if (list.length === 0) return;
      const map = s.map;
      const r = f.rotation;
      const v = f.view;
      for (let i = 0; i < list.length; i++) {
        const item = list[i]!;
        const def = getSceneryDef(item.defId);
        if (!def) continue;
        itemView(iv, item, def, r, map.width, map.height);
        const ax = (iv.u0 - iv.v0) * HW;
        const ay = (iv.u0 + iv.v0) * HH - item.z * STEP;
        const left = ax - iv.ey * HW - 8;
        const right = ax + iv.ex * HW + 8;
        const top = ay - def.heightM * STEP - ART_HEADROOM_PX;
        const bottom = ay + (iv.ex + iv.ey) * HH + 6;
        if (right < v.x0 || left > v.x1 || bottom < v.y0 || top > v.y1) continue;
        if (def.edge) {
          sink.push(LAYER_KIND.sceneryEdge, i, SUB_WHOLE, ax, ay, scenerySpriteKey(def.id, iv.f, 0, f.bucket), iv.depth, item.z, Layer.Object);
          continue;
        }
        const wilted = def.needsWater && item.waterLevel < GARDEN_WILT_BELOW;
        if (def.overPath) {
          const d0 = iv.u0 + iv.v0;
          sink.push(LAYER_KIND.scenery, i, SUB_ARCH_BACK, ax, ay, scenerySpriteKey(def.id, iv.f, sceneryFrame(false, 1, null), f.bucket), d0 + 0.6, item.z, Layer.Object);
          sink.push(LAYER_KIND.scenery, i, SUB_ARCH_FRONT, ax, ay, scenerySpriteKey(def.id, iv.f, sceneryFrame(false, 2, null), f.bucket), d0 + 1.4, item.z, Layer.Object);
          continue;
        }
        const key = scenerySpriteKey(def.id, iv.f, sceneryFrame(wilted, 0, null), f.bucket);
        if (iv.ex === 1 && iv.ey === 1) {
          sink.push(LAYER_KIND.scenery, i, SUB_WHOLE, ax, ay, key, iv.depth, item.z, Layer.Object);
          continue;
        }
        const cols = columns(iv.ex, iv.ey);
        const colStart = ax - iv.ey * HW;
        for (let k = 0; k < cols.length; k++) {
          const colL = colStart + k * HW;
          if (colL + HW < v.x0 || colL > v.x1) continue;
          const c = cols[k]!;
          sink.push(LAYER_KIND.scenery, i, k, ax, ay, key, iv.u0 + c.dx + iv.v0 + c.dy + 1, item.z, Layer.Object);
        }
      }
    },

    drawItem(ctx, world, kind, ref, sub, ax, ay, skey, f): void {
      const item = world.state.scenery[ref];
      if (!item) return;
      const def = getSceneryDef(item.defId);
      if (!def) return;
      const map = world.state.map;
      itemView(iv, item, def, f.rotation, map.width, map.height);
      const wilted = !def.edge && def.needsWater && item.waterLevel < GARDEN_WILT_BELOW;
      const part = sub === SUB_ARCH_BACK ? 1 : sub === SUB_ARCH_FRONT ? 2 : 0;
      const sp = sprites.get(skey, def.id, iv.f, kind === LAYER_KIND.sceneryEdge ? 0 : sceneryFrame(wilted, part, null), f.bucket);
      if (!sp) return;
      if (sub < 0) {
        blit(ctx, f, sp, ax, ay);
        return;
      }
      const colL = ax - iv.ey * HW + sub * HW;
      // Pixel: the first and last column reach the image edges, as for rides.
      const ends = (sub === 0 ? 1 : 0) | (sub === columns(iv.ex, iv.ey).length - 1 ? 2 : 0);
      blitColumn(ctx, f, sp, ax, ay, colL, colL + HW, ends);
    },

    drawOverlay(ctx, world, tool, f): void {
      sprites.trim();
      if (tool.tool !== 'scenery') return;
      const g = sceneryGhostOf(tool);
      if (!g) return;
      const map = world.state.map;
      const r = f.rotation;
      const fill = ghostFill(g.valid);
      const stroke = ghostStroke(g.valid);
      ctx.lineWidth = ghostLineWidth(Math.max(1, f.scale));
      for (const t of g.tiles) outlineTile(ctx, f, map, t, r, fill, stroke);
      const def = g.defId ? getSceneryDef(g.defId) : undefined;
      let iconX = 0;
      let iconY = 0;
      if (def && g.tiles.length > 0) {
        const fake = { id: -1, defId: def.id, x: g.x, y: g.y, z: map.heights[g.tiles[0]!] ?? 0, rotation: g.rotation, edge: g.edge, waterLevel: 255 };
        itemView(iv, fake, def, r, map.width, map.height);
        const ax = (iv.u0 - iv.v0) * HW;
        const ay = (iv.u0 + iv.v0) * HH - fake.z * STEP;
        if (g.mode === 'place') {
          const frame = sceneryFrame(false, 0, g.valid ? 'valid' : 'invalid');
          const sp = sprites.get(scenerySpriteKey(def.id, iv.f, frame, f.bucket), def.id, iv.f, frame, f.bucket);
          if (sp) {
            ctx.globalAlpha = 0.85;
            blit(ctx, f, sp, ax, ay);
            ctx.globalAlpha = 1;
          }
        }
        if (def.edge) edgeHighlight(ctx, f, iv.u0, iv.v0, fake.z, iv.f, stroke);
        const ve = viewExtent(def, iv.f);
        iconX = ax + ((ve.ex - ve.ey) * HW) / 2;
        iconY = ay + ((ve.ex + ve.ey) * HH) / 2 - def.heightM * STEP - 14;
      } else if (g.tiles.length > 0) {
        const t = g.tiles[0]!;
        const x = t % map.width;
        const y = (t - x) / map.width;
        const u = viewU(x, y, r, map.width, map.height);
        const vv = viewV(x, y, r, map.width, map.height);
        iconX = (u - vv) * HW;
        iconY = (u + vv) * HH + HH - (map.heights[t] ?? 0) * STEP - 14;
      } else {
        return;
      }
      if (g.mode === 'remove' && g.targetId < 0) return;
      drawGhostIcon(ctx, devX(f, iconX), devY(f, iconY), g.mode === 'remove' ? false : g.valid, Math.max(8, 11 * Math.min(1.5, f.scale)));
    },
  };

  /** Tile top face (with slope) as a device-px path, in the current view rotation. */
  function outlineTile(ctx: CanvasRenderingContext2D, f: LayerFrame, map: World['state']['map'], t: number, r: Dir, fill: string, stroke: string): void {
    if (t < 0 || t >= map.width * map.height) return;
    const x = t % map.width;
    const y = (t - x) / map.width;
    const h = cornerHeights(map, t);
    // Map corners N (x, y), E (x + 1, y), S (x + 1, y + 1), W (x, y + 1) → continuous view coordinates.
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const cx = x + (k === 1 || k === 2 ? 1 : 0);
      const cy = y + (k >= 2 ? 1 : 0);
      const u = r === 0 ? cx : r === 1 ? map.height - cy : r === 2 ? map.width - cx : cy;
      const vv = r === 0 ? cy : r === 1 ? cx : r === 2 ? map.height - cy : map.width - cx;
      const px = devX(f, (u - vv) * HW);
      const py = devY(f, (u + vv) * HH - (h[k] as number) * STEP);
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  /** A bright line along the chosen view edge of an edge item's tile. */
  function edgeHighlight(ctx: CanvasRenderingContext2D, f: LayerFrame, u0: number, v0: number, z: number, e: Dir, stroke: string): void {
    const a = e === 0 ? [0, 0] : e === 1 ? [1, 0] : e === 2 ? [0, 1] : [0, 0];
    const b = e === 0 ? [1, 0] : e === 1 ? [1, 1] : e === 2 ? [1, 1] : [0, 1];
    const p = (q: number[]): [number, number] => [devX(f, (u0 + q[0]! - (v0 + q[1]!)) * HW), devY(f, (u0 + q[0]! + v0 + q[1]!) * HH - z * STEP)];
    const [x0, y0] = p(a);
    const [x1, y1] = p(b);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = ghostLineWidth(Math.max(2, 3 * f.scale));
    ctx.stroke();
  }
}
