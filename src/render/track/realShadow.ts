/**
 * Realistic look only (batch 5 Task 4): the shadow of one collected track drawable, drawn by the renderer's shadow pass
 * (after the ground, before the depth-sorted objects). A rail slice draws its supports' shadows then its rail's (baked,
 * untinted, `../real/trackShadow.ts`); a car draws a live soft ellipse (owner decision D1 a). A shadow the look does
 * not have draws nothing (never today's art). Each lies on the ground under it, slopes included
 * (`../real/groundShadow.ts`); one whose ground point is off the map is not drawn.
 *
 * A module of its own, not a TrackLayer method, so the website build (VITE_ART unset) keeps no trace of it: it reads
 * the layer's frame state through `LayerView` (the layer's own fields, read-only), and keeps its scratch state here.
 */
import { getTrackTypeDef } from '../../data/track';
import { TILE_M } from '../../data/tuning/track';
import type { World } from '../../sim/types';
import type { RealLook } from '../real/look';
import type { Sprite } from '../spriteCache';
import { newShadowGround, shadowDrop, shadowGround, skewedShadowTransform } from '../real/groundShadow';
import { CAR_SHADOW_ALPHA, railShadowPlane, sunShift } from '../real/trackShadow';
import { carShadowAt, realGoalBeams, realGoalLegPlacement, realRailPlacement, realSupportPlacement, type CarShadow, type SliceRec, type SupportRec, type TrackLayer } from './layer';
import { projectX, projectY, type ViewFrame } from './project';

/** The TrackLayer fields a shadow reads (set by its `collect` this frame). */
interface LayerView {
  slices: SliceRec[];
  frameRef: ViewFrame;
  cars: { x: ArrayLike<number>; y: ArrayLike<number>; z: ArrayLike<number>; mapYaw: ArrayLike<number>; pitch: ArrayLike<number> };
  carDef: string[];
  scale: number;
  offX: number;
  offY: number;
}

/** The layer's drawable kinds (layer.ts SUB_SLICE, SUB_CAR; not exported there: an export changes the website bundle). */
export const SHADOW_SUB_SLICE = 0;
export const SHADOW_SUB_CAR = 2;

const scratch: CarShadow = { cx: 0, cy: 0, ax: 0, ay: 0, bx: 0, by: 0 };
const ground = newShadowGround();
let fill: { ctx: CanvasRenderingContext2D; fill: CanvasGradient } | null = null;

function blit(L: LayerView, ctx: CanvasRenderingContext2D, sp: Sprite, wx: number, wy: number): void {
  // as TrackLayer.blit: the sprite's anchor at world px (wx, wy), scaled by zoom over the sprite's density
  const f = L.scale / sp.scale;
  const x0 = Math.round(wx * L.scale + L.offX - sp.ox * f);
  const y0 = Math.round(wy * L.scale + L.offY - sp.oy * f);
  const x1 = Math.round(wx * L.scale + L.offX + (sp.w - sp.ox) * f);
  const y1 = Math.round(wy * L.scale + L.offY + (sp.h - sp.oy) * f);
  if (sp.sx === undefined) ctx.drawImage(sp.image, x0, y0, x1 - x0, y1 - y0);
  else ctx.drawImage(sp.image, sp.sx, sp.sy ?? 0, sp.w, sp.h, x0, y0, x1 - x0, y1 - y0);
}

/**
 * Blit a shadow sprite drawn on a horizontal plane, anchored at world px (wx, wy) as its caster, onto the ground under
 * it (`../real/groundShadow.ts`): the plane point at screen (S0x, S0y) drops `s0` m; flat ground is a plain shift.
 */
function blitOnGround(L: LayerView, ctx: CanvasRenderingContext2D, sp: Sprite, wx: number, wy: number, s0: number, S0x: number, S0y: number): void {
  if (ground.kx === 0 && ground.ky === 0) {
    const sh = sunShift();
    blit(L, ctx, sp, wx + s0 * sh.x, wy + s0 * sh.y);
    return;
  }
  const t = skewedShadowTransform(ground, s0, S0x, S0y, L.scale, L.offX, L.offY);
  ctx.save();
  ctx.transform(t.a, t.b, t.c, t.d, t.e, t.f);
  blit(L, ctx, sp, wx, wy);
  ctx.restore();
}

