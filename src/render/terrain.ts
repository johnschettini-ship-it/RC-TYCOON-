/**
 * Terrain chunk cache (Phase 0 §4.8, Phase 4 §4.8 and §4.10): static tiles (ground, cliffs, water, paths, queues)
 * pre-drawn into chunk images per zoom bucket (0.5, 1, 2) and view rotation. Owner: W1-A, W3-G, W4-E.
 * A chunk is a block of `CHUNK_SIZE` × `CHUNK_SIZE` map tiles (8 since Phase 6 §4.6: a 16 × 16 image was 9 MB at
 * the phone zoom bucket and took 100+ ms to build on the throttled phone, see `docs/adr/0001-renderer.md`); with a
 * view rotation it is painted in view space (view corners, cliff faces toward the viewer, path joins turned by r).
 * Images are keyed by (chunk, rotation, bucket) in an LRU with a memory cap (`CHUNK_CACHE_MB`, 32 MB on phones)
 * that also counts toward the shared sprite memory: after a rotation the visible chunks are built within a frame
 * budget (placeholders until then), the rest when they come into view, and the old rotation's images age out.
 */
import { Content, Terrain, type MapState } from '../sim/map';
import type { Ride } from '../sim/rides/types';
import type { Stall } from '../sim/stalls/types';
import { bucketIndex, SpriteCache, spriteMemory, type Sprite } from './spriteCache';
import type { ZoomBucket } from './camera';
import { isPhoneScreen, makeCanvas } from './canvas';
import { STEP_PX } from './iso';
import { JOIN_E, JOIN_N, JOIN_S, JOIN_W, pathJoinMask } from './paths';
import { mapToView, rotateSlopeMask, viewCornerHeights, viewSize, viewToMap, type ViewRotation } from './view';
import { mix32, shade } from './palette';
import { CHUNK_SIZE, TerrainTracker } from './terrainTracker';
import type { Ctx } from './sprites/shapes';

const HW = 32;
const HH = 16;

/** Two seeded shades per terrain type: [owned a, owned b]. Land outside the park is darker. */
const TERRAIN_SHADES: Readonly<Record<number, readonly [string, string]>> = {
  [Terrain.Grass]: ['#6dbb4f', '#64b049'],
  [Terrain.Sand]: ['#e3cf8f', '#dac584'],
  [Terrain.Dirt]: ['#a87d4f', '#9e7449'],
  [Terrain.Rock]: ['#a09f98', '#96958e'],
  [Terrain.Snow]: ['#f2f6fa', '#e6edf3'],
};
const OUTSIDE_FACTOR = 0.78;
const CLIFF_LEFT = '#9a7148';
const CLIFF_RIGHT = '#7b5835';

const PATH = { fill: '#dcc79c', edge: '#a88e5f', light: '#e8d7b2' };
const QUEUE = { fill: '#a9c0d2', edge: '#6a8396', post: '#56636f', rope: '#e8503a' };

export interface TerrainEnv {
  seed: number;
  rides: readonly Ride[];
  stalls: readonly Stall[];
}

/** Deterministic shade choice for tile (x, y). */
export function grassShade(seed: number, x: number, y: number): 0 | 1 {
  return (mix32((x * 73856093) ^ (y * 19349663) ^ seed) & 1) as 0 | 1;
}

// ------------------------------------------------------------------ tile painting

/** Painter for one tile; world-pixel coordinates (the chunk transform maps them into the image). */
class TilePainter {
  // Corner heights in px of the tile being painted: N, E, S, W.
  private hN = 0;
  private hE = 0;
  private hS = 0;
  private hW = 0;
  private x = 0;
  private y = 0;

  constructor(
    private ctx: Ctx,
    private expand: number,
  ) {}

  setTile(x: number, y: number, c: readonly [number, number, number, number]): void {
    this.x = x;
    this.y = y;
    this.hN = c[0] * STEP_PX;
    this.hE = c[1] * STEP_PX;
    this.hS = c[2] * STEP_PX;
    this.hW = c[3] * STEP_PX;
  }

  /** Height (px) at local (u, v) on the tile surface: bilinear over the 4 corners. */
  h(u: number, v: number): number {
    return (1 - u) * (1 - v) * this.hN + u * (1 - v) * this.hE + u * v * this.hS + (1 - u) * v * this.hW;
  }

  X(u: number, v: number): number {
    return (this.x + u - this.y - v) * HW;
  }

  Y(u: number, v: number): number {
    return (this.x + u + this.y + v) * HH - this.h(u, v);
  }

