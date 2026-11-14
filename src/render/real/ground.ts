/**
 * RealGround (spec §5.5 item 1): the realistic look's ground, laid at play time from baked ground pieces into one
 * canvas per 8 × 8 tile chunk, for the current view rotation, at the screen's scale.
 *
 * - Each tile gets one piece, `look.groundPiece(terrain, slopeMask, variant, rot, join)`: terrain `water` (water
 *   above the ground), `queue`, `path` or `grass`; slope mask as seen in the view (`rotateSlopeMask`); variant 0–3
 *   from a hash of the tile position; for path and queue tiles the join mask in view terms (`pathJoinMask`, as
 *   today's paths), which picks the kerb piece. The piece is anchored at the tile's top corner at its base height,
 *   the point `viewTileSX/SY` give (the bake's ground anchor, Task 9).
 * - A piece that answers `undefined` (no such set in the bake) is left out of the chunk: today's terrain, drawn
 *   underneath by the renderer, shows through there. A piece that answers `null` (set still decoding) leaves the
 *   chunk unbuilt this frame (today's terrain shows) and the ground incomplete.
 * - Chunks are built at `groundScale`: the screen scale (zoom × dpr) rounded up to a step, never above the look's
 *   density, so a chunk holds no pixel the screen cannot show. Chunks of another rotation or scale are freed as soon
 *   as the ground draws at a new one.
 * - Above `DIRECT_ABOVE_SCALE` (a phone at zoom 2: screen scale 4) no chunk is made (round 3 item 3): an 8 × 8 chunk
 *   at scale 4 is about 2048 × 1100 px, and the view's chunks took about 60 MB of the 128 MB budget. The tiles in the
 *   view are drawn straight into the target (the static layer when the view is still, the screen while it moves),
 *   chunk by chunk in the same back-to-front order as the chunks, at the screen's scale. The tiles are few at that
 *   scale (a phone screen shows about 100), and nothing is held.
 * - New chunks are built while the frame has spent less than `FIRST_BUILD_BUDGET_MS` on them (at least one per
 *   frame), as the terrain layer does. A terrain change rebuilds only the chunks whose tiles (or the ring of tiles
 *   around them, for path joins) changed.
 * - Memory (spec §5.4 item 4): a chunk is admitted against the decode budget before it is made (`admit`); with no
 *   room it stays unbuilt and the ground incomplete. Chunk canvases are held as `hold('ground', bytes)`.
 *   `endFrame` runs every frame (the static layer drawn or reused): chunks not on screen for `KEEP_FRAMES` frames are
 *   freed; `reclaim` frees chunks not on screen at once when the set manager needs the room.
 * - A canvas that cannot be made (no 2D context, too big) leaves the chunk unbuilt and the ground incomplete:
 *   `draw` never throws.
 */
import { STEP_PX } from '../heightStep';
import type { MapState } from '../../sim/map';
import { Content } from '../../sim/map';
import type { Ride } from '../../sim/rides/types';
import type { Stall } from '../../sim/stalls/types';
import { pathJoinMask } from '../paths';
import type { Sprite } from '../spriteCache';
import { chunkBounds, chunkViewRect, FIRST_BUILD_BUDGET_MS, terrainClock, type ViewRect } from '../terrain';
import { CHUNK_SIZE } from '../terrainTracker';
import { rotateSlopeMask, viewToMap, type ViewRotation } from '../view';
import { pickDensity, type RealLook } from './look';
import type { CanvasLike } from './tint';

const HW = 32;
const HH = 16;
const PAD = 2;
/** Chunk canvases not on screen for this many frames are freed. */
const KEEP_FRAMES = 120;
/** Chunk scales: the screen scale is rounded up to one of these (so a pinch does not rebuild every frame). */
const SCALE_STEPS = [1, 1.5, 2, 3, 4] as const;
/** Above this screen scale (zoom × dpr) the tiles in the view are drawn straight into the target, with no chunk. */
export const DIRECT_ABOVE_SCALE = 2;

/** The scale chunks are built at for screen scale `scale` (zoom × dpr) and look density `density`. */
export function groundScale(scale: number, density: number): number {
  const s = SCALE_STEPS.find((x) => x >= scale - 1e-6) ?? 4;
  return Math.min(s, density);
}

/** Rides and stalls, for path join masks (entrance and exit gates). */
export interface GroundEnv {
  rides: readonly Ride[];
  stalls: readonly Stall[];
}

