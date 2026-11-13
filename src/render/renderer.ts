/**
 * Canvas 2D renderer (Phase 0 §4.8, Phase 1 §7, Phase 4 §4.8 and §4.10). Owner: W1-A, W3-G.
 * Frame: background → terrain chunks → ground (litter, Build 2 `drawGround`, ownership tints, far-zoom guests)
 * → depth-sorted objects (fence, entrance, rides, stalls, guests, staff, path items, track, Build 2 kinds)
 * → weather → Build 2 `drawAfterObjects` → overlays (drag, highlight, selection, ghosts, Build 2 `drawOverlay`)
 * → dev overlay.
 * View rotation (Phase 4 §4.8): every map position goes through the table in `./view.ts` (affine form) before the
 * master 6.4 projection, depth sorts by u + v, and sprites turn by `(rotation + r) mod 4` (the sprite cache key
 * holds the view rotation). All drawing happens in device pixels with integer-rounded destinations so slices do
 * not seam. Frame loops write into reused arrays: no allocation per object.
 */
import { getFlatRideDef } from '../data/catalog/flatRides';
import { getStallDef } from '../data/catalog/stalls';
import { extent, footprintTiles, stallServiceTile } from '../sim/footprint';
import { Content, Owned, type Dir, type MapState } from '../sim/map';
import type { Guest } from '../sim/guests/types';
import type { World } from '../sim/types';
import { coarseRideFrame, GHOST_FRAME_INVALID, GHOST_FRAME_VALID, rideFrameFor } from './anim';
import { clampCameraToMap, ZOOM_BUCKETS, zoomBucket, type ZoomBucket } from './camera';
import { makeCanvas, type AnyCanvas } from './canvas';
import { footprintColumns, Layer, packDepth, sortIndex, sortKey, viewPointDepth, viewTileDepth, type ColumnTile } from './depth';
import { entranceOuterDir, fenceEdgeDepth, fenceSegments, type FenceSegment } from './fence';
import { guestPosition, walkerHeights, type GuestPos } from './guestPos';
import { STEP_PX, TILE_H, TILE_W } from './iso';
import { GHOST_FILL_INVALID, GHOST_FILL_VALID, GHOST_INVALID, GHOST_VALID, ghostLineWidth, mix32, rgbCss, SHIRT_COLOURS, SKY, tintStep, tintStepRgb, TINT_STEPS, withAlpha } from './palette';
import { createQueueWalker, queueSlot } from './queue';
import { SpriteCache, spriteMemory, type Sprite } from './spriteCache';
import type { Ctx } from './sprites/shapes';
import { GUEST_BALLOON, GUEST_UMBRELLA, guestFrame, guestSpriteKey, SPRITE_CACHE_MB, SpriteBank } from './sprites/bank';
import { drawGhostIcon } from './sprites/props';
import { drawRideArt, rideArtBounds, type ArtBounds } from './sprites/rides';
import { drawStallArt, stallArtBounds } from './sprites/stalls';
import { CHUNK_CACHE_MB, chunkCacheBudgetPixels, PREFETCH_HEADROOM, TerrainLayer, grassShade, type TerrainEnv, type ViewRect } from './terrain';
import { KIND_TRACK, TrackLayer, trackRideTiles, trackTroubleTiles } from './track';
import type { Camera, Renderer, ToolState } from './types';
import { KIND_PATH_ITEM, KIND_STAFF, ManagementLayer, PATH_ITEM_IDS } from './management/layer';
import type { LayerFrame, WorldLayer } from './layers';
import type { RealLook } from './real/look';
import type { GroundLayer } from './real/ground';
import { createWorldLayers } from './worldLayers';
import { displayPrefs } from '../a11y/prefs';
import { perfProbe } from '../perf/stats';
import { AutoScale, browserDeviceEnv, deviceClass, renderPlan, renderQuality, renderQualityVersion } from '../perf/quality';
import { BUDGET_DESKTOP_FRAME_P95_MS, BUDGET_PHONE_FRAME_P95_MS, GUEST_LOD_ZOOM } from '../data/tuning/perf';
import {
  rotateCameraView,
  viewAffine,
  viewCornerHeights,
  viewDir,
  viewPointSX,
  viewPointSY,
  viewSpriteRotation,
  viewTileSX,
  viewTileSY,
  viewTileU,
  viewTileV,
  type ViewAffine,
  type ViewRotation,
} from './view';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

const KIND_FENCE = 1;
const KIND_ARCH = 2;
const KIND_RIDE = 3;
const KIND_STALL = 4;
const KIND_GUEST = 5;

/**
 * Phase 4 §4.10, Phase 6 §4.6 step 3: at camera zoom ≤ 0.5 guests are drawn as small rectangles grouped by colour
 * (`data/tuning/perf.ts`; `low` render quality from 0.75).
 */
export { GUEST_LOD_ZOOM };
/** Guest rectangle at far zoom, CSS px (Phase 4 §4.10: 2 × 3 px). */
export const GUEST_LOD_W = 2;
export const GUEST_LOD_H = 3;
/** LOD colour slots: shirt colours, then temperament tint steps. */
const LOD_COLOURS: readonly string[] = [...SHIRT_COLOURS, ...Array.from({ length: TINT_STEPS }, (_, k) => rgbCss(tintStepRgb(k)))];

/** Struct-of-arrays draw list; grows by doubling, never shrinks, so frames do not allocate. */
class DrawList {
  n = 0;
  kind = new Uint8Array(1024);
  ref = new Int32Array(1024);
  sub = new Int32Array(1024);
  ax = new Float64Array(1024);
  ay = new Float64Array(1024);
  skey = new Float64Array(1024);
  keys = new Float64Array(1024);

  private grow(): void {
    const cap = this.kind.length * 2;
    const g = <T extends Uint8Array | Int32Array | Float64Array>(a: T, make: (n: number) => T): T => {
      const b = make(cap);
      b.set(a);
      return b;
    };
    this.kind = g(this.kind, (n) => new Uint8Array(n));
    this.ref = g(this.ref, (n) => new Int32Array(n));
    this.sub = g(this.sub, (n) => new Int32Array(n));
    this.ax = g(this.ax, (n) => new Float64Array(n));
    this.ay = g(this.ay, (n) => new Float64Array(n));
    this.skey = g(this.skey, (n) => new Float64Array(n));
    this.keys = g(this.keys, (n) => new Float64Array(n));
  }

  push(kind: number, ref: number, sub: number, ax: number, ay: number, skey: number, depth: number, z: number, layer: number): void {
    if (this.n === this.kind.length) this.grow();
    const i = this.n++;
    this.kind[i] = kind;
    this.ref[i] = ref;
    this.sub[i] = sub;
    this.ax[i] = ax;
    this.ay[i] = ay;
    this.skey[i] = skey;
    this.keys[i] = sortKey(packDepth(depth, z, layer), i);
  }

  sort(): void {
    this.keys.subarray(0, this.n).sort();
  }
}

/** Far-zoom guests (Phase 4 §4.10): device position and colour slot, bucketed by colour before drawing. */
class GuestDots {
  n = 0;
  x = new Float32Array(1024);
  y = new Float32Array(1024);
  colour = new Uint8Array(1024);
  /** Indices sorted by colour (counting sort). */
  private order = new Int32Array(1024);
  private readonly counts = new Int32Array(LOD_COLOURS.length + 1);
  private readonly starts = new Int32Array(LOD_COLOURS.length);