  /** Quad in local tile coordinates on the surface, lifted by `lift` px. */
  quad(u0: number, v0: number, u1: number, v1: number, fill: string, lift = 0): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(this.X(u0, v0), this.Y(u0, v0) - lift);
    c.lineTo(this.X(u1, v0), this.Y(u1, v0) - lift);
    c.lineTo(this.X(u1, v1), this.Y(u1, v1) - lift);
    c.lineTo(this.X(u0, v1), this.Y(u0, v1) - lift);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  }

  /** Top face, grown by a hair so neighbouring tiles overlap and no seams show. */
  top(fill: string): void {
    const c = this.ctx;
    const e = this.expand;
    c.beginPath();
    c.moveTo(this.X(0, 0), this.Y(0, 0) - e);
    c.lineTo(this.X(1, 0) + 2 * e, this.Y(1, 0));
    c.lineTo(this.X(1, 1), this.Y(1, 1) + e);
    c.lineTo(this.X(0, 1) - 2 * e, this.Y(0, 1));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  }

  /** Vertical face on the +x edge (front right) down to heights (px) nN at (1, 0) and nW at (1, 1). */
  faceE(bottomN: number, bottomW: number, fill: string): void {
    const c = this.ctx;
    const x0 = this.X(1, 0);
    const x1 = this.X(1, 1);
    const base0 = (this.x + 1 + this.y) * HH;
    const base1 = (this.x + 1 + this.y + 1) * HH;
    c.beginPath();
    c.moveTo(x0, base0 - this.hE);
    c.lineTo(x1, base1 - this.hS);
    c.lineTo(x1, base1 - bottomW);
    c.lineTo(x0, base0 - bottomN);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  }

  /** Vertical face on the +y edge (front left) down to heights (px) at (0, 1) and (1, 1). */
  faceS(bottomW: number, bottomS: number, fill: string): void {
    const c = this.ctx;
    const x0 = this.X(0, 1);
    const x1 = this.X(1, 1);
    const base0 = (this.x + this.y + 1) * HH;
    const base1 = (this.x + 1 + this.y + 1) * HH;
    c.beginPath();
    c.moveTo(x0, base0 - this.hW);
    c.lineTo(x1, base1 - this.hS);
    c.lineTo(x1, base1 - bottomS);
    c.lineTo(x0, base0 - bottomW);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  }

  line(u0: number, v0: number, u1: number, v1: number, lift0: number, lift1: number, colour: string, width: number): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(this.X(u0, v0), this.Y(u0, v0) - lift0);
    c.lineTo(this.X(u1, v1), this.Y(u1, v1) - lift1);
    c.strokeStyle = colour;
    c.lineWidth = width;
    c.lineCap = 'round';
    c.stroke();
  }
}

const M = 0.16; // path margin on sides without a join
const B = 0.055; // border width

/**
 * Path surface with auto-joined arms. `diag` bits fill the corner squares between two joined arms
 * when the diagonal tile is also a path (NE = 1, SE = 2, SW = 4, NW = 8) so plazas are solid.
 */
function paintPathShape(p: TilePainter, mask: number, diag: number, fill: string, edge: string): void {
  for (const [inset, colour] of [
    [0, edge],
    [B, fill],
  ] as const) {
    const a = M + inset;
    const b = 1 - M - inset;
    p.quad(a, a, b, b, colour);
    if (mask & JOIN_N) p.quad(a, 0, b, a, colour);
    if (mask & JOIN_S) p.quad(a, b, b, 1, colour);
    if (mask & JOIN_W) p.quad(0, a, a, b, colour);
    if (mask & JOIN_E) p.quad(b, a, 1, b, colour);
    if (diag & 1) p.quad(b, 0, 1, a, colour);
    if (diag & 2) p.quad(b, b, 1, 1, colour);
    if (diag & 4) p.quad(0, b, a, 1, colour);
    if (diag & 8) p.quad(0, 0, a, a, colour);
  }
}

function isFootLike(c: number | undefined): boolean {
  return c === Content.Footpath || c === Content.ParkEntrance;
}