/** Darkness of a goalpost beam's shadow: as the baked column shadows look on the ground (drawn at 0.5 in the bake). */
export const GOAL_SHADOW_ALPHA = 0.3;
/** Soft edge (world px at zoom 1) of a goalpost beam's shadow: a half-dark band this wide round the hull. */
const GOAL_SHADOW_EDGE = 1.2;
const hullX: number[] = [];
const hullY: number[] = [];

/**
 * A goalpost's shadows (2026-11-21): each leg's baked column shadows, laid on the ground under it like a column's, and
 * the beam's, drawn live: the convex hull of its box's corners, each moved along its own sun ray onto the ground plane
 * under the beam's middle.
 */
function goalShadow(L: LayerView, ctx: CanvasRenderingContext2D, map: World['state']['map'], sl: SliceRec, rec: SupportRec, look: RealLook): void {
  const f = L.frameRef;
  const g = rec.goal;
  if (!g || !look.supportShadow) return;
  for (const leg of realGoalLegPlacement(sl, f, rec)) {
    if (!shadowGround(map, leg.wx, leg.wy, (g.z + rec.base) / 2, f, ground)) continue;
    for (const p of leg.pieces) {
      const sp = look.supportShadow(sl.data.typeId, p.part, leg.heading);
      if (sp) blitOnGround(L, ctx, sp, leg.ax, p.ay, shadowDrop(ground, leg.wx, leg.wy, p.z), leg.ax, p.ay);
    }
  }
  if (!shadowGround(map, (g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, g.z, f, ground)) return;
  const sh = sunShift();
  const k = L.scale;
  ctx.save();
  // soft-edged as the baked shadows, without a per-frame canvas filter: the hull, and a band at half its darkness outside
  ctx.fillStyle = `rgba(0,0,0,${GOAL_SHADOW_ALPHA})`;
  ctx.strokeStyle = `rgba(0,0,0,${GOAL_SHADOW_ALPHA / 2})`;
  ctx.lineWidth = 2 * GOAL_SHADOW_EDGE * k;
  ctx.lineJoin = 'round';
  for (const b of realGoalBeams(sl, rec, f)) {
    hullX.length = 0;
    hullY.length = 0;
    for (let i = 0; i < 8; i++) {
      const sa = i & 1 ? b.a : -b.a;
      const sb = i & 2 ? b.b : -b.b;
      const z = i & 4 ? b.h1 : b.h0;
      const x = b.c[0] + (b.f[0] as number) * sa + (b.r[0] as number) * sb;
      const y = b.c[1] + (b.f[1] as number) * sa + (b.r[1] as number) * sb;
      const s0 = shadowDrop(ground, x, y, z);
      hullX.push((projectX(x, y, f) + s0 * sh.x) * k + L.offX);
      hullY.push((projectY(x, y, z, f) + s0 * sh.y) * k + L.offY);
    }
    fillHull(ctx, hullX, hullY);
  }
  ctx.restore();
}

/** Fill the convex hull of points (xs, ys) (gift wrapping: 8 points), and stroke its edge outside it only. */
function fillHull(ctx: CanvasRenderingContext2D, xs: number[], ys: number[]): void {
  const n = xs.length;
  let start = 0;
  for (let i = 1; i < n; i++) if ((xs[i] as number) < (xs[start] as number) || ((xs[i] as number) === (xs[start] as number) && (ys[i] as number) < (ys[start] as number))) start = i;
  const hull: number[] = [];
  let p = start;
  for (let guard = 0; guard <= n; guard++) {
    hull.push(p);
    let q = (p + 1) % n;
    for (let i = 0; i < n; i++) {
      const cr = ((xs[q] as number) - (xs[p] as number)) * ((ys[i] as number) - (ys[p] as number)) - ((ys[q] as number) - (ys[p] as number)) * ((xs[i] as number) - (xs[p] as number));
      if (cr < 0) q = i;
    }
    p = q;
    if (p === start) break;
  }
  const trace = (): void => {
    hull.forEach((h, i) => (i === 0 ? ctx.moveTo(xs[h] as number, ys[h] as number) : ctx.lineTo(xs[h] as number, ys[h] as number)));
    ctx.closePath();
  };
  ctx.beginPath();
  trace();
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(-1e6, -1e6, 2e6, 2e6);
  trace();
  ctx.clip('evenodd');
  ctx.beginPath();
  trace();
  ctx.stroke();
  ctx.restore();
}

export function drawTrackShadow(layer: TrackLayer, ctx: CanvasRenderingContext2D, world: World, ref: number, sub: number, look: RealLook): void {
  const L = layer as unknown as LayerView;
  const f = L.frameRef;
  if (sub === SHADOW_SUB_SLICE) {
    const sl = L.slices[ref];
    if (!sl || !look.railPart) return;
    const type = sl.data.typeId;
    const map = world.state.map;
    if (look.supportShadow) {
      for (const rec of sl.supports) {
        const su = realSupportPlacement(sl, f, rec);
        if (rec.goal) goalShadow(L, ctx, map, sl, rec, look);
        // the column's shadow on the ground where its middle's falls
        if (!su || !shadowGround(map, rec.wx, rec.wy, (rec.top + rec.base) / 2, f, ground)) continue;
        for (const p of su.pieces) {
          const sp = look.supportShadow(type, p.part, su.heading);
          if (sp) blitOnGround(L, ctx, sp, su.ax, p.ay, shadowDrop(ground, rec.wx, rec.wy, p.z), su.ax, p.ay);
        }
      }
    }
    // The rail's baked shadow lies on its plane under the tile's lowest rail; fitted at the tile centre's point there.
    const rp = realRailPlacement(sl, f);
    const cx = (sl.x + 0.5) * TILE_M;
    const cy = (sl.y + 0.5) * TILE_M;
    const plane = railShadowPlane(sl.railMin);
    if (!shadowGround(map, cx, cy, plane, f, ground)) return;
    const sp = look.railPart(type, sl.pieceId, sl.tile, rp.heading, 'sh');
    if (sp) blitOnGround(L, ctx, sp, rp.ax, rp.ay, shadowDrop(ground, cx, cy, plane), projectX(cx, cy, f), projectY(cx, cy, plane, f));
  } else if (sub === SHADOW_SUB_CAR) {
    const c = L.cars;
    const type = getTrackTypeDef(L.carDef[ref] as string);
    if (!type) return;
    const x = c.x[ref] as number, y = c.y[ref] as number, z = c.z[ref] as number;
    if (!shadowGround(world.state.map, x, y, z, f, ground)) return;
    // carShadowAt shifts by z − g: the ground "height" that makes it the drop to the ground plane
    const e = carShadowAt(x, y, z, z - shadowDrop(ground, x, y, z), c.mapYaw[ref] as number, c.pitch[ref] as number, type.vehicle.carLengthMm / 1000, f, scratch);
    if (ground.kx !== 0 || ground.ky !== 0) {
      // the ellipse's axes, flat around its centre, laid on the slope: each moves by its own extra drop
      const sh = sunShift();
      const da = ground.kx * e.ax + ground.ky * e.ay;
      const db = ground.kx * e.bx + ground.ky * e.by;
      e.ax += sh.x * da;
      e.ay += sh.y * da;
      e.bx += sh.x * db;
      e.by += sh.y * db;
    }
    const k = L.scale;
    if (!fill || fill.ctx !== ctx) {
      // one radial fill per context, in the unit circle the transform below maps onto the ellipse
      const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g2.addColorStop(0, `rgba(0,0,0,${CAR_SHADOW_ALPHA})`);
      g2.addColorStop(0.55, `rgba(0,0,0,${CAR_SHADOW_ALPHA * 0.75})`);
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      fill = { ctx, fill: g2 };
    }
    ctx.save();
    ctx.translate(e.cx * k + L.offX, e.cy * k + L.offY);
    ctx.transform(e.ax * k, e.ay * k, e.bx * k, e.by * k, 0, 0);
    ctx.fillStyle = fill.fill;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
