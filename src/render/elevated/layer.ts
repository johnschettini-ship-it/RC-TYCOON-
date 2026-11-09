/**
 * Elevated paths, ramps on elevated paths, and supports at the tile corners down to the ground (Phase 4 §4.2).
 * Owner: W3-B. Ground ramps are drawn by the terrain chunks (they follow the slope).
 *
 * One drawable per elevated path (`LAYER_KIND.elevatedPath`), sorted at the tile's depth `u + v + 0.5` (between its
 * back corner and its centre, so walkers on the deck draw after it) and its height. It draws the 4 support posts
 * (deck corner → ground corner), the deck's two front side faces, and the walking surface (footpath or queue
 * colours, a ramp tilted toward `rampDir`). The overlay pass draws the path tool ghost at the chosen height.
 * Everything goes through the view rotation (`../view.ts`); no allocations per frame.
 */
import { LAYER_KIND, type LayerFrame, type WorldLayer } from '../layers';
import { Layer } from '../depth';
import { rotateSlopeMask } from '../view';
import type { ToolState } from '../types';
import type { World } from '../../sim/types';
import type { ElevatedPath } from '../../sim/paths/types';
import { RAMP_MASK } from '../../sim/paths/nodes';

const HW = 32;
const HH = 16;
const STEP = 8;
/** Deck slab thickness in px (zoom 1). */
const DECK_PX = 4;

export const ELEVATED_COLOURS = {
  footpath: { top: '#dcc79c', edge: '#a88e5f', left: '#b39a6b', right: '#9a8258' },
  queue: { top: '#a9c0d2', edge: '#6a8396', left: '#8aa1b3', right: '#74899a' },
  support: '#6b5a45',
  supportDark: '#4d4032',
  ghostOk: 'rgba(120, 220, 140, 0.45)',
  ghostEdge: 'rgba(40, 120, 60, 0.9)',
} as const;

/** View corner offsets [N', E', S', W'] of a view tile's top face: (du, dv). */
const CORNER_DU = [0, 1, 1, 0];
const CORNER_DV = [0, 0, 1, 1];

/** View tile of map tile (x, y) at rotation r (master 6.4 / Phase 4 §4.8 table), written into `out`. */
function viewTile(x: number, y: number, r: number, w: number, h: number, out: Float64Array): void {
  switch (r) {
    case 1:
      out[0] = h - 1 - y;
      out[1] = x;
      break;
    case 2:
      out[0] = w - 1 - x;
      out[1] = h - 1 - y;
      break;
    case 3:
      out[0] = y;
      out[1] = w - 1 - x;
      break;
    default:
      out[0] = x;
      out[1] = y;
  }
}

