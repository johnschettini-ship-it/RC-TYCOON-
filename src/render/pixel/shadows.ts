/** Phase 8 stage 0 prototype (never merged): ground shadows from catalog casters, one multiply per frame (spec §8.4). */
import { getFlatRideDef } from '../../data/catalog/flatRides';
import { getSceneryDef } from '../../data/catalog/scenery';
import { extent } from '../../sim/footprint';
import type { Dir } from '../../sim/map';
import type { World } from '../../sim/types';
import { makeCanvas, type AnyCanvas } from '../canvas';
import { STEP_PX, TILE_H, TILE_W } from '../iso';
import type { LayerFrame, WorldLayer } from '../layers';
import { itemView, newItemView } from '../scenery/place';
import type { Ctx } from '../sprites/shapes';
import { rideArtBounds } from '../sprites/rides';
import { stallArtBounds } from '../sprites/stalls';
import { viewAffine, viewTileSX, viewTileSY, viewTileU, viewTileV, type ViewAffine, type ViewRotation } from '../view';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

/** A shadow caster (§5.2). A box: `w`, `d` in map tiles, `shift` 0. An ellipse or rect: art pixels, `heightPx` 0. */
export interface Caster {
  shape: 'box' | 'ellipse' | 'rect';
  w: number;
  d: number;
  heightPx: number;
  shift: number;
}

/** World pixels of height per tile of shadow (§15, provisional). */
export const SHADOW_TZ = 40;
/** Shadow length factor (§15, provisional). */
export const SHADOW_LEN = 0.75;
/** The multiply colour: `mix(#ffffff, i2, 0.3)` (§8.4 item 4). */
export const SHADOW_MULTIPLY = '#c9c0cb';
/** Guests: the draft ellipse `[cx − 3, cy − 1, cx + 4, cy + 1]` (§8.4 item 1). */
export const GUEST_SHADOW: Caster = { shape: 'ellipse', w: 8, d: 3, heightPx: 0, shift: 0 };

/** The draft pairs (`r`, `k`) of `sh_ell` for the round scenery casters (§8.4 item 1). */
const ROUND_PAIRS: Readonly<Record<string, readonly [number, number]>> = {
  oak_round: [0.42, 1.3],
  pine_tall: [0.36, 1.5],
  birch_silver: [0.3, 1.2],
  willow: [0.45, 1.3],
  shrub_round: [0.32, 1.0],
  shrub_flowering: [0.32, 1.0],
  boulder: [0.38, 1.0],
};

/** Scenery ids with an ellipse caster (§8.4 item 1). */
export const ROUND_CASTERS: ReadonlySet<string> = new Set(Object.keys(ROUND_PAIRS));

/** Flat scenery: no caster. */
const NO_CASTER: ReadonlySet<string> = new Set(['bed_mixed', 'bed_tulip']);

/** The caster of one object (stage 0 kinds only; edge scenery and unknown ids give `null`). */
export function casterOf(kind: 'ride' | 'stall' | 'scenery' | 'guest', defId: string, rotation: number): Caster | null {
  const rot = (rotation & 3) as Dir;
  switch (kind) {
    case 'ride': {
      const def = getFlatRideDef(defId);
      if (!def) return null;
      const { ex, ey } = extent(def.w, def.d, rot);
      const heightPx = (ex + ey) * 8 - 6 - rideArtBounds(defId, def.w, def.d, rot).top;
      return { shape: 'box', w: ex, d: ey, heightPx, shift: 0 };
    }
    case 'stall':
      return { shape: 'box', w: 1, d: 1, heightPx: 16 - stallArtBounds().top, shift: 0 };
    case 'scenery': {
      const pair = ROUND_PAIRS[defId];
      if (pair) {
        const [r, k] = pair;
        return {
          shape: 'ellipse',
          w: 2 * Math.floor(r * 22.6 * (1 + 0.35 * k)) + 1,
          d: 2 * Math.max(1, Math.floor(r * 11.3)) + 1,
          heightPx: 0,
          shift: Math.round(r * 0.55 * k * 32),
        };
      }
      const def = getSceneryDef(defId);
      if (!def || def.edge || NO_CASTER.has(defId)) return null;
      const odd = (rot & 1) === 1;
      return { shape: 'box', w: odd ? def.d : def.w, d: odd ? def.w : def.d, heightPx: def.heightM * STEP_PX, shift: 0 };
    }
    case 'guest':
      return GUEST_SHADOW;
    default:
      return null;
  }
}

export interface CasterMask {
  w: number;
  h: number;
  cx: number;
  cy: number;
  bits: Uint8Array;
}

