/**
 * Ride entrance name banner (owner 2026-11-19; re-added after path clarity removed the entrance sign). A small banner
 * in the ride's zone colours with the ride's name (`ride.name`, so a renamed ride shows its new name), over the
 * entrance of a ride whose queue reaches its gate, and over the selected ride's entrance before that.
 *
 * Fitting (review 2026-11-20, the owner's original complaint was a name cut off at the screen edge):
 * - a long name is shortened with an ellipsis to `BANNER_MAX_TEXT_PX`;
 * - a banner whose entrance is off screen is not drawn; one whose entrance is on screen is moved sideways and down
 *   until it is wholly on screen (its posts still point at the entrance);
 * - a banner keeps out of the controls floating over the map (`../screenAvoid.ts`: the phone's turn-view buttons): it
 *   moves to the side with room, else it is not drawn;
 * - the fitted text is measured once per (font, name, width) and cached, not every frame;
 * - the height step is the look's own (`STEP_PX`: classic 8, realistic 9.8 px per step);
 * - hidden at the farthest zoom, where guests are drawn as dots.
 */
import { getFlatRideDef, getTrackRideDef } from '../../data/catalog';
import { GUEST_LOD_ZOOM } from '../../data/tuning/perf';
import { entranceNeedsQueue } from '../../sim/paths/autoConnect';
import { Content } from '../../sim/map';
import type { Ride } from '../../sim/rides/types';
import type { World } from '../../sim/types';
import { STEP_PX } from '../heightStep';
import { labelAvoidBoxes, type AvoidBox } from '../screenAvoid';
import type { LayerFrame } from '../layers';
import type { ToolState } from '../types';
import { mapToViewContinuous } from '../view';
import { TAG_COLOURS, shade } from '../palette';

/** Widest name text (CSS px at zoom 1, scaled with the banner). */
export const BANNER_MAX_TEXT_PX = 120;
/** Gap kept between a banner and the canvas edge (CSS px). */
const EDGE_PX = 4;
/** Height of the banner's middle above the entrance ground, in height steps. */
const LIFT_STEPS = 3.4;
const ELLIPSIS = '…';
/** Most fitted names kept; a park has far fewer rides, so the cache only empties on a burst of renames. */
const FIT_CACHE_MAX = 256;
const POST_INK = '#2b2f38';
const TEXT_INK = '#ffffff';

