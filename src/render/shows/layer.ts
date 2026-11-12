/**
 * Show site rendering (Phase 6 §4.4 "Rendering (render only, not sim)"). Owner: W4-C.
 *
 * - `collect` / `drawItem`: show site sprites as depth-sorted slices (`LAYER_KIND.showSite`; a 2 × 2 tower is cut into
 *   screen columns like flat rides and scenery), in 4 view rotations (sprite rotation `(rotation + view) mod 4`).
 * - `drawAfterObjects` (after the After Dark light pass, so they glow): the Lightshow beams and the Fireworks from
 *   `./fx.ts`, timed by the show plan (`./timeline.ts`, render RNG seeded by `(site.id, site.startTick)`), in the
 *   theme palette of the scenery around the site; reduced motion (`displayPrefs().reducedMotion`) gives still,
 *   slowly pulsing beams and soft glow circles. A tower lamp glows at night and a site that has announced a show
 *   blinks its lamp. Sites far outside the view are skipped.
 * - `drawOverlay`: the placement ghost (`./ghost.ts`) with its footprint, viewing tiles (footpaths in the radius), the
 *   radius ring, and a check or cross icon; a selected site shows its viewing area too.
 *
 * Frame counters (`stats()`, `totals()`, and `window.__tcShows = { frame, totals }` in the browser for Playwright)
 * count beams, rockets, particles, flashes, and glows drawn.
 */
import { getShowSiteDef, type ShowSiteDef } from '../../data/catalog';
import { displayPrefs } from '../../a11y/prefs';
import { Content, type Dir } from '../../sim/map';
import { viewingTilesAt } from '../../sim/shows/api';
import type { ShowSite } from '../../sim/shows/types';
import type { World } from '../../sim/types';
import { buildSprite } from '../canvas';
import { footprintColumns, Layer, type ColumnTile } from '../depth';
import { LAYER_KIND, type LayerFrame, type LayerSink, type WorldLayer } from '../layers';
import { darknessAt } from '../lighting/darkness';
import { ghostFill, ghostLineWidth, ghostStroke } from '../palette';
import { SpriteCache, spriteKey, type Sprite } from '../spriteCache';
import { GHOST_TINT_INVALID, GHOST_TINT_VALID } from '../sprites/bank';
import { drawGhostIcon } from '../sprites/props';
import type { ToolState } from '../types';
import { viewAffine, viewPointSX, viewPointSY, viewTileU, viewTileV, type ViewAffine } from '../view';
import { drawShowSiteArt, LAUNCHER_MOUTH_PX, showArtBounds, TOWER_TOP_PX } from './art';
import { BEAM_LENGTH, drawFireworks, drawLightshow, emptyFxStats, GLOW_IN, GLOW_OUT, resetFxStats, rgba, type FxCtx, type FxStats } from './fx';
import { showGhostOf } from './ghost';
import { K_GHOST, K_SHOW, pixel } from '../artHook';
import { SHOW_PALETTES, showTheme } from './palette';
import { showPlan } from './timeline';

const HW = 32;
const HH = 16;
const STEP = 8;
const SUB_WHOLE = -1;
/** Sprite frames: 0 = the site, 1 = valid ghost, 2 = invalid ghost. */
const FRAME_GHOST_VALID = 1;
const FRAME_GHOST_INVALID = 2;
/** Effects keep drawing this long after the show (glows and the last sparks fade). */
const TAIL_TICKS = GLOW_IN + GLOW_OUT;
/** Fireworks reach about this far from the launcher (world px) for culling. */
const FIREWORK_REACH = 380;
/** About 8 MB of RGBA sprite memory (a handful of site sprites per zoom bucket). */
const SHOW_SPRITE_BUDGET_PX = 2_000_000;

export interface ShowLayerTotals extends FxStats {
  frames: number;
  reduced: boolean;
}

/** `window.__tcShows`: the last frame's counters and the running totals. */
export interface ShowDebug {
  frame: FxStats;
  totals: ShowLayerTotals;
}

export interface ShowLayer extends WorldLayer {
  /** Counters of the last frame. */
  stats(): FxStats;
  /** Counters summed over every frame so far (Playwright compares two readings). */
  totals(): ShowLayerTotals;
}

/** Device-px ellipse of a ground circle of `r` tiles (rotation-invariant). */
function groundEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, scale: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, r * HW * Math.SQRT2 * scale, r * HH * Math.SQRT2 * scale, 0, 0, Math.PI * 2);
}

