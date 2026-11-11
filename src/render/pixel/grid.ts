/** Phase 8 stage 0 prototype (never merged): the art grid, zoom levels and copy rules (spec §7). */
import { PHONE_MAX_RENDER_SCALE } from '../../data/tuning/perf';
import { ZOOM_MAX, ZOOM_MIN } from '../camera';
import type { DeviceClass, Sprite } from '../spriteCache';
import { ART_SCALE } from './surface';

/** Tolerance of a crisp level (§7.1 item 4). */
export const LEVEL_EPS = 1e-6;
/** The soft level exists when the smallest crisp level is at least this × `ZOOM_MIN` (§7.2). */
export const SOFT_LEVEL_GAP = 1.5;
/** The home level is the level nearest to this zoom (§7.6). */
export const HOME_ZOOM_TARGET = 1;

/** The grid the renderer draws on (§5.2). `canvasRatio = deviceRatio / stretch`. */
export interface PixelGrid {
  device: DeviceClass;
  deviceRatio: number;
  stretch: number;
  canvasRatio: number;
}

/** One zoom level. `n` is canvas pixels per art pixel (0 at the soft level). */
export interface ZoomLevel {
  zoom: number;
  n: number;
  soft: boolean;
}

/** What a copy needs. `scale` is `cam.zoom × canvas ratio`; `offX`, `offY` are canvas pixels. */
export interface ArtFrame {
  n: number;
  scale: number;
  offX: number;
  offY: number;
  walkers?: Float64Array;
  walkerCount?: number;
}

/** The stretch `k` of §7.1 item 2. */
export function planStretch(deviceRatio: number, device: DeviceClass, capped: boolean): number {
  if (device === 'desktop') return capped ? Math.max(1, Math.floor(deviceRatio)) : 1;
  return capped ? Math.max(1, Math.ceil(deviceRatio)) : Math.max(1, Math.ceil(deviceRatio / PHONE_MAX_RENDER_SCALE));
}

export function makeGrid(deviceRatio: number, device: DeviceClass, capped: boolean): PixelGrid {
  const stretch = planStretch(deviceRatio, device, capped);
  return { device, deviceRatio, stretch, canvasRatio: deviceRatio / stretch };
}

/** `n` at this zoom: `2 × zoom × canvasRatio` when it is a whole number ≥ 1 within `LEVEL_EPS`, else 0 (§7.1 item 4). */
export function artScale(zoom: number, grid: PixelGrid): number {
  const v = 2 * zoom * grid.canvasRatio;
  const r = Math.round(v);
  return r >= 1 && Math.abs(v - r) <= LEVEL_EPS ? r : 0;
}

/** The crisp levels and the soft level, in ascending order (§7.2). */
export function zoomLevels(grid: PixelGrid): readonly ZoomLevel[] {
  const step = grid.stretch / (2 * grid.deviceRatio);
  const crisp: ZoomLevel[] = [];
  for (let n = 1; n * step <= ZOOM_MAX + LEVEL_EPS; n++) {
    const zoom = n * step;
    if (zoom >= ZOOM_MIN - LEVEL_EPS) crisp.push({ zoom, n, soft: false });
  }
  const first = crisp[0];
  if (!first || first.zoom >= SOFT_LEVEL_GAP * ZOOM_MIN) return [{ zoom: ZOOM_MIN, n: 0, soft: true }, ...crisp];
  return crisp;
}

/** The level nearest to `zoom`; a tie within `LEVEL_EPS` goes to the smaller zoom (§7.2). */
export function nearestLevel(zoom: number, grid: PixelGrid): number {
  let best = ZOOM_MIN;
  let bestD = Infinity;
  for (const l of zoomLevels(grid)) {
    const d = Math.abs(l.zoom - zoom);
    if (d < bestD - LEVEL_EPS) {
      best = l.zoom;
      bestD = d;
    }
  }
  return best;
}

/** The CSS size of the viewport (§7.1 item 3). */
export function viewportCss(): { width: number; height: number } {
  const el = document.documentElement;
  return { width: el.clientWidth, height: el.clientHeight };
}