/**
 * What the renderer needs from a ground: draw the visible chunks; `complete` when all of them drew their image;
 * `endFrame` every frame, before the set manager's `endFrame`.
 */
export interface GroundLayer {
  complete: boolean;
  /**
   * Before today's terrain draws (round 3 fix 2): from then on `covers(chunk)` says whether this ground will lay that
   * chunk in full this frame, every tile from a realistic piece, so today's terrain can leave it out.
   */
  beginCover?(map: MapState, scale: number, rot: ViewRotation, version: number): void;
  covers?(chunk: number): boolean;
  draw(ctx: CanvasRenderingContext2D, map: MapState, view: ViewRect, scale: number, offX: number, offY: number, rot: ViewRotation, version: number, env?: GroundEnv): number;
  endFrame?(): void;
}

export interface RealGroundOptions {
  makeCanvas?: (w: number, h: number) => CanvasLike;
  /** Bytes held by the chunk canvases, and what they would take at density 4, for the set manager's budget. */
  hold?: (id: string, bytes: number, upBytes?: number) => void;
  /** Asks the budget for room before a chunk is made (default: always room). */
  admit?: (id: string, bytes: number, upBytes?: number) => boolean;
  /** Told when a chunk canvas could not be made (once per error message). */
  onError?: (err: unknown) => void;
}

interface Chunk {
  canvas: CanvasLike;
  sprite: Sprite;
  rot: ViewRotation;
  /** The scale it was built at (`groundScale`). */
  scale: number;
  /** Fingerprint of the chunk's tiles when built. */
  sig: number;
  lastFrame: number;
  bytes: number;
  /** `bytes` at the scale density 4 would give. */
  upBytes: number;
  /** Every tile of the chunk drew from a realistic piece (no piece missing from the bake). */
  full: boolean;
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
  private readonly reported = new Set<string>();
  private version = -1;
  private map: MapState | null = null;
  /** Frames counted by `endFrame`; chunks on screen carry the current one. */
  private frame = 1;
  /** The frame of the last `draw`: on a frame without one (static layer reused) its chunks are still on screen. */
  private lastDraw = 0;
  private bytes = 0;
  private upBytes = 0;
  /** Chunk indices back to front (v0, then u0) for `orderRot`, as the terrain layer draws. */
  private order: number[] = [];
  private orderRot = -1;
  /** Direct tiles: path and queue join masks (map terms) by map tile (−1: not known yet), cleared on a terrain change. */
  private joins = new Int16Array(0);
  /** Tiles drawn by the last direct `draw` (tests, bench). */
  tilesDrawn = 0;
  /** Direct tiles: per chunk, 1 when every tile of it had a realistic piece at the last draw, for `directRot`/`directVersion`. */
  private directFull = new Uint8Array(0);
  private directRot = -1;
  private directVersion = -1;
  /** What `beginCover` was told for this frame (`coverScale` 0: nothing covers). */
  private coverRot = -1;
  private coverScale = 0;
  private coverDirect = false;
  private coverOk = false;
  /** The last `draw` drew tiles directly. */
  private wasDirect = false;

  constructor(
    private readonly look: Pick<RealLook, 'groundPiece' | 'density'>,
    private readonly opts: RealGroundOptions = {},
  ) {
    this.make = opts.makeCanvas ?? defaultCanvas;
  }

  /** Bytes held by chunk canvases now. */
  heldBytes(): number {
    return this.bytes;
  }

  /** Fingerprint of chunk (cx, cy): heights, slopes, water and content of its tiles, and content of the ring around. */
  private sig(map: MapState, cx: number, cy: number): number {
    let h = 0x811c9dc5;
    const x0 = cx * CHUNK_SIZE;
    const y0 = cy * CHUNK_SIZE;
    const x1 = Math.min(map.width, x0 + CHUNK_SIZE);
    const y1 = Math.min(map.height, y0 + CHUNK_SIZE);
    for (let y = Math.max(0, y0 - 1); y < Math.min(map.height, y1 + 1); y++) {
      for (let x = Math.max(0, x0 - 1); x < Math.min(map.width, x1 + 1); x++) {
        const i = y * map.width + x;
        const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
        if (inside) {
          h = Math.imul(h ^ (map.heights[i] as number), 0x01000193);
          h = Math.imul(h ^ ((map.slope[i] as number) | ((map.content[i] as number) << 4)), 0x01000193);
          h = Math.imul(h ^ (map.water[i] as number), 0x01000193);
        } else h = Math.imul(h ^ ((map.content[i] as number) + 0x100), 0x01000193);
      }
    }
    return h >>> 0;
  }

