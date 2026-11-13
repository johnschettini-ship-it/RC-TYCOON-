/**
 * RealGround (spec §5.5 item 1): the realistic look's ground, laid at play time from baked ground pieces into one
 * canvas per 8 × 8 tile chunk and view rotation, at the look's density.
 *
 * - Each tile gets one piece, `look.groundPiece(terrain, slopeMask, variant, rot)`: terrain `water` (water above
 *   the ground), `queue`, `path` or `grass`; slope mask as seen in the view (`rotateSlopeMask`); variant 0–3 from a
 *   hash of the tile position. The piece is anchored at the tile's top corner at its base height, the point
 *   `viewTileSX/SY` give (the bake's ground anchor, Task 9).
 * - A piece that answers `undefined` (no such set in the bake) is left out of the chunk: today's terrain, drawn
 *   underneath by the renderer, shows through there. A piece that answers `null` (set still decoding) leaves the
 *   chunk unbuilt this frame (today's terrain shows) and the ground incomplete.
 * - New chunks are built while the frame has spent less than `FIRST_BUILD_BUDGET_MS` on them (at least one per
 *   frame), as the terrain layer does. A terrain change rebuilds only the chunks whose tiles changed.
 * - Chunk canvases count toward the decode budget through `hold('ground', bytes)` (spec §5.4 item 4).
 */
import { STEP_PX } from '../heightStep';
import type { MapState } from '../../sim/map';
import { Content } from '../../sim/map';
import type { Sprite } from '../spriteCache';
import { chunkBounds, chunkViewRect, FIRST_BUILD_BUDGET_MS, terrainClock, type ViewRect } from '../terrain';
import { CHUNK_SIZE } from '../terrainTracker';
import { rotateSlopeMask, viewToMap, type ViewRotation } from '../view';
import type { RealLook } from './look';
import type { CanvasLike } from './tint';

const HW = 32;
const HH = 16;
const PAD = 2;
/** Chunk canvases not drawn for this many frames are freed. */
const KEEP_FRAMES = 120;

/** What the renderer needs from a ground: draw the visible chunks; `complete` when all of them drew their image. */
export interface GroundLayer {
  complete: boolean;
  draw(ctx: CanvasRenderingContext2D, map: MapState, view: ViewRect, scale: number, offX: number, offY: number, rot: ViewRotation, version: number): number;
}

export interface RealGroundOptions {
  makeCanvas?: (w: number, h: number) => CanvasLike;
  /** Bytes held by the chunk canvases, for the set manager's budget. */
  hold?: (id: string, bytes: number) => void;
}

interface Chunk {
  canvas: CanvasLike;
  sprite: Sprite;
  density: number;
  /** Fingerprint of the chunk's tiles when built. */
  sig: number;
  lastFrame: number;
  bytes: number;
}

function defaultCanvas(w: number, h: number): CanvasLike {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h) as unknown as CanvasLike;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c as unknown as CanvasLike;
}

/** Variant 0–3 of tile (x, y): a fixed hash of the position. */
export function groundVariant(x: number, y: number): number {
  let h = Math.imul(x + 0x9e37, 0x85ebca6b) ^ Math.imul(y + 0x79b9, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f);
  return (h >>> 13) & 3;
}

/** The ground terrain id of map tile `i`. */
export function groundTerrain(map: MapState, i: number): string {
  if ((map.water[i] as number) > (map.heights[i] as number)) return 'water';
  const c = map.content[i];
  if (c === Content.Queue) return 'queue';
  if (c === Content.Footpath) return 'path';
  return 'grass';
}

export class RealGround implements GroundLayer {
  complete = false;
  /** Chunks built by the last `draw` (tests). */
  builds = 0;
  private readonly chunks = new Map<number, Chunk>();
  private readonly make: (w: number, h: number) => CanvasLike;
  private version = -1;
  private map: MapState | null = null;
  private frame = 0;
  private bytes = 0;
  /** Chunk indices back to front (v0, then u0) for `orderRot`, as the terrain layer draws. */
  private order: number[] = [];
  private orderRot = -1;

  constructor(
    private readonly look: Pick<RealLook, 'groundPiece' | 'density'>,
    private readonly opts: RealGroundOptions = {},
  ) {
    this.make = opts.makeCanvas ?? defaultCanvas;
  }

  /** Fingerprint of chunk (cx, cy): heights, slopes, water and content of its tiles. */
  private sig(map: MapState, cx: number, cy: number): number {
    let h = 0x811c9dc5;
    const x1 = Math.min(map.width, (cx + 1) * CHUNK_SIZE);
    const y1 = Math.min(map.height, (cy + 1) * CHUNK_SIZE);
    for (let y = cy * CHUNK_SIZE; y < y1; y++) {
      for (let x = cx * CHUNK_SIZE; x < x1; x++) {
        const i = y * map.width + x;
        h = Math.imul(h ^ (map.heights[i] as number), 0x01000193);
        h = Math.imul(h ^ ((map.slope[i] as number) | ((map.content[i] as number) << 4)), 0x01000193);
        h = Math.imul(h ^ (map.water[i] as number), 0x01000193);
      }
    }
    return h >>> 0;
  }

  private free(key: number, c: Chunk): void {
    c.canvas.width = 0;
    c.canvas.height = 0;
    this.bytes -= c.bytes;
    this.chunks.delete(key);
  }

