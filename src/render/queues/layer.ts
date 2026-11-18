/**
 * Queue clarity overlay (spec 2026-11-18 §1–3), drawn in `drawOverlay` in both looks:
 * - the tapped queue (`selectedEntity` kind `queue`, id = a `queueKey`): every node of its linked group highlighted,
 *   ground nodes in `drawGround` (under the guests), deck nodes over the decks;
 * - while a path tool (footpath or queue) is on: queue groups that reach no ride entrance tinted, with one "!" badge
 *   per group;
 * Path clarity (spec 2026-11-18 §3–4; it removed the entrance sign):
 * - while a path tool is on: footpaths the park entrance does not reach are dimmed; ride entrances with no queue and
 *   queue open ends no reached footpath touches glow (`../../sim/pathing/reach.ts` `pathMarks`);
 * - Show me (`ToolState.pathFocus`): the spot pulses until its time (steady with reduced motion).
 * The canvas carries `data-queue-warnings` (unlinked groups marked), `data-path-glows`, `data-path-dimmed` and
 * `data-path-focus` (the pulsing tile, or empty), written only when they change, for e2e tests. Hints only: nothing
 * here changes which ride owns a queue or where guests can walk.
 */
import { nodeZOf } from '../../sim/paths/nodes';
import { nodeTile, queueComponent, queueNodeOfKey, unlinkedQueueGroups } from '../../sim/pathing/queues';
import type { World } from '../../sim/types';
import { tileCorners } from '../a11y/layer';
import { STEP_PX, TILE_H, TILE_W } from '../iso';
import type { LayerFrame, WorldLayer } from '../layers';
import type { ToolState } from '../types';
import { mapToViewContinuous } from '../view';
import { displayPrefs } from '../../a11y/prefs';
import { pathMarks } from '../../sim/pathing/reach';
import { PATH_COLOURS, QUEUE_COLOURS } from './colours';

const corners: number[] = [];

/** Device-px corners (N, E, S, W) of path node `node`: the ground surface for a ground node, flat at `z` for a deck. */
function nodeCorners(world: World, node: number, f: LayerFrame, out: number[]): number[] {
  return spotCorners(world, nodeTile(world, node), nodeZOf(world, node), f, out);
}

/** Device-px corners of tile `tile` at height `z`: its ground surface when `z` is its ground height, else flat at `z`. */
function spotCorners(world: World, tile: number, z: number, f: LayerFrame, out: number[]): number[] {
  const map = world.state.map;
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

function setData(ctx: CanvasRenderingContext2D, key: 'queueWarnings' | 'pathGlows' | 'pathDimmed' | 'pathFocus', value: string): void {
  const ds = (ctx.canvas as { dataset?: Record<string, string> } | undefined)?.dataset;
  if (ds && ds[key] !== value) ds[key] = value;
}

/** Nodes of `nodes` on the ground (`ground` true) or on decks (false). */
function nodesOn(world: World, nodes: readonly number[], ground: boolean, out: number[]): number[] {
  const tiles = world.state.map.width * world.state.map.height;
  out.length = 0;
  for (const n of nodes) if (n < tiles === ground) out.push(n);
  return out;
}

const part: number[] = [];

/** The highlighted and the unlinked queue nodes on the ground (`ground`) or on decks. */
function drawMarks(ctx: CanvasRenderingContext2D, world: World, tool: ToolState, f: LayerFrame, ground: boolean): void {
  const sel = tool.selectedEntity;
  if (sel && sel.kind === 'queue') {
    const group = queueComponent(world, queueNodeOfKey(world, sel.id));
    if (nodesOn(world, group.nodes, ground, part).length > 0) drawNodes(ctx, world, part, QUEUE_COLOURS.highlightFill, QUEUE_COLOURS.highlight, f);
  }
  if (tool.tool === 'footpath' || tool.tool === 'queue') {
    for (const g of unlinkedQueueGroups(world)) if (nodesOn(world, g, ground, part).length > 0) drawNodes(ctx, world, part, QUEUE_COLOURS.unlinkedFill, QUEUE_COLOURS.badge, f);
  }
}

const pathToolOn = (tool: ToolState): boolean => tool.tool === 'footpath' || tool.tool === 'queue';

/** Pulse phase in [0, 1] (1 Hz); a steady 1 with reduced motion. */
function pulse(now: number): number {
  return displayPrefs().reducedMotion ? 1 : 0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 2);
}

/** Footpaths the park entrance does not reach, dimmed: ground ones under the objects, decks over them. */
function drawDimmed(ctx: CanvasRenderingContext2D, world: World, f: LayerFrame, ground: boolean): number {
  const dimmed = pathMarks(world).dimmed;
  if (nodesOn(world, dimmed, ground, part).length === 0) return dimmed.length;
  ctx.fillStyle = PATH_COLOURS.dim;
  for (const n of part) {
    diamond(ctx, nodeCorners(world, n, f, corners));
    ctx.fill();
  }
  return dimmed.length;
}

