/** Phase 8b stage 0b test (never merged): the app runtime chunk (style, picture store, `pixel.rt`, progress line, stats). */
import { pixel, type PixelFrame, type PixelPlan, type PixelRuntime } from '../../artHook';
import type { LayerFrame } from '../../layers';
import type { Sprite } from '../../spriteCache';
import type { ArtBounds } from '../../sprites/rides';
import type { Camera } from '../../types';
import type { ViewRotation } from '../../view';
import type { MapState } from '../../../sim/map';
import type { ElevatedPath } from '../../../sim/paths/types';
import type { World } from '../../../sim/types';
import { isPhoneScreen } from '../../canvas';
import { darknessAt } from '../../lighting/darkness';
import { artScale, blitArt, blitArtColumn, HOME_ZOOM_TARGET, nearestLevel, snapArt, type PixelGrid } from '../grid';
import { resolveArtStyle } from '../style';
import { decodeIndex, type PackIndex } from './format';
import { assembleChunk } from './ground';
import { ShadowPass } from './shadows';
import { TrackPictures, type TrackCarRec, type TrackGateRec, type TrackSliceRec } from './track';
import { createProgressLine, type ProgressLine } from './progress';
import { prepareBench, startBench } from './bench';
import { createStats, noteBudget, noteDecode, type PredrawnStats } from './stats';
import { browserIo, PictureStore, type PackRef, type StoreIo } from './store';

/** The shared budget of pictures, swaps, chunk images and the static layer (D11). */
export const BUDGET_BYTES = 64 * 1024 * 1024;

/** The frame set: `?frames=coarse|full` overrides the device's set (phones coarse, tablets full; B4). */
export function frameSetFor(cssW: number, cssH: number, search: string): 'full' | 'coarse' {
  const q = new URLSearchParams(search).get('frames');
  if (q === 'coarse' || q === 'full') return q;
  return isPhoneScreen(cssW, cssH) ? 'coarse' : 'full';
}

/** iPhone canvas limit: the canvas area must stay below this (pixels). */
export const CANVAS_AREA_MAX = 16_777_216;

/** The runtime behind `pixel.rt`. Task 12 fills in the ground, shadow, track and elevated members. */
export class AppRuntime implements PixelRuntime {
  private grid: PixelGrid | null = null;
  private readonly frame: PixelFrame = { n: 0, scale: 1, offX: 0, offY: 0, night: false };
  private lastWorld: World | null = null;
  private lastRot = -1;
  private complete = false;
  private turnActive = false;
  private turnCount = 0;
  private readonly shadows: ShadowPass;
  private readonly track: TrackPictures;

  constructor(
    readonly store: PictureStore,
    readonly stats: PredrawnStats,
    readonly progress: ProgressLine | null,
  ) {
    this.shadows = new ShadowPass(store);
    this.track = new TrackPictures(store);
    store.onDecode = (r) => noteDecode(stats, r);
    store.onError = () => progress?.error();
  }

  /**
   * The canvas plan (Test decisions 2, 3): phone `k = max(1, ceil(dpr))`, tablet `k = max(1, round(dpr))`; canvas
   * `ceil(css × dpr / k)`; box `canvas × k / dpr` CSS px; home zoom the crisp level nearest to 1. Throws at the
   * iPhone canvas area limit.
   */
  plan(cssW: number, cssH: number, dpr: number): PixelPlan {
    const d = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
    const device = isPhoneScreen(cssW, cssH) ? 'phone' : 'tablet';
    const stretch = device === 'phone' ? Math.max(1, Math.ceil(d)) : Math.max(1, Math.round(d));
    const canvasW = Math.max(1, Math.ceil((cssW * d) / stretch));
    const canvasH = Math.max(1, Math.ceil((cssH * d) / stretch));
    if (canvasW * canvasH >= CANVAS_AREA_MAX) throw new Error(`stage 0b: canvas ${canvasW} × ${canvasH} reaches the iPhone limit`);
    this.grid = { device: 'phone', deviceRatio: d, stretch, canvasRatio: d / stretch };
    return {
      stretch,
      canvasW,
      canvasH,
      boxW: (canvasW * stretch) / d,
      boxH: (canvasH * stretch) / d,
      homeZoom: nearestLevel(HOME_ZOOM_TARGET, this.grid),
      budgetBytes: BUDGET_BYTES,
      coarse: this.stats.frameSet === 'coarse',
      device,
    };
  }

