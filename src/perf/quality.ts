/**
 * Render quality (Phase 6 §4.6, §4.9 "Render quality (auto/high/low)"). Owner: W4-E. Not game state: the overlay
 * extension (`../ui/perf`) copies `game.settings.renderQuality` here and the renderer reads the plan on resize and
 * when the version changes.
 *
 * - Device class (Phase 6 §4.6): a phone is `pointer: coarse`, or `navigator.deviceMemory ≤ 4` when present, or a
 *   phone-sized screen (Phase 4 §11, either CSS side below 600 px). Everything else is a desktop.
 * - `auto` = `high` = the device's best: desktop at the full device pixel ratio with exact-scale terrain chunk
 *   images; phone with the render scale capped at 2× device pixels and the 3 zoom buckets only (no exact-scale
 *   images, Phase 6 §4.6 "max 3 zoom buckets").
 * - `low`: render scale 1× on every device, guests as rectangles from zoom 0.75 down, the 3 zoom buckets only.
 * - The sprite and chunk memory budget follows the device class (64 MB phone, 192 MB desktop) at every quality;
 *   phones and `low` animate rides with half the angles and 3 occupancy levels, so a running ride's frames fit.
 */
import { GUEST_LOD_ZOOM, PHONE_DEVICE_MEMORY_GB, PHONE_MAX_RENDER_SCALE, PHONE_MAX_ZOOM_BUCKETS } from '../data/tuning/perf';
import type { RenderQuality } from '../settings/types';
import { spriteBudgetBytes, type DeviceClass } from '../render/spriteCache';
import { planStretch } from '../render/pixel/grid';
import type { ArtStyle } from '../render/pixel/style';

/** Phone-sized screen (Phase 4 §11): either CSS side below this. */
export const PHONE_SCREEN_MAX_CSS = 600;
/** `low` quality: guests turn into rectangles from this zoom down. */
export const LOW_GUEST_LOD_ZOOM = 0.75;

export interface DeviceEnv {
  /** `matchMedia('(pointer: coarse)')`. */
  coarsePointer: boolean;
  /** `navigator.deviceMemory` (GB) when the browser has it. */
  deviceMemoryGb: number | undefined;
}

export function deviceClass(env: DeviceEnv, cssW: number, cssH: number): DeviceClass {
  if (env.coarsePointer) return 'phone';
  if (env.deviceMemoryGb !== undefined && env.deviceMemoryGb <= PHONE_DEVICE_MEMORY_GB) return 'phone';
  return Math.min(cssW, cssH) < PHONE_SCREEN_MAX_CSS ? 'phone' : 'desktop';
}

/** The browser's device facts (fine pointer and unknown memory outside a browser). */
export function browserDeviceEnv(): DeviceEnv {
  let coarse = false;
  try {
    coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch {
    coarse = false;
  }
  const mem = typeof navigator !== 'undefined' ? (navigator as { deviceMemory?: unknown }).deviceMemory : undefined;
  return { coarsePointer: coarse, deviceMemoryGb: typeof mem === 'number' && mem > 0 ? mem : undefined };
}

export interface RenderPlan {
  device: DeviceClass;
  /** Canvas device pixels per CSS pixel. */
  pixelRatio: number;
  /** Zoom buckets the caches may hold (3 = 0.5, 1, 2; 4 adds exact-scale terrain chunk images). */
  zoomBuckets: number;
  /** Guests draw as rectangles batched by colour at camera zoom ≤ this. */
  guestLodZoom: number;
  /** Shared sprite and chunk memory budget (bytes). */
  budgetBytes: number;
  /** Rides animate with 16 angles and 3 occupancy levels (`render/anim.ts` `coarseRideFrame`): 64 MB devices. */
  coarseRideFrames: boolean;
  /** Phase 8 stage 0 prototype: device pixels per canvas pixel (1 in Classic). */
  stretch: number;
}

/** `autoMaxRatio`: the `auto` step down of `AutoScale` (ignored at `high` and `low`). */
export function renderPlan(quality: RenderQuality, device: DeviceClass, dpr: number, autoMaxRatio = Infinity, style: ArtStyle = 'classic'): RenderPlan {
  const d = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  const low = quality === 'low';
  const phone = device === 'phone';
  const best = phone ? Math.min(d, PHONE_MAX_RENDER_SCALE) : d;
  // Phase 8 stage 0 prototype (§7.1): a whole stretch k, canvas ratio d / k, the 3 zoom buckets only.
  const stretch = style === 'pixel' ? planStretch(d, device, low || (quality === 'auto' && autoMaxRatio <= 1)) : 1;
  return {
    device,
    pixelRatio:
      style === 'pixel' ? d / stretch : low ? Math.min(d, 1) : quality === 'auto' ? Math.min(best, Math.max(1, autoMaxRatio)) : best,
    zoomBuckets: style === 'pixel' || phone || low ? PHONE_MAX_ZOOM_BUCKETS : PHONE_MAX_ZOOM_BUCKETS + 1,
    guestLodZoom: low ? LOW_GUEST_LOD_ZOOM : GUEST_LOD_ZOOM,
    budgetBytes: spriteBudgetBytes(device),
    coarseRideFrames: phone || low,
    stretch,
  };
}

/** Frames ignored after a start, a load, a resize, or a quality change (sprite and chunk warm-up). */
export const AUTO_WARMUP_FRAMES = 120;
/** Frames per evaluation window. */
export const AUTO_WINDOW_FRAMES = 60;
/** Step down when the window's frame p95 is over this many times the device budget. */
export const AUTO_SLOW_FACTOR = 1.25;
/** A longer gap between frames is a paused or hidden tab. */
const AUTO_MAX_GAP_MS = 1000;

/**
 * `auto` render quality, adaptive part: the render scale steps down to 1× when a whole window of frames has a p95
 * over 1.25 × the device's frame budget (Phase 6 §4.6: desktop 20 ms, phone 40 ms). It never steps back up on its
 * own (no oscillation); a resize, a quality change, or a new device class starts over.
 */
export class AutoScale {
  /** Highest render scale `auto` may use now (Infinity = the device's best). */
  maxRatio = Infinity;
  private readonly window = new Float64Array(AUTO_WINDOW_FRAMES);
  private frames = 0;

  constructor(public budgetMs: number) {}

  reset(): void {
    this.maxRatio = Infinity;
    this.frames = 0;
  }

  /** One frame interval (ms). True when `maxRatio` changed. */
  frame(intervalMs: number): boolean {
    if (!(intervalMs > 0) || intervalMs > AUTO_MAX_GAP_MS || this.maxRatio <= 1) return false;
    this.frames++;
    if (this.frames <= AUTO_WARMUP_FRAMES) return false;
    const k = (this.frames - AUTO_WARMUP_FRAMES - 1) % AUTO_WINDOW_FRAMES;
    this.window[k] = intervalMs;
    if (k !== AUTO_WINDOW_FRAMES - 1) return false;
    const sorted = Float64Array.from(this.window).sort();
    const p95 = sorted[Math.ceil(0.95 * AUTO_WINDOW_FRAMES) - 1] as number;
    if (p95 <= this.budgetMs * AUTO_SLOW_FACTOR) return false;
    this.maxRatio = 1;
    return true;
  }
}

let quality: RenderQuality = 'auto';
let version = 0;

export function setRenderQuality(q: RenderQuality): void {
  if (q === quality) return;
  quality = q;
  version++;
}

export function renderQuality(): RenderQuality {
  return quality;
}

/** Bumps on every change, so the renderer re-plans once. */
export function renderQualityVersion(): number {
  return version;
}
