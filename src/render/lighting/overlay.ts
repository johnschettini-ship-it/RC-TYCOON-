/**
 * Light overlay (Phase 4 §7 Overlays row, `tool.overlay === 'light'`): footpath and queue tiles tinted by light band
 * (Dark, Lit, Bright) and dry ground tiles that are lit, each band with its hatch so colour is not the only signal.
 * Drawn in `drawGround`, day or night (it shows the light map, which does not change with the clock). Owner: W3-F.
 *
 * Canvas calls, not pixels, are the cost of a tile overlay, so the tile shapes are cached: the map is cut into
 * 16 × 16-tile chunks, each with one path per band in world pixels (zoom 1, view rotation applied). A frame diffs
 * the tile bands, heights, and slopes of the visible chunks (plain array reads), rebuilds only the chunks that
 * changed, and joins the visible chunks into one path per band (again only when the visible set or a chunk
 * changed). A still or panning frame is 5 fills under the camera transform, with no per-tile canvas calls.
 * Elevated paths are not tinted (their column shows the ground tile's band).
 */
import { Content, type Dir, type MapState } from '../../sim/map';
import { lightRawNow } from '../../sim/lighting/lightMap';
import type { World } from '../../sim/types';
import type { LayerFrame } from '../layers';
import { LIGHT_BANDS, lightBandIndex } from './legend';
import { toView, worldX, worldY, type ViewXY } from './project';
import { makeHatchTile, type CanvasFactory, type CanvasLike } from './sprites';

/** The part of `Path2D` the overlay uses. */
export interface PathLike {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  addPath(path: PathLike): void;
}

export type PathFactory = () => PathLike | null;

export const defaultPathFactory: PathFactory = () => (typeof Path2D !== 'undefined' ? new Path2D() : null);

export const OVERLAY_CHUNK = 16;
const BANDS = 3;
/** Map corners N, E, S, W of a tile as offsets; corner c is raised when slope bit c is set (render/iso.ts). */
const CORNER_DX: readonly number[] = [0, 1, 1, 0];
const CORNER_DY: readonly number[] = [0, 0, 1, 1];
/** Highest corner in steps (master 6.3: heights 0–63, plus one for a raised corner). */
const Z_MAX = 64;

class Chunk {
  /** Per tile: 0 = no tint, else band + 1. */
  readonly codes: Uint8Array;
  readonly heights: Uint8Array;
  readonly slopes: Uint8Array;
  readonly paths: Array<PathLike | null> = [null, null, null];
  readonly counts = [0, 0, 0];
  rotation = -1;
  built = false;
  constructor(
    readonly cx: number,
    readonly cy: number,
    size: number,
  ) {
    this.codes = new Uint8Array(size);
    this.heights = new Uint8Array(size);
    this.slopes = new Uint8Array(size);
  }
}

export class LightOverlay {
  private chunks: Chunk[] = [];
  private map: MapState | null = null;
  private cw = 0;
  private ch = 0;
  private readonly vp: ViewXY = { u: 0, v: 0 };
  private hatchTiles: [CanvasLike | null, CanvasLike | null] | null = null;
  private patterns: Array<CanvasPattern | null> = [null, null, null];
  private patternCtx: CanvasRenderingContext2D | null = null;
  private readonly visible: Chunk[] = [];
  /** Visible chunk indices of the frame that built `joined`. */
  private joinedSet = new Int32Array(0);
  private joinedCount = -1;
  private readonly joined: Array<PathLike | null> = [null, null, null];
  /** Chunks rebuilt by the last frame (tests and stats). */
  rebuilt = 0;
  /** The joined band paths were rebuilt by the last frame. */
  rejoined = false;

  constructor(
    private readonly makeCanvas: CanvasFactory,
    private readonly makePath: PathFactory = defaultPathFactory,
  ) {}

