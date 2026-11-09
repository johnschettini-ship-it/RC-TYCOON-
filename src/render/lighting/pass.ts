/**
 * The After Dark light pass (Phase 4 §4.7, Rendering steps 2–5). Owner: W3-F.
 *
 * 2. If darkness > 0, a light canvas at 1/4 of the device resolution is filled with the ambient colour.
 * 3. Each visible light source adds a cached warm radial sprite with `lighter` (≤ 400 a frame, culled to the view).
 * 4. The light canvas is drawn over the frame with `multiply`, scaled up with smoothing.
 * 5. Emissive sprites (lamp bulbs, pillar caps, stall lanterns, ride marquee bulbs, lit scenery) are drawn after the
 *    multiply with `lighter`, so they glow.
 * Darkness 0 skips all of it. The light canvas is redrawn only when the light sources, the camera, the canvas size,
 * the view rotation, or the ambient colour changed; otherwise the cached canvas is multiplied again. The per-frame
 * loops use scratch objects only (no allocations).
 */
import { MAX_DARKNESS, MAX_LIGHT_SPRITES } from '../../data/tuning/night';
import { Content, type Dir, type MapState } from '../../sim/map';
import { LightKind, lightSources, type LightSourceList } from '../../sim/lighting/lightMap';
import type { World } from '../../sim/types';
import { entranceOuterDir } from '../fence';
import type { LayerFrame } from '../layers';
import { pathItemPlacement, type ItemPlacement } from '../management/pathItemPos';
import { pathJoinMask } from '../paths';
import { ambientColour, darknessAt, type Rgb } from './darkness';
import { toView, worldX, worldY, type ViewXY } from './project';
import { BULB_SIZE, GLOW_SIZE, makeBulbSprite, makeGlowSprite, type CanvasFactory, type CanvasLike, type Ctx2D } from './sprites';

/** Device px per light canvas px (Phase 4 §4.7: 1/4 resolution). */
export const LIGHT_CANVAS_DIVISOR = 4;
/** Half-width of a ground disc of radius 1 tile, in world px (iso: √2 × 32). */
const DISC_HW = 32 * Math.SQRT2;
/** Emissive bulbs per frame (the same cap as the light sprites). */
const MAX_BULBS = MAX_LIGHT_SPRITES;
/** Bulb glow diameter in world px at zoom 1. */
const BULB_PX = 12;
/** Lamp head height above the path surface (render/sprites/litter.ts lamp: box 22–26 px). */
const LAMP_HEAD_PX = 24;
/** Park entrance pillar caps (render/sprites/props.ts: at t = 0.1 and 0.9, 50–54 px) and emblems (66 px). */
const ENTRANCE_CAP_PX = 52;
const ENTRANCE_EMBLEM_PX = 66;
/** Stall roof lantern (pyramid apex at 38 px) and the counter light on the service face (16 px). */
const STALL_TOP_PX = 40;
const STALL_COUNTER_PX = 14;
/** Ride marquee bulbs at the footprint corners. */
const RIDE_BULB_PX = 5;
const RIDE_BULB_INSET = 0.18;

export interface LightPassStats {
  /** Light sprites drawn into the light canvas at its last redraw. */
  sprites: number;
  /** Emissive bulbs drawn this frame. */
  bulbs: number;
  /** The light canvas was redrawn this frame. */
  redrawn: boolean;
  /** Wall time of the last pass in ms (0 when skipped or where `performance` is missing). */
  ms: number;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : 0);

export class LightPass {
  readonly stats: LightPassStats = { sprites: 0, bulbs: 0, redrawn: false, ms: 0 };
  private light: CanvasLike | null = null;
  private lctx: Ctx2D | null = null;
  private glow: CanvasLike | null = null;
  private bulb: CanvasLike | null = null;
  private ready = false;
  private readonly amb: Rgb = { r: -1, g: -1, b: -1 };
  private ambStr = '';
  // Cache key of the light canvas contents.
  private kSrc: LightSourceList | null = null;
  private kVersion = -1;
  private kW = 0;
  private kH = 0;
  private kScale = 0;
  private kOffX = 0;
  private kOffY = 0;
  private kRot = -1;
  private kR = -1;
  private kG = -1;
  private kB = -1;
  private kHeights: Uint8Array | null = null;
  // Scratch.
  private readonly vp: ViewXY = { u: 0, v: 0 };
  private readonly place: ItemPlacement = { u: 0, v: 0, alongX: true, side: 0 };

  constructor(private readonly makeCanvas: CanvasFactory) {}

  private init(): boolean {
    if (this.ready) return this.light !== null;
    this.ready = true;
    this.glow = makeGlowSprite(this.makeCanvas);
    this.bulb = makeBulbSprite(this.makeCanvas);
    this.light = this.makeCanvas(1, 1);
    this.lctx = this.light?.getContext('2d') ?? null;
    if (!this.glow || !this.bulb || !this.light || !this.lctx) this.light = null;
    return this.light !== null;
  }