  private free(key: number, c: Chunk): void {
    c.canvas.width = 0;
    c.canvas.height = 0;
    this.bytes -= c.bytes;
    this.upBytes -= c.upBytes;
    this.chunks.delete(key);
  }

  private holdNow(): void {
    this.opts.hold?.('ground', this.bytes, this.upBytes);
  }

  private report(err: unknown): void {
    const m = err instanceof Error ? err.message : String(err);
    if (this.reported.has(m)) return;
    this.reported.add(m);
    this.opts.onError?.(err);
  }

  /** The chunk image, or null when one of its pieces is not decoded yet or its canvas could not be made. */
  private build(map: MapState, cx: number, cy: number, rot: ViewRotation, scale: number, upScale: number, sig: number, env: GroundEnv | undefined): Chunk | null {
    const g = chunkBounds(map, cx, cy, rot);
    const vr = chunkViewRect(map, cx, cy, rot);
    const w = Math.ceil((g.right - g.left) * scale) + PAD * 2;
    const h = Math.ceil((g.bottom - g.top) * scale) + PAD * 2;
    const ox = PAD - g.left * scale;
    const oy = PAD - g.top * scale;
    let canvas: CanvasLike | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    const drop = (): null => {
      if (canvas) canvas.width = canvas.height = 0;
      return null;
    };
    let full = true;
    try {
      // Back to front by u + v.
      for (let s = vr.u0 + vr.v0; s <= vr.u1 + vr.v1 - 2; s++) {
        for (let u = Math.max(vr.u0, s - (vr.v1 - 1)); u <= Math.min(vr.u1 - 1, s - vr.v0); u++) {
          const v = s - u;
          const m = viewToMap(u, v, rot, map.width, map.height);
          const i = m.y * map.width + m.x;
          const terrain = groundTerrain(map, i);
          const join = env && (terrain === 'path' || terrain === 'queue') ? rotateSlopeMask(pathJoinMask(map, i, env.rides, env.stalls), rot) : undefined;
          const sp = this.look.groundPiece(terrain, rotateSlopeMask(map.slope[i] as number, rot), groundVariant(m.x, m.y), rot, join);
          if (sp === null) return drop();
          if (!sp) {
            full = false;
            continue;
          }
          if (!canvas) {
            canvas = this.make(w, h);
            ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
            if (!ctx) throw new Error('no 2D context for a ground chunk canvas');
          }
          const k = scale / sp.scale;
          const ax = (u - v) * HW * scale + ox;
          const ay = ((u + v) * HH - (map.heights[i] as number) * STEP_PX) * scale + oy;
          (ctx as CanvasRenderingContext2D).drawImage(sp.image, sp.sx ?? 0, sp.sy ?? 0, sp.w, sp.h, Math.round(ax - sp.ox * k), Math.round(ay - sp.oy * k), Math.round(sp.w * k), Math.round(sp.h * k));
        }
      }
      // A chunk with no baked piece at all: an empty 1 × 1 image, so it is not asked again until it changes.
      if (!canvas) canvas = this.make(1, 1);
    } catch (err) {
      this.report(err);
      return drop();
    }
    const cw = canvas.width;
    const ch = canvas.height;
    const bytes = cw * ch * 4;
    const up = cw > 1 ? Math.round(bytes * (upScale / scale) ** 2) : bytes;
    return { canvas, sprite: { image: canvas as unknown as CanvasImageSource, w: cw, h: ch, ox, oy, scale }, rot, scale, sig, lastFrame: this.frame, bytes, upBytes: up, full: full && cw > 1 };
  }

  draw(ctx: CanvasRenderingContext2D, map: MapState, view: ViewRect, scale: number, offX: number, offY: number, rot: ViewRotation, version: number, env?: GroundEnv): number {
    try {
      return this.drawChunks(ctx, map, view, scale, offX, offY, rot, version, env);
    } catch (err) {
      // Never out of the frame: the ground counts as incomplete and today's terrain shows.
      this.report(err);
      this.complete = false;
      return 0;
    }
  }