/** `name` when it fits in `maxPx`, else its longest prefix that fits with "…" after it (trailing spaces dropped). */
export function fitBannerText(measure: (s: string) => number, name: string, maxPx: number): string {
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

const fitCache = new Map<string, { text: string; width: number }>();

/** The fitted text of `name` at the context's current font, and its width; measured once per (font, width, name). */
function fitted(ctx: CanvasRenderingContext2D, name: string, maxPx: number): { text: string; width: number } {
  const key = `${ctx.font}|${Math.round(maxPx)}|${name}`;
  let hit = fitCache.get(key);
  if (!hit) {
    if (fitCache.size >= FIT_CACHE_MAX) fitCache.clear();
    const measure = (s: string): number => ctx.measureText(s).width;
    const text = fitBannerText(measure, name, maxPx);
    hit = { text, width: measure(text) };
    fitCache.set(key, hit);
  }
  return hit;
}

/** Banner size factor for a camera zoom: readable far out, not huge close in. */
function bannerScale(zoom: number): number {
  return Math.min(1.4, Math.max(0.75, zoom));
}

function drawPill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/**
 * Draw one banner whose entrance (post foot) is at (`x`, `y` + its lift), centred on `x`, `y` (device px), scaled by
 * `k` (zoom factor × device pixel ratio). `bounds`: the canvas size (device px): the banner is moved inside it.
 */
/** Boxes overlap (device px). */
function hits(x: number, y: number, w: number, h: number, a: AvoidBox): boolean {
  return x < a.x + a.w && a.x < x + w && y < a.y + a.h && a.y < y + h;
}

export function drawBannerSign(
  ctx: CanvasRenderingContext2D,
  ride: Ride,
  x: number,
  y: number,
  k: number,
  isSelected: boolean,
  bounds?: { width: number; height: number; dpr: number },
  avoid: readonly AvoidBox[] = [],
): void {
  const fontSize = Math.max(10, Math.round(11 * k));
  ctx.save();
  ctx.font = `700 ${fontSize}px Fredoka, system-ui, -apple-system, sans-serif`;

  const tag = (getFlatRideDef(ride.defId) ?? getTrackRideDef(ride.defId))?.tag ?? 'family';
  const theme = TAG_COLOURS[tag] ?? TAG_COLOURS.family;

  const padX = 7 * k;
  const edge = EDGE_PX * (bounds?.dpr ?? 1);
  const room = bounds ? bounds.width - 2 * edge - 2 * padX : Infinity;
  const { text, width } = fitted(ctx, ride.name, Math.min(BANNER_MAX_TEXT_PX * k, room));
  const bannerW = Math.round(width + padX * 2);
  const bannerH = Math.round(18 * k);
  const radius = Math.round(4 * k);
  let cx = x;
  let cy = y;
  if (bounds) {
    cx = Math.min(Math.max(cx, edge + bannerW / 2), bounds.width - edge - bannerW / 2);
    cy = Math.min(Math.max(cy, edge + bannerH / 2), bounds.height - edge - bannerH / 2);
  }
  // Out of the floating controls: to the side of a box with room (posts included), else no banner.
  const postH = 7 * k;
  for (const a of avoid) {
    if (!hits(cx - bannerW / 2, cy - bannerH / 2, bannerW, bannerH + postH, a)) continue;
    const leftX = a.x - edge - bannerW / 2;
    const rightX = a.x + a.w + edge + bannerW / 2;
    const roomLeft = leftX - bannerW / 2 >= edge;
    const roomRight = !bounds || rightX + bannerW / 2 <= bounds.width - edge;
    cx = roomLeft && (!roomRight || Math.abs(leftX - cx) <= Math.abs(rightX - cx)) ? leftX : roomRight ? rightX : NaN;
  }
  if (Number.isNaN(cx) || avoid.some((a) => hits(cx - bannerW / 2, cy - bannerH / 2, bannerW, bannerH + postH, a))) {
    ctx.restore();
    return;
  }
  const bx = Math.round(cx - bannerW / 2);
  const by = Math.round(cy - bannerH / 2);

  // Sign posts down toward the entrance arch.
  ctx.strokeStyle = POST_INK;
  ctx.lineWidth = Math.max(1, 1.5 * k);
  ctx.beginPath();
  ctx.moveTo(bx + 4 * k, by + bannerH);
  ctx.lineTo(bx + 4 * k, by + bannerH + 7 * k);
  ctx.moveTo(bx + bannerW - 4 * k, by + bannerH);
  ctx.lineTo(bx + bannerW - 4 * k, by + bannerH + 7 * k);
  ctx.stroke();

  // Banner background with the zone colour border.
  ctx.beginPath();
  drawPill(ctx, bx, by, bannerW, bannerH, radius);
  ctx.fillStyle = shade(theme.dark, 0.7);
  ctx.globalAlpha = 0.94;
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.strokeStyle = isSelected ? TEXT_INK : theme.main;
  ctx.lineWidth = Math.max(1, isSelected ? 2 * k : 1.2 * k);
  ctx.stroke();

  // Bottom accent line.
  ctx.strokeStyle = theme.light;
  ctx.lineWidth = Math.max(0.5, 0.7 * k);
  ctx.beginPath();
  ctx.moveTo(bx + padX / 2, by + bannerH - 2);
  ctx.lineTo(bx + bannerW - padX / 2, by + bannerH - 2);
  ctx.stroke();

  ctx.fillStyle = TEXT_INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + bannerW / 2, by + bannerH / 2);

  ctx.restore();
}

/** Draws the banners of the rides whose queue reaches the entrance, and of the selected ride, on screen. */
export function drawEntranceBanners(ctx: CanvasRenderingContext2D, world: World, tool: ToolState, frame: LayerFrame): void {
  const zoom = frame.scale / frame.dpr;
  if (zoom <= (frame.guestLodZoom ?? GUEST_LOD_ZOOM)) return;
  const k = bannerScale(zoom) * frame.dpr;

  const map = world.state.map;
  const w = map.width;
  const n = w * map.height;
  const bounds = { width: frame.width, height: frame.height, dpr: frame.dpr };
  const avoid = labelAvoidBoxes().map((a) => ({ x: a.x * frame.dpr, y: a.y * frame.dpr, w: a.w * frame.dpr, h: a.h * frame.dpr }));

  for (const ride of world.state.rides) {
    const e = ride.entrance;
    if (!e) continue;
    const gate = e.gate;
    const outside = e.outside;
    if (gate < 0 || outside < 0 || gate >= n || outside >= n) continue;

    const isSelected = tool.selectedEntity?.kind === 'ride' && tool.selectedEntity.id === ride.id;
    if (!isSelected && map.content[outside] !== Content.Queue && entranceNeedsQueue(world, ride)) continue;

    const gx = gate % w;
    const gy = (gate - gx) / w;
    const ox = outside % w;
    const oy = (outside - ox) / w;
    // Over the entrance arch, a little toward the outside tile.
    const fx = gx * 0.45 + ox * 0.55 + 0.5;
    const fy = gy * 0.45 + oy * 0.55 + 0.5;
    const groundZ = map.heights[gate] as number;
    const p = mapToViewContinuous(fx, fy, frame.rotation, w, map.height);
    const footX = (p.u - p.v) * 32 * frame.scale + frame.offX;
    const footY = ((p.u + p.v) * 16 - groundZ * STEP_PX) * frame.scale + frame.offY;
    // The entrance itself is off screen: no banner (one pinned to the edge would point at nothing).
    if (footX < 0 || footX > frame.width || footY < 0 || footY > frame.height) continue;
    const sy = footY - LIFT_STEPS * STEP_PX * frame.scale;

    drawBannerSign(ctx, ride, footX, sy, k, isSelected, bounds, avoid);
  }
}
