/**
 * Light overlay (Phase 4 §7 Overlays row, `tool.overlay === 'light'`): footpath and queue tiles tinted by light band
 * (Dark, Lit, Bright) and ground tiles that are lit, each band with its hatch so colour is not the only signal.
 * Drawn in `drawGround`, day or night (it shows the light map, which does not change with the clock).
 * One path per band (all visible tiles of the band as subpaths) keeps it to a few fills a frame. Owner: W3-F.
 */
import { Content, type Dir, type MapState } from '../../sim/map';
import { lightRawNow } from '../../sim/lighting/lightMap';
import type { World } from '../../sim/types';
import type { LayerFrame } from '../layers';
import { viewSize } from '../view';
import { LIGHT_BANDS, lightBandIndex } from './legend';
import { toView, viewTileToIndex, visibleTileRange, worldX, worldY, type TileRange, type ViewXY } from './project';
import { makeHatchTile, type CanvasFactory, type CanvasLike } from './sprites';

/** Map corners N, E, S, W of tile (x, y) as offsets, and their slope bits (render/iso.ts). */
const CORNER_DX: readonly number[] = [0, 1, 1, 0];
const CORNER_DY: readonly number[] = [0, 0, 1, 1];

export class LightOverlay {
  private bands: Int32Array[] = [new Int32Array(1024), new Int32Array(1024), new Int32Array(1024)];
  private counts = [0, 0, 0];
  private readonly range: TileRange = { u0: 0, u1: 0, v0: 0, v1: 0, aMin: 0, aMax: 0, bMin: 0, bMax: 0 };
  private readonly vp: ViewXY = { u: 0, v: 0 };
  private hatchTiles: [CanvasLike | null, CanvasLike | null] | null = null;
  private patterns: Array<CanvasPattern | null> = [null, null, null];
  private patternCtx: CanvasRenderingContext2D | null = null;

  constructor(private readonly makeCanvas: CanvasFactory) {}

  private push(band: number, tile: number): void {
    let arr = this.bands[band] as Int32Array;
    const n = this.counts[band] as number;
    if (n === arr.length) {
      const grown = new Int32Array(arr.length * 2);
      grown.set(arr);
      this.bands[band] = grown;
      arr = grown;
    }
    arr[n] = tile;
    this.counts[band] = n + 1;
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

  draw(ctx: CanvasRenderingContext2D, world: World, f: LayerFrame): void {
    const s = world.state;
    const map = s.map;
    const raw = lightRawNow(world);
    const r = f.rotation as Dir;
    const vs = viewSize(map, r);
    const rg = visibleTileRange(f.view, vs.w, vs.h, 64, this.range);
    this.counts[0] = 0;
    this.counts[1] = 0;
    this.counts[2] = 0;
    const content = map.content;
    for (let v = rg.v0; v <= rg.v1; v++) {
      for (let u = rg.u0; u <= rg.u1; u++) {
        const a = u - v;
        const b = u + v;
        if (a < rg.aMin || a > rg.aMax || b < rg.bMin || b > rg.bMax) continue;
        const i = viewTileToIndex(u, v, r, map.width, map.height);
        if (i < 0) continue;
        const c = content[i];
        const value = Math.min(255, raw[i] as number);
        const band = lightBandIndex(value);
        if (c === Content.Footpath || c === Content.Queue) this.push(band, i);
        else if (band > 0 && (map.water[i] as number) === 0) this.push(band, i);
      }
    }
    for (let band = 0; band < 3; band++) {
      const n = this.counts[band] as number;
      if (n === 0) continue;
      const def = LIGHT_BANDS[band];
      if (!def) continue;
      ctx.beginPath();
      const tiles = this.bands[band] as Int32Array;
      for (let k = 0; k < n; k++) this.tilePath(ctx, map, tiles[k] as number, f);
      ctx.fillStyle = def.colour;
      ctx.fill();
      const p = this.pattern(ctx, band);
      if (p) {
        ctx.fillStyle = p;
        ctx.fill();
      }
    }
  }

  /** Add the top face of map tile `i` (with its slope) to the current path, in device px. */
  private tilePath(ctx: CanvasRenderingContext2D, map: MapState, i: number, f: LayerFrame): void {
    const w = map.width;
    const x = i % w;
    const y = (i - x) / w;
    const h = map.heights[i] as number;
    const slope = map.slope[i] as number;
    const vp = this.vp;
    for (let c = 0; c < 4; c++) {
      const z = h + ((slope >> c) & 1);
      toView(x + (CORNER_DX[c] as number), y + (CORNER_DY[c] as number), f.rotation as Dir, w, map.height, vp);
      const px = worldX(vp.u, vp.v) * f.scale + f.offX;
      const py = worldY(vp.u, vp.v, z) * f.scale + f.offY;
      if (c === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
}