  draw(ctx: CanvasRenderingContext2D, world: World, f: LayerFrame): void {
    const s = world.state;
    const darkness = darknessAt(s.tick + f.alpha, s.park.afterDark);
    if (darkness <= 0) {
      this.stats.bulbs = 0;
      this.stats.redrawn = false;
      this.stats.ms = 0;
      return;
    }
    if (!this.init()) return;
    const t0 = now();
    const src = lightSources(world);
    const amb = ambientColour(darkness, this.amb);
    const lw = Math.max(1, Math.ceil(f.width / LIGHT_CANVAS_DIVISOR));
    const lh = Math.max(1, Math.ceil(f.height / LIGHT_CANVAS_DIVISOR));
    const light = this.light as CanvasLike;
    const lctx = this.lctx as Ctx2D;
    const changed =
      src !== this.kSrc ||
      src.version !== this.kVersion ||
      lw !== this.kW ||
      lh !== this.kH ||
      f.scale !== this.kScale ||
      f.offX !== this.kOffX ||
      f.offY !== this.kOffY ||
      f.rotation !== this.kRot ||
      amb.r !== this.kR ||
      amb.g !== this.kG ||
      amb.b !== this.kB ||
      s.map.heights !== this.kHeights;
    this.stats.redrawn = changed;
    if (changed) {
      if (light.width !== lw || light.height !== lh) {
        light.width = lw;
        light.height = lh;
      }
      this.redraw(lctx, s.map, src, f, lw, lh, amb);
      this.kSrc = src;
      this.kVersion = src.version;
      this.kW = lw;
      this.kH = lh;
      this.kScale = f.scale;
      this.kOffX = f.offX;
      this.kOffY = f.offY;
      this.kRot = f.rotation;
      this.kR = amb.r;
      this.kG = amb.g;
      this.kB = amb.b;
      this.kHeights = s.map.heights;
    }
    // Step 4: multiply the light canvas over the frame.
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(light as unknown as CanvasImageSource, 0, 0, f.width / LIGHT_CANVAS_DIVISOR, f.height / LIGHT_CANVAS_DIVISOR, 0, 0, f.width, f.height);
    // Step 5: emissive sprites glow on top.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, darkness / MAX_DARKNESS);
    this.stats.bulbs = this.drawBulbs(ctx, world, src, f);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = smooth;
    this.stats.ms = now() - t0;
  }

  /** Steps 2–3 into the light canvas. */
  private redraw(lctx: Ctx2D, map: MapState, src: LightSourceList, f: LayerFrame, lw: number, lh: number, amb: Rgb): void {
    if (amb.r !== this.kR || amb.g !== this.kG || amb.b !== this.kB || this.ambStr === '') this.ambStr = `rgb(${amb.r}, ${amb.g}, ${amb.b})`;
    lctx.globalCompositeOperation = 'source-over';
    lctx.globalAlpha = 1;
    lctx.fillStyle = this.ambStr;
    lctx.fillRect(0, 0, lw, lh);
    lctx.globalCompositeOperation = 'lighter';
    const glow = this.glow as unknown as CanvasImageSource;
    const k = f.scale / LIGHT_CANVAS_DIVISOR;
    const ox = f.offX / LIGHT_CANVAS_DIVISOR;
    const oy = f.offY / LIGHT_CANVAS_DIVISOR;
    const r = f.rotation as Dir;
    const mw = map.width;
    const mh = map.height;
    const vp = this.vp;
    let drawn = 0;
    for (let i = 0; i < src.count && drawn < MAX_LIGHT_SPRITES; i++) {
      const tile = src.tile[i] as number;
      const zFixed = src.z[i] as number;
      const z = zFixed >= 0 ? zFixed : ((map.heights[tile] as number | undefined) ?? 0);
      toView(src.fx[i] as number, src.fy[i] as number, r, mw, mh, vp);
      const cx = worldX(vp.u, vp.v) * k + ox;
      const cy = worldY(vp.u, vp.v, z) * k + oy;
      const ext = Math.max(src.ex[i] as number, src.ey[i] as number);
      const reach = (src.radius[i] as number) + 0.5 + ext / 2;
      const rx = reach * DISC_HW * k;
      const ry = rx / 2;
      if (cx + rx < 0 || cx - rx > lw || cy + ry < 0 || cy - ry > lh) continue;
      lctx.drawImage(glow, 0, 0, GLOW_SIZE, GLOW_SIZE, cx - rx, cy - ry, rx * 2, ry * 2);
      drawn++;
    }
    lctx.globalCompositeOperation = 'source-over';
    this.stats.sprites = drawn;
  }

  // Bulb drawing state for the current frame (fields, so the loop needs no closure).
  private bctx: CanvasRenderingContext2D | null = null;
  private bf: LayerFrame | null = null;
  private bn = 0;
  private bsize = 0;

