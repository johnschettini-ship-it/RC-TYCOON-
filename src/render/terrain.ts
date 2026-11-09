/**
 * Terrain chunk cache (Phase 0 §4.8): static tiles (ground, cliffs, water, paths, queues) pre-drawn
 * into 16 × 16-tile chunk images per zoom bucket (0.5, 1, 2). Owner: W1-A.
 */
import { Content, Terrain, type MapState } from '../sim/map';
import type { Ride } from '../sim/rides/types';
import type { Stall } from '../sim/stalls/types';
import { bucketIndex, SpriteCache, type Sprite } from './spriteCache';
import type { ZoomBucket } from './camera';
import { makeCanvas } from './canvas';
import { cornerHeights, STEP_PX } from './iso';
import { JOIN_E, JOIN_N, JOIN_S, JOIN_W, pathJoinMask } from './paths';
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

/** Paint tile (x, y) in world-pixel coordinates. */
function paintTile(p: TilePainter, map: MapState, x: number, y: number, env: TerrainEnv): void {
  const w = map.width;
  const i = y * w + x;
  const c = cornerHeights(map, i);
  p.setTile(x, y, c);
  const owned = map.owned[i] === 1;
  // Cliff and edge faces toward the viewer (+x and +y), down to the neighbour or to height 0 at the map edge.
  const hE = c[1] * STEP_PX;
  const hS = c[2] * STEP_PX;
  const hW = c[3] * STEP_PX;
  let nN = 0;
  let nW = 0;
  if (x + 1 < w) {
    const n = cornerHeights(map, i + 1);
    nN = n[0] * STEP_PX;
    nW = n[3] * STEP_PX;
  }
  if (hE > nN || hS > nW) p.faceE(Math.min(nN, hE), Math.min(nW, hS), CLIFF_RIGHT);
  let sN = 0;
  let sE = 0;
  if (y + 1 < map.height) {
    const n = cornerHeights(map, i + w);
    sN = n[0] * STEP_PX;
    sE = n[1] * STEP_PX;
  }
  if (hW > sN || hS > sE) p.faceS(Math.min(sN, hW), Math.min(sE, hS), CLIFF_LEFT);

  // Ground.
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
    const m = mix32(i * 2654435761 + env.seed);
    if ((m & 7) === 0) {
      const tuft = shade(base, 0.8);
      for (let k = 0; k < 3; k++) {
        const u = 0.25 + (((m >>> (4 + k * 4)) & 15) / 15) * 0.5;
        const v = 0.25 + (((m >>> (16 + k * 4)) & 15) / 15) * 0.5;
        p.line(u - 0.04, v, u, v - 0.02, 0, 3, tuft, 1.2);
        p.line(u + 0.04, v, u, v - 0.02, 0, 3, tuft, 1.2);
      }
    }
  }

  // Water surface (Phase 4).
  const water = map.water[i] as number;
  if (water > (map.heights[i] as number)) {
    const lift = (water - (map.heights[i] as number)) * STEP_PX;
    p.quad(0, 0, 1, 1, 'rgba(63,143,214,0.8)', lift);
  }

  // Paths, queues, entrance plaza, track placeholder.
  if (content === Content.Footpath || content === Content.ParkEntrance) {
    const mask = pathJoinMask(map, i, env.rides, env.stalls);
    paintPathShape(p, mask, diagMask(map, x, y, mask), PATH.fill, PATH.edge);
    if (content === Content.ParkEntrance) paintEntrancePlaza(p);
  } else if (content === Content.Queue) {
    const mask = pathJoinMask(map, i, env.rides, env.stalls);
    paintPathShape(p, mask, 0, QUEUE.fill, QUEUE.edge);
    paintQueueRails(p, mask);
  } else if (content === Content.Track) {
    p.quad(0.12, 0.12, 0.88, 0.88, '#5e6875');
  }
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

/** World-pixel bounds of chunk (cx, cy), including cliff faces and queue rails. */
export function chunkBounds(map: MapState, cx: number, cy: number): ChunkGeom {
  const x0 = cx * CHUNK_SIZE;
  const y0 = cy * CHUNK_SIZE;
  const x1 = Math.min(map.width, x0 + CHUNK_SIZE);
  const y1 = Math.min(map.height, y0 + CHUNK_SIZE);
  let zTop = 0;
  let zBot = Infinity;
  const w = map.width;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      const h = map.heights[i] as number;
      const top = Math.max(h + ((map.slope[i] as number) ? 1 : 0), map.water[i] as number);
      if (top > zTop) zTop = top;
      if (h < zBot) zBot = h;
      if (x + 1 < w) zBot = Math.min(zBot, map.heights[i + 1] as number);
      if (y + 1 < map.height) zBot = Math.min(zBot, map.heights[i + w] as number);
    }
  }
  if (x1 === map.width || y1 === map.height) zBot = 0;
  if (zBot === Infinity) zBot = 0;
  return {
    left: (x0 - y1) * HW,
    right: (x1 - y0) * HW,
    top: (x0 + y0) * HH - (zTop + 2) * STEP_PX,
    bottom: (x1 + y1) * HH - zBot * STEP_PX,
  };
}

