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
 *   chunk unbuilt this frame and the ground incomplete.
 * - Cover (Task 3): today's terrain frees every image of a chunk this ground covers (`covers`), so a covered chunk is
 *   never left empty, not even for one frame: a chunk known to have a baked piece for every tile (built full, or every
 *   tile in view drawn from a piece) stays covered across view turns, zoom steps, density changes (a cap, a demotion
 *   lifting) and terrain changes elsewhere. While its own picture is not ready it draws a stand-in: its smaller chunk
 *   of the old scale (a zoom in), scaled; else, within the frame's first-build budget, its tiles directly, each from
 *   its piece, the same piece of the other density (`look.groundStandIn`: the density-2 twin on a zoom in) or a flat
 *   placeholder diamond; else one flat placeholder for the chunk. A stand-in leaves the ground incomplete. A new map,
 *   a changed tile or a piece the bake lacks uncovers the chunk (today's terrain draws it).
 * - Chunks are built at `groundScale`: the screen scale (zoom × dpr) rounded up to a step, never above the look's
 *   density, so a chunk holds no pixel the screen cannot show. Chunks of another rotation or a larger scale are freed
 *   as soon as the ground draws at a new one; a smaller chunk stays only as the stand-in until its replacement is
 *   built (freed at the end of the first frame it does not stand in).
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
/** Placeholder colours of a tile with no piece decoded yet, by ground terrain (today's terrain colours). */
const PLACEHOLDER: Readonly<Record<string, string>> = { path: '#dcc79c', queue: '#a9c0d2', water: '#4f86b8' };
const PLACEHOLDER_GRASS = '#67b24b';
/** One bit per ground terrain (`groundTerrain`), to ask `groundBaked` once per terrain in a chunk. */
const TERRAIN_BIT: Readonly<Record<string, number>> = { grass: 1, path: 2, queue: 4, water: 8 };
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
  /** Chunks of the current scale (or the last one, before a draw at a new scale), by chunk index. */
  private readonly chunks = new Map<number, Chunk>();
  /** Chunks of an old scale kept as stand-ins until their replacement is built, by chunk index. */
  private readonly old = new Map<number, Chunk>();
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
  /** Tiles drawn from a piece (its own or the other density's) by the last `draw` (tests, bench). */
  tilesDrawn = 0;
  /** Tiles drawn as a flat placeholder by the last `draw` (no piece decoded at either density). */
  placeholders = 0;
  /**
   * Per chunk, for the tiles whose fingerprint is `fullSig`: 1 when every tile is known to have a baked piece (built
   * full, every tile in view drawn from a piece or a stand-in for a piece still decoding, or every tile's terrain has a
   * ground set in the bake: `look.groundBaked`), 2 when a tile lacks one, 0 not known yet. Kept across view turns: the
   * bake has ground pieces for every turn (`rot: 'all'` sets), so a turn draws stand-ins instead of today's terrain.
   */
  private full = new Uint8Array(0);
  private fullSig = new Uint32Array(0);
  /** The map `full` is for. */
  private fullMap: MapState | null = null;
  /** The rotation `beginCover` was told (for `groundBaked`). */
  private coverRot: ViewRotation = 0;
  /** The terrain version `full` was last checked against. */
  private fullVersion = -1;
  /** The last `draw` threw: nothing counts as covered until a draw completes. */
  private drawFailed = false;
  /** What `beginCover` was told for this frame. */
  private coverOk = false;

  constructor(
    private readonly look: Pick<RealLook, 'groundPiece' | 'density'> & Partial<Pick<RealLook, 'groundStandIn' | 'groundBaked'>>,
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

  private free(from: Map<number, Chunk>, key: number, c: Chunk): void {
    c.canvas.width = 0;
    c.canvas.height = 0;
    this.bytes -= c.bytes;
    this.upBytes -= c.upBytes;
    from.delete(key);
  }

  private freeAll(): void {
    for (const [k, c] of [...this.chunks]) this.free(this.chunks, k, c);
    for (const [k, c] of [...this.old]) this.free(this.old, k, c);
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

  /** Records whether chunk `c` has a baked piece for every tile (1) or lacks one (2), for the tiles it has now. */
  private markFull(map: MapState, c: number, full: boolean, sig?: number): void {
    const f = full ? 1 : 2;
    const cxN = Math.ceil(map.width / CHUNK_SIZE);
    if (this.full[c] !== f || sig !== undefined) this.fullSig[c] = sig ?? this.sig(map, c % cxN, Math.floor(c / cxN));
    this.full[c] = f;
  }

  /**
   * The cover record for `map` at terrain version `version`: started over for a new map; after a terrain change only
   * the chunks whose tiles (or ring) changed are dropped.
   */
  private checkFull(map: MapState, version: number): void {
    const cxN = Math.ceil(map.width / CHUNK_SIZE);
    const n = cxN * Math.ceil(map.height / CHUNK_SIZE);
    if (map !== this.fullMap || this.full.length !== n) {
      this.full = new Uint8Array(n);
      this.fullSig = new Uint32Array(n);
      this.fullMap = map;
      this.fullVersion = version;
      return;
    }
    if (version === this.fullVersion) return;
    this.fullVersion = version;
    for (let c = 0; c < n; c++) if (this.full[c] !== 0 && this.fullSig[c] !== this.sig(map, c % cxN, Math.floor(c / cxN))) this.full[c] = 0;
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
      this.drawFailed = true;
      const n = this.drawChunks(ctx, map, view, scale, offX, offY, rot, version, env);
      this.drawFailed = false;
      return n;
    } catch (err) {
      // Never out of the frame: the ground counts as incomplete and today's terrain shows.
      this.report(err);
      this.complete = false;
      return 0;
    }
  }

  private blit(ctx: CanvasRenderingContext2D, ch: Chunk, scale: number, offX: number, offY: number): void {
    ch.lastFrame = this.frame;
    const sp = ch.sprite;
    if (sp.w <= 1) return;
    const f = scale / sp.scale;
    const x0 = Math.round(offX - sp.ox * f);
    const y0 = Math.round(offY - sp.oy * f);
    ctx.drawImage(sp.image, x0, y0, Math.round(offX + (sp.w - sp.ox) * f) - x0, Math.round(offY + (sp.h - sp.oy) * f) - y0);
  }

  private drawChunks(ctx: CanvasRenderingContext2D, map: MapState, view: ViewRect, scale: number, offX: number, offY: number, rot: ViewRotation, version: number, env?: GroundEnv): number {
    this.builds = 0;
    this.lastDraw = this.frame;
    const cxN = Math.ceil(map.width / CHUNK_SIZE);
    const cyN = Math.ceil(map.height / CHUNK_SIZE);
    // The cover record first (it compares against the map and the rotation of the last draw).
    this.checkFull(map, version);
    if (map !== this.map) {
      this.freeAll();
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
    const cs = direct ? 0 : groundScale(scale, this.look.density(scale, 1));
    const upScale = groundScale(scale, pickDensity(scale, 1, 4));
    // Chunks of another rotation are never drawn again at this one, nor any chunk while tiles are drawn directly:
    // free them now. A smaller chunk of another scale (a zoom in) becomes the stand-in until its replacement is built;
    // a larger one (a zoom out) is freed, as it would hold more than the new one (tiles or a placeholder stand in).
    for (const [k, c] of [...this.old]) if (direct || c.rot !== rot || c.scale > cs) this.free(this.old, k, c);
    for (const [k, c] of [...this.chunks]) {
      if (direct || c.rot !== rot || c.scale > cs) this.free(this.chunks, k, c);
      else if (c.scale !== cs) {
        const prev = this.old.get(k);
        if (prev) this.free(this.old, k, prev);
        this.chunks.delete(k);
        this.old.set(k, c);
      }
    }
    let complete = true;
    let drawn = 0;
    let t0 = 0;
    /** New chunks built and tile stand-ins drawn this frame (under `FIRST_BUILD_BUDGET_MS` from `t0`). */
    let work = 0;
    this.tilesDrawn = 0;
    this.placeholders = 0;
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
      if (changed) {
        const sig = ch || this.old.has(key) ? this.sig(map, cx, cy) : 0;
        if (ch && ch.sig !== sig) {
          this.free(this.chunks, key, ch);
          ch = undefined;
        }
        const o = this.old.get(key);
        if (o && o.sig !== sig) this.free(this.old, key, o);
      }
      const g = chunkBounds(map, cx, cy, rot);
      if (g.right < view.x0 || g.left > view.x1 || g.bottom < view.y0 || g.top > view.y1) continue;
      // Covered this frame (today's terrain left it out and freed its images): something is always drawn.
      const covered = this.full[key] === 1;
      if (direct) {
        const r = this.drawTiles(ctx, map, cx, cy, view, scale, offX, offY, rot, env);
        if (!r.complete) complete = false;
        this.markFull(map, key, r.full);
        drawn++;
        continue;
      }
      if (!ch) {
        let built: Chunk | null = null;
        // New chunks and tile stand-ins share the frame's first-build budget (at least one piece of work a frame).
        const timeLeft = work === 0 || terrainClock.now() - t0 < FIRST_BUILD_BUDGET_MS;
        if (work === 0) t0 = terrainClock.now();
        if (timeLeft) {
          // Room first (the whole chunk box; an emptier chunk gives the difference back below).
          const need = (Math.ceil((g.right - g.left) * cs) + PAD * 2) * (Math.ceil((g.bottom - g.top) * cs) + PAD * 2) * 4;
          if (!this.opts.admit || this.opts.admit('ground', this.bytes + need, this.upBytes + Math.round(need * (upScale / cs) ** 2))) {
            work++;
            built = this.build(map, cx, cy, rot, cs, upScale, this.sig(map, cx, cy), env);
          } else {
            // No room: the old-scale stand-in gives its memory back; the tiles are drawn directly instead.
            const o = this.old.get(key);
            if (o) this.free(this.old, key, o);
          }
        }
        if (built) {
          this.builds++;
          ch = built;
          this.chunks.set(key, ch);
          this.bytes += ch.bytes;
          this.upBytes += ch.upBytes;
          this.markFull(map, key, ch.full, ch.sig);
          const o = this.old.get(key);
          if (o) this.free(this.old, key, o);
          this.holdNow();
        } else {
          complete = false;
          this.holdNow();
          if (!covered) continue;
          // A stand-in: the old-scale chunk, scaled; else, while the frame's budget lasts, the tiles straight into the
          // target; else one flat placeholder for the chunk.
          const o = this.old.get(key);
          if (o) this.blit(ctx, o, scale, offX, offY);
          else if (work === 0 || terrainClock.now() - t0 < FIRST_BUILD_BUDGET_MS) {
            if (work++ === 0) t0 = terrainClock.now();
            this.markFull(map, key, this.drawTiles(ctx, map, cx, cy, view, scale, offX, offY, rot, env).full);
          } else this.chunkPlaceholder(ctx, map, cx, cy, rot, scale, offX, offY);
          drawn++;
          continue;
        }
      }
      this.blit(ctx, ch, scale, offX, offY);
      if (ch.sprite.w > 1) drawn++;
    }
    this.holdNow();
    this.complete = complete;
    return drawn;
  }

  /**
   * The tiles of chunk (cx, cy) inside `view`, back to front, straight into `ctx` at the screen's scale: above
   * `DIRECT_ABOVE_SCALE` always, below it as a covered chunk's stand-in. Each tile from its piece; while that is not
   * decoded, the other density's piece (`groundStandIn`) or a flat placeholder, never nothing (incomplete). `full`:
   * no tile in view lacked a baked piece.
   */
  private drawTiles(ctx: CanvasRenderingContext2D, map: MapState, cx: number, cy: number, view: ViewRect, scale: number, offX: number, offY: number, rot: ViewRotation, env: GroundEnv | undefined): { complete: boolean; full: boolean } {
    const vr = chunkViewRect(map, cx, cy, rot);
    let complete = true;
    let full = true;
    const cached = this.joins.length > 0;
    for (let s = vr.u0 + vr.v0; s <= vr.u1 + vr.v1 - 2; s++) {
      for (let u = Math.max(vr.u0, s - (vr.v1 - 1)); u <= Math.min(vr.u1 - 1, s - vr.v0); u++) {
        const v = s - u;
        const m = viewToMap(u, v, rot, map.width, map.height);
        const i = m.y * map.width + m.x;
        const hz = (map.heights[i] as number) * STEP_PX;
        const ax = (u - v) * HW;
        const ay = (u + v) * HH - hz;
        // A piece spans its tile (64 × 32 px at zoom 1) and hangs at most its height down (cliff faces).
        if (ax + HW + 8 < view.x0 || ax - HW - 8 > view.x1 || ay + 2 * HH + hz + 8 < view.y0 || ay - 16 > view.y1) continue;
        const terrain = groundTerrain(map, i);
        let join: number | undefined;
        if (env && (terrain === 'path' || terrain === 'queue')) {
          let raw = cached ? (this.joins[i] as number) : -1;
          if (raw < 0) {
            raw = pathJoinMask(map, i, env.rides, env.stalls);
            if (cached) this.joins[i] = raw;
          }
          join = rotateSlopeMask(raw, rot);
        }
        const slope = rotateSlopeMask(map.slope[i] as number, rot);
        let sp = this.look.groundPiece(terrain, slope, groundVariant(m.x, m.y), rot, join);
        if (sp === null) {
          complete = false;
          sp = this.look.groundStandIn?.(terrain, slope, groundVariant(m.x, m.y), rot, join) ?? null;
        } else if (sp === undefined) full = false;
        if (!sp) {
          this.placeholder(ctx, terrain, ax, ay, scale, offX, offY);
          continue;
        }
        const k = scale / sp.scale;
        const x0 = Math.round(offX + ax * scale - sp.ox * k);
        const y0 = Math.round(offY + ay * scale - sp.oy * k);
        ctx.drawImage(sp.image, sp.sx ?? 0, sp.sy ?? 0, sp.w, sp.h, x0, y0, Math.round(offX + ax * scale + (sp.w - sp.ox) * k) - x0, Math.round(offY + ay * scale + (sp.h - sp.oy) * k) - y0);
        this.tilesDrawn++;
      }
    }
    return { complete, full };
  }

  /** A covered chunk with no stand-in this frame (the budget is spent): one flat diamond at its mean height. */
  private chunkPlaceholder(ctx: CanvasRenderingContext2D, map: MapState, cx: number, cy: number, rot: ViewRotation, scale: number, offX: number, offY: number): void {
    const vr = chunkViewRect(map, cx, cy, rot);
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
    ctx.fillStyle = PLACEHOLDER_GRASS;
    ctx.fill();
    this.placeholders += count;
  }

  /** A tile with no piece to draw: a flat diamond at its base height in a plain colour of its terrain. */
  private placeholder(ctx: CanvasRenderingContext2D, terrain: string, ax: number, ay: number, scale: number, offX: number, offY: number): void {
    const x = offX + ax * scale;
    const y = offY + ay * scale;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + HW * scale, y + HH * scale);
    ctx.lineTo(x, y + 2 * HH * scale);
    ctx.lineTo(x - HW * scale, y + HH * scale);
    ctx.closePath();
    ctx.fillStyle = PLACEHOLDER[terrain] ?? PLACEHOLDER_GRASS;
    ctx.fill();
    this.placeholders++;
  }

  /** See `GroundLayer.beginCover`: the frame's map and terrain version, before today's terrain draws. */
  beginCover(map: MapState, _scale: number, rot: ViewRotation, version: number): void {
    // A draw that threw: nothing counts as covered until a draw completes.
    this.coverOk = !this.drawFailed;
    this.coverRot = rot;
    // A new map starts the record over; a terrain change forgets only the chunks whose tiles (or the ring around
    // them, for path joins) changed.
    this.checkFull(map, version);
  }

  /**
   * True when this frame's `draw` will lay chunk `chunk` in full: every tile is known to have a baked piece for its
   * tiles as they are now (see the header: until its own picture is ready it draws a stand-in).
   * A chunk with a piece missing from the bake is never covered, so today's terrain stays under it.
   */
  covers(chunk: number): boolean {
    if (!this.coverOk) return false;
    if (this.full[chunk] === 0 && this.look.groundBaked && this.fullMap) {
      // Not drawn yet (a new park, a chunk coming into view, a changed tile): covered when the bake has a ground set
      // for every tile's terrain, so today's terrain never builds under it (a frame the bake lacks shows a placeholder
      // for a frame, then uncovers the chunk).
      const map = this.fullMap;
      const cxN = Math.ceil(map.width / CHUNK_SIZE);
      const cx = chunk % cxN;
      const cy = Math.floor(chunk / cxN);
      let seen = 0;
      let ok = true;
      for (let y = cy * CHUNK_SIZE; ok && y < Math.min(map.height, (cy + 1) * CHUNK_SIZE); y++) {
        for (let x = cx * CHUNK_SIZE; x < Math.min(map.width, (cx + 1) * CHUNK_SIZE); x++) {
          const t = groundTerrain(map, y * map.width + x);
          const bit = TERRAIN_BIT[t] ?? 0;
          if (seen & bit) continue;
          seen |= bit;
          if (!this.look.groundBaked(t, this.coverRot)) {
            ok = false;
            break;
          }
        }
      }
      this.markFull(map, chunk, ok);
    }
    return this.full[chunk] === 1;
  }

  /**
   * Every frame, before the set manager's `endFrame`: the chunks of the last draw stay on screen while the static
   * layer is reused; chunks not on screen for `KEEP_FRAMES` frames are freed, old-scale stand-ins as soon as a frame
   * did not need them.
   */
  endFrame(): void {
    if (this.lastDraw !== this.frame) {
      for (const c of this.chunks.values()) if (c.lastFrame === this.lastDraw) c.lastFrame = this.frame;
      for (const c of this.old.values()) if (c.lastFrame === this.lastDraw) c.lastFrame = this.frame;
      this.lastDraw = this.frame;
    }
    for (const [k, c] of [...this.chunks]) if (c.lastFrame < this.frame - KEEP_FRAMES) this.free(this.chunks, k, c);
    for (const [k, c] of [...this.old]) if (c.lastFrame < this.frame) this.free(this.old, k, c);
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
      this.free(this.chunks, k, c);
    }
    if (freed > 0) this.holdNow();
    return freed;
  }

  /** Frees every chunk canvas. */
  dispose(): void {
    this.freeAll();
    this.opts.hold?.('ground', 0);
  }
}