function diagMask(map: MapState, x: number, y: number, mask: number): number {
  const w = map.width;
  const at = (dx: number, dy: number): number | undefined => {
    const nx = x + dx;
    const ny = y + dy;
    return nx < 0 || ny < 0 || nx >= w || ny >= map.height ? undefined : map.content[ny * w + nx];
  };
  let d = 0;
  if (mask & JOIN_N && mask & JOIN_E && isFootLike(at(1, -1))) d |= 1;
  if (mask & JOIN_S && mask & JOIN_E && isFootLike(at(1, 1))) d |= 2;
  if (mask & JOIN_S && mask & JOIN_W && isFootLike(at(-1, 1))) d |= 4;
  if (mask & JOIN_N && mask & JOIN_W && isFootLike(at(-1, -1))) d |= 8;
  return d;
}

function paintQueueRails(p: TilePainter, mask: number): void {
  const a = M;
  const b = 1 - M;
  const H = 8;
  const sides: Array<[number, number, number, number, number]> = [
    [JOIN_N, a, a, b, a],
    [JOIN_E, b, a, b, b],
    [JOIN_S, a, b, b, b],
    [JOIN_W, a, a, a, b],
  ];
  for (const [bit, u0, v0, u1, v1] of sides) {
    if (mask & bit) continue;
    p.line(u0, v0, u1, v1, H - 1, H - 1, QUEUE.rope, 1.6);
  }
  // Posts at the corners of the queue lane where a rail meets.
  const posts: Array<[number, number, number]> = [
    [a, a, JOIN_N | JOIN_W],
    [b, a, JOIN_N | JOIN_E],
    [b, b, JOIN_S | JOIN_E],
    [a, b, JOIN_S | JOIN_W],
  ];
  for (const [u, v, bits] of posts) {
    if ((mask & bits) === bits) continue;
    p.line(u, v, u, v, 0, H + 1, QUEUE.post, 1.8);
  }
}

function paintEntrancePlaza(p: TilePainter): void {
  // A warm/cool inlay: Thrill and Chill meet at the gate.
  p.quad(0.3, 0.3, 0.5, 0.7, '#f39a5a');
  p.quad(0.5, 0.3, 0.7, 0.7, '#7cc3e6');
}

/** Scratch corner records for tile painting (no allocation per tile). */
const vc: [number, number, number, number] = [0, 0, 0, 0];
const nc: [number, number, number, number] = [0, 0, 0, 0];

/** Map tile index under view tile (u, v). */
function mapIndexAt(map: MapState, u: number, v: number, r: ViewRotation): number {
  if (r === 0) return v * map.width + u;
  const m = viewToMap(u, v, r, map.width, map.height);
  return m.y * map.width + m.x;
}

/**
 * Paint view tile (u, v) in world-pixel coordinates (view space, Phase 4 §4.8). The map tile under it comes from the
 * inverse table; corner heights, cliff faces, and path joins are turned into the view. Rotation 0 is the Build 1 look.
 */