export function createElevatedPathLayer(): WorldLayer {
  const uv = new Float64Array(2);
  const px = new Float64Array(4);
  const deckY = new Float64Array(4);
  const groundY = new Float64Array(4);

  /** Screen points (device px) of the 4 view corners of path `p`: deck tops in `deckY`, ground in `groundY`. */
  function corners(world: World, p: ElevatedPath, f: LayerFrame, z: number, ramp: number): void {
    const map = world.state.map;
    const r = f.rotation;
    viewTile(p.x, p.y, r, map.width, map.height, uv);
    const u = uv[0] as number;
    const v = uv[1] as number;
    const mask = ramp >= 0 ? rotateSlopeMask(RAMP_MASK[ramp] as number, r) : 0;
    const i = p.y * map.width + p.x;
    const base = map.heights[i] as number;
    const slope = map.slope[i] as number;
    for (let c = 0; c < 4; c++) {
      const cu = u + (CORNER_DU[c] as number);
      const cv = v + (CORNER_DV[c] as number);
      px[c] = (cu - cv) * HW * f.scale + f.offX;
      const top = z + ((mask >> c) & 1);
      // The map corner under view corner c is (c − r) mod 4.
      const mc = (c - r + 4) & 3;
      const g = base + ((slope >> mc) & 1);
      const flatY = (cu + cv) * HH;
      deckY[c] = (flatY - top * STEP) * f.scale + f.offY;
      groundY[c] = (flatY - g * STEP) * f.scale + f.offY;
    }
  }

  function quad(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
  }

  function drawDeck(ctx: CanvasRenderingContext2D, f: LayerFrame, kind: 'footpath' | 'queue', withSupports: boolean): void {
    const col = ELEVATED_COLOURS[kind];
    const t = DECK_PX * f.scale;
    if (withSupports) {
      // Posts at the 4 corners, back corner (N') first; the deck hides their tops.
      const wPost = Math.max(1, 2.2 * f.scale);
      for (let c = 0; c < 4; c++) {
        const x = px[c] as number;
        const top = (deckY[c] as number) + t;
        const bottom = groundY[c] as number;
        if (bottom <= top) continue;
        ctx.fillStyle = c === 1 ? ELEVATED_COLOURS.supportDark : ELEVATED_COLOURS.support;
        const inset = c === 1 ? -wPost : c === 3 ? 0 : -wPost / 2;
        ctx.fillRect(x + inset, top, wPost, bottom - top);
      }
    }
    // Side faces: left (W' → S') and right (S' → E').
    ctx.fillStyle = col.left;
    quad(ctx, px[3] as number, deckY[3] as number, px[2] as number, deckY[2] as number, px[2] as number, (deckY[2] as number) + t, px[3] as number, (deckY[3] as number) + t);
    ctx.fill();
    ctx.fillStyle = col.right;
    quad(ctx, px[2] as number, deckY[2] as number, px[1] as number, deckY[1] as number, px[1] as number, (deckY[1] as number) + t, px[2] as number, (deckY[2] as number) + t);
    ctx.fill();
    // Walking surface.
    ctx.fillStyle = col.top;
    quad(ctx, px[0] as number, deckY[0] as number, px[1] as number, deckY[1] as number, px[2] as number, deckY[2] as number, px[3] as number, deckY[3] as number);
    ctx.fill();
    ctx.strokeStyle = col.edge;
    ctx.lineWidth = Math.max(1, f.scale);
    ctx.stroke();
  }

  return {
    name: 'elevatedPaths',
    kinds: [LAYER_KIND.elevatedPath, LAYER_KIND.elevatedSupport],

    collect(world, sink, _tool, f) {
      const list = world.state.elevatedPaths;
      if (list.length === 0) return;
      const map = world.state.map;
      const r = f.rotation;
      for (let k = 0; k < list.length; k++) {
        const p = list[k] as ElevatedPath;
        viewTile(p.x, p.y, r, map.width, map.height, uv);
        const u = uv[0] as number;
        const v = uv[1] as number;
        const ax = (u - v) * HW;
        const ay = (u + v) * HH - p.z * STEP;
        const ground = map.heights[p.y * map.width + p.x] ?? 0;
        // Cull by the deck and its supports down to the ground.
        if (ax + HW < f.view.x0 || ax - HW > f.view.x1) continue;
        if (ay + 2 * HH + (p.z - ground + 1) * STEP < f.view.y0 || ay - STEP > f.view.y1) continue;
        sink.push(LAYER_KIND.elevatedPath, k, 0, ax, ay, 0, u + v + 0.5, p.z, Layer.Path);
      }
    },

    drawItem(ctx, world, kind, ref, _sub, _ax, _ay, _skey, f) {
      if (kind !== LAYER_KIND.elevatedPath) return;
      const p = world.state.elevatedPaths[ref];
      if (!p) return;
      corners(world, p, f, p.z, p.rampDir);
      drawDeck(ctx, f, p.kind, true);
    },

    drawOverlay(ctx, world, tool, f) {
      drawGhost(ctx, world, tool, f);
    },
  };

  /** Path tool at a height: outline decks over the drag line (or the hovered tile) at the chosen height. */
  function drawGhost(ctx: CanvasRenderingContext2D, world: World, tool: ToolState, f: LayerFrame): void {
    if ((tool.tool !== 'footpath' && tool.tool !== 'queue') || tool.pathHeight.z === null) return;
    const map = world.state.map;
    const z0 = tool.pathHeight.z;
    const tiles = tool.drag ? tool.drag.tiles : tool.hoverTile !== null ? null : undefined;
    if (tiles === undefined) return;
    const count = tiles ? tiles.length : 1;
    let dir = -1;
    if (tiles && tiles.length > 1) {
      const a = tiles[0] as number;
      const b = tiles[1] as number;
      dir = b === a - map.width ? 0 : b === a + 1 ? 1 : b === a + map.width ? 2 : 3;
    }
    const mode = dir < 0 ? 'flat' : tool.pathHeight.ramp;
    for (let k = 0; k < count; k++) {
      const tile = tiles ? (tiles[k] as number) : (tool.hoverTile as number);
      if (tile < 0 || tile >= map.width * map.height) continue;
      const z = mode === 'up' ? z0 + k : mode === 'down' ? z0 - k - 1 : z0;
      const ramp = mode === 'up' ? dir : mode === 'down' ? (dir + 2) & 3 : -1;
      GHOST.x = tile % map.width;
      GHOST.y = Math.floor(tile / map.width);
      corners(world, GHOST, f, z, ramp);
      ctx.fillStyle = ELEVATED_COLOURS.ghostOk;
      quad(ctx, px[0] as number, deckY[0] as number, px[1] as number, deckY[1] as number, px[2] as number, deckY[2] as number, px[3] as number, deckY[3] as number);
      ctx.fill();
      ctx.strokeStyle = ELEVATED_COLOURS.ghostEdge;
      ctx.lineWidth = Math.max(1, f.scale);
      ctx.stroke();
      // A guide line from the deck down to the ground at the front corner.
      ctx.beginPath();
      ctx.moveTo(px[2] as number, deckY[2] as number);
      ctx.lineTo(px[2] as number, groundY[2] as number);
      ctx.stroke();
    }
  }
}

/** Reused stand-in for a ghost tile (only x and y are read). */
const GHOST: ElevatedPath = { id: -1, x: 0, y: 0, z: 0, kind: 'footpath', rampDir: -1 };
