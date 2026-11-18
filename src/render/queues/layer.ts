/**
 * Queue clarity overlay (spec 2026-11-18 §1–3), drawn in `drawOverlay` in both looks:
 * - the tapped queue (`selectedEntity` kind `queue`, id = a queue node): every node of its linked group highlighted;
 * - while a path tool (footpath or queue) is on: queue groups that reach no ride entrance tinted, with one "!" badge
 *   per group;
 * - a ride name sign over every ride entrance (`./sign.ts`).
 * The canvas carries `data-queue-signs` (sign texts joined by "|") and `data-queue-warnings` (unlinked groups marked),
 * written only when they change, for e2e tests. Hints only: nothing here changes which ride owns a queue.
 */
import { nodeZOf } from '../../sim/paths/nodes';
import { nodeTile, queueComponent, unlinkedQueueGroups } from '../../sim/pathing/queues';
import type { World } from '../../sim/types';
import { tileCorners } from '../a11y/layer';
import { STEP_PX, TILE_H, TILE_W } from '../iso';
import type { LayerFrame, WorldLayer } from '../layers';
import type { ToolState } from '../types';
import { mapToViewContinuous } from '../view';
import { QUEUE_COLOURS } from './colours';
import { SIGN_FONT_PX, signBoxes, signFont, signScale, type SignBox } from './sign';

const corners: number[] = [];
const signs: SignBox[] = [];

/** Device-px corners (N, E, S, W) of path node `node`: the ground surface for a ground node, flat at `z` for a deck. */
function nodeCorners(world: World, node: number, f: LayerFrame, out: number[]): number[] {
  const map = world.state.map;
  const tile = nodeTile(world, node);
  const z = nodeZOf(world, node);
  if (z === (map.heights[tile] as number)) return tileCorners(map, tile, f, out);
  const x = tile % map.width;
  const y = (tile - x) / map.width;
  out.length = 0;
  for (const [fx, fy] of [
    [x, y],
    [x + 1, y],
    [x + 1, y + 1],
    [x, y + 1],
  ] as const) {
    const p = mapToViewContinuous(fx, fy, f.rotation, map.width, map.height);
    out.push((p.u - p.v) * (TILE_W / 2) * f.scale + f.offX, ((p.u + p.v) * (TILE_H / 2) - z * STEP_PX) * f.scale + f.offY);
  }
  return out;
}

function diamond(ctx: CanvasRenderingContext2D, c: readonly number[]): void {
  ctx.beginPath();
  ctx.moveTo(c[0] as number, c[1] as number);
  ctx.lineTo(c[2] as number, c[3] as number);
  ctx.lineTo(c[4] as number, c[5] as number);
  ctx.lineTo(c[6] as number, c[7] as number);
  ctx.closePath();
}

function drawNodes(ctx: CanvasRenderingContext2D, world: World, nodes: readonly number[], fill: string, stroke: string, f: LayerFrame): void {
  ctx.lineWidth = Math.max(1, 1.5 * f.scale);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  for (const n of nodes) {
    diamond(ctx, nodeCorners(world, n, f, corners));
    ctx.fill();
    ctx.stroke();
  }
}

/** A round "!" badge centred on node `node`. */
function drawBadge(ctx: CanvasRenderingContext2D, world: World, node: number, f: LayerFrame): void {
  const c = nodeCorners(world, node, f, corners);
  const cx = ((c[0] as number) + (c[4] as number)) / 2;
  const cy = ((c[1] as number) + (c[5] as number)) / 2 - 10 * f.scale;
  const r = Math.max(7 * f.dpr, 9 * f.scale);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = QUEUE_COLOURS.badge;
  ctx.fill();
  ctx.lineWidth = Math.max(1, 1.2 * f.scale);
  ctx.strokeStyle = QUEUE_COLOURS.badgeText;
  ctx.stroke();
  ctx.fillStyle = QUEUE_COLOURS.badgeText;
  ctx.font = `700 ${Math.round(r * 1.4)}px Fredoka, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', cx, cy + r * 0.05);
}

function drawSign(ctx: CanvasRenderingContext2D, s: SignBox, f: LayerFrame): void {
  const k = s.fontPx / SIGN_FONT_PX;
  // Post from the sign down to the entrance.
  ctx.strokeStyle = QUEUE_COLOURS.signPost;
  ctx.lineWidth = Math.max(1, 1.6 * k);
  ctx.beginPath();
  ctx.moveTo(s.footX, s.y + s.h);
  ctx.lineTo(s.footX, s.footY);
  ctx.stroke();
  const r = Math.min(s.h / 2, 5 * k);
  ctx.beginPath();
  ctx.moveTo(s.x + r, s.y);
  ctx.arcTo(s.x + s.w, s.y, s.x + s.w, s.y + s.h, r);
  ctx.arcTo(s.x + s.w, s.y + s.h, s.x, s.y + s.h, r);
  ctx.arcTo(s.x, s.y + s.h, s.x, s.y, r);
  ctx.arcTo(s.x, s.y, s.x + s.w, s.y, r);
  ctx.closePath();
  ctx.fillStyle = QUEUE_COLOURS.sign;
  ctx.fill();
  ctx.lineWidth = Math.max(1, f.dpr);
  ctx.strokeStyle = QUEUE_COLOURS.signEdge;
  ctx.stroke();
  ctx.fillStyle = QUEUE_COLOURS.signText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s.text, s.x + s.w / 2, s.y + s.h / 2 + s.fontPx * 0.06);
}

function setData(ctx: CanvasRenderingContext2D, key: 'queueSigns' | 'queueWarnings', value: string): void {
  const ds = (ctx.canvas as { dataset?: Record<string, string> } | undefined)?.dataset;
  if (ds && ds[key] !== value) ds[key] = value;
}

export function createQueueLayer(): WorldLayer {
  return {
    name: 'queues',
    kinds: [],
    drawOverlay(ctx: CanvasRenderingContext2D, world: World, tool: ToolState, f: LayerFrame): void {
      ctx.save();
      const sel = tool.selectedEntity;
      if (sel && sel.kind === 'queue') {
        const group = queueComponent(world, sel.id);
        if (group.nodes.length > 0) drawNodes(ctx, world, group.nodes, QUEUE_COLOURS.highlightFill, QUEUE_COLOURS.highlight, f);
      }
      let marked = 0;
      if (tool.tool === 'footpath' || tool.tool === 'queue') {
        const groups = unlinkedQueueGroups(world);
        for (const g of groups) drawNodes(ctx, world, g, QUEUE_COLOURS.unlinkedFill, QUEUE_COLOURS.badge, f);
        for (const g of groups) drawBadge(ctx, world, g[0] as number, f);
        marked = groups.length;
      }
      setData(ctx, 'queueWarnings', String(marked));
      const zoom = f.scale / f.dpr;
      // The font depends only on the zoom: set it once, measure with it, draw with it.
      ctx.font = signFont(SIGN_FONT_PX * signScale(zoom) * f.dpr);
      signBoxes(world, f, (s) => ctx.measureText(s).width, signs);
      for (const s of signs) drawSign(ctx, s, f);
      setData(ctx, 'queueSigns', signs.map((s) => s.text).join('|'));
      ctx.restore();
    },
  };
}