function paintTile(p: TilePainter, map: MapState, u: number, v: number, r: ViewRotation, env: TerrainEnv): void {
  const w = map.width;
  const vs = viewSize(map, r);
  const i = mapIndexAt(map, u, v, r);
  const x = i % w;
  const y = (i - x) / w;
  const c = viewCornerHeights(map, i, r, vc);
  p.setTile(u, v, c);
  const owned = map.owned[i] === 1;
  // Cliff and edge faces toward the viewer (+u and +v in the view), down to the neighbour or to height 0 at the
  // map edge.
  const hE = c[1] * STEP_PX;
  const hS = c[2] * STEP_PX;
  const hW = c[3] * STEP_PX;
  let nN = 0;
  let nW = 0;
  if (u + 1 < vs.w) {
    const n = viewCornerHeights(map, mapIndexAt(map, u + 1, v, r), r, nc);
    nN = n[0] * STEP_PX;
    nW = n[3] * STEP_PX;
  }
  if (hE > nN || hS > nW) p.faceE(Math.min(nN, hE), Math.min(nW, hS), CLIFF_RIGHT);
  let sN = 0;
  let sE = 0;
  if (v + 1 < vs.h) {
    const n = viewCornerHeights(map, mapIndexAt(map, u, v + 1, r), r, nc);
    sN = n[0] * STEP_PX;
    sE = n[1] * STEP_PX;
  }
  if (hW > sN || hS > sE) p.faceS(Math.min(sN, hW), Math.min(sE, hS), CLIFF_LEFT);

  // Ground. Shades and tufts follow the map tile, so they turn with it.
  const shades = TERRAIN_SHADES[map.terrain[i] as number] ?? TERRAIN_SHADES[Terrain.Grass]!;
  let base = shades[grassShade(env.seed, x, y)];
  const dzdx = (c[1] + c[2] - c[0] - c[3]) / 2;
  const dzdy = (c[2] + c[3] - c[0] - c[1]) / 2;
  const light = (owned ? 1 : OUTSIDE_FACTOR) * (1 + 0.12 * dzdx - 0.06 * dzdy);
  if (light !== 1) base = shade(base, light);
  p.top(base);
  // Grass tufts on some tiles (deterministic).
  const content = map.content[i];
  if (content === Content.Empty && map.terrain[i] === Terrain.Grass) {
    const h = mix32(i * 2654435761 + env.seed);
    if ((h & 7) === 0) {
      const tuft = shade(base, 0.8);
      for (let k = 0; k < 3; k++) {
        const tu = 0.25 + (((h >>> (4 + k * 4)) & 15) / 15) * 0.5;
        const tv = 0.25 + (((h >>> (16 + k * 4)) & 15) / 15) * 0.5;
        p.line(tu - 0.04, tv, tu, tv - 0.02, 0, 3, tuft, 1.2);
        p.line(tu + 0.04, tv, tu, tv - 0.02, 0, 3, tuft, 1.2);
      }
    }
  }

  // Water surface (Phase 4).
  const water = map.water[i] as number;
  if (water > (map.heights[i] as number)) {
    const lift = (water - (map.heights[i] as number)) * STEP_PX;
    p.quad(0, 0, 1, 1, 'rgba(63,143,214,0.8)', lift);
  }

  // Paths, queues, entrance plaza. Join masks are found in map directions, then turned into the view.
  if (content === Content.Footpath || content === Content.ParkEntrance) {
    const mask = pathJoinMask(map, i, env.rides, env.stalls);
    paintPathShape(p, rotateSlopeMask(mask, r), rotateSlopeMask(diagMask(map, x, y, mask), r), PATH.fill, PATH.edge);
    if (content === Content.ParkEntrance) paintEntrancePlaza(p);
  } else if (content === Content.Queue) {
    const mask = rotateSlopeMask(pathJoinMask(map, i, env.rides, env.stalls), r);
    paintPathShape(p, mask, 0, QUEUE.fill, QUEUE.edge);
    paintQueueRails(p, mask);
  }
  // Track tiles keep plain grass: the track layer (src/render/track) draws rails, supports, and footings.
}

// ------------------------------------------------------------------ chunk layer

export interface ViewRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface ChunkGeom {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** View-space tile rectangle [u0, u1) × [v0, v1) of map chunk (cx, cy). */
export function chunkViewRect(map: Pick<MapState, 'width' | 'height'>, cx: number, cy: number, r: ViewRotation = 0): { u0: number; v0: number; u1: number; v1: number } {
  const x0 = cx * CHUNK_SIZE;
  const y0 = cy * CHUNK_SIZE;
  const x1 = Math.min(map.width, x0 + CHUNK_SIZE);
  const y1 = Math.min(map.height, y0 + CHUNK_SIZE);
  const a = mapToView(x0, y0, r, map.width, map.height);
  const b = mapToView(x1 - 1, y1 - 1, r, map.width, map.height);
  return { u0: Math.min(a.u, b.u), v0: Math.min(a.v, b.v), u1: Math.max(a.u, b.u) + 1, v1: Math.max(a.v, b.v) + 1 };
}

/**
 * World-pixel bounds of map chunk (cx, cy) as seen with view rotation `r`, including cliff faces, queue rails, and
 * the chunk's height range (Phase 4 §4.10). Faces reach down to the lowest neighbour, or to height 0 at the map
 * edge in front of the viewer.
 */
export function chunkBounds(map: MapState, cx: number, cy: number, r: ViewRotation = 0): ChunkGeom {
  const x0 = cx * CHUNK_SIZE;
  const y0 = cy * CHUNK_SIZE;
  const x1 = Math.min(map.width, x0 + CHUNK_SIZE);
  const y1 = Math.min(map.height, y0 + CHUNK_SIZE);
  let zTop = 0;
  let zBot = Infinity;
  const w = map.width;
  const hs = map.heights;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      const h = hs[i] as number;
      const top = Math.max(h + ((map.slope[i] as number) ? 1 : 0), map.water[i] as number);
      if (top > zTop) zTop = top;
      if (h < zBot) zBot = h;
      // Any neighbour may be the one in front in some view.
      if (x + 1 < w) zBot = Math.min(zBot, hs[i + 1] as number);
      if (y + 1 < map.height) zBot = Math.min(zBot, hs[i + w] as number);
      if (x > 0) zBot = Math.min(zBot, hs[i - 1] as number);
      if (y > 0) zBot = Math.min(zBot, hs[i - w] as number);
    }
  }
  const vr = chunkViewRect(map, cx, cy, r);
  const vs = viewSize(map, r);
  if (vr.u1 === vs.w || vr.v1 === vs.h) zBot = 0;
  if (zBot === Infinity) zBot = 0;
  return {
    left: (vr.u0 - vr.v1) * HW,
    right: (vr.u1 - vr.v0) * HW,
    top: (vr.u0 + vr.v0) * HH - (zTop + 2) * STEP_PX,
    bottom: (vr.u1 + vr.v1) * HH - zBot * STEP_PX,
  };
}