/**
 * The art-pixel mask of a caster in a view rotation (§8.4 items 2, 3): `w × h` bytes, row by row, 1 = shadow.
 * `(cx, cy)` is the mask column and row of the anchor art pixel. A box: the footprint diamond with its back corner at
 * `(cx, cy)`, joined with the same diamond moved to the screen right by the shear (the polygon of `pixel3.py:178`).
 * An ellipse or rect: the columns and rows of §8.4 item 2 around the anchor.
 */
export function casterMask(c: Caster, rotation: ViewRotation): CasterMask {
  if (c.shape !== 'box') {
    const c0 = -Math.floor((c.w - 1) / 2) + c.shift;
    const r0 = -Math.floor((c.d - 1) / 2);
    const w = c.w;
    const h = c.d;
    const bits = new Uint8Array(w * h);
    const rx = w / 2;
    const ry = h / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (c.shape === 'rect') {
          bits[y * w + x] = 1;
          continue;
        }
        const dx = (x + 0.5 - rx) / rx;
        const dy = (y + 0.5 - ry) / ry;
        if (dx * dx + dy * dy <= 1) bits[y * w + x] = 1;
      }
    }
    return { w, h, cx: -c0, cy: -r0, bits };
  }
  // View extents: the map extents, swapped at odd view rotations.
  const eu = rotation & 1 ? c.d : c.w;
  const ev = rotation & 1 ? c.w : c.d;
  const s = (c.heightPx / SHADOW_TZ) * SHADOW_LEN * 64;
  // World pixels from the back corner, clockwise on screen: left, back, back moved, right moved, front moved, front.
  const px = [-ev * HW, 0, s, eu * HW + s, (eu - ev) * HW + s, (eu - ev) * HW];
  const py = [ev * HH, 0, 0, eu * HH, (eu + ev) * HH, (eu + ev) * HH];
  const x0 = Math.floor(-ev * HW / 2);
  const x1 = Math.ceil((eu * HW + s) / 2);
  const h = Math.ceil(((eu + ev) * HH) / 2);
  const w = x1 - x0;
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const wy = 2 * y + 1;
    for (let x = 0; x < w; x++) {
      const wx = 2 * (x + x0) + 1;
      let inside = true;
      for (let k = 0; k < 6 && inside; k++) {
        const j = (k + 1) % 6;
        const ex = (px[j] as number) - (px[k] as number);
        const ey = (py[j] as number) - (py[k] as number);
        if (ex * (wy - (py[k] as number)) - ey * (wx - (px[k] as number)) < 0) inside = false;
      }
      if (inside) bits[y * w + x] = 1;
    }
  }
  return { w, h, cx: -x0, cy: 0, bits };
}

/** View origin (min u, min v) of a map footprint [x, x + ex) × [y, y + ey) (as the renderer's `footprintViewOrigin`). */
function footprintViewOrigin(va: ViewAffine, x: number, y: number, ex: number, ey: number, out: { u: number; v: number }): void {
  const ua = viewTileU(va, x, y);
  const ub = viewTileU(va, x + ex - 1, y + ey - 1);
  const vA = viewTileV(va, x, y);
  const vB = viewTileV(va, x + ex - 1, y + ey - 1);
  out.u = ua < ub ? ua : ub;
  out.v = vA < vB ? vA : vB;
}

interface MaskEntry {
  m: CasterMask;
  image: AnyCanvas;
}

/** The mask image: `SHADOW_MULTIPLY`, one `fillRect` per horizontal run of 1 bits. */
function paintMask(m: CasterMask): AnyCanvas {
  const { canvas, ctx } = makeCanvas(Math.max(1, m.w), Math.max(1, m.h));
  ctx.fillStyle = SHADOW_MULTIPLY;
  for (let y = 0; y < m.h; y++) {
    let x = 0;
    while (x < m.w) {
      if (!m.bits[y * m.w + x]) {
        x++;
        continue;
      }
      let e = x + 1;
      while (e < m.w && m.bits[y * m.w + e]) e++;
      ctx.fillRect(x, y, e - x, 1);
      x = e;
    }
  }
  return canvas;
}