/** A glowing spot: a pulsing cyan wash with a white and a cyan edge. */
function drawGlow(ctx: CanvasRenderingContext2D, c: readonly number[], f: LayerFrame, k: number): void {
  ctx.fillStyle = `rgba(57,208,255,${(0.3 + 0.35 * k).toFixed(2)})`;
  diamond(ctx, c);
  ctx.fill();
  ctx.lineWidth = Math.max(2, 4 * f.scale);
  ctx.strokeStyle = PATH_COLOURS.glowHalo;
  ctx.stroke();
  ctx.lineWidth = Math.max(1, 2 * f.scale);
  ctx.strokeStyle = PATH_COLOURS.glow;
  ctx.stroke();
}

/** Entrances with no queue and queue ends no footpath reaches (§4); returns how many glow. */
function drawGlows(ctx: CanvasRenderingContext2D, world: World, f: LayerFrame, k: number): number {
  const m = pathMarks(world);
  for (const e of m.entrances) drawGlow(ctx, spotCorners(world, e.tile, e.z, f, corners), f, k);
  for (const q of m.queueEnds) drawGlow(ctx, nodeCorners(world, q.node, f, corners), f, k);
  return m.entrances.length + m.queueEnds.length;
}

/** The Show me spot (§3): a ring that swells and fades once a second; −1 when nothing draws. */
function drawFocus(ctx: CanvasRenderingContext2D, world: World, tool: ToolState, f: LayerFrame, now: number): number {
  const p = tool.pathFocus;
  const map = world.state.map;
  if (!p || now >= p.until || !Number.isInteger(p.tile) || p.tile < 0 || p.tile >= map.width * map.height) return -1;
  const c = spotCorners(world, p.tile, p.z, f, corners);
  const cx = ((c[0] as number) + (c[4] as number)) / 2;
  const cy = ((c[1] as number) + (c[5] as number)) / 2;
  const reduced = displayPrefs().reducedMotion;
  const t = reduced ? 0 : (now % 1000) / 1000;
  ctx.fillStyle = 'rgba(255,210,63,0.35)';
  diamond(ctx, c);
  ctx.fill();
  for (const grow of reduced ? [1.25] : [1 + t * 0.9, 1 + ((t + 0.5) % 1) * 0.9]) {
    const ring = c.map((v, i) => (i % 2 === 0 ? cx + (v - cx) * grow : cy + (v - cy) * grow));
    ctx.globalAlpha = reduced ? 1 : Math.max(0, 1 - (grow - 1) / 0.9);
    diamond(ctx, ring);
    ctx.lineWidth = Math.max(2, 3 * f.scale);
    ctx.strokeStyle = PATH_COLOURS.focusHalo;
    ctx.stroke();
    ctx.lineWidth = Math.max(1.5, 2 * f.scale);
    ctx.strokeStyle = PATH_COLOURS.focus;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return p.tile;
}

/** `now`: the clock of the Show me pulse (ms, the `performance.now()` clock `pathFocus.until` uses). */
export function createQueueLayer(now: () => number = () => performance.now()): WorldLayer {
  return {
    name: 'queues',
    kinds: [],
    // Ground queues are marked before the objects, so the guests standing in the line stay untinted on top.
    drawGround(ctx: CanvasRenderingContext2D, world: World, tool: ToolState, f: LayerFrame): void {
      ctx.save();
      // Path clarity §4: cut-off footpaths dim on the ground, under guests and objects.
      if (pathToolOn(tool)) drawDimmed(ctx, world, f, true);
      drawMarks(ctx, world, tool, f, true);
      ctx.restore();
    },
    drawOverlay(ctx: CanvasRenderingContext2D, world: World, tool: ToolState, f: LayerFrame): void {
      ctx.save();
      // Decks are objects: their marks go over them.
      drawMarks(ctx, world, tool, f, false);
      let marked = 0;
      if (tool.tool === 'footpath' || tool.tool === 'queue') {
        const groups = unlinkedQueueGroups(world);
        for (const g of groups) drawBadge(ctx, world, g[0] as number, f);
        marked = groups.length;
      }
      setData(ctx, 'queueWarnings', String(marked));
      // Path clarity §3–4: dimmed decks, then the glows, then the Show me spot on top.
      let glows = 0;
      let dimmed = 0;
      const t = now();
      if (pathToolOn(tool)) {
        dimmed = drawDimmed(ctx, world, f, false);
        glows = drawGlows(ctx, world, f, pulse(t));
      }
      setData(ctx, 'pathGlows', String(glows));
      setData(ctx, 'pathDimmed', String(dimmed));
      const focus = drawFocus(ctx, world, tool, f, t);
      setData(ctx, 'pathFocus', focus < 0 ? '' : String(focus));
      ctx.restore();
    },
  };
}