  private reset(map: MapState): void {
    this.map = map;
    this.cw = Math.ceil(map.width / OVERLAY_CHUNK);
    this.ch = Math.ceil(map.height / OVERLAY_CHUNK);
    this.chunks = [];
    for (let cy = 0; cy < this.ch; cy++) for (let cx = 0; cx < this.cw; cx++) this.chunks.push(new Chunk(cx, cy, OVERLAY_CHUNK * OVERLAY_CHUNK));
    this.joinedCount = -1;
  }

  /** Join the visible chunks' paths per band, unless the same chunks were joined last frame and none changed. */
  private join(): void {
    const visible = this.visible;
    let same = this.rebuilt === 0 && this.joinedCount === visible.length;
    if (same) {
      for (let n = 0; n < visible.length; n++) {
        const c = visible[n] as Chunk;
        if (this.joinedSet[n] !== c.cy * this.cw + c.cx) {
          same = false;
          break;
        }
      }
    }
    this.rejoined = !same;
    if (same) return;
    if (this.joinedSet.length < visible.length) this.joinedSet = new Int32Array(Math.max(16, visible.length * 2));
    for (let n = 0; n < visible.length; n++) {
      const c = visible[n] as Chunk;
      this.joinedSet[n] = c.cy * this.cw + c.cx;
    }
    this.joinedCount = visible.length;
    for (let b = 0; b < BANDS; b++) {
      let joined: PathLike | null = null;
      for (let n = 0; n < visible.length; n++) {
        const c = visible[n] as Chunk;
        const p = c.paths[b];
        if (!p || (c.counts[b] as number) === 0) continue;
        if (joined === null) joined = this.makePath();
        joined?.addPath(p);
      }
      this.joined[b] = joined;
    }
  }

  private pattern(ctx: CanvasRenderingContext2D, band: number): CanvasPattern | null {
    if (this.patternCtx !== ctx) {
      this.patternCtx = ctx;
      this.patterns = [null, null, null];
    }
    const hatch = LIGHT_BANDS[band]?.hatch ?? 'none';
    if (hatch === 'none') return null;
    if (this.hatchTiles === null) this.hatchTiles = [makeHatchTile(this.makeCanvas, 'dense'), makeHatchTile(this.makeCanvas, 'sparse')];
    let p = this.patterns[band] ?? null;
    if (p === null) {
      const tile = hatch === 'dense' ? this.hatchTiles[0] : this.hatchTiles[1];
      p = tile ? ctx.createPattern(tile as unknown as CanvasImageSource, 'repeat') : null;
      this.patterns[band] = p;
    }
    return p;
  }