  /**
   * A new frame: the store's frame, the art frame (art scale `n`, whole offsets from the viewport centre), the night
   * flag (D8), and the turn tracking (a view turn starts counting incomplete frames; a new world starts B5 again).
   */
  beginFrame(cam: Camera, world: World, cssW: number, cssH: number, dpr: number, alpha: number): PixelFrame {
    this.store.beginFrame();
    if (!this.grid) this.plan(cssW, cssH, dpr);
    const g = this.grid as PixelGrid;
    if (world !== this.lastWorld) {
      this.lastWorld = world;
      this.complete = false;
      this.stats.firstCompleteMs = -1;
      this.turnActive = false;
      this.lastRot = -1;
    }
    const rot = cam.rotation & 3;
    if (this.lastRot >= 0 && rot !== this.lastRot) {
      // A turn during an open turn: its count is already in the max (fix round 1, I1).
      if (this.turnActive && this.turnCount > this.stats.incompleteAfterTurnMax) this.stats.incompleteAfterTurnMax = this.turnCount;
      this.turnActive = true;
      this.turnCount = 0;
    }
    this.lastRot = rot;
    const f = this.frame;
    f.n = artScale(cam.zoom, g);
    f.scale = cam.zoom * g.canvasRatio;
    f.offX = Math.round((cssW * g.canvasRatio) / 2 - cam.centerX * f.scale);
    f.offY = Math.round((cssH * g.canvasRatio) / 2 - cam.centerY * f.scale);
    f.night = darknessAt(world.state.tick + alpha, world.state.park.afterDark) > 0;
    return f;
  }

  picture(kind: number, key: number, swap = -1): Sprite | null {
    return this.store.get(kind, key, swap);
  }

  keep(sp: Sprite | null): Sprite | null {
    return this.store.keep(sp);
  }

  blit(ctx: CanvasRenderingContext2D, sp: Sprite, wx: number, wy: number): void {
    blitArt(ctx, sp, wx, wy, this.frame);
  }

  blitColumn(ctx: CanvasRenderingContext2D, sp: Sprite, ax: number, ay: number, colL: number, colR: number, ends: number): void {
    blitArtColumn(ctx, sp, ax, ay, colL, colR, this.frame, ends);
  }

  /** A walker anchor on the art grid: x first, then y along the walk slope (stage 0 `snapWalker`, no allocation). */
  snapWalker(ax: number, ay: number, slope: 0 | 0.5 | -0.5, out: { x: number; y: number }): void {
    const x = snapArt(ax);
    out.x = x;
    out.y = snapArt(ay + (x - ax) * slope);
  }

  /** The ground chunk from pieces (`assembleChunk`); null while a piece decodes. Feeds `chunkMsMax`. Timing only measures. */
  chunk(map: MapState, rect: { u0: number; v0: number; u1: number; v1: number }, r: ViewRotation, geom: ArtBounds): Sprite | null {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const out = assembleChunk(this.store, map, rect, r, geom);
    const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    // Fix round 1 (M4): only complete assemblies feed the timing.
    if (out.complete && ms > this.stats.chunkMsMax) this.stats.chunkMsMax = ms;
    return out.complete ? out.sprite : null;
  }

  /** Object shadows (none at night, D8). Uses the layer frame's art frame (the one `beginFrame` returned). */
  drawShadows(ctx: CanvasRenderingContext2D, world: World, f: LayerFrame): void {
    this.shadows.draw(ctx, world, f, f.art ?? this.frame);
  }

  drawTrack(ctx: CanvasRenderingContext2D, what: 'slice' | 'car' | 'gate', rec: unknown, f: LayerFrame): boolean {
    const frame = f.art ?? this.frame;
    if (what === 'slice') return this.lastWorld ? this.track.slice(ctx, this.lastWorld, rec as TrackSliceRec, frame) : false;
    if (what === 'car') return this.track.car(ctx, rec as TrackCarRec, frame);
    return this.track.gate(ctx, rec as TrackGateRec, frame);
  }

  drawElevated(ctx: CanvasRenderingContext2D, p: ElevatedPath, world: World, f: LayerFrame): void {
    this.track.elevated(ctx, p, world, f, f.art ?? this.frame);
  }

  get storeBytes(): number {
    return this.store.totalBytes;
  }