const CHUNK_PAD = 2;
/** Chunks built per frame when an image at another bucket can stand in. */
const MAX_REFINES_PER_FRAME = 1;
/**
 * Chunks with no image at all in this view rotation (a view turn, a jump across the map) are built while the frame
 * has spent less than this on them (at least one per frame); the rest draw a flat placeholder until a later frame
 * builds them (Phase 6 §4.6 finding: a turn rebuilt every visible chunk in one frame, 95–170 ms on desktop).
 */
export const FIRST_BUILD_BUDGET_MS = 6;
/** `prefetch` works only while the chunk images use less than this share of their cap. */
export const PREFETCH_HEADROOM = 0.6;
/** Placeholder ground colour of a chunk not built yet. */
const PLACEHOLDER = '#67b24b';
/** Clock of the first-build budget (ms); tests replace `now` to make the budget deterministic. */
export const terrainClock = { now: (): number => (typeof performance !== 'undefined' ? performance.now() : 0) };
/**
 * Exact-scale chunk images: once the device scale (zoom × pixel ratio) has stayed the same for this many frames
 * and is not a bucket scale, visible chunks are rebuilt at that exact scale, one per frame, so they draw as 1:1
 * copies instead of filtered scaled draws (a software-rastered canvas pays about 5× for a filtered draw; measured
 * on the 128 × 128 park at zoom 0.75). Up to scale 2: larger images would cost more memory than they save.
 */
export const EXACT_SETTLE_FRAMES = 8;
const MAX_EXACT_BUILDS_PER_FRAME = 1;
const MAX_EXACT_SCALE = 2;
/** Cache slot of the exact-scale image (bucket slots are 0–2). */
const EXACT_SLOT = 3;
/** Image cache keys per chunk: 4 rotations × 4 bucket slots. */
const KEYS_PER_CHUNK = 16;

/**
 * The realistic test build only (VITE_ART=real; unreferenced and dropped from the website build): `covers(chunk)` is
 * true when the realistic ground will lay that chunk in full this frame (every tile from a realistic piece), so
 * today's terrain neither builds nor draws it. Set by the renderer from `RealGround.covers`.
 */
export const realGroundCover: { covers: ((chunk: number) => boolean) | null } = { covers: null };

/** Phase 4 §8 `CHUNK_CACHE_MB` (32 MB on phones, §11): chunk image memory cap at 4 bytes per pixel. */
export const CHUNK_CACHE_MB = 64;
export const CHUNK_CACHE_MB_PHONE = 32;

/** Chunk image cap in pixels (4 bytes each) for a canvas of this CSS size: the phone cap on phone-sized screens. */
export function chunkCacheBudgetPixels(cssW: number, cssH: number): number {
  return ((isPhoneScreen(cssW, cssH) ? CHUNK_CACHE_MB_PHONE : CHUNK_CACHE_MB) * 1024 * 1024) / 4;
}

/** Image cache key of a chunk image: (chunk, view rotation, zoom bucket). */
export function chunkImageKey(chunk: number, r: ViewRotation, bucket: ZoomBucket): number {
  return chunk * KEYS_PER_CHUNK + r * 4 + bucketIndex(bucket);
}

export class TerrainLayer {
  readonly tracker = new TerrainTracker();
  private images: SpriteCache;
  private bounds: ChunkGeom[] = [];
  /** Chunk indices in view row-major order (back to front for the painter). */
  private order = new Int32Array(0);
  /** Rotation the bounds and order were computed for, or −1. */
  private rot = -1;
  /** Chunk images built since the last `draw` began (tests and the debug overlay). */
  builds = 0;
  /** Chunks the last `draw` showed as a placeholder (not built yet). */
  placeholders = 0;
  /**
   * The last `draw` showed every visible chunk with its final image and nothing is waiting to be refined: the
   * same frame drawn again would look the same (the renderer's static layer may keep it, Phase 6 §4.6 step 4).
   */
  complete = false;
  /**
   * Exact-scale images (a 4th zoom bucket, `EXACT_SLOT`). Off on phones and at low quality: Phase 6 §4.6 caps
   * phones at 3 zoom buckets.
   */
  allowExact = true;