  private drawChunks(ctx: CanvasRenderingContext2D, map: MapState, view: ViewRect, scale: number, offX: number, offY: number, rot: ViewRotation, version: number, env?: GroundEnv): number {
    this.builds = 0;
    this.lastDraw = this.frame;
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
    const direct = scale > DIRECT_ABOVE_SCALE + 1e-6;
    // Join cache for direct tiles only (chunks keep their joins in their pixels); dropped when chunks draw.
    if (!direct) this.joins = new Int16Array(0);
    else if (changed || this.joins.length !== map.width * map.height) this.joins = new Int16Array(map.width * map.height).fill(-1);
    if (direct && (!this.wasDirect || this.directFull.length !== cxN * cyN || this.directRot !== rot || changed)) {
      this.directFull = new Uint8Array(cxN * cyN);
      this.directRot = rot;
    }
    this.directVersion = version;
    this.wasDirect = direct;
    const cs = direct ? 0 : groundScale(scale, this.look.density(scale, 1));
    const upScale = groundScale(scale, pickDensity(scale, 1, 4));
    // Chunks of another rotation or scale are never drawn again at this one: free them now (all of them when the
    // tiles are drawn directly).
    for (const [k, c] of [...this.chunks]) if (c.rot !== rot || c.scale !== cs) this.free(k, c);
    let complete = true;
    let drawn = 0;
    let t0 = 0;
    let firstBuilds = 0;
    this.tilesDrawn = 0;
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
      const key = c;
      let ch = this.chunks.get(key);
      if (ch && changed && ch.sig !== this.sig(map, cx, cy)) {
        this.free(key, ch);
        ch = undefined;
      }
      const g = chunkBounds(map, cx, cy, rot);
      if (g.right < view.x0 || g.left > view.x1 || g.bottom < view.y0 || g.top > view.y1) continue;
      if (direct) {
        const r = this.drawTiles(ctx, map, cx, cy, view, scale, offX, offY, rot, env);
        if (!r.complete) complete = false;
        this.directFull[key] = r.full ? 1 : 0;
        drawn++;
        continue;
      }
      if (!ch) {
        if (firstBuilds === 0) t0 = terrainClock.now();
        if (firstBuilds > 0 && terrainClock.now() - t0 >= FIRST_BUILD_BUDGET_MS) {
          complete = false;
          continue;
        }
        // Room first (the whole chunk box; an emptier chunk gives the difference back below).
        const need = (Math.ceil((g.right - g.left) * cs) + PAD * 2) * (Math.ceil((g.bottom - g.top) * cs) + PAD * 2) * 4;
        if (this.opts.admit && !this.opts.admit('ground', this.bytes + need, this.upBytes + Math.round(need * (upScale / cs) ** 2))) {
          complete = false;
          continue;
        }
        firstBuilds++;
        const built = this.build(map, cx, cy, rot, cs, upScale, this.sig(map, cx, cy), env);
        if (!built) {
          complete = false;
          this.holdNow();
          continue;
        }
        this.builds++;
        ch = built;
        this.chunks.set(key, ch);
        this.bytes += ch.bytes;
        this.upBytes += ch.upBytes;
        this.holdNow();
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
    this.holdNow();
    this.complete = complete;
    return drawn;
  }

  /**
   * Direct tiles (screen scale above `DIRECT_ABOVE_SCALE`): the tiles of chunk (cx, cy) inside `view`, back to front,
   * straight into `ctx` at the screen's scale. False when a piece is not decoded yet (the ground is incomplete).
   */
  private drawTiles(ctx: CanvasRenderingContext2D, map: MapState, cx: number, cy: number, view: ViewRect, scale: number, offX: number, offY: number, rot: ViewRotation, env: GroundEnv | undefined): { complete: boolean; full: boolean } {
    const vr = chunkViewRect(map, cx, cy, rot);
    let complete = true;
    // Every tile of the chunk has a realistic piece (those out of view are asked too, not drawn): today's terrain can
    // then leave the whole chunk out next frame (`covers`).
    let full = true;
    for (let s = vr.u0 + vr.v0; s <= vr.u1 + vr.v1 - 2; s++) {
      for (let u = Math.max(vr.u0, s - (vr.v1 - 1)); u <= Math.min(vr.u1 - 1, s - vr.v0); u++) {
        const v = s - u;
        const m = viewToMap(u, v, rot, map.width, map.height);
        const i = m.y * map.width + m.x;
        const hz = (map.heights[i] as number) * STEP_PX;
        const ax = (u - v) * HW;
        const ay = (u + v) * HH - hz;
        // A piece spans its tile (64 × 32 px at zoom 1) and hangs at most its height down (cliff faces).
        const out = ax + HW + 8 < view.x0 || ax - HW - 8 > view.x1 || ay + 2 * HH + hz + 8 < view.y0 || ay - 16 > view.y1;
        if (out && !full) continue;
        const terrain = groundTerrain(map, i);
        let join: number | undefined;
        if (env && (terrain === 'path' || terrain === 'queue')) {
          let raw = this.joins[i] as number;
          if (raw < 0) this.joins[i] = raw = pathJoinMask(map, i, env.rides, env.stalls);
          join = rotateSlopeMask(raw, rot);
        }
        const sp = this.look.groundPiece(terrain, rotateSlopeMask(map.slope[i] as number, rot), groundVariant(m.x, m.y), rot, join);
        if (!sp) full = false;
        if (out) continue;
        if (sp === null) {
          complete = false;
          continue;
        }
        if (!sp) continue;
        const k = scale / sp.scale;
        const x0 = Math.round(offX + ax * scale - sp.ox * k);
        const y0 = Math.round(offY + ay * scale - sp.oy * k);
        ctx.drawImage(sp.image, sp.sx ?? 0, sp.sy ?? 0, sp.w, sp.h, x0, y0, Math.round(offX + ax * scale + (sp.w - sp.ox) * k) - x0, Math.round(offY + ay * scale + (sp.h - sp.oy) * k) - y0);
        this.tilesDrawn++;
      }
    }
    return { complete, full };
  }

  /** See `GroundLayer.beginCover`: the frame's rotation, scale and terrain version, before today's terrain draws. */
  beginCover(map: MapState, scale: number, rot: ViewRotation, version: number): void {
    this.coverRot = rot;
    this.coverDirect = scale > DIRECT_ABOVE_SCALE + 1e-6;
    this.coverScale = this.coverDirect ? 0 : groundScale(scale, this.look.density(scale, 1));
    // A terrain change or a new map may rebuild any chunk this frame: nothing counts as covered until it drew again.
    this.coverOk = map === this.map && version === this.version;
  }

  /**
   * True when this frame's `draw` will lay chunk `chunk` in full from realistic pieces: a built chunk of this rotation
   * and scale with every tile from a piece, or (direct tiles) a chunk whose every tile had a piece at the last draw at
   * this rotation and terrain version. A chunk with a piece missing or not decoded is never covered, so today's
   * terrain stays under it.
   */
  covers(chunk: number): boolean {
    if (!this.coverOk) return false;
    if (this.coverDirect) return this.wasDirect && this.directRot === this.coverRot && this.directVersion === this.version && this.directFull[chunk] === 1;
    const c = this.chunks.get(chunk);
    return !!c && c.full && c.rot === this.coverRot && c.scale === this.coverScale;
  }

  /**
   * Every frame, before the set manager's `endFrame`: the chunks of the last draw stay on screen while the static
   * layer is reused; chunks not on screen for `KEEP_FRAMES` frames are freed.
   */
  endFrame(): void {
    if (this.lastDraw !== this.frame) {
      for (const c of this.chunks.values()) if (c.lastFrame === this.lastDraw) c.lastFrame = this.frame;
      this.lastDraw = this.frame;
    }
    for (const [k, c] of [...this.chunks]) if (c.lastFrame < this.frame - KEEP_FRAMES) this.free(k, c);
    this.holdNow();
    this.frame++;
  }

  /**
   * The set manager's reclaimer: frees chunks not on screen in the frame just ended (`endFrame` ran), least recently
   * on screen first, until about `needBytes` are freed. Returns the bytes freed.
   */
  reclaim(needBytes: number): number {
    let freed = 0;
    const idle = [...this.chunks.entries()].filter(([, c]) => c.lastFrame < this.frame - 1).sort((a, b) => a[1].lastFrame - b[1].lastFrame);
    for (const [k, c] of idle) {
      if (freed >= needBytes) break;
      freed += c.bytes;
      this.free(k, c);
    }
    if (freed > 0) this.holdNow();
    return freed;
  }

  /** Frees every chunk canvas. */
  dispose(): void {
    for (const [k, c] of [...this.chunks]) this.free(k, c);
    this.opts.hold?.('ground', 0);
  }
}