export function createShowLayer(): ShowLayer {
  const sprites = new SpriteCache(SHOW_SPRITE_BUDGET_PX);
  const affine: ViewAffine = viewAffine(0, 1, 1);
  const columnsMemo = new Map<number, ColumnTile[]>();
  // Phase 8b stage 0b keep-last per show index (Test decision 11), with the site id.
  const lastShow: Array<Sprite | null> = [];
  const lastShowId: number[] = [];
  const frame = emptyFxStats();
  const totals: ShowLayerTotals = { ...emptyFxStats(), frames: 0, reduced: false };
  const palettes = new Map<string, readonly string[]>();
  // Playwright reads the counters (dev builds and e2e only; render state, never game state).
  if (typeof window !== 'undefined') (window as unknown as { __tcShows?: ShowDebug }).__tcShows = { frame, totals };

  function columns(n: number): ColumnTile[] {
    let c = columnsMemo.get(n);
    if (!c) {
      c = footprintColumns(n, n);
      columnsMemo.set(n, c);
    }
    return c;
  }

  function sprite(defId: string, facing: Dir, ghost: number, bucket: LayerFrame['bucket']): Sprite | null {
    // Phase 8b stage 0b: predrawn pictures; a ghost is the site picture with the ghost swap
    // (`ghostKey(K_SHOW, defId, facing)` = `spriteKey(defId, facing, K_SHOW, 0.5)`).
    const rt = __TC_APP__ ? pixel.rt : null;
    if (__TC_APP__ && rt) {
      if (ghost === FRAME_GHOST_VALID || ghost === FRAME_GHOST_INVALID) return rt.picture(K_GHOST, spriteKey(defId, facing, K_SHOW, 0.5), ghost === FRAME_GHOST_VALID ? 0 : 1) ?? null;
      return rt.picture(K_SHOW, spriteKey(defId, facing, 0, 0.5)) ?? null;
    }
    const key = spriteKey(defId, facing, ghost, bucket);
    const hit = sprites.get(key);
    if (hit) return hit;
    const tint = ghost === FRAME_GHOST_VALID ? GHOST_TINT_VALID : ghost === FRAME_GHOST_INVALID ? GHOST_TINT_INVALID : null;
    const sp = buildSprite(showArtBounds(defId), bucket, (ctx) => drawShowSiteArt(ctx, defId, facing), tint);
    sprites.set(key, sp);
    return sp;
  }

  function devX(f: LayerFrame, wx: number): number {
    return wx * f.scale + f.offX;
  }
  function devY(f: LayerFrame, wy: number): number {
    return wy * f.scale + f.offY;
  }

  function blit(ctx: CanvasRenderingContext2D, f: LayerFrame, sp: Sprite | null, ax: number, ay: number): void {
    if (!sp) return;
    // Phase 8b stage 0b: whole copies on the art grid in Pixel.
    if (__TC_APP__ && f.art && pixel.rt) {
      pixel.rt.blit(ctx, sp, ax, ay);
      return;
    }
    const s = f.scale / sp.scale;
    const x0 = Math.round(devX(f, ax) - sp.ox * s);
    const y0 = Math.round(devY(f, ay) - sp.oy * s);
    const x1 = Math.round(devX(f, ax) + (sp.w - sp.ox) * s);
    const y1 = Math.round(devY(f, ay) + (sp.h - sp.oy) * s);
    ctx.drawImage(sp.image, x0, y0, x1 - x0, y1 - y0);
  }

  function blitColumn(ctx: CanvasRenderingContext2D, f: LayerFrame, sp: Sprite, ax: number, ay: number, colL: number, colR: number, ends = 0): void {
    if (__TC_APP__ && f.art && pixel.rt) {
      pixel.rt.blitColumn(ctx, sp, ax, ay, colL, colR, ends);
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

  /** View-origin tile (u0, v0) and the anchor of an n × n footprint at map (x, y). */
  function anchorOf(x: number, y: number, n: number, z: number): { u0: number; v0: number; ax: number; ay: number } {
    const ua = viewTileU(affine, x, y);
    const ub = viewTileU(affine, x + n - 1, y + n - 1);
    const va = viewTileV(affine, x, y);
    const vb = viewTileV(affine, x + n - 1, y + n - 1);
    const u0 = ua < ub ? ua : ub;
    const v0 = va < vb ? va : vb;
    return { u0, v0, ax: (u0 - v0) * HW, ay: (u0 + v0) * HH - z * STEP };
  }

  function paletteOf(world: World, site: ShowSite): readonly string[] {
    const key = `${site.id}:${site.startTick}:${world.state.scenery.length}`;
    let p = palettes.get(key);
    if (!p) {
      if (palettes.size > 32) palettes.clear();
      p = SHOW_PALETTES[showTheme(world, site)];
      palettes.set(key, p);
    }
    return p;
  }

  /** Tile diamond at its base height (device px). */
  function tilePath(ctx: CanvasRenderingContext2D, f: LayerFrame, world: World, t: number): void {
    const map = world.state.map;
    const x = t % map.width;
    const y = (t - x) / map.width;
    const z = map.heights[t] ?? 0;
    const u = viewTileU(affine, x, y);
    const v = viewTileV(affine, x, y);
    const px = (u - v) * HW;
    const py = (u + v) * HH - z * STEP;
    ctx.moveTo(devX(f, px), devY(f, py));
    ctx.lineTo(devX(f, px + HW), devY(f, py + HH));
    ctx.lineTo(devX(f, px), devY(f, py + 2 * HH));
    ctx.lineTo(devX(f, px - HW), devY(f, py + HH));
    ctx.closePath();
  }

  /** The viewing area of a footprint: its footpath tiles tinted, the radius ring, and the footprint outline. */
  function drawViewingArea(ctx: CanvasRenderingContext2D, f: LayerFrame, world: World, x: number, y: number, def: ShowSiteDef, footprint: readonly number[], fill: string, stroke: string): void {
    const map = world.state.map;
    const z = map.heights[y * map.width + x] ?? 0;
    ctx.save();
    ctx.beginPath();
    for (const t of viewingTilesAt(world, x, y, def)) tilePath(ctx, f, world, t);
    ctx.fillStyle = 'rgba(255, 224, 102, 0.28)';
    ctx.fill();
    const cx = x + def.w / 2;
    const cy = y + def.d / 2;
    groundEllipse(ctx, devX(f, viewPointSX(affine, cx, cy)), devY(f, viewPointSY(affine, cx, cy, z)), def.radius, f.scale);
    ctx.setLineDash([6 * f.dpr, 5 * f.dpr]);
    ctx.lineWidth = Math.max(1, 1.5 * f.dpr);
    ctx.strokeStyle = 'rgba(255, 224, 102, 0.85)';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    for (const t of footprint) if (t >= 0 && t < map.width * map.height) tilePath(ctx, f, world, t);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = ghostLineWidth(Math.max(1, f.scale));
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();
  }

  return {
    name: 'shows',
    kinds: [LAYER_KIND.showSite],

    collect(world: World, sink: LayerSink, _tool: ToolState, f: LayerFrame): void {
      sprites.beginFrame();
      const s = world.state;
      if (s.shows.length === 0) return;
      const map = s.map;
      viewAffine(f.rotation, map.width, map.height, affine);
      const v = f.view;
      for (let i = 0; i < s.shows.length; i++) {
        const site = s.shows[i] as ShowSite;
        const def = getShowSiteDef(site.defId);
        if (!def) continue;
        const n = def.w;
        const z = map.heights[site.y * map.width + site.x] ?? 0;
        const { u0, v0, ax, ay } = anchorOf(site.x, site.y, n, z);
        const b = showArtBounds(def.id);
        if (ax + b.right < v.x0 || ax + b.left > v.x1 || ay + b.bottom < v.y0 || ay + b.top > v.y1) continue;
        const facing = ((site.rotation + f.rotation) % 4) as Dir;
        const key = spriteKey(def.id, facing, 0, f.bucket);
        if (n === 1) {
          sink.push(LAYER_KIND.showSite, i, SUB_WHOLE, ax, ay, key, u0 + v0 + 1, z, Layer.Object);
          continue;
        }
        const cols = columns(n);
        const left = ax - n * HW;
        for (let k = 0; k < cols.length; k++) {
          const colL = left + k * HW;
          if (colL + HW < v.x0 || colL > v.x1) continue;
          const c = cols[k] as ColumnTile;
          sink.push(LAYER_KIND.showSite, i, k, ax, ay, key, u0 + c.dx + v0 + c.dy + 1, z, Layer.Object);
        }
      }
    },

    drawItem(ctx, world, _kind, ref, sub, ax, ay, _skey, f): void {
      const site = world.state.shows[ref];
      if (!site) return;
      const def = getShowSiteDef(site.defId);
      if (!def) return;
      const facing = ((site.rotation + f.rotation) % 4) as Dir;
      let sp = sprite(def.id, facing, 0, f.bucket);
      if (__TC_APP__ && f.art) {
        // Stage 0b keep-last per show index while the sheet decodes.
        if (sp) {
          lastShow[ref] = sp;
          lastShowId[ref] = site.id;
        } else if (lastShowId[ref] === site.id) sp = pixel.rt?.keep(lastShow[ref] ?? null) ?? null;
      }
      if (!sp) return;
      if (sub < 0) {
        blit(ctx, f, sp, ax, ay);
        return;
      }
      const colL = ax - def.w * HW + sub * HW;
      const ends = f.art ? (sub === 0 ? 1 : 0) | (sub === columns(def.w).length - 1 ? 2 : 0) : 0;
      blitColumn(ctx, f, sp, ax, ay, colL, colL + HW, ends);
    },

    drawAfterObjects(ctx, world, _tool, f): void {
      resetFxStats(frame);
      const s = world.state;
      const reduced = displayPrefs().reducedMotion;
      totals.frames++;
      totals.reduced = reduced;
      if (s.shows.length === 0) return;
      const map = s.map;
      viewAffine(f.rotation, map.width, map.height, affine);
      const now = s.tick + f.alpha;
      const dark = darknessAt(now, s.park.afterDark);
      const v = f.view;
      for (const site of s.shows) {
        const def = getShowSiteDef(site.defId);
        if (!def) continue;
        const tower = def.id === 'lightshow_tower';
        const z = map.heights[site.y * map.width + site.x] ?? 0;
        const cx = site.x + def.w / 2;
        const cy = site.y + def.d / 2;
        const wx = viewPointSX(affine, cx, cy);
        const wy = viewPointSY(affine, cx, cy, z) - (tower ? TOWER_TOP_PX - 4 : LAUNCHER_MOUTH_PX);
        const reach = tower ? BEAM_LENGTH : FIREWORK_REACH;
        if (wx + reach < v.x0 || wx - reach > v.x1 || wy + 80 < v.y0 || wy - reach > v.y1) continue;
        const ox = devX(f, wx);
        const oy = devY(f, wy);
        const fx = ctx as unknown as FxCtx;
        // Night lamp, blinking while a show is announced (steady under reduced motion).
        if (dark > 0 || site.status === 'announced') {
          const blink = site.status === 'announced' && !reduced ? 0.45 + 0.35 * Math.sin((now * Math.PI) / 10) : 0.55;
          const r = (tower ? 9 : 6) * f.scale;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
          g.addColorStop(0, rgba('#fff4c2', blink));
          g.addColorStop(1, rgba('#ffb347', 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(ox, oy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        if (site.startTick < 0) continue;
        const t = now - site.startTick;
        if (t < 0 || t >= def.showTicks + TAIL_TICKS) continue;
        if (site.status === 'announced') continue;
        const plan = showPlan(site, def);
        const palette = paletteOf(world, site);
        if (tower) drawLightshow(fx, plan, palette, t, ox, oy, f.scale, reduced, frame);
        else drawFireworks(fx, plan, palette, t, ox, oy, f.scale, reduced, frame);
      }
      totals.beams += frame.beams;
      totals.rockets += frame.rockets;
      totals.particles += frame.particles;
      totals.flashes += frame.flashes;
      totals.glows += frame.glows;
    },

    drawOverlay(ctx, world, tool, f): void {
      sprites.trim();
      const map = world.state.map;
      viewAffine(f.rotation, map.width, map.height, affine);
      if (tool.tool === 'placeShowSite') {
        const g = showGhostOf(tool);
        const def = g ? getShowSiteDef(g.defId) : undefined;
        if (!g || !def) return;
        const fill = ghostFill(g.valid);
        const stroke = ghostStroke(g.valid);
        drawViewingArea(ctx, f, world, g.x, g.y, def, g.tiles, fill, stroke);
        const z = g.tiles.length > 0 ? (map.heights[g.tiles[0] as number] ?? 0) : 0;
        const { ax, ay } = anchorOf(g.x, g.y, def.w, z);
        const facing = ((g.rotation + f.rotation) % 4) as Dir;
        ctx.save();
        ctx.globalAlpha = 0.85;
        blit(ctx, f, sprite(def.id, facing, g.valid ? FRAME_GHOST_VALID : FRAME_GHOST_INVALID, f.bucket), ax, ay);
        ctx.restore();
        const top = def.id === 'lightshow_tower' ? TOWER_TOP_PX + 14 : LAUNCHER_MOUTH_PX + 14;
        drawGhostIcon(ctx, devX(f, ax), devY(f, ay + def.w * HH - top), g.valid, Math.max(8, 11 * Math.min(1.5, f.scale)));
        return;
      }
      const sel = tool.selectedEntity;
      if (sel?.kind !== 'showSite') return;
      const site = world.state.shows.find((x) => x.id === sel.id);
      const def = site ? getShowSiteDef(site.defId) : undefined;
      if (!site || !def) return;
      const tiles: number[] = [];
      for (let dy = 0; dy < def.d; dy++) for (let dx = 0; dx < def.w; dx++) tiles.push((site.y + dy) * map.width + site.x + dx);
      drawViewingArea(ctx, f, world, site.x, site.y, def, tiles.filter((t) => map.content[t] === Content.Building), 'rgba(255,255,255,0.10)', '#ffffff');
    },

    stats: () => frame,
    totals: () => totals,
  };
}
