/** Phase 8b stage 0b test (never merged): the object shadow pass from predrawn checkerboard pictures (D8, Test decision 6). */
import { getFlatRideDef } from '../../../data/catalog/flatRides';
import { getSceneryDef } from '../../../data/catalog/scenery';
import { extent } from '../../../sim/footprint';
import type { World } from '../../../sim/types';
import type { PixelFrame } from '../../artHook';
import { STEP_PX } from '../../iso';
import type { LayerFrame } from '../../layers';
import { itemView, newItemView } from '../../scenery/place';
import { viewAffine, viewSpriteRotation, viewTileSX, viewTileSY, viewTileU, viewTileV, type ViewRotation } from '../../view';
import { blitArt } from '../grid';
import { casterMask, casterOf } from '../shadows';
import { K_RIDE, K_SCENERY, K_SHADOW, K_STALL, shadowKey } from './keys';
import type { PictureStore } from './store';

const HW = 32;
const HH = 16;

/**
 * The checkerboard phase of a shadow picture: picture pixel (x, y) is shadow where `(x + y + phase)` is even, and it lands
 * on art pixel (anchor − mask anchor + (x, y)). With this phase every shadow pixel of every object lies on the art
 * pixels where `X + Y` is even, so two shadows never add up. `(cx, cy)`: the mask anchor of the caster (0 parity for
 * a box; an ellipse may be odd), `(ax, ay)`: the anchor in world px.
 */
export function shadowPhase(ax: number, ay: number, cx: number, cy: number): 0 | 1 {
  return ((Math.round(ax / 2) + Math.round(ay / 2) + cx + cy) & 1) as 0 | 1;
}

/** One caster in one view: its two picture keys, its mask anchor and size (art px), or null (no caster). */
interface CasterEntry {
  keys: [number, number];
  cx: number;
  cy: number;
  w: number;
  h: number;
  ellipse: boolean;
}

/** The shadow pass state: casters per (kind, def, view), scratch for the footprint origin. */
export class ShadowPass {
  private readonly casters = new Map<number, CasterEntry | null>();
  private readonly va = viewAffine(0, 1, 1);
  private readonly iv = newItemView();
  /** Shadow pictures drawn in the last pass (tests). */
  drawn = 0;

  constructor(private readonly store: Pick<PictureStore, 'get'>) {}

  /** Casters are cached per (kind, def, view) under the numeric phase-0 key (the def hash is memoised): no string per object. */
  private caster(name: 'ride' | 'stall' | 'scenery', kind: number, defId: string, view: number): CasterEntry | null {
    const id = shadowKey(kind, defId, view, 0);
    let e = this.casters.get(id);
    if (e === undefined) {
      const c = casterOf(name, defId, view);
      if (!c) e = null;
      else {
        const m = casterMask(c, 0);
        e = { keys: [shadowKey(kind, defId, view, 0), shadowKey(kind, defId, view, 1)], cx: m.cx, cy: m.cy, w: m.w, h: m.h, ellipse: c.shape === 'ellipse' };
      }
      this.casters.set(id, e);
    }
    return e;
  }

  private put(ctx: CanvasRenderingContext2D, e: CasterEntry, ax: number, ay: number, f: LayerFrame, frame: PixelFrame): void {
    // Cull by the mask box (art px around the anchor).
    const x0 = ax - 2 * e.cx;
    const y0 = ay - 2 * e.cy;
    const v = f.view;
    if (x0 > v.x1 || y0 > v.y1 || x0 + 2 * e.w < v.x0 || y0 + 2 * e.h < v.y0) return;
    const sp = this.store.get(K_SHADOW, e.keys[shadowPhase(ax, ay, e.cx, e.cy)], -1);
    if (!sp) return;
    blitArt(ctx, sp, ax, ay, frame);
    this.drawn++;
  }

  /**
   * Nothing at night (D8: `frame.night`); else one copy per ride, stall and scenery item whose shadow box meets the view,
   * at the anchor of the object's sprite (rides: the back corner of the view footprint; stalls: the tile anchor; scenery:
   * a box at the sprite anchor, an ellipse at the footprint centre, as stage 0). The key uses the sprite view rotation.
   * Guests keep the shadow inside their own pictures.
   */
  draw(ctx: CanvasRenderingContext2D, world: World, f: LayerFrame, frame: PixelFrame): void {
    this.drawn = 0;
    if (frame.night) return;
    const s = world.state;
    const map = s.map;
    const r = (f.rotation & 3) as ViewRotation;
    const va = viewAffine(r, map.width, map.height, this.va);
    for (const ride of s.rides) {
      if (ride.kind !== 'flat') continue;
      const def = getFlatRideDef(ride.defId);
      if (!def) continue;
      const e = this.caster('ride', K_RIDE, ride.defId, viewSpriteRotation(ride.rotation, r));
      if (!e) continue;
      const { ex, ey } = extent(def.w, def.d, ride.rotation);
      const ua = viewTileU(va, ride.x, ride.y);
      const ub = viewTileU(va, ride.x + ex - 1, ride.y + ey - 1);
      const vA = viewTileV(va, ride.x, ride.y);
      const vB = viewTileV(va, ride.x + ex - 1, ride.y + ey - 1);
      const u0 = ua < ub ? ua : ub;
      const v0 = vA < vB ? vA : vB;
      const z = (map.heights[ride.y * map.width + ride.x] as number | undefined) ?? 0;
      this.put(ctx, e, (u0 - v0) * HW, (u0 + v0) * HH - z * STEP_PX, f, frame);
    }
    for (const st of s.stalls) {
      const e = this.caster('stall', K_STALL, st.defId, viewSpriteRotation(st.rotation, r));
      if (!e) continue;
      const z = (map.heights[st.y * map.width + st.x] as number | undefined) ?? 0;
      this.put(ctx, e, viewTileSX(va, st.x, st.y), viewTileSY(va, st.x, st.y, z), f, frame);
    }
    const iv = this.iv;
    for (const item of s.scenery) {
      const def = getSceneryDef(item.defId);
      if (!def || def.edge) continue;
      itemView(iv, item, def, r, map.width, map.height);
      const e = this.caster('scenery', K_SCENERY, item.defId, iv.f);
      if (!e) continue;
      let ax = (iv.u0 - iv.v0) * HW;
      let ay = (iv.u0 + iv.v0) * HH - item.z * STEP_PX;
      if (e.ellipse) {
        // Stage 0 anchor of a round caster: the footprint centre.
        ax += ((iv.ex - iv.ey) * HW) / 2;
        ay += ((iv.ex + iv.ey) * HH) / 2;
      }
      this.put(ctx, e, ax, ay, f, frame);
    }
  }
}

const passes = new WeakMap<object, ShadowPass>();

/** The shadow pass of `store` (one `ShadowPass` per store). */
export function drawShadowPass(ctx: CanvasRenderingContext2D, store: Pick<PictureStore, 'get'>, world: World, f: LayerFrame, frame: PixelFrame): void {
  let p = passes.get(store);
  if (!p) passes.set(store, (p = new ShadowPass(store)));
  p.draw(ctx, world, f, frame);
}