  /** One emissive bulb at map position (fx, fy), height z steps plus `px` pixels. */
  private bulbAt(fx: number, fy: number, z: number, px: number, mw: number, mh: number): void {
    const f = this.bf as LayerFrame;
    if (this.bn >= MAX_BULBS) return;
    const vp = toView(fx, fy, f.rotation as Dir, mw, mh, this.vp);
    const half = this.bsize / 2;
    const x = worldX(vp.u, vp.v) * f.scale + f.offX;
    const y = worldY(vp.u, vp.v, z, px) * f.scale + f.offY;
    if (x < -half || y < -half || x > f.width + half || y > f.height + half) return;
    (this.bctx as CanvasRenderingContext2D).drawImage(this.bulb as unknown as CanvasImageSource, 0, 0, BULB_SIZE, BULB_SIZE, x - half, y - half, this.bsize, this.bsize);
    this.bn++;
  }

  /** Step 5. Returns the number of bulbs drawn. */
  private drawBulbs(ctx: CanvasRenderingContext2D, world: World, src: LightSourceList, f: LayerFrame): number {
    const s = world.state;
    const map = s.map;
    const r = f.rotation as Dir;
    const mw = map.width;
    const mh = map.height;
    this.bctx = ctx;
    this.bf = f;
    this.bn = 0;
    this.bsize = Math.max(3, BULB_PX * f.scale);
    const vp = this.vp;
    const place = this.place;
    // Cull whole sources by their footprint box before placing bulbs.
    const margin = 90 * f.scale;
    for (let i = 0; i < src.count && this.bn < MAX_BULBS; i++) {
      const tile = src.tile[i] as number;
      const zFixed = src.z[i] as number;
      const z = zFixed >= 0 ? zFixed : ((map.heights[tile] as number | undefined) ?? 0);
      const fx = src.fx[i] as number;
      const fy = src.fy[i] as number;
      toView(fx, fy, r, mw, mh, vp);
      const sx = worldX(vp.u, vp.v) * f.scale + f.offX;
      const sy = worldY(vp.u, vp.v, z) * f.scale + f.offY;
      const ext = Math.max(src.ex[i] as number, src.ey[i] as number) * 32 * f.scale;
      if (sx < -margin - ext || sx > f.width + margin + ext || sy < -margin - ext || sy > f.height + margin + ext) continue;
      const x = tile % mw;
      const y = (tile - x) / mw;
      switch (src.kind[i]) {
        case LightKind.Lamp: {
          if (map.content[tile] === Content.Footpath || map.content[tile] === Content.Queue) {
            pathItemPlacement(pathJoinMask(map, tile, s.rides, s.stalls), place);
          } else {
            place.u = 0.5;
            place.v = 0.5;
          }
          this.bulbAt(x + place.u, y + place.v, z, LAMP_HEAD_PX, mw, mh);
          break;
        }
        case LightKind.Entrance: {
          const outer = entranceOuterDir(map);
          const alongX = outer === 0 || outer === 2 || outer === -1;
          for (let p = 0; p < PILLARS.length; p++) {
            const t = PILLARS[p] as number;
            const px = x + (alongX ? t : 0.5);
            const py = y + (alongX ? 0.5 : t);
            this.bulbAt(px, py, z, ENTRANCE_CAP_PX, mw, mh);
            this.bulbAt(px, py, z, ENTRANCE_EMBLEM_PX, mw, mh);
          }
          break;
        }
        case LightKind.Stall: {
          this.bulbAt(x + 0.5, y + 0.5, z, STALL_TOP_PX, mw, mh);
          const rot = stallAt(s.stalls, map, tile);
          if (rot >= 0) this.bulbAt(x + 0.5 + (FACE_DX[rot] as number), y + 0.5 + (FACE_DY[rot] as number), z, STALL_COUNTER_PX, mw, mh);
          break;
        }
        case LightKind.Scenery:
          this.bulbAt(fx, fy, z, Math.max(6, (src.height[i] as number) * 8 * 0.8), mw, mh);
          break;
        default: {
          // Rides and stations: marquee bulbs at the footprint corners.
          const hx = (src.ex[i] as number) / 2 - RIDE_BULB_INSET;
          const hy = (src.ey[i] as number) / 2 - RIDE_BULB_INSET;
          this.bulbAt(fx - hx, fy - hy, z, RIDE_BULB_PX, mw, mh);
          this.bulbAt(fx + hx, fy - hy, z, RIDE_BULB_PX, mw, mh);
          this.bulbAt(fx + hx, fy + hy, z, RIDE_BULB_PX, mw, mh);
          this.bulbAt(fx - hx, fy + hy, z, RIDE_BULB_PX, mw, mh);
        }
      }
    }
    this.bctx = null;
    this.bf = null;
    return this.bn;
  }
}

const PILLARS: readonly number[] = [0.1, 0.9];
/** Service face offset from the tile centre by stall rotation (0 N, 1 E, 2 S, 3 W). */
const FACE_DX: readonly number[] = [0, 0.38, 0, -0.38];
const FACE_DY: readonly number[] = [-0.38, 0, 0.38, 0];

/** Rotation of the stall on `tile`, or −1. */
function stallAt(stalls: World['state']['stalls'], map: MapState, tile: number): number {
  const id = map.contentRef[tile] as number;
  let lo = 0;
  let hi = stalls.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const st = stalls[mid]!;
    if (st.id === id) return st.rotation;
    if (st.id < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