/** The nearest multiple of 2 world pixels (one art pixel). `+ 0` turns -0 into 0. */
export function snapArt(v: number): number {
  return 2 * Math.round(v / 2) + 0;
}

/** A walker anchor on the art grid: x first, then y along the walk slope, so a 2:1 walk is a clean stair (§7.7). */
export function snapWalker(ax: number, ay: number, slope: 0.5 | -0.5 | 0): { x: number; y: number } {
  const x = snapArt(ax);
  return { x, y: snapArt(ay + (x - ax) * slope) };
}

/**
 * The snap slope of a walker from its motion, not from its frame (§5.5 `collectGuests` row, §7.7): 0 when it sits or
 * stands; else +0.5 for view directions 1 and 3 (along `u`) and -0.5 for 0 and 2 (along `v`).
 */
export function walkerSlope(sitting: boolean, moving: boolean, vf: number): 0 | 0.5 | -0.5 {
  if (sitting || !moving) return 0;
  return vf & 1 ? 0.5 : -0.5;
}

/** Copy a sprite anchored at world (wx, wy): at factor `n` with whole edges, or as renderer `blit` at `n = 0` (§7.7). */
export function blitArt(ctx: CanvasRenderingContext2D, sp: Sprite, wx: number, wy: number, f: ArtFrame): void {
  const n = f.n;
  if (n > 0) {
    const x0 = f.offX + wx * n * ART_SCALE - sp.ox * n;
    const y0 = f.offY + wy * n * ART_SCALE - sp.oy * n;
    ctx.drawImage(sp.image, x0, y0, sp.w * n, sp.h * n);
    return;
  }
  const k = f.scale / sp.scale;
  const dx = wx * f.scale + f.offX;
  const dy = wy * f.scale + f.offY;
  const x0 = Math.round(dx - sp.ox * k);
  const y0 = Math.round(dy - sp.oy * k);
  const x1 = Math.round(dx + (sp.w - sp.ox) * k);
  const y1 = Math.round(dy + (sp.h - sp.oy) * k);
  ctx.drawImage(sp.image, x0, y0, x1 - x0, y1 - y0);
}

/**
 * Copy the vertical strip [colL, colR) (world x) of a sprite anchored at (ax, ay), as renderer `blitColumn`, at factor `n`
 * (or `f.scale / sp.scale` at `n = 0`). Bit 1 of `ends` extends the strip to the left edge of the image, bit 2 to the right edge.
 */
export function blitArtColumn(ctx: CanvasRenderingContext2D, sp: Sprite, ax: number, ay: number, colL: number, colR: number, f: ArtFrame, ends: number): void {
  const n = f.n;
  const k = n > 0 ? n : f.scale / sp.scale;
  const scale = n > 0 ? n * ART_SCALE : f.scale;
  const devX = (wx: number): number => (n > 0 ? f.offX + wx * scale : Math.round(f.offX + wx * scale));
  const ax0 = f.offX + ax * scale;
  let dx0 = devX(colL);
  let dx1 = devX(colR);
  let s0 = sp.ox + (colL - ax) * sp.scale;
  let s1 = sp.ox + (colR - ax) * sp.scale;
  if (ends & 1) {
    s0 = 0;
    dx0 = n > 0 ? ax0 - sp.ox * k : Math.round(ax0 - sp.ox * k);
  }
  if (ends & 2) {
    s1 = sp.w;
    dx1 = n > 0 ? ax0 + (sp.w - sp.ox) * k : Math.round(ax0 + (sp.w - sp.ox) * k);
  }
  if (dx1 <= dx0) return;
  if (s0 < 0) s0 = 0;
  if (s1 > sp.w) s1 = sp.w;
  if (s1 <= s0) return;
  const ay0 = f.offY + ay * scale;
  const y0 = n > 0 ? ay0 - sp.oy * k : Math.round(ay0 - sp.oy * k);
  const y1 = n > 0 ? ay0 + (sp.h - sp.oy) * k : Math.round(ay0 + (sp.h - sp.oy) * k);
  ctx.drawImage(sp.image, s0, 0, s1 - s0, sp.h, dx0, y0, dx1 - dx0, y1 - y0);
}
