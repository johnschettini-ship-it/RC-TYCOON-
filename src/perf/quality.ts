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
 * - The sprite and chunk memory budget follows the device class (64 MB phone, 192 MB desktop) at every quality.
 */
import { GUEST_LOD_ZOOM, PHONE_DEVICE_MEMORY_GB, PHONE_MAX_RENDER_SCALE, PHONE_MAX_ZOOM_BUCKETS } from '../data/tuning/perf';
import type { RenderQuality } from '../settings/types';
import { spriteBudgetBytes, type DeviceClass } from '../render/spriteCache';

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
}

export function renderPlan(quality: RenderQuality, device: DeviceClass, dpr: number): RenderPlan {
  const d = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  const low = quality === 'low';
  const phone = device === 'phone';
  return {
    device,
    pixelRatio: low ? Math.min(d, 1) : phone ? Math.min(d, PHONE_MAX_RENDER_SCALE) : d,
    zoomBuckets: phone || low ? PHONE_MAX_ZOOM_BUCKETS : PHONE_MAX_ZOOM_BUCKETS + 1,
    guestLodZoom: low ? LOW_GUEST_LOD_ZOOM : GUEST_LOD_ZOOM,
    budgetBytes: spriteBudgetBytes(device),
  };
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