  /**
   * Budget and eviction, counters, turn tracking (`incompleteAfterTurnMax`: frames with a missing picture or placeholder
   * ground from the turn draw to the first complete frame, the running count), the first complete frame of the world
   * (`firstCompleteMs`) and the progress line. A frame is complete when no picture is missing and the ground has no
   * placeholder (fix round 1 I2). `otherBytes`: the rest of the sprite memory (M1); the peak is noted before eviction.
   */
  endFrame(staticBytes: number, chunkBytes: number, groundComplete = true, otherBytes = 0): boolean {
    const s = this.store;
    const st = this.stats;
    noteBudget(st, s.sheetBytes, s.swapBytes, chunkBytes, staticBytes, otherBytes);
    s.endFrame(staticBytes + chunkBytes + otherBytes);
    noteBudget(st, s.sheetBytes, s.swapBytes, chunkBytes, staticBytes, otherBytes);
    st.failed = s.failed;
    const missing = s.missing;
    st.missing = missing;
    st.frameComplete = missing === 0 && groundComplete;
    st.missingTotal += missing;
    st.sheetsDecoded = s.images;
    if (s.swapMainMsMax > st.swapMainMsMax) st.swapMainMsMax = s.swapMainMsMax;
    if (missing > 0 || !groundComplete) {
      st.incompleteFrames++;
      if (this.turnActive) {
        this.turnCount++;
        // The running count, so a turn that never completes is still in the max (fix round 1, I1).
        if (this.turnCount > st.incompleteAfterTurnMax) st.incompleteAfterTurnMax = this.turnCount;
      }
    } else {
      if (this.turnActive) {
        if (this.turnCount > st.incompleteAfterTurnMax) st.incompleteAfterTurnMax = this.turnCount;
        this.turnActive = false;
      }
      if (!this.complete) {
        this.complete = true;
        st.firstCompleteMs = typeof performance !== 'undefined' ? performance.now() : 0;
      }
    }
    this.progress?.update(s.decoded, s.queued, !this.complete);
    return this.complete;
  }
}

/** One decoded sheet for the B1 check (Task 14). */
export interface DecodedSheet {
  file: string;
  w: number;
  h: number;
  swappable: number;
  image: CanvasImageSource;
}

/** `window.__predrawn` (Task 14): the packs, a pack's index and every sheet of a pack decoded with the store's options. */
export function predrawnDebug(packs: readonly PackRef[], io: StoreIo): {
  packs: readonly PackRef[];
  entries(pack: string): Promise<PackIndex>;
  decodeAll(pack: string): Promise<{ index: PackIndex; sheets: DecodedSheet[] }>;
} {
  const indexes = new Map<string, Promise<PackIndex>>();
  const entries = (name: string): Promise<PackIndex> => {
    let p = indexes.get(name);
    if (!p) {
      const ref = packs.find((q) => q.name === name);
      if (!ref) return Promise.reject(new Error(`no pack ${name}`));
      p = io.fetch(ref.url).then(decodeIndex);
      indexes.set(name, p);
    }
    return p;
  };
  return {
    packs,
    entries,
    async decodeAll(name) {
      const ref = packs.find((q) => q.name === name) as PackRef;
      const index = await entries(name);
      const dir = ref.url.slice(0, ref.url.lastIndexOf('/') + 1);
      const sheets: DecodedSheet[] = [];
      for (const sh of index.sheets) {
        const img = await io.decode(await io.fetch(dir + sh.file));
        sheets.push({ file: sh.file, w: sh.w, h: sh.h, swappable: sh.swappable, image: img.image });
      }
      return { index, sheets };
    },
  };
}

/**
 * App start (`main.ts`, app mode only): marks the build (`window.__tcBuild = 'app'`, both styles; Review Focus 1),
 * resolves the style (address flag, then `VITE_ART`; app default Classic, D3 = b). Pixel: the canvas CSS, the pack
 * indexes of the frame set, `pixel.rt`, the progress line, `window.__predrawnStats` and `window.__predrawn`; then `boot`
 * (and the device bench with `VITE_BENCH=1`).
 */
export async function start(bootGame: () => void): Promise<void> {
  const w = window as unknown as Record<string, unknown>;
  w.__tcBuild = 'app';
  // Test decision 18: with `VITE_BENCH=1` the bench save goes in slot 1 before boot, and the bench starts after it.
  const bench = import.meta.env.VITE_BENCH === '1';
  if (bench) await prepareBench(location.search);
  const boot = (): void => {
    bootGame();
    if (bench) startBench(document);
  };
  const style = resolveArtStyle('auto', location.search, import.meta.env.VITE_ART as string | undefined);
  if (style !== 'pixel') {
    boot();
    return;
  }
  const css = document.createElement('style');
  css.textContent = '#game[data-art="pixel"]{right:auto;bottom:auto;image-rendering:pixelated}';
  document.head.appendChild(css);
  const el = document.documentElement;
  const frameSet = frameSetFor(el.clientWidth, el.clientHeight, location.search);
  const device = isPhoneScreen(el.clientWidth, el.clientHeight) ? 'phone' : 'tablet';
  // Loaded here, not at the top, so Node tests can import this module (the virtual module exists only under Vite).
  const { packs: artPacks } = await import('virtual:tc-art');
  const io = browserIo();
  const store = new PictureStore(io, BUDGET_BYTES);
  await store.load(artPacks, frameSet === 'coarse');
  const stats = createStats(frameSet, device);
  w.__predrawnStats = stats;
  w.__predrawn = predrawnDebug(artPacks, io);
  pixel.rt = new AppRuntime(store, stats, createProgressLine(document));
  boot();
}
