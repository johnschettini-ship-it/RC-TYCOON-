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

/**
 * Signs of every ride with an entrance, in ride order, on screen (device px); [] at zoom ≤ `GUEST_LOD_ZOOM`.
 * `measure` gives the text width in device px at the sign font (the caller sets `ctx.font = signFont(fontPx)`).
 */
export function signBoxes(world: World, f: LayerFrame, measure: (s: string) => number, out: SignBox[]): SignBox[] {
  out.length = 0;
  const zoom = f.scale / f.dpr;
  if (zoom <= GUEST_LOD_ZOOM) return out;
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
    const text = fitSignText(measure, r.name, SIGN_MAX_TEXT_PX * k);
    const bw = measure(text) + padX * 2;
    const bottom = footY - SIGN_LIFT * f.scale;
    const box: SignBox = { rideId: r.id, text, x: footX - bw / 2, y: bottom - h, w: bw, h, footX, footY, fontPx };
    if (box.x > f.width || box.x + box.w < 0 || box.y > f.height || footY < 0) continue;
    out.push(box);
  }
  return out;
}