  /** `budgetPixels`: image memory cap in pixels (4 bytes each); default `CHUNK_CACHE_MB`. */
  constructor(budgetPixels = (CHUNK_CACHE_MB * 1024 * 1024) / 4) {
    this.images = new SpriteCache(budgetPixels, spriteMemory, 'chunks');
  }

  /** Image memory cap in pixels. */
  get budgetPixels(): number {
    return this.images.budgetPixels;
  }

  set budgetPixels(px: number) {
    this.images.budgetPixels = px;
  }

  /** Pixels held by chunk images now. */
  get pixels(): number {
    return this.images.pixels;
  }

  /** Has an image for this chunk, rotation, and bucket. */
  hasImage(chunk: number, r: ViewRotation, bucket: ZoomBucket): boolean {
    return this.images.peek(chunkImageKey(chunk, r, bucket));
  }

  /** Diff the map, drop stale chunk images. Returns true when anything changed. */
  sync(map: MapState): boolean {
    const v = this.tracker.version;
    this.tracker.sync(map);
    const n = this.tracker.chunksX * this.tracker.chunksY;
    if (this.bounds.length !== n || this.tracker.resets !== this.resetsSeen) {
      // New map: start over.
      this.resetsSeen = this.tracker.resets;
      this.images.clear();
      this.bounds = new Array<ChunkGeom>(n);
      this.rot = -1;
      for (let c = 0; c < n; c++) this.tracker.clean(c);
      return v !== this.tracker.version;
    }
    if (this.tracker.dirtyCount() > 0) {
      for (let c = 0; c < n; c++) {
        if (!this.tracker.isDirty(c)) continue;
        for (let k = 0; k < KEYS_PER_CHUNK; k++) this.images.delete(c * KEYS_PER_CHUNK + k);
        if (this.rot >= 0) this.bounds[c] = chunkBounds(map, c % this.tracker.chunksX, Math.floor(c / this.tracker.chunksX), this.rot as ViewRotation);
        this.tracker.clean(c);
      }
    }
    return v !== this.tracker.version;
  }

  private resetsSeen = -1;

  /** Forget all images (e.g. the seed changed). */
  invalidate(): void {
    this.images.clear();
  }

  /** Bounds and draw order for rotation `r` (recomputed when the rotation changes). */
  private orient(map: MapState, r: ViewRotation): void {
    if (this.rot === r) return;
    this.rot = r;
    const cx = this.tracker.chunksX;
    const n = cx * this.tracker.chunksY;
    const keys = new Float64Array(n);
    for (let c = 0; c < n; c++) {
      this.bounds[c] = chunkBounds(map, c % cx, Math.floor(c / cx), r);
      const vr = chunkViewRect(map, c % cx, Math.floor(c / cx), r);
      keys[c] = vr.v0 * 65536 + vr.u0;
    }
    const order = Array.from({ length: n }, (_, c) => c).sort((a, b) => (keys[a] as number) - (keys[b] as number));
    this.order = Int32Array.from(order);
  }

  /** Device scale of the last frame and how many frames in a row it stayed the same. */
  private lastScale = 0;
  private stableFrames = 0;

  /** Build the image of `chunk` at `scale` image px per world px (a zoom bucket, or an exact device scale). */
  private build(map: MapState, chunk: number, scale: number, env: TerrainEnv, r: ViewRotation, geom?: ChunkGeom): Sprite {
    this.builds++;
    const g = geom ?? (this.bounds[chunk] as ChunkGeom);
    const w = Math.ceil((g.right - g.left) * scale) + CHUNK_PAD * 2;
    const h = Math.ceil((g.bottom - g.top) * scale) + CHUNK_PAD * 2;
    const { canvas, ctx } = makeCanvas(w, h);
    const ox = CHUNK_PAD - g.left * scale;
    const oy = CHUNK_PAD - g.top * scale;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    const p = new TilePainter(ctx, 0.6 / scale);
    const vr = chunkViewRect(map, chunk % this.tracker.chunksX, Math.floor(chunk / this.tracker.chunksX), r);
    // Back to front by u + v so front cliff faces cover the tiles behind them.
    for (let s = vr.u0 + vr.v0; s <= vr.u1 + vr.v1 - 2; s++) {
      for (let u = Math.max(vr.u0, s - (vr.v1 - 1)); u <= Math.min(vr.u1 - 1, s - vr.v0); u++) {
        paintTile(p, map, u, s - u, r, env);
      }
    }
    // Anchor is world (0, 0).
    return { image: canvas, w, h, ox, oy, scale };
  }