  /** Conservative world-pixel box of a chunk at any height, tested against the visible rectangle. */
  private chunkVisible(c: Chunk, map: MapState, f: LayerFrame): boolean {
    const x0 = c.cx * OVERLAY_CHUNK;
    const y0 = c.cy * OVERLAY_CHUNK;
    const x1 = Math.min(map.width, x0 + OVERLAY_CHUNK);
    const y1 = Math.min(map.height, y0 + OVERLAY_CHUNK);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const r = f.rotation as Dir;
    for (let k = 0; k < 4; k++) {
      const fx = k === 0 || k === 3 ? x0 : x1;
      const fy = k < 2 ? y0 : y1;
      toView(fx, fy, r, map.width, map.height, this.vp);
      const wx = worldX(this.vp.u, this.vp.v);
      const wy = worldY(this.vp.u, this.vp.v, 0);
      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wy < minY) minY = wy;
      if (wy > maxY) maxY = wy;
    }
    minY -= Z_MAX * 8;
    const v = f.view;
    return maxX >= v.x0 && minX <= v.x1 && maxY >= v.y0 && minY <= v.y1;
  }

  /** Diff a chunk's tile bands and shapes; true when its paths must be rebuilt. */
  private diff(c: Chunk, map: MapState, raw: Uint16Array, rotation: number): boolean {
    let changed = !c.built || c.rotation !== rotation;
    const w = map.width;
    const content = map.content;
    const water = map.water;
    const heights = map.heights;
    const slope = map.slope;
    const x0 = c.cx * OVERLAY_CHUNK;
    const y0 = c.cy * OVERLAY_CHUNK;
    const x1 = Math.min(map.width, x0 + OVERLAY_CHUNK);
    const y1 = Math.min(map.height, y0 + OVERLAY_CHUNK);
    let k = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++, k++) {
        const i = y * w + x;
        const v = raw[i] as number;
        const band = lightBandIndex(v > 255 ? 255 : v);
        const ct = content[i];
        let code = 0;
        if (ct === Content.Footpath || ct === Content.Queue) code = band + 1;
        else if (band > 0 && water[i] === 0) code = band + 1;
        if (code !== c.codes[k]) {
          c.codes[k] = code;
          changed = true;
        }
        if (code !== 0 && (heights[i] !== c.heights[k] || slope[i] !== c.slopes[k])) {
          c.heights[k] = heights[i] as number;
          c.slopes[k] = slope[i] as number;
          changed = true;
        }
      }
    }
    return changed;
  }

  private rebuild(c: Chunk, map: MapState, rotation: Dir): void {
    for (let b = 0; b < BANDS; b++) {
      c.paths[b] = null;
      c.counts[b] = 0;
    }
    const x0 = c.cx * OVERLAY_CHUNK;
    const y0 = c.cy * OVERLAY_CHUNK;
    const x1 = Math.min(map.width, x0 + OVERLAY_CHUNK);
    const y1 = Math.min(map.height, y0 + OVERLAY_CHUNK);
    let k = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++, k++) {
        const code = c.codes[k] as number;
        if (code === 0) continue;
        const b = code - 1;
        let p = c.paths[b] ?? null;
        if (p === null) {
          p = this.makePath();
          if (p === null) continue;
          c.paths[b] = p;
        }
        c.counts[b] = (c.counts[b] as number) + 1;
        const h = c.heights[k] as number;
        const s = c.slopes[k] as number;
        for (let corner = 0; corner < 4; corner++) {
          toView(x + (CORNER_DX[corner] as number), y + (CORNER_DY[corner] as number), rotation, map.width, map.height, this.vp);
          const px = worldX(this.vp.u, this.vp.v);
          const py = worldY(this.vp.u, this.vp.v, h + ((s >> corner) & 1));
          if (corner === 0) p.moveTo(px, py);
          else p.lineTo(px, py);
        }
        p.closePath();
      }
    }
    c.rotation = rotation;
    c.built = true;
  }

  draw(ctx: CanvasRenderingContext2D, world: World, f: LayerFrame): void {
    const map = world.state.map;
    if (map !== this.map || this.cw !== Math.ceil(map.width / OVERLAY_CHUNK) || this.ch !== Math.ceil(map.height / OVERLAY_CHUNK)) this.reset(map);
    const raw = lightRawNow(world);
    const rotation = f.rotation as Dir;
    const visible = this.visible;
    visible.length = 0;
    this.rebuilt = 0;
    for (let n = 0; n < this.chunks.length; n++) {
      const c = this.chunks[n] as Chunk;
      if (!this.chunkVisible(c, map, f)) continue;
      if (this.diff(c, map, raw, rotation)) {
        this.rebuild(c, map, rotation);
        this.rebuilt++;
      }
      visible.push(c);
    }
    this.join();
    if (visible.length === 0) return;
    ctx.setTransform(f.scale, 0, 0, f.scale, f.offX, f.offY);
    for (let b = 0; b < BANDS; b++) {
      const def = LIGHT_BANDS[b];
      const p = this.joined[b];
      if (!def || !p) continue;
      ctx.fillStyle = def.colour;
      ctx.fill(p as unknown as Path2D);
      const pattern = this.pattern(ctx, b);
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fill(p as unknown as Path2D);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