const CHUNK_PAD = 2;
/** Chunks built per frame when an image at another bucket can stand in. */
const MAX_REFINES_PER_FRAME = 2;

export class TerrainLayer {
  readonly tracker = new TerrainTracker();
  private images: SpriteCache;
  private bounds: ChunkGeom[] = [];

  constructor(budgetPixels = 20_000_000) {
    this.images = new SpriteCache(budgetPixels);
  }

  /** Diff the map, drop stale chunk images. Returns true when anything changed. */
  sync(map: MapState): boolean {
    const v = this.tracker.version;
    this.tracker.sync(map);
    const reset = this.bounds.length !== this.tracker.chunksX * this.tracker.chunksY;
    if (reset) {
      this.images.clear();
      this.bounds = [];
      for (let cy = 0; cy < this.tracker.chunksY; cy++) {
        for (let cx = 0; cx < this.tracker.chunksX; cx++) this.bounds.push(chunkBounds(map, cx, cy));
      }
    }
    if (this.tracker.dirtyCount() > 0) {
      const n = this.tracker.chunksX * this.tracker.chunksY;
      for (let c = 0; c < n; c++) {
        if (!this.tracker.isDirty(c)) continue;
        for (const b of [0, 1, 2]) this.images.delete(c * 4 + b);
        this.bounds[c] = chunkBounds(map, c % this.tracker.chunksX, Math.floor(c / this.tracker.chunksX));
        this.tracker.clean(c);
      }
    }
    return v !== this.tracker.version;
  }

  /** Forget all images (e.g. the seed changed). */
  invalidate(): void {
    this.images.clear();
  }

  private build(map: MapState, chunk: number, bucket: ZoomBucket, env: TerrainEnv): Sprite {
    const g = this.bounds[chunk] as ChunkGeom;
    const scale = bucket;
    const w = Math.ceil((g.right - g.left) * scale) + CHUNK_PAD * 2;
    const h = Math.ceil((g.bottom - g.top) * scale) + CHUNK_PAD * 2;
    const { canvas, ctx } = makeCanvas(w, h);
    const ox = CHUNK_PAD - g.left * scale;
    const oy = CHUNK_PAD - g.top * scale;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    const p = new TilePainter(ctx, 0.6 / scale);
    const cx = chunk % this.tracker.chunksX;
    const cy = Math.floor(chunk / this.tracker.chunksX);
    const x0 = cx * CHUNK_SIZE;
    const y0 = cy * CHUNK_SIZE;
    const x1 = Math.min(map.width, x0 + CHUNK_SIZE);
    const y1 = Math.min(map.height, y0 + CHUNK_SIZE);
    // Back to front by x + y so front cliff faces cover the tiles behind them.
    for (let s = x0 + y0; s <= x1 + y1 - 2; s++) {
      for (let x = Math.max(x0, s - (y1 - 1)); x <= Math.min(x1 - 1, s - y0); x++) {
        paintTile(p, map, x, s - x, env);
      }
    }
    // Anchor is world (0, 0).
    return { image: canvas, w, h, ox, oy, scale };
  }

  /**
   * Draw visible chunks. `scale` = device pixels per world pixel; (offX, offY) = device position of world (0, 0).
   * Returns the number of chunks drawn.
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
  ): number {
    this.images.beginFrame();
    const bi = bucketIndex(bucket);
    let refines = 0;
    let drawn = 0;
    const n = this.bounds.length;
    for (let c = 0; c < n; c++) {
      const g = this.bounds[c] as ChunkGeom;
      if (g.right < view.x0 || g.left > view.x1 || g.bottom < view.y0 || g.top > view.y1) continue;
      let sp = this.images.get(c * 4 + bi);
      if (!sp) {
        const alt = this.images.get(c * 4 + (bi === 1 ? 0 : 1)) ?? this.images.get(c * 4 + (bi === 2 ? 0 : 2));
        if (alt && refines >= MAX_REFINES_PER_FRAME) {
          sp = alt;
        } else {
          sp = this.build(map, c, bucket, env);
          this.images.set(c * 4 + bi, sp);
          if (alt) refines++;
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
    return drawn;
  }
}