  /**
   * Draw visible chunks with view rotation `r`, back to front. `scale` = device pixels per world pixel;
   * (offX, offY) = device position of world (0, 0). Returns the number of chunks drawn.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    map: MapState,
    env: TerrainEnv,
    view: ViewRect,
    bucket: ZoomBucket,
    scale: number,
    offX: number,
    offY: number,
    r: ViewRotation = 0,
  ): number {
    this.orient(map, r);
    this.images.beginFrame();
    this.builds = 0;
    this.placeholders = 0;
    const bi = bucketIndex(bucket);
    if (scale === this.lastScale) this.stableFrames++;
    else {
      this.lastScale = scale;
      this.stableFrames = 0;
    }
    const wantsExact = this.allowExact && scale !== bucket && scale <= MAX_EXACT_SCALE;
    const exact = wantsExact && this.stableFrames >= EXACT_SETTLE_FRAMES;
    // Not settled yet: exact images will replace the bucket images in a few frames.
    let complete = !(wantsExact && !exact);
    let exactBuilds = 0;
    let refines = 0;
    let firstBuilds = 0;
    let firstStart = 0;
    let drawn = 0;
    const n = this.order.length;
    for (let k = 0; k < n; k++) {
      const c = this.order[k] as number;
      const g = this.bounds[c] as ChunkGeom;
      if (g.right < view.x0 || g.left > view.x1 || g.bottom < view.y0 || g.top > view.y1) continue;
      // The realistic test build (folded away in the website build): a chunk the realistic ground lays in full this
      // frame is not built or drawn, and its images are freed (round 3 fix 2).
      if (import.meta.env.VITE_ART === 'real' && realGroundCover.covers?.(c)) {
        for (let k = 0; k < KEYS_PER_CHUNK; k++) this.images.delete(c * KEYS_PER_CHUNK + k);
        continue;
      }
      const base = c * KEYS_PER_CHUNK + r * 4;
      let sp: Sprite | undefined;
      // An exact-scale image of this very scale draws 1:1.
      if (exact && this.images.peekSprite(base + EXACT_SLOT)?.scale === scale) sp = this.images.get(base + EXACT_SLOT);
      if (!sp) {
        const own = this.images.get(base + bi);
        if (own && !exact) sp = own;
        else {
          // Anything that can stand in while the wanted image waits for its turn to be built.
          const standIn = own ?? this.images.get(base + (bi === 1 ? 0 : 1)) ?? this.images.get(base + (bi === 2 ? 0 : 2));
          if (standIn) {
            const budgetLeft = exact ? exactBuilds < MAX_EXACT_BUILDS_PER_FRAME : refines < MAX_REFINES_PER_FRAME;
            if (!budgetLeft) {
              sp = standIn;
              complete = false;
            } else {
              sp = this.build(map, c, exact ? scale : bucket, env, r);
              this.images.set(exact ? base + EXACT_SLOT : base + bi, sp);
              if (exact) exactBuilds++;
              else refines++;
            }
          } else {
            // Nothing to stand in: build within the frame's first-build budget, else a placeholder for now.
            if (firstBuilds === 0) firstStart = terrainClock.now();
            if (firstBuilds > 0 && terrainClock.now() - firstStart >= FIRST_BUILD_BUDGET_MS) {
              this.drawPlaceholder(ctx, map, c, r, scale, offX, offY);
              this.placeholders++;
              complete = false;
              continue;
            }
            sp = this.build(map, c, exact ? scale : bucket, env, r);
            this.images.set(exact ? base + EXACT_SLOT : base + bi, sp);
            firstBuilds++;
          }
        }
      }
      const f = scale / sp.scale;
      const dx0 = Math.round(offX - sp.ox * f);
      const dy0 = Math.round(offY - sp.oy * f);
      const dx1 = Math.round(offX + (sp.w - sp.ox) * f);
      const dy1 = Math.round(offY + (sp.h - sp.oy) * f);
      ctx.drawImage(sp.image, dx0, dy0, dx1 - dx0, dy1 - dy0);
      drawn++;
    }
    this.images.trim();
    this.complete = complete;
    return drawn;
  }

  /**
   * Mark the images of the visible chunks as used this frame without drawing them (the renderer copied its static
   * layer instead): they stay in memory for the next pan, and off-screen images go first under the budget.
   */
  touch(view: ViewRect, bucket: ZoomBucket, r: ViewRotation): void {
    if (this.rot !== r) return;
    this.images.beginFrame();
    const bi = bucketIndex(bucket);
    const n = this.order.length;
    for (let k = 0; k < n; k++) {
      const c = this.order[k] as number;
      const g = this.bounds[c] as ChunkGeom;
      if (g.right < view.x0 || g.left > view.x1 || g.bottom < view.y0 || g.top > view.y1) continue;
      const base = c * KEYS_PER_CHUNK + r * 4;
      this.images.get(base + EXACT_SLOT);
      this.images.get(base + bi);
    }
  }