  push(x: number, y: number, colour: number): void {
    if (this.n === this.x.length) {
      const cap = this.n * 2;
      const fx = new Float32Array(cap);
      fx.set(this.x);
      this.x = fx;
      const fy = new Float32Array(cap);
      fy.set(this.y);
      this.y = fy;
      const c = new Uint8Array(cap);
      c.set(this.colour);
      this.colour = c;
      this.order = new Int32Array(cap);
    }
    const i = this.n++;
    this.x[i] = x;
    this.y[i] = y;
    this.colour[i] = colour;
  }

  /** One fill per colour. `w`, `h`: rectangle size in device px. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const n = this.n;
    if (n === 0) return;
    const counts = this.counts;
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      const c = (this.colour[i] as number) + 1;
      counts[c] = (counts[c] as number) + 1;
    }
    for (let c = 1; c < counts.length; c++) counts[c] = (counts[c] as number) + (counts[c - 1] as number);
    // counts[c] is now the start of colour c.
    const start = this.starts;
    for (let c = 0; c < start.length; c++) start[c] = counts[c] as number;
    for (let i = 0; i < n; i++) {
      const c = this.colour[i] as number;
      this.order[counts[c] as number] = i;
      counts[c] = (counts[c] as number) + 1;
    }
    for (let c = 0; c < LOD_COLOURS.length; c++) {
      const a = start[c] as number;
      const b = counts[c] as number;
      if (b <= a) continue;
      ctx.fillStyle = LOD_COLOURS[c] as string;
      ctx.beginPath();
      for (let k = a; k < b; k++) {
        const i = this.order[k] as number;
        ctx.rect(Math.round((this.x[i] as number) - w / 2), Math.round((this.y[i] as number) - h), w, h);
      }
      ctx.fill();
    }
  }
}

/** `#rrggbb` with alpha `a` as `rgba(…)` (moved to `./palette`; re-exported for existing importers). */
export { withAlpha };

/**
 * Valid / invalid ghost, drag, and purchase colours (Phase 6 §4.7): the colour-blind safe pair of `./palette.ts`
 * (blue = OK, vermillion = blocked); the check / cross icons and the a11y layer's hatch carry the meaning too.
 */
const OK_FILL = GHOST_FILL_VALID;
const BAD_FILL = GHOST_FILL_INVALID;
const OK_FILL_STRONG = withAlpha(GHOST_VALID, 0.45);
const BAD_FILL_STRONG = withAlpha(GHOST_INVALID, 0.45);

/** Outline width: doubled with high contrast (Phase 6 §4.7). */
function outlineWidth(w: number): number {
  return ghostLineWidth(w);
}

function findGuestIndex(guests: readonly Guest[], id: number): number {
  let lo = 0;
  let hi = guests.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = (guests[mid] as Guest).id;
    if (v === id) return mid;
    if (v < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

function dirBetween(w: number, from: number, to: number): Dir {
  const fx = from % w;
  const tx = to % w;
  if (tx > fx) return 1;
  if (tx < fx) return 3;
  return to > from ? 2 : 0;
}

function debugEnabled(): boolean {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
  } catch {
    return false;
  }
}

/** Ownership tints of the Buy Land tool (Phase 4 §7), by `owned` state; owned land (1) has none. */
const OWNED_TINTS: readonly (string | null)[] = [
  'rgba(20,24,36,0.45)', // 0 not owned
  null, // 1 owned
  'rgba(255,214,82,0.38)', // 2 land for sale
  'rgba(120,200,255,0.30)', // 3 construction rights owned
  'rgba(90,150,255,0.42)', // 4 construction rights for sale
];

/**
 * Phase 6 §4.6 draw-call count: while the probe is on, the context's `drawImage` counts every call (the renderer's
 * own and every layer's) into `perfProbe.countDraw`. Off again, the context's own method comes back.
 */
function drawCounter(ctx: CanvasRenderingContext2D): () => void {
  const c = ctx as unknown as { drawImage: (...a: unknown[]) => void };
  const own = Object.prototype.hasOwnProperty.call(c, 'drawImage') ? c.drawImage : null;
  const raw = c.drawImage;
  let on = false;
  return () => {
    if (perfProbe.enabled === on) return;
    on = perfProbe.enabled;
    if (on) {
      c.drawImage = function (...a: unknown[]): void {
        perfProbe.countDraw();
        raw.apply(ctx, a);
      };
    } else if (own) c.drawImage = own;
    else delete (c as { drawImage?: unknown }).drawImage;
  };
}

/**
 * The realistic look (`?art=real`, stage 1), all optional: without `look` the renderer draws today's art exactly as
 * before. Per object the look answers a Sprite (drawn from its sheet rectangle), `null` (set still decoding: skipped,
 * the frame counted incomplete) or `undefined` (today's art). `sets` brackets every frame (`beginFrame` before
 * `look.prepare`, `endFrame` after the draws); `ground` lays the realistic ground over today's terrain.
 */
export interface RealOptions {
  look?: RealLook;
  sets?: { beginFrame(frame: number): void; endFrame(): void };
  ground?: GroundLayer;
}

export function createCanvasRenderer(canvas: HTMLCanvasElement, real: RealOptions = {}): Renderer {
  // Compile-time gate: the website build (VITE_ART unset) folds every realistic branch away.
  // Compile-time gate: the website build (VITE_ART unset) folds every realistic branch away.
  const L = import.meta.env.VITE_ART === 'real' ? real.look : undefined;
  const ground = import.meta.env.VITE_ART === 'real' ? real.ground : undefined;
  // Opaque: every frame clears to the sky colour first.
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is not available');
  const syncDrawCounter = drawCounter(ctx);
  let cssW = 1;
  let cssH = 1;
  let dpr = 1;

  const bank = new SpriteBank((SPRITE_CACHE_MB * 1024 * 1024) / 4);
  const terrain = new TerrainLayer((CHUNK_CACHE_MB * 1024 * 1024) / 4);
  const track = new TrackLayer();
  // Build 2 and Build 3 layers (`./layers.ts`, registry `./worldLayers.ts`), called in this order at each frame stage.
  const layers: readonly WorldLayer[] = createWorldLayers();
  const layerByKind = new Map<number, WorldLayer>();
  for (const l of layers) for (const k of l.kinds) layerByKind.set(k, l);
  const frame: LayerFrame = { scale: 1, offX: 0, offY: 0, dpr: 1, bucket: 1, view: { x0: 0, y0: 0, x1: 0, y1: 0 }, rotation: 0, alpha: 0, width: 1, height: 1 };
  const list = new DrawList();
  const dots = new GuestDots();
  const walker = createQueueWalker(64 * 64);
  const chain: number[] = [];
  const pos: GuestPos = { fx: 0, fy: 0, z: 0, tile: -1 };
  // Phase 3 (W2-B): staff, path items, litter, weather, markers. Created below once `blit` exists.
  let mgmt: ManagementLayer;
  const columnsMemo = new Map<number, ColumnTile[]>();
  let rideSprites: Array<Sprite | null> = [];
  /** Phase 6 §4.6: 64 MB devices animate rides with fewer frames (`render/anim.ts` `coarseRideFrame`). */
  let coarseRides = false;
  let rideEy = new Int32Array(64);
  const corners: [number, number, number, number] = [0, 0, 0, 0];

  let fence: FenceSegment[] = [];
  let fenceVersion = -1;
  let outerDir: Dir | -1 = -1;

  // Per-guest queue placement for this frame (indexed like state.guests).
  let qStamp = new Uint32Array(256);
  let qfx = new Float64Array(256);
  let qfy = new Float64Array(256);
  let qz = new Float64Array(256);
  let qdir = new Uint8Array(256);
  let frameNo = 0;

  // Frame-local camera transform (device px = world px × scale + off) and view rotation.
  let scale = 1;
  let offX = 0;
  let offY = 0;
  let bucket: ZoomBucket = 1;
  let rot: ViewRotation = 0;
  const va: ViewAffine = viewAffine(0, 1, 1);
  const view: ViewRect = { x0: 0, y0: 0, x1: 0, y1: 0 };

  const debug = debugEnabled();
  let lastFrameAt = 0;
  let fpsAvg = 60;
  let msAvg = 0;
  let lastZoom = '';
  let lastCamX = '';
  let lastRot = -1;

  const devX = (wx: number): number => wx * scale + offX;
  const devY = (wy: number): number => wy * scale + offY;

  function columnsFor(ex: number, ey: number): ColumnTile[] {
    const k = ex * 1024 + ey;
    let c = columnsMemo.get(k);
    if (!c) {
      c = footprintColumns(ex, ey);
      columnsMemo.set(k, c);
    }
    return c;
  }

  function blit(sp: Sprite, wx: number, wy: number): void {
    const f = scale / sp.scale;
    const x0 = Math.round(devX(wx) - sp.ox * f);
    const y0 = Math.round(devY(wy) - sp.oy * f);
    const x1 = Math.round(devX(wx) + (sp.w - sp.ox) * f);
    const y1 = Math.round(devY(wy) + (sp.h - sp.oy) * f);
    if (sp.sx === undefined) (ctx as CanvasRenderingContext2D).drawImage(sp.image, x0, y0, x1 - x0, y1 - y0);
    else (ctx as CanvasRenderingContext2D).drawImage(sp.image, sp.sx, sp.sy ?? 0, sp.w, sp.h, x0, y0, x1 - x0, y1 - y0);
  }

  mgmt = new ManagementLayer(bank, blit);
  mgmt.look = L;
  frame.look = L;

  /** Draw the vertical strip [colL, colR) (world x) of a sprite anchored at (ax, ay). */
  function blitColumn(sp: Sprite, ax: number, ay: number, colL: number, colR: number): void {
    const f = scale / sp.scale;
    const dx0 = Math.round(devX(colL));
    const dx1 = Math.round(devX(colR));
    if (dx1 <= dx0) return;
    let s0 = sp.ox + (colL - ax) * sp.scale;
    let s1 = sp.ox + (colR - ax) * sp.scale;
    if (s0 < 0) s0 = 0;
    if (s1 > sp.w) s1 = sp.w;
    if (s1 <= s0) return;
    const y0 = Math.round(devY(ay) - sp.oy * f);
    const y1 = Math.round(devY(ay) + (sp.h - sp.oy) * f);
    (ctx as CanvasRenderingContext2D).drawImage(sp.image, (sp.sx ?? 0) + s0, sp.sy ?? 0, s1 - s0, sp.h, dx0, y0, dx1 - dx0, y1 - y0);
  }

  function inView(l: number, t: number, r: number, b: number): boolean {
    return r >= view.x0 && l <= view.x1 && b >= view.y0 && t <= view.y1;
  }

  function ensureGuestScratch(n: number): void {
    if (qStamp.length >= n) return;
    let cap = qStamp.length;
    while (cap < n) cap *= 2;
    qStamp = new Uint32Array(cap);
    qfx = new Float64Array(cap);
    qfy = new Float64Array(cap);
    qz = new Float64Array(cap);
    qdir = new Uint8Array(cap);
  }

  /** View origin (min u, min v) of a map footprint [x, x + ex) × [y, y + ey). */
  let footU = 0;
  let footV = 0;
  function footprintViewOrigin(x: number, y: number, ex: number, ey: number): void {
    const ua = viewTileU(va, x, y);
    const ub = viewTileU(va, x + ex - 1, y + ey - 1);
    const vA = viewTileV(va, x, y);
    const vB = viewTileV(va, x + ex - 1, y + ey - 1);
    footU = ua < ub ? ua : ub;
    footV = vA < vB ? vA : vB;
  }

  // ------------------------------------------------------------------ collection

  function collectFence(map: MapState): void {
    const w = map.width;
    for (let k = 0; k < fence.length; k++) {
      const seg = fence[k] as FenceSegment;
      const x = seg.tile % w;
      const y = (seg.tile - x) / w;
      const z = map.heights[seg.tile] as number;
      const ax = viewTileSX(va, x, y);
      const ay = viewTileSY(va, x, y, z);
      if (!inView(ax - HW - 2, ay - 18, ax + HW + 2, ay + TILE_H + 2)) continue;
      list.push(KIND_FENCE, k, viewDir(seg.dir, rot), ax, ay, 0, fenceEdgeDepth(map, seg.tile, seg.dir, va), z, Layer.Object);
    }
  }

  function collectEntrance(map: MapState): void {
    const e = map.entranceTile;
    if (e < 0 || map.content[e] !== Content.ParkEntrance) return;
    const w = map.width;
    const x = e % w;
    const y = (e - x) / w;
    const z = map.heights[e] as number;
    const ax = viewTileSX(va, x, y);
    const ay = viewTileSY(va, x, y, z);
    if (!inView(ax - 40, ay - 90, ax + 40, ay + 40)) return;
    const d = viewTileDepth(x, y, va) - 1;
    list.push(KIND_ARCH, 0, 0, ax, ay, 0, d + 0.6, z, Layer.Object);
    list.push(KIND_ARCH, 0, 1, ax, ay, 0, d + 1.4, z, Layer.Object);
  }

  function collectRides(world: World): void {
    const s = world.state;
    const map = s.map;
    const rides = s.rides;
    if (rideSprites.length < rides.length) {
      rideSprites = new Array<Sprite | null>(rides.length * 2).fill(null);
      rideEy = new Int32Array(rides.length * 2);
    }
    for (let ri = 0; ri < rides.length; ri++) {
      rideSprites[ri] = null;
      const r = rides[ri]!;
      if (r.kind !== 'flat') continue;
      const def = getFlatRideDef(r.defId);
      const w = def?.w ?? 1;
      const d = def?.d ?? 1;
      const { ex, ey } = extent(w, d, r.rotation);
      const vrot = viewSpriteRotation(r.rotation, rot);
      const oi = r.y * map.width + r.x;
      const z = (map.heights[oi] as number | undefined) ?? 0;
      footprintViewOrigin(r.x, r.y, ex, ey);
      const u0 = footU;
      const v0 = footV;
      // View extents: the map extents, swapped at r = 1 and 3.
      const eu = rot & 1 ? ey : ex;
      const ev = rot & 1 ? ex : ey;
      const ax = (u0 - v0) * HW;
      const ay = (u0 + v0) * HH - z * STEP_PX;
      const b = rideArtBounds(r.defId, w, d, vrot);
      rideEy[ri] = ev;
      if (!inView(ax + b.left, ay + b.top, ax + b.right, ay + b.bottom)) continue;
      const fr = def ? (coarseRides ? coarseRideFrame(rideFrameFor(r, def)) : rideFrameFor(r, def)) : 0;
      // Realistic frame: the frame's angle and swing bits (`anim.ts` `encodeRideFrame`), occupancy level apart.
      const rs = import.meta.env.VITE_ART === 'real' && L ? L.ride(r.defId, vrot, fr & 255, (fr >> 8) & 7) : undefined;
      rideSprites[ri] = rs === undefined ? bank.ride(r.defId, w, d, vrot, fr, bucket) : rs;
      const cols = columnsFor(eu, ev);
      const left = ax - ev * HW;
      for (let k = 0; k < cols.length; k++) {
        const colL = left + k * HW;
        if (colL + HW < view.x0 || colL > view.x1) continue;
        const c = cols[k] as ColumnTile;
        list.push(KIND_RIDE, ri, k, ax, ay, 0, u0 + c.dx + v0 + c.dy + 1, z, Layer.Object);
      }
    }
  }

  function collectStalls(world: World): void {
    const s = world.state;
    const map = s.map;
    const b = stallArtBounds();
    for (let si = 0; si < s.stalls.length; si++) {
      const st = s.stalls[si]!;
      const z = (map.heights[st.y * map.width + st.x] as number | undefined) ?? 0;
      const ax = viewTileSX(va, st.x, st.y);
      const ay = viewTileSY(va, st.x, st.y, z);
      if (!inView(ax + b.left, ay + b.top, ax + b.right, ay + b.bottom)) continue;
      list.push(KIND_STALL, si, viewSpriteRotation(st.rotation, rot), ax, ay, 0, viewTileDepth(st.x, st.y, va), z, Layer.Object);
    }
  }

  /** Place queueing guests on their ride's queue tiles (4 per tile from the entrance outward). Map coordinates. */
  function placeQueues(world: World): void {
    const s = world.state;
    const map = s.map;
    const w = map.width;
    for (const r of s.rides) {
      if (r.queue.length === 0 || !r.entrance) continue;
      walker.chain(map, r.entrance.outside, chain);
      if (chain.length === 0) continue;
      for (let k = 0; k < r.queue.length; k++) {
        const gi = findGuestIndex(s.guests, r.queue[k] as number);
        if (gi < 0) continue;
        queueSlot(map, chain, r.entrance.gate, k, pos);
        qStamp[gi] = frameNo;
        qfx[gi] = pos.fx;
        qfy[gi] = pos.fy;
        qz[gi] = pos.z;
        const j = Math.min(Math.floor(k / 4), chain.length - 1);
        const front = j === 0 ? r.entrance.gate : (chain[j - 1] as number);
        qdir[gi] = dirBetween(w, chain[j] as number, front);
      }
    }
  }

  /**
   * Guests: sprites in the depth list, or (camera zoom ≤ 0.5, Phase 4 §4.10) device-pixel dots grouped by colour,
   * drawn before the objects.
   */
  function collectGuests(world: World, tool: ToolState, alpha: number, lod: boolean): void {
    const s = world.state;
    const map = s.map;
    const guests = s.guests;
    const tint = tool.overlay === 'temperament';
    const w = map.width;
    // Umbrellas open in rain and storms (Phase 3 §4.9); balloons show whenever a guest holds one.
    const weather = s.management.weather.current;
    const wet = weather === 'rain' || weather === 'storm';
    const heights = walkerHeights(world);
    // Phase 6 §4.7: reduced motion turns guest bobbing off (walkers keep the standing frame; W4-F sets the pref).
    const bob = !displayPrefs().reducedMotion;
    for (let gi = 0; gi < guests.length; gi++) {
      const g = guests[gi]!;
      if (g.state === 'riding' || g.tile < 0) continue;
      let fx: number;
      let fy: number;
      let z: number;
      let facing: Dir;
      let walk = 0;
      const sitDir = g.state === 'sitting' ? mgmt.sitter(gi, pos) : -1;
      if (sitDir >= 0) {
        // On a bench (Phase 3): seat position and the sitting pose.
        fx = pos.fx;
        fy = pos.fy;
        z = pos.z;
        facing = sitDir as Dir;
        walk = 3;
      } else if (qStamp[gi] === frameNo) {
        fx = qfx[gi] as number;
        fy = qfy[gi] as number;
        z = qz[gi] as number;
        facing = (qdir[gi] as number) as Dir;
      } else {
        guestPosition(map, g, alpha, pos, heights);
        fx = pos.fx;
        fy = pos.fy;
        z = pos.z;
        if (g.nextTile >= 0 && g.nextTile !== g.tile) {
          facing = dirBetween(w, g.tile, g.nextTile);
          if (bob) walk = 1 + ((Math.floor((g.progress + alpha) / 5) + g.id) & 1);
        } else {
          facing = g.dir;
        }
      }
      const ax = viewPointSX(va, fx, fy);
      const ay = viewPointSY(va, fx, fy, z);
      if (lod) {
        if (ax < view.x0 - 4 || ax > view.x1 + 4 || ay < view.y0 - 2 || ay > view.y1 + 8) continue;
        const colour = tint ? SHIRT_COLOURS.length + tintStep(g.temperament) : mix32(g.id) % SHIRT_COLOURS.length;
        dots.push(devX(ax), devY(ay), colour);
        continue;
      }
      const items = (g.items.balloon ? GUEST_BALLOON : 0) | (wet && g.items.umbrella ? GUEST_UMBRELLA : 0);
      // Cull by the sprite bounds (GUEST_BOUNDS, or GUEST_ITEM_BOUNDS with a balloon or umbrella).
      const mx = items ? 14 : 10;
      if (ax < view.x0 - mx || ax > view.x1 + mx || ay < view.y0 - 6 || ay > view.y1 + (items ? 42 : 24)) continue;
      const m = mix32(g.id);
      const colour = tint ? tintStep(g.temperament) : m % SHIRT_COLOURS.length;
      const fr = guestFrame(colour, walk, (m >>> 8) & 3, tint, items);
      const vf = viewDir(facing, rot);
      list.push(KIND_GUEST, gi, vf | (fr << 2), ax, ay, guestSpriteKey(vf, fr, bucket), viewPointDepth(fx, fy, va), z, Layer.Guest);
    }
  }

  /**
   * Realistic look (spec §5.5 item 2): each ride, stall, path item and scenery item in the draw list gets its soft
   * shadow, drawn after the ground and before every depth-sorted object. A ride cut into columns casts one shadow.
   */
  let shadowStamp = new Uint32Array(64);
  function drawShadows(world: World): void {
    const s = world.state;
    const look = L as RealLook;
    if (shadowStamp.length < s.rides.length) shadowStamp = new Uint32Array(s.rides.length * 2);
    for (let i = 0; i < list.n; i++) {
      const kind = list.kind[i] as number;
      const ref = list.ref[i] as number;
      let sp: Sprite | null | undefined;
      if (kind === KIND_RIDE) {
        if (shadowStamp[ref] === frameNo) continue;
        shadowStamp[ref] = frameNo;
        const r = s.rides[ref]!;
        sp = look.shadow('ride', r.defId, viewSpriteRotation(r.rotation, rot));
      } else if (kind === KIND_STALL) sp = look.shadow('stall', s.stalls[ref]!.defId, (list.sub[i] as number) as Dir);
      else if (kind === KIND_PATH_ITEM) sp = look.shadow('scenery', PATH_ITEM_IDS[(list.sub[i] as number) & 3] as string, rot);
      else {
        layerByKind.get(kind)?.drawShadow?.(ctx as CanvasRenderingContext2D, world, kind, ref, list.sub[i] as number, list.ax[i] as number, list.ay[i] as number, frame);
        continue;
      }
      if (sp) blit(sp, list.ax[i] as number, list.ay[i] as number);
    }
  }

  // ------------------------------------------------------------------ drawing

  function drawList(world: World): void {
    const s = world.state;
    for (let k = 0; k < list.n; k++) {
      const i = sortIndex(list.keys[k] as number);
      const ax = list.ax[i] as number;
      const ay = list.ay[i] as number;
      switch (list.kind[i]) {
        case KIND_GUEST: {
          const sub = list.sub[i] as number;
          const fr = sub >> 2;
          // Realistic guests: shirt colour, walk (3 = sitting) and facing from the frame; the temperament tint stays today's art.
          const sp = import.meta.env.VITE_ART === 'real' && L && !(fr & 256) ? L.guest((s.guests[list.ref[i] as number] as Guest).id, fr & 15, (fr >> 4) & 3, sub & 3, ((fr >> 4) & 3) === 3) : undefined;
          if (sp !== null) blit(sp ?? bank.guest(list.skey[i] as number, (sub & 3) as Dir, fr, bucket), ax, ay);
          break;
        }
        case KIND_RIDE: {
          const ri = list.ref[i] as number;
          const sp = rideSprites[ri];
          if (!sp) break;
          const colL = ax - (rideEy[ri] as number) * HW + (list.sub[i] as number) * HW;
          blitColumn(sp, ax, ay, colL, colL + HW);
          break;
        }
        case KIND_STALL: {
          const st = s.stalls[list.ref[i] as number];
          const sp = import.meta.env.VITE_ART === 'real' && st && L ? L.stall(st.defId, (list.sub[i] as number) as Dir) : undefined;
          if (st && sp !== null) blit(sp ?? bank.stall(st.defId, (list.sub[i] as number) as Dir, 0, bucket), ax, ay);
          break;
        }
        case KIND_FENCE:
          blit(bank.fence((list.sub[i] as number) as Dir, bucket), ax, ay);
          break;
        case KIND_ARCH:
          blit(bank.entrance((list.sub[i] as number) as 0 | 1, outerDir === -1 ? -1 : viewDir(outerDir, rot), bucket), ax, ay);
          break;
        case KIND_STAFF:
        case KIND_PATH_ITEM:
          mgmt.drawEntry(list.kind[i] as number, list.sub[i] as number, ax, ay, list.skey[i] as number);
          break;
        case KIND_TRACK:
          track.drawItem(ctx as CanvasRenderingContext2D, list.ref[i] as number, list.sub[i] as number, L);
          break;
        default: {
          const kind = list.kind[i] as number;
          layerByKind.get(kind)?.drawItem?.(ctx as CanvasRenderingContext2D, world, kind, list.ref[i] as number, list.sub[i] as number, ax, ay, list.skey[i] as number, frame);
          break;
        }
      }
    }
  }

  /** Add map tile `i`'s top face (with slope, as seen in the view) to the current path, in device pixels. */
  function tileFace(map: MapState, i: number, inset: number): void {
    const c = ctx as CanvasRenderingContext2D;
    const w = map.width;
    const x = i % w;
    const y = (i - x) / w;
    const u = viewTileU(va, x, y);
    const v = viewTileV(va, x, y);
    const h = viewCornerHeights(map, i, rot, corners);
    const a = inset;
    const b = 1 - inset;
    c.moveTo(devX((u + a - v - a) * HW), devY((u + a + v + a) * HH - h[0] * STEP_PX));
    c.lineTo(devX((u + b - v - a) * HW), devY((u + b + v + a) * HH - h[1] * STEP_PX));
    c.lineTo(devX((u + b - v - b) * HW), devY((u + b + v + b) * HH - h[2] * STEP_PX));
    c.lineTo(devX((u + a - v - b) * HW), devY((u + a + v + b) * HH - h[3] * STEP_PX));
    c.closePath();
  }

  /** Path a tile's top face (with slope) in device pixels. */
  function tilePath(map: MapState, i: number, inset = 0): void {
    (ctx as CanvasRenderingContext2D).beginPath();
    tileFace(map, i, inset);
  }

  function outlineTiles(map: MapState, tiles: readonly number[], fill: string | null, stroke: string, width: number): void {
    const c = ctx as CanvasRenderingContext2D;
    const n = map.width * map.height;
    for (const t of tiles) {
      if (t < 0 || t >= n) continue;
      tilePath(map, t, 0.02);
      if (fill) {
        c.fillStyle = fill;
        c.fill();
      }
      c.strokeStyle = stroke;
      c.lineWidth = outlineWidth(width);
      c.stroke();
    }
  }

  function dragColours(tool: ToolState): { fill: string; stroke: string } {
    // A path line the build command would refuse (W3-B dry run) shows in the blocked colours.
    if (tool.drag?.reason && (tool.tool === 'footpath' || tool.tool === 'queue')) return { fill: BAD_FILL, stroke: GHOST_INVALID };
    switch (tool.tool) {
      case 'footpath':
        return { fill: 'rgba(220,199,156,0.75)', stroke: '#fff4d6' };
      case 'queue':
        return { fill: 'rgba(169,192,210,0.8)', stroke: '#e8f4ff' };
      case 'demolish':
        return { fill: BAD_FILL_STRONG, stroke: GHOST_INVALID };
      case 'patrol':
        return mgmt.strokeColours(tool);
      default:
        return { fill: 'rgba(255,255,255,0.3)', stroke: '#ffffff' };
    }
  }

  /** Buy Land tool (Phase 4 §7): every visible tile that is not owned land gets its state's tint (one fill per state). */
  function drawOwnershipTints(map: MapState): void {
    const c = ctx as CanvasRenderingContext2D;
    const w = map.width;
    const n = w * map.height;
    for (let state = 0; state < OWNED_TINTS.length; state++) {
      const tint = OWNED_TINTS[state];
      if (!tint) continue;
      let any = false;
      c.beginPath();
      for (let i = 0; i < n; i++) {
        if (map.owned[i] !== state) continue;
        const x = i % w;
        const y = (i - x) / w;
        const ax = viewTileSX(va, x, y);
        const ay = viewTileSY(va, x, y, map.heights[i] as number);
        if (!inView(ax - HW, ay - 8, ax + HW, ay + TILE_H + 8)) continue;
        tileFace(map, i, 0);
        any = true;
      }
      if (!any) continue;
      c.fillStyle = tint;
      c.fill();
    }
  }

  /** Buy Land drag rectangle: tiles that would be bought, and the rest of the rectangle lighter. */
  function drawPurchaseRect(map: MapState, tool: ToolState): void {
    const b = tool.brush;
    if (!b || b.tiles.length === 0) return;
    const c = ctx as CanvasRenderingContext2D;
    const n = map.width * map.height;
    for (const buy of [false, true]) {
      c.beginPath();
      for (const t of b.tiles) {
        if (t < 0 || t >= n) continue;
        const o = map.owned[t];
        const forSale = o === Owned.LandForSale || o === Owned.RightsForSale;
        if (forSale !== buy) continue;
        tileFace(map, t, 0.02);
      }
      c.fillStyle = buy ? (b.valid ? OK_FILL_STRONG : BAD_FILL_STRONG) : 'rgba(255,255,255,0.12)';
      c.fill();
      c.strokeStyle = buy ? (b.valid ? GHOST_VALID : GHOST_INVALID) : 'rgba(255,255,255,0.6)';
      c.lineWidth = outlineWidth(Math.max(1, scale));
      c.stroke();
    }
  }

  function drawGhost(world: World, tool: ToolState): void {
    const g = tool.ghost;
    if (!g) return;
    const map = world.state.map;
    const w = map.width;
    const n = w * map.height;
    if (g.tile < 0 || g.tile >= n) return;
    const x = g.tile % w;
    const y = (g.tile - x) / w;
    const z = map.heights[g.tile] as number;
    const ax = viewTileSX(va, x, y);
    const ay = viewTileSY(va, x, y, z);
    const fill = g.valid ? OK_FILL : BAD_FILL;
    const stroke = g.valid ? GHOST_VALID : GHOST_INVALID;
    const fr = g.valid ? GHOST_FRAME_VALID : GHOST_FRAME_INVALID;
    const c = ctx as CanvasRenderingContext2D;
    // Ghost rotations are map rotations; the sprite turns with the view.
    const vrot = viewSpriteRotation(g.rotation, rot);
    let top = ay - 40;
    if (g.kind === 'ride') {
      const def = getFlatRideDef(g.defId);
      const fw = def?.w ?? 1;
      const fd = def?.d ?? 1;
      const tiles = footprintTiles(map, x, y, fw, fd, g.rotation);
      if (tiles) outlineTiles(map, tiles, fill, stroke, Math.max(1, scale));
      const { ex, ey } = extent(fw, fd, g.rotation);
      footprintViewOrigin(x, y, ex, ey);
      const gx = (footU - footV) * HW;
      const gy = (footU + footV) * HH - z * STEP_PX;
      // Realistic ghost: the item's real sprite once decoded, today's ghost art meanwhile.
      const sp = (import.meta.env.VITE_ART === 'real' && L && L.ride(g.defId, vrot, 0, 0)) || bank.ride(g.defId, fw, fd, vrot, fr, bucket);
      c.globalAlpha = 0.85;
      blit(sp, gx, gy);
      c.globalAlpha = 1;
      top = gy + rideArtBounds(g.defId, fw, fd, vrot).top + 10;
      const eu = rot & 1 ? ey : ex;
      const ev = rot & 1 ? ex : ey;
      drawGhostIcon(c, devX(gx + ((eu - ev) * HW) / 2), devY(top), g.valid, Math.max(8, 12 * Math.min(1.5, scale)));
      return;
    }
    if (g.kind === 'stall') {
      outlineTiles(map, [g.tile], fill, stroke, Math.max(1, scale));
      const service = stallServiceTile(map, x, y, g.rotation);
      if (service >= 0) {
        c.setLineDash([4, 3]);
        outlineTiles(map, [service], null, 'rgba(255,255,255,0.85)', Math.max(1, scale));
        c.setLineDash([]);
      }
      c.globalAlpha = 0.85;
      blit((import.meta.env.VITE_ART === 'real' && L && L.stall(g.defId, vrot)) || bank.stall(g.defId, vrot, fr, bucket), ax, ay);
      c.globalAlpha = 1;
      top = ay + stallArtBounds().top + 4;
      drawGhostIcon(c, devX(ax), devY(top), g.valid, Math.max(8, 12 * Math.min(1.5, scale)));
      return;
    }
    // Other ghosts (path items, track pieces, stations): tile highlight and icon.
    outlineTiles(map, [g.tile], fill, stroke, Math.max(1, scale));
    drawGhostIcon(c, devX(ax), devY(ay - 6), g.valid, Math.max(8, 10 * Math.min(1.5, scale)));
  }

  function drawSelection(world: World, tool: ToolState, alpha: number): void {
    const sel = tool.selectedEntity;
    if (!sel) return;
    const s = world.state;
    const map = s.map;
    const c = ctx as CanvasRenderingContext2D;
    if (sel.kind === 'guest') {
      const gi = findGuestIndex(s.guests, sel.id);
      if (gi < 0) return;
      const g = s.guests[gi]!;
      if (g.state === 'riding') return;
      let fx: number;
      let fy: number;
      let z: number;
      if (qStamp[gi] === frameNo) {
        fx = qfx[gi] as number;
        fy = qfy[gi] as number;
        z = qz[gi] as number;
      } else {
        guestPosition(map, g, alpha, pos, walkerHeights(world));
        fx = pos.fx;
        fy = pos.fy;
        z = pos.z;
      }
      const x = devX(viewPointSX(va, fx, fy));
      const y = devY(viewPointSY(va, fx, fy, z));
      const k = scale;
      c.strokeStyle = '#ffffff';
      c.lineWidth = outlineWidth(Math.max(1.5, 2 * k));
      c.beginPath();
      c.ellipse(x, y, 8 * k, 4 * k, 0, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = '#ffe066';
      c.beginPath();
      c.moveTo(x, y - 22 * k);
      c.lineTo(x - 4 * k, y - 28 * k);
      c.lineTo(x + 4 * k, y - 28 * k);
      c.closePath();
      c.fill();
      return;
    }
    if (sel.kind === 'ride') {
      const r = s.rides.find((q) => q.id === sel.id);
      if (!r) return;
      if (r.kind === 'track') {
        // Station, track, and gate tiles (elevated pieces outline the ground under them).
        const tiles = trackRideTiles(world, r);
        if (tiles.length > 0) outlineTiles(map, tiles, 'rgba(255,255,255,0.12)', '#ffffff', Math.max(1, 1.5 * scale));
        // R7 (owner 2026-11-12): the trouble piece of the last test (stall or safety limit) in the blocked colours,
        // with the cross icon so the place is not shown by colour alone.
        const trouble = trackTroubleTiles(world, r);
        if (trouble.length > 0) {
          outlineTiles(map, trouble, BAD_FILL, GHOST_INVALID, Math.max(1.5, 2 * scale));
          const t0 = trouble[0] as number;
          const tx = t0 % map.width;
          const ty = (t0 - tx) / map.width;
          drawGhostIcon(c, devX(viewTileSX(va, tx, ty)), devY(viewTileSY(va, tx, ty, map.heights[t0] as number) - 6), false, Math.max(8, 10 * Math.min(1.5, scale)));
        }
        return;
      }
      const def = getFlatRideDef(r.defId);
      const tiles = footprintTiles(map, r.x, r.y, def?.w ?? 1, def?.d ?? 1, r.rotation);
      if (tiles) outlineTiles(map, tiles, 'rgba(255,255,255,0.12)', '#ffffff', Math.max(1, 1.5 * scale));
      return;
    }
    if (sel.kind === 'stall') {
      const st = s.stalls.find((q) => q.id === sel.id);
      if (st) outlineTiles(map, [st.y * map.width + st.x], 'rgba(255,255,255,0.12)', '#ffffff', Math.max(1, 1.5 * scale));
    }
  }

  const single: number[] = [0];

  function drawOverlays(world: World, tool: ToolState, alpha: number): void {
    const map = world.state.map;
    mgmt.drawOverlays(ctx as CanvasRenderingContext2D, world, tool, alpha);
    if (tool.drag && tool.drag.tiles.length > 0) {
      const col = dragColours(tool);
      outlineTiles(map, tool.drag.tiles, col.fill, col.stroke, Math.max(1, scale));
    }
    if (tool.tool === 'buyLand') drawPurchaseRect(map, tool);
    drawSelection(world, tool, alpha);
    if (tool.selectedTile !== null) {
      single[0] = tool.selectedTile;
      outlineTiles(map, single, null, '#ffffff', Math.max(1.5, 2 * scale));
    }
    if (tool.hoverTile !== null && !tool.ghost && !(tool.tool === 'buyLand' && tool.brush)) {
      single[0] = tool.hoverTile;
      if (tool.tool === 'demolish') outlineTiles(map, single, BAD_FILL, GHOST_INVALID, Math.max(1, 1.5 * scale));
      else outlineTiles(map, single, 'rgba(255,224,102,0.22)', '#ffe066', Math.max(1, 1.5 * scale));
    }
    drawGhost(world, tool);
    track.drawOverlay(ctx as CanvasRenderingContext2D, world, tool);
    for (const l of layers) l.drawOverlay?.(ctx as CanvasRenderingContext2D, world, tool, frame);
  }

  function drawDebug(world: World, drawn: number): void {
    const c = ctx as CanvasRenderingContext2D;
    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(cssW - 230, 52, 220, 84);
    c.fillStyle = '#e8f4ff';
    c.font = '12px ui-monospace, monospace';
    c.fillText(`fps ${fpsAvg.toFixed(0)}  draw ${msAvg.toFixed(2)} ms`, cssW - 220, 70);
    c.fillText(`objects ${list.n}  chunks ${drawn}  view ${rot}  static ${staticReuses}`, cssW - 220, 88);
    c.fillText(`guests ${world.state.guests.length}  sprites ${bank.cache.size}`, cssW - 220, 106);
    c.fillText(`mem chunks ${Math.round((terrain.pixels * 4) / 1048576)} MB  sprites ${Math.round((bank.cache.pixels * 4) / 1048576)} MB`, cssW - 220, 124);
    c.restore();
  }

  // ---- Phase 6 §4.6: render plan (device class, render quality) and the static terrain layer.
  let rawDpr = 1;
  let planVersion = -1;
  let lodZoom = GUEST_LOD_ZOOM;
  const device = browserDeviceEnv();
  /** `auto` quality steps the render scale down when frames stay too slow (`../perf/quality.ts`). */
  const autoScale = new AutoScale(BUDGET_DESKTOP_FRAME_P95_MS);
  let lastDrawAt = -1;

  /** Pixel ratio, zoom buckets, guest LOD zoom, and the shared sprite memory budget from the device and quality. */
  function applyPlan(): void {
    if (planVersion !== renderQualityVersion()) autoScale.reset();
    planVersion = renderQualityVersion();
    const cls = deviceClass(device, cssW, cssH);
    autoScale.budgetMs = cls === 'phone' ? BUDGET_PHONE_FRAME_P95_MS : BUDGET_DESKTOP_FRAME_P95_MS;
    const plan = renderPlan(renderQuality(), cls, rawDpr, autoScale.maxRatio);
    dpr = plan.pixelRatio;
    lodZoom = plan.guestLodZoom;
    terrain.allowExact = plan.zoomBuckets > ZOOM_BUCKETS.length;
    prefetchTurns = plan.device === 'desktop' && renderQuality() !== 'low';
    coarseRides = plan.coarseRideFrames;
    spriteMemory.budgetBytes = plan.budgetBytes;
    // Phone-sized screens keep the smaller chunk cap as well (Phase 4 §4.10, §11).
    terrain.budgetPixels = chunkCacheBudgetPixels(cssW, cssH);
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    canvas.dataset.pixelRatio = String(dpr);
    canvas.dataset.device = plan.device;
    canvas.dataset.autoScale = autoScale.maxRatio === Infinity ? 'full' : String(autoScale.maxRatio);
  }

  /** Feed the frame interval to the `auto` step down; re-plan when it steps. */
  function autoFrame(): void {
    if (renderQuality() !== 'auto' || typeof performance === 'undefined') {
      lastDrawAt = -1;
      return;
    }
    const now = performance.now();
    if (lastDrawAt >= 0 && autoScale.frame(now - lastDrawAt)) applyPlan();
    lastDrawAt = now;
  }

  /**
   * Static layer (Phase 6 §4.6 work order step 4): the sky and the terrain chunks composited into one canvas-sized
   * image. While the view (camera centre, zoom × pixel ratio, rotation, canvas size) and the terrain (tracker
   * version, map) stay the same, a frame copies that image 1:1 instead of drawing every visible chunk (on a
   * software-rastered canvas a chunk costs in proportion to its whole image, not to the part on screen). The image
   * is built on the second frame of a still view and only kept when every chunk drew its final image. It lives in a
   * sprite cache, so it counts toward the shared sprite memory and can be evicted while the camera moves.
   */
  const statics = new SpriteCache(Number.MAX_SAFE_INTEGER, spriteMemory, 'static');
  const STATIC_KEY = 0;
  let staticImage: { canvas: AnyCanvas; ctx: Ctx } | null = null;
  let staticValid = false;
  /** Frames drawn from the static layer (tests and the debug overlay). */
  let staticReuses = 0;
  interface ViewKey {
    cx: number;
    cy: number;
    scale: number;
    rot: number;
    w: number;
    h: number;
    version: number;
    map: MapState | null;
  }
  const staticKey: ViewKey = { cx: NaN, cy: NaN, scale: NaN, rot: -1, w: 0, h: 0, version: -1, map: null };
  const lastKey: ViewKey = { cx: NaN, cy: NaN, scale: NaN, rot: -1, w: 0, h: 0, version: -1, map: null };
  const sameView = (k: ViewKey, cam: Camera, map: MapState): boolean =>
    k.cx === cam.centerX && k.cy === cam.centerY && k.scale === scale && k.rot === rot && k.w === canvas.width && k.h === canvas.height && k.version === terrain.tracker.version && k.map === map;
  const setKey = (k: ViewKey, cam: Camera, map: MapState): void => {
    k.cx = cam.centerX;
    k.cy = cam.centerY;
    k.scale = scale;
    k.rot = rot;
    k.w = canvas.width;
    k.h = canvas.height;
    k.version = terrain.tracker.version;
    k.map = map;
  };

  /** Desktops (memory to spare) build the chunks of the neighbouring view rotations on idle frames. */
  let prefetchTurns = false;
  const turned: Camera = { centerX: 0, centerY: 0, zoom: 1, rotation: 0 };
  const turnedView: ViewRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  function prefetchTurn(cam: Camera, map: MapState, env: TerrainEnv): void {
    for (const dir of [1, -1] as const) {
      turned.centerX = cam.centerX;
      turned.centerY = cam.centerY;
      turned.zoom = cam.zoom;
      turned.rotation = cam.rotation;
      rotateCameraView(turned, map, dir);
      turnedView.x0 = turned.centerX - cssW / 2 / cam.zoom;
      turnedView.x1 = turned.centerX + cssW / 2 / cam.zoom;
      turnedView.y0 = turned.centerY - cssH / 2 / cam.zoom;
      turnedView.y1 = turned.centerY + cssH / 2 / cam.zoom;
      if (terrain.prefetch(map, env, turnedView, bucket, (turned.rotation & 3) as ViewRotation)) return;
    }
  }

  /** Sky and terrain: from the static layer when nothing changed, else drawn (and kept when the view is still). */
  function drawStatic(world: World, cam: Camera, map: MapState): number {
    const env = { seed: world.state.seed, rides: world.state.rides, stalls: world.state.stalls };
    const c = ctx as CanvasRenderingContext2D;
    // A new frame for the layer's cache first: the image used below stays protected from eviction all frame.
    statics.beginFrame();
    if (staticImage && !statics.peek(STATIC_KEY)) {
      // Evicted under memory pressure while unused.
      staticImage = null;
      staticValid = false;
    }
    let chunks = 0;
    if (staticValid && staticImage && sameView(staticKey, cam, map) && statics.get(STATIC_KEY)) {
      c.drawImage(staticImage.canvas, 0, 0);
      // The chunks on screen stay cached for the next pan.
      terrain.touch(view, bucket, rot);
      // Idle frame on a desktop: build ahead for a view turn either way.
      if (prefetchTurns && spriteMemory.bytes < spriteMemory.budgetBytes * PREFETCH_HEADROOM) prefetchTurn(cam, map, env);
      staticReuses++;
    } else if (sameView(lastKey, cam, map)) {
      // A still view: compose the static layer, then copy it.
      const w = canvas.width;
      const h = canvas.height;
      if (!staticImage || staticImage.canvas.width !== w || staticImage.canvas.height !== h) {
        statics.delete(STATIC_KEY);
        staticImage = makeCanvas(w, h, true);
      }
      const sc = staticImage.ctx as unknown as CanvasRenderingContext2D;
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.globalAlpha = 1;
      sc.imageSmoothingEnabled = true;
      sc.fillStyle = SKY;
      sc.fillRect(0, 0, w, h);
      chunks = terrain.draw(sc, map, env, view, bucket, scale, offX, offY, rot);
      ground?.draw(sc, map, view, scale, offX, offY, rot, terrain.tracker.version);
      staticValid = terrain.complete && (!ground || ground.complete);
      setKey(staticKey, cam, map);
      statics.set(STATIC_KEY, { image: staticImage.canvas, w, h, ox: 0, oy: 0, scale: 1 });
      c.drawImage(staticImage.canvas, 0, 0);
    } else {
      // The view moves: draw the chunks straight to the canvas.
      staticValid = false;
      c.fillStyle = SKY;
      c.fillRect(0, 0, canvas.width, canvas.height);
      chunks = terrain.draw(c, map, env, view, bucket, scale, offX, offY, rot);
      ground?.draw(c, map, view, scale, offX, offY, rot, terrain.tracker.version);
    }
    setKey(lastKey, cam, map);
    return chunks;
  }

  return {
    resize(w, h, d) {
      cssW = Math.max(1, w);
      cssH = Math.max(1, h);
      rawDpr = d;
      autoScale.reset();
      applyPlan();
    },

    draw(world: World, cam: Camera, tool: ToolState, alpha: number) {
      perfProbe.renderStart();
      syncDrawCounter();
      spriteMemory.beginFrame();
      if (planVersion !== renderQualityVersion()) applyPlan();
      autoFrame();
      const t0 = debug && typeof performance !== 'undefined' ? performance.now() : 0;
      const s = world.state;
      const map = s.map;
      frameNo = (frameNo + 1) >>> 0 || 1;
      rot = (cam.rotation & 3) as ViewRotation;
      viewAffine(rot, map.width, map.height, va);
      clampCameraToMap(cam, map);
      scale = cam.zoom * dpr;
      bucket = zoomBucket(scale);
      offX = canvas.width / 2 - cam.centerX * scale;
      offY = canvas.height / 2 - cam.centerY * scale;
      view.x0 = cam.centerX - cssW / 2 / cam.zoom;
      view.x1 = cam.centerX + cssW / 2 / cam.zoom;
      view.y0 = cam.centerY - cssH / 2 / cam.zoom;
      view.y1 = cam.centerY + cssH / 2 / cam.zoom;
      const lod = cam.zoom <= lodZoom;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;

      frame.scale = scale;
      frame.offX = offX;
      frame.offY = offY;
      frame.dpr = dpr;
      frame.bucket = bucket;
      frame.view = view;
      frame.rotation = rot;
      frame.alpha = alpha;
      frame.width = canvas.width;
      frame.height = canvas.height;

      if (import.meta.env.VITE_ART === 'real' && L) {
        real.sets?.beginFrame(frameNo);
        L.prepare(world, rot, view, cam.zoom, dpr);
      }

      // Sky and terrain (the static layer when nothing changed).
      terrain.sync(map);
      const chunks = drawStatic(world, cam, map);
      mgmt.begin(scale, offX, offY, dpr, bucket, view, va);
      mgmt.drawGround(world);
      for (const l of layers) l.drawGround?.(ctx, world, tool, frame);
      if (tool.tool === 'buyLand') drawOwnershipTints(map);

      // Objects.
      if (fenceVersion !== terrain.tracker.version) {
        fence = fenceSegments(map, fence);
        outerDir = entranceOuterDir(map);
        fenceVersion = terrain.tracker.version;
      }
      bank.beginFrame();
      ensureGuestScratch(s.guests.length);
      list.n = 0;
      dots.n = 0;
      collectFence(map);
      collectEntrance(map);
      collectRides(world);
      collectStalls(world);
      track.collect(world, list, view, bucket, scale, offX, offY, alpha, rot);
      placeQueues(world);
      mgmt.collect(world, alpha, list);
      for (const l of layers) l.collect?.(world, list, tool, frame);
      collectGuests(world, tool, alpha, lod);
      if (import.meta.env.VITE_ART === 'real' && L) drawShadows(world);
      // Far zoom: guests are dots under the objects (rides and fences in front still cover them).
      if (lod) dots.draw(ctx, Math.max(1, Math.round(GUEST_LOD_W * dpr)), Math.max(1, Math.round(GUEST_LOD_H * dpr)));
      list.sort();
      drawList(world);
      if (import.meta.env.VITE_ART === 'real' && L && (L.incomplete() > 0 || (ground && !ground.complete))) perfProbe.countIncomplete();
      mgmt.drawWeather(ctx, world, canvas.width, canvas.height, alpha);
      for (const l of layers) l.drawAfterObjects?.(ctx, world, tool, frame);

      drawOverlays(world, tool, alpha);
      bank.cache.trim();

      const zoomStr = cam.zoom.toFixed(3);
      const camXStr = cam.centerX.toFixed(1);
      if (zoomStr !== lastZoom) {
        canvas.dataset.zoom = zoomStr;
        lastZoom = zoomStr;
      }
      if (camXStr !== lastCamX) {
        canvas.dataset.cameraX = camXStr;
        lastCamX = camXStr;
      }
      if (rot !== lastRot) {
        canvas.dataset.rotation = String(rot);
        lastRot = rot;
      }

      if (t0) {
        const t1 = performance.now();
        msAvg = msAvg * 0.9 + (t1 - t0) * 0.1;
        if (lastFrameAt) {
          const dt = t1 - lastFrameAt;
          if (dt > 0) fpsAvg = fpsAvg * 0.9 + (1000 / dt) * 0.1;
        }
        lastFrameAt = t1;
      }
      if (debug) drawDebug(world, chunks);
      if (import.meta.env.VITE_ART === 'real' && L) real.sets?.endFrame();
      perfProbe.renderEnd();
    },
  };
}

// ------------------------------------------------------------------ previews

/**
 * Sprite preview for UI pickers: the real sprite of `defId` (flat ride or stall; anything else gets
 * the generic fallback), fitted into a w × h box in the context's current coordinate space.
 */
export function drawPreview(ctx: CanvasRenderingContext2D, defId: string, w: number, h: number): void {
  const ride = getFlatRideDef(defId);
  const stall = ride ? undefined : getStallDef(defId);
  let fw = 1;
  let fd = 1;
  let bounds: ArtBounds;
  if (ride) {
    fw = ride.w;
    fd = ride.d;
    bounds = rideArtBounds(defId, fw, fd, 0);
  } else if (stall) {
    bounds = stallArtBounds();
  } else {
    fw = 2;
    fd = 2;
    bounds = rideArtBounds(defId, fw, fd, 0);
  }
  const pad = Math.min(w, h) * 0.06;
  const bw = bounds.right - bounds.left;
  const bh = bounds.bottom - bounds.top;
  const k = Math.max(0.01, Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh));
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.translate((w - bw * k) / 2 - bounds.left * k, (h - bh * k) / 2 - bounds.top * k);
  ctx.scale(k, k);
  // Ground under the footprint.
  for (let y = 0; y < (stall ? 1 : fd); y++) {
    for (let x = 0; x < (stall ? 1 : fw); x++) {
      ctx.beginPath();
      ctx.moveTo((x - y) * HW, (x + y) * HH);
      ctx.lineTo((x - y) * HW + HW, (x + y) * HH + HH);
      ctx.lineTo((x - y) * HW, (x + y) * HH + TILE_H);
      ctx.lineTo((x - y) * HW - HW, (x + y) * HH + HH);
      ctx.closePath();
      ctx.fillStyle = grassShade(0, x, y) ? '#64b049' : '#6dbb4f';
      ctx.fill();
    }
  }
  if (stall) drawStallArt(ctx, defId, 2);
  else drawRideArt(ctx, defId, fw, fd, { rotation: 0, angle: 0, swing: 0, occupancy: 0 });
  ctx.restore();
}