  /** The chunk image, or null when one of its pieces is not decoded yet. */
  private build(map: MapState, cx: number, cy: number, rot: ViewRotation, density: number, sig: number): Chunk | null {
    const g = chunkBounds(map, cx, cy, rot);
    const vr = chunkViewRect(map, cx, cy, rot);
    const w = Math.ceil((g.right - g.left) * density) + PAD * 2;
    const h = Math.ceil((g.bottom - g.top) * density) + PAD * 2;
    const ox = PAD - g.left * density;
    const oy = PAD - g.top * density;
    let canvas: CanvasLike | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    // Back to front by u + v.
    for (let s = vr.u0 + vr.v0; s <= vr.u1 + vr.v1 - 2; s++) {
      for (let u = Math.max(vr.u0, s - (vr.v1 - 1)); u <= Math.min(vr.u1 - 1, s - vr.v0); u++) {
        const v = s - u;
        const m = viewToMap(u, v, rot, map.width, map.height);
        const i = m.y * map.width + m.x;
        const sp = this.look.groundPiece(groundTerrain(map, i), rotateSlopeMask(map.slope[i] as number, rot), groundVariant(m.x, m.y), rot);
        if (sp === null) {
          if (canvas) canvas.width = canvas.height = 0;
          return null;
        }
        if (!sp) continue;
        if (!canvas) {
          canvas = this.make(w, h);
          ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        }
        const k = density / sp.scale;
        const ax = (u - v) * HW * density + ox;
        const ay = ((u + v) * HH - (map.heights[i] as number) * STEP_PX) * density + oy;
        (ctx as CanvasRenderingContext2D).drawImage(sp.image, sp.sx ?? 0, sp.sy ?? 0, sp.w, sp.h, Math.round(ax - sp.ox * k), Math.round(ay - sp.oy * k), Math.round(sp.w * k), Math.round(sp.h * k));
      }
    }
    // A chunk with no baked piece at all: an empty 1 × 1 image, so it is not asked again until it changes.
    if (!canvas) canvas = this.make(1, 1);
    const cw = canvas.width;
    const ch = canvas.height;
    return { canvas, sprite: { image: canvas as unknown as CanvasImageSource, w: cw, h: ch, ox, oy, scale: density }, density, sig, lastFrame: this.frame, bytes: cw * ch * 4 };
  }

  draw(ctx: CanvasRenderingContext2D, map: MapState, view: ViewRect, scale: number, offX: number, offY: number, rot: ViewRotation, version: number): number {
    this.frame++;
    this.builds = 0;
    const cxN = Math.ceil(map.width / CHUNK_SIZE);
    const cyN = Math.ceil(map.height / CHUNK_SIZE);
    if (map !== this.map) {
      for (const [k, c] of [...this.chunks]) this.free(k, c);
      this.map = map;
      this.orderRot = -1;
    }
    // A terrain change: drop the chunks whose tiles changed.
    const changed = version !== this.version;
    this.version = version;
    const density = this.look.density(scale, 1);
    let complete = true;
    let drawn = 0;
    let t0 = 0;
    let firstBuilds = 0;
    if (this.orderRot !== rot || changed) {
      const keys: number[] = [];
      for (let c = 0; c < cxN * cyN; c++) {
        const vr = chunkViewRect(map, c % cxN, Math.floor(c / cxN), rot);
        keys[c] = vr.v0 * 65536 + vr.u0;
      }
      this.order = keys.map((_, c) => c).sort((a, b) => (keys[a] as number) - (keys[b] as number));
      this.orderRot = rot;
    }
    for (const c of this.order) {
      const cx = c % cxN;
      const cy = (c - cx) / cxN;
      const key = c * 4 + rot;
      let ch = this.chunks.get(key);
      if (ch && changed && ch.sig !== this.sig(map, cx, cy)) {
        this.free(key, ch);
        ch = undefined;
      }
      const g = chunkBounds(map, cx, cy, rot);
      if (g.right < view.x0 || g.left > view.x1 || g.bottom < view.y0 || g.top > view.y1) continue;
      if (ch && ch.density !== density) {
        this.free(key, ch);
        ch = undefined;
      }
      if (!ch) {
        if (firstBuilds === 0) t0 = terrainClock.now();
        if (firstBuilds > 0 && terrainClock.now() - t0 >= FIRST_BUILD_BUDGET_MS) {
          complete = false;
          continue;
        }
        firstBuilds++;
        const built = this.build(map, cx, cy, rot, density, this.sig(map, cx, cy));
        if (!built) {
          complete = false;
          continue;
        }
        this.builds++;
        ch = built;
        this.chunks.set(key, ch);
        this.bytes += ch.bytes;
      }
      ch.lastFrame = this.frame;
      const sp = ch.sprite;
      if (sp.w <= 1) continue;
      const f = scale / sp.scale;
      const x0 = Math.round(offX - sp.ox * f);
      const y0 = Math.round(offY - sp.oy * f);
      ctx.drawImage(sp.image, x0, y0, Math.round(offX + (sp.w - sp.ox) * f) - x0, Math.round(offY + (sp.h - sp.oy) * f) - y0);
      drawn++;
    }
    for (const [k, c] of [...this.chunks]) if (c.lastFrame < this.frame - KEEP_FRAMES) this.free(k, c);
    this.opts.hold?.('ground', this.bytes);
    this.complete = complete;
    return drawn;
  }

  /** Frees every chunk canvas. */
  dispose(): void {
    for (const [k, c] of [...this.chunks]) this.free(k, c);
    this.opts.hold?.('ground', 0);
  }
}
