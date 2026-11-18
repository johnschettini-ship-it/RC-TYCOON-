/**
 * Entrance signs (queue clarity spec 2026-11-18 §1): a small sign with the ride's name over each ride entrance, the
 * name the ride panel shows (`ride.name`, so a renamed ride shows its new name). Hidden at the farthest zoom (where
 * guests are drawn as dots). Long names are cut with an ellipsis to fit the sign. Both looks draw it.
 */
import { GUEST_LOD_ZOOM } from '../../data/tuning/perf';
import type { World } from '../../sim/types';
import { STEP_PX, TILE_H, TILE_W } from '../iso';
import type { LayerFrame } from '../layers';
import { mapToViewContinuous } from '../view';

/** Sign text size (CSS px at zoom 1) and widest text (CSS px at zoom 1). */
export const SIGN_FONT_PX = 11;
export const SIGN_MAX_TEXT_PX = 120;
/** Height of the sign's foot above the entrance (world px at zoom 1). */
const SIGN_LIFT = 30;
const ELLIPSIS = '…';

export interface SignBox {
  rideId: number;
  text: string;
  /** Box (device px): left, top, width, height. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Foot of the post, on the entrance (device px). */
  footX: number;
  footY: number;
  /** Font size (device px). */
  fontPx: number;
}

/** `name` when it fits in `maxPx`, else its longest prefix that fits with "…" after it (trailing spaces dropped). */
export function fitSignText(measure: (s: string) => number, name: string, maxPx: number): string {
  if (name === '' || measure(name) <= maxPx) return name;
  const chars = [...name];
  let lo = 0;
  let hi = chars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measure(chars.slice(0, mid).join('').trimEnd() + ELLIPSIS) <= maxPx) lo = mid;
    else hi = mid - 1;
  }
  return chars.slice(0, lo).join('').trimEnd() + ELLIPSIS;
}

/** Sign scale for a camera zoom: readable far out, not huge close in. */
export function signScale(zoom: number): number {
  return Math.min(1.4, Math.max(0.8, zoom));
}

/** The canvas font of a sign at device size `px`. */
export function signFont(px: number): string {
  return `600 ${Math.round(px)}px Fredoka, system-ui, sans-serif`;
}

/** A sign's fitted text and its width in device px at the sign font. */
export type SignFit = (name: string, maxPx: number) => { text: string; width: number };

/** Most fitted names kept; a park has far fewer rides, so the cache only empties on a burst of renames. */
const FIT_CACHE_MAX = 256;

/**
 * `SignFit` that measures each (font, name, width) once: `measure` (the canvas `measureText` at `font`) runs only on a
 * name, zoom step or font not seen before, not every frame.
 */
export function createSignFit(): (measure: (s: string) => number, font: string) => SignFit {
  const cache = new Map<string, { text: string; width: number }>();
  return (measure, font) => (name, maxPx) => {
    const key = `${font}|${Math.round(maxPx)}|${name}`;
    let hit = cache.get(key);
    if (!hit) {
      if (cache.size >= FIT_CACHE_MAX) cache.clear();
      const text = fitSignText(measure, name, maxPx);
      hit = { text, width: measure(text) };
      cache.set(key, hit);
    }
    return hit;
  };
}

/**
 * Signs of every ride with an entrance, in ride order, on screen (device px); [] at a zoom where the renderer draws
 * guests as dots (`f.guestLodZoom`, which render quality and the device change; `GUEST_LOD_ZOOM` without one).
 */
export function signBoxes(world: World, f: LayerFrame, fit: SignFit, out: SignBox[]): SignBox[] {
  out.length = 0;
  const zoom = f.scale / f.dpr;
  if (zoom <= (f.guestLodZoom ?? GUEST_LOD_ZOOM)) return out;
  const map = world.state.map;
  const w = map.width;
  const n = w * map.height;
  const k = signScale(zoom) * f.dpr;
  const fontPx = SIGN_FONT_PX * k;
  const padX = 6 * k;
  const h = fontPx * 1.7;
  for (const r of world.state.rides) {
    const e = r.entrance;
    if (!e || e.gate < 0 || e.gate >= n || e.outside < 0 || e.outside >= n) continue;
    const gx = e.gate % w;
    const ox = e.outside % w;
    // The entrance: the shared edge of the gate tile and the tile outside it.
    const fx = (gx + ox) / 2 + 0.5;
    const fy = ((e.gate - gx) / w + (e.outside - ox) / w) / 2 + 0.5;
    const z = Math.max(map.heights[e.gate] as number, map.heights[e.outside] as number);
    const p = mapToViewContinuous(fx, fy, f.rotation, w, map.height);
    const footX = (p.u - p.v) * (TILE_W / 2) * f.scale + f.offX;
    const footY = ((p.u + p.v) * (TILE_H / 2) - z * STEP_PX) * f.scale + f.offY;
    const { text, width } = fit(r.name, SIGN_MAX_TEXT_PX * k);
    const bw = width + padX * 2;
    const bottom = footY - SIGN_LIFT * f.scale;
    const box: SignBox = { rideId: r.id, text, x: footX - bw / 2, y: bottom - h, w: bw, h, footX, footY, fontPx };
    if (box.x > f.width || box.x + box.w < 0 || box.y > f.height || footY < 0) continue;
    out.push(box);
  }
  return out;
}