/** The ground shadow layer (§8.4 item 4): first in `createWorldLayers`, `drawGround` only, Pixel at `n > 0` only. */
export function createPixelShadowLayer(): WorldLayer {
  const casters = new Map<string, Caster | null>();
  const masks = new Map<Caster, Array<MaskEntry | undefined>>();
  const va = viewAffine(0, 1, 1);
  const iv = newItemView();
  const origin = { u: 0, v: 0 };
  let shadow: AnyCanvas | null = null;
  let sctx: Ctx | null = null;

  function caster(kind: 'ride' | 'stall' | 'scenery', defId: string, rotation: number): Caster | null {
    const key = `${kind}:${defId}:${rotation}`;
    let c = casters.get(key);
    if (c === undefined) {
      c = casterOf(kind, defId, rotation);
      casters.set(key, c);
    }
    return c;
  }

  function mask(c: Caster, r: ViewRotation): MaskEntry {
    let list = masks.get(c);
    if (!list) {
      list = [undefined, undefined, undefined, undefined];
      masks.set(c, list);
    }
    let e = list[r];
    if (!e) {
      const m = casterMask(c, r);
      e = { m, image: paintMask(m) };
      list[r] = e;
    }
    return e;
  }

  return {
    name: 'pixelShadow',
    kinds: [],
    drawGround(ctx: CanvasRenderingContext2D, world: World, _tool, f: LayerFrame): void {
      const art = f.art;
      if (!art || art.n === 0) return;
      const n = art.n;
      const W = f.width;
      const H = f.height;
      if (!shadow || !sctx || shadow.width !== W || shadow.height !== H) {
        const made = makeCanvas(W, H);
        shadow = made.canvas;
        sctx = made.ctx;
      }
      const sc = sctx;
      sc.clearRect(0, 0, W, H);
      // A new 2D context smooths: a smoothed `w × n` copy would give partial alpha at every shadow edge.
      sc.imageSmoothingEnabled = false;
      const s = world.state;
      const map = s.map;
      const r = (f.rotation & 3) as ViewRotation;
      viewAffine(r, map.width, map.height, va);
      let drawn = 0;

      /** Copy rule (as `blitArt`, §7.7): the anchor art pixel `(ax / 2, ay / 2)` meets the mask's `(cx, cy)`. */
      const put = (c: Caster, ax: number, ay: number): void => {
        const e = mask(c, r);
        const m = e.m;
        const x0 = art.offX + (ax / 2 - m.cx) * n;
        const y0 = art.offY + (ay / 2 - m.cy) * n;
        const w = m.w * n;
        const h = m.h * n;
        if (x0 >= W || y0 >= H || x0 + w <= 0 || y0 + h <= 0) return;
        sc.drawImage(e.image, x0, y0, w, h);
        drawn++;
      };

      // Rides: the anchor of `collectRides` (the back corner of the view footprint).
      for (const ride of s.rides) {
        if (ride.kind !== 'flat') continue;
        const def = getFlatRideDef(ride.defId);
        if (!def) continue;
        const c = caster('ride', ride.defId, ride.rotation);
        if (!c) continue;
        const { ex, ey } = extent(def.w, def.d, ride.rotation);
        footprintViewOrigin(va, ride.x, ride.y, ex, ey, origin);
        const z = (map.heights[ride.y * map.width + ride.x] as number | undefined) ?? 0;
        put(c, (origin.u - origin.v) * HW, (origin.u + origin.v) * HH - z * STEP_PX);
      }
      // Stalls: the anchor of `collectStalls`.
      for (const st of s.stalls) {
        const c = caster('stall', st.defId, st.rotation);
        if (!c) continue;
        const z = (map.heights[st.y * map.width + st.x] as number | undefined) ?? 0;
        put(c, viewTileSX(va, st.x, st.y), viewTileSY(va, st.x, st.y, z));
      }
      // Scenery: a box at the sprite anchor; an ellipse at the footprint centre (Prototype decision 10).
      for (const item of s.scenery) {
        const def = getSceneryDef(item.defId);
        if (!def || def.edge) continue;
        const c = caster('scenery', item.defId, item.rotation);
        if (!c) continue;
        itemView(iv, item, def, r, map.width, map.height);
        let ax = (iv.u0 - iv.v0) * HW;
        let ay = (iv.u0 + iv.v0) * HH - item.z * STEP_PX;
        if (c.shape === 'ellipse') {
          ax += ((iv.ex - iv.ey) * HW) / 2;
          ay += ((iv.ex + iv.ey) * HH) / 2;
        }
        put(c, ax, ay);
      }
      // Walkers: the snapped anchors of this frame (`collectGuests`).
      const walkers = art.walkers;
      const count = art.walkerCount ?? 0;
      if (walkers) for (let k = 0; k < count; k++) put(GUEST_SHADOW, walkers[2 * k] as number, walkers[2 * k + 1] as number);

      if (drawn === 0) return;
      const prev = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(shadow as CanvasImageSource, 0, 0, W, H);
      ctx.globalCompositeOperation = typeof prev === 'string' ? prev : 'source-over';
    },
  };
}