  /** Chunk bounds per view rotation for `prefetch`, recomputed when the terrain changes. */
  private turnBounds: Array<ChunkGeom[] | null> = [null, null, null, null];
  private turnBoundsVersion = -1;
  /** Chunk images `prefetch` built (tests and the debug overlay). */
  prefetched = 0;

  /**
   * Idle-frame work (desktop): build one missing chunk image of view rotation `r` (another rotation than the one on
   * screen) inside `view`, the view rectangle a turn to `r` would show. A later turn then finds its chunks ready
   * instead of drawing placeholders. Returns true when it built one.
   */
  prefetch(map: MapState, env: TerrainEnv, view: ViewRect, bucket: ZoomBucket, r: ViewRotation): boolean {
    // Only with room to spare: a prefetched image the LRU evicts again would be rebuilt on every idle frame.
    if (this.bounds.length === 0 || this.images.pixels > this.images.budgetPixels * PREFETCH_HEADROOM) return false;
    if (this.turnBoundsVersion !== this.tracker.version) {
      this.turnBounds = [null, null, null, null];
      this.turnBoundsVersion = this.tracker.version;
    }
    const cx = this.tracker.chunksX;
    const n = cx * this.tracker.chunksY;
    let bounds = this.turnBounds[r];
    if (!bounds) {
      bounds = new Array<ChunkGeom>(n);
      for (let c = 0; c < n; c++) bounds[c] = chunkBounds(map, c % cx, Math.floor(c / cx), r);
      this.turnBounds[r] = bounds;
    }
    const bi = bucketIndex(bucket);
    for (let c = 0; c < n; c++) {
      const g = bounds[c] as ChunkGeom;
      if (g.right < view.x0 || g.left > view.x1 || g.bottom < view.y0 || g.top > view.y1) continue;
      const key = c * KEYS_PER_CHUNK + r * 4 + bi;
      if (this.images.peek(key)) continue;
      this.images.set(key, this.build(map, c, bucket, env, r, g));
      this.prefetched++;
      return true;
    }
    return false;
  }

  /** A chunk not built yet: its ground as one flat diamond at the chunk's mean height. */
  private drawPlaceholder(ctx: CanvasRenderingContext2D, map: MapState, chunk: number, r: ViewRotation, scale: number, offX: number, offY: number): void {
    const cx = chunk % this.tracker.chunksX;
    const cy = Math.floor(chunk / this.tracker.chunksX);
    const vr = chunkViewRect(map, cx, cy, r);
    let sum = 0;
    let count = 0;
    for (let y = cy * CHUNK_SIZE; y < Math.min(map.height, (cy + 1) * CHUNK_SIZE); y++) {
      for (let x = cx * CHUNK_SIZE; x < Math.min(map.width, (cx + 1) * CHUNK_SIZE); x++) {
        sum += map.heights[y * map.width + x] as number;
        count++;
      }
    }
    const lift = (count > 0 ? sum / count : 0) * STEP_PX;
    const X = (u: number, v: number): number => (u - v) * HW * scale + offX;
    const Y = (u: number, v: number): number => ((u + v) * HH - lift) * scale + offY;
    ctx.beginPath();
    ctx.moveTo(X(vr.u0, vr.v0), Y(vr.u0, vr.v0));
    ctx.lineTo(X(vr.u1, vr.v0), Y(vr.u1, vr.v0));
    ctx.lineTo(X(vr.u1, vr.v1), Y(vr.u1, vr.v1));
    ctx.lineTo(X(vr.u0, vr.v1), Y(vr.u0, vr.v1));
    ctx.closePath();
    ctx.fillStyle = PLACEHOLDER;
    ctx.fill();
  }
}
