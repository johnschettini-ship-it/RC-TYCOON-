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
import { carShadowAt, realRailPlacement, realSupportPlacement, type CarShadow, type SliceRec, type TrackLayer } from './layer';
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
