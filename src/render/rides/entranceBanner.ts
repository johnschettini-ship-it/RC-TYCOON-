/**
 * Ride entrance name banner rendering.
 * Draws an in-world entrance sign banner displaying the ride's name
 * directly mounted above the entrance gate once the queue path is connected.
 */
import { getFlatRideDef, getTrackRideDef } from '../../data/catalog';
import { entranceNeedsQueue } from '../../sim/paths/autoConnect';
import { Content } from '../../sim/map';
import type { Ride } from '../../sim/rides/types';
import type { ToolState } from '../types';
import type { World } from '../../sim/types';
import type { LayerFrame } from '../layers';
import { mapToViewContinuous } from '../view';
import { TAG_COLOURS, shade } from '../palette';

function drawPill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

export function drawBannerSign(
  ctx: CanvasRenderingContext2D,
  ride: Ride,
  x: number,
  y: number,
  scale: number,
  isSelected: boolean,
): void {
  const k = Math.min(1.4, Math.max(0.75, scale));
  const fontSize = Math.max(10, Math.round(11 * k));
  ctx.save();
  ctx.font = `700 ${fontSize}px Fredoka, system-ui, -apple-system, sans-serif`;

  const tag = (getFlatRideDef(ride.defId) ?? getTrackRideDef(ride.defId))?.tag ?? 'family';
  const theme = TAG_COLOURS[tag] ?? TAG_COLOURS.family;

  const text = ride.name;
  const metrics = ctx.measureText(text);
  const padX = 7 * k;
  const bannerW = Math.round(metrics.width + padX * 2);
  const bannerH = Math.round(18 * k);
  const radius = Math.round(4 * k);
  const bx = Math.round(x - bannerW / 2);
  const by = Math.round(y - bannerH / 2);

  // Sign posts connecting down toward the entrance arch
  ctx.strokeStyle = '#2b2f38';
  ctx.lineWidth = Math.max(1, 1.5 * k);
  ctx.beginPath();
  ctx.moveTo(bx + 4 * k, by + bannerH);
  ctx.lineTo(bx + 4 * k, by + bannerH + 7 * k);
  ctx.moveTo(bx + bannerW - 4 * k, by + bannerH);
  ctx.lineTo(bx + bannerW - 4 * k, by + bannerH + 7 * k);
  ctx.stroke();

  // Banner background with theme border
  ctx.beginPath();
  drawPill(ctx, bx, by, bannerW, bannerH, radius);
  ctx.fillStyle = shade(theme.dark, 0.7);
  ctx.globalAlpha = 0.94;
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.strokeStyle = isSelected ? '#ffffff' : theme.main;
  ctx.lineWidth = Math.max(1, isSelected ? 2 * k : 1.2 * k);
  ctx.stroke();

  // Subtle bottom accent line
  ctx.strokeStyle = theme.light;
  ctx.lineWidth = Math.max(0.5, 0.7 * k);
  ctx.beginPath();
  ctx.moveTo(bx + padX / 2, by + bannerH - 2);
  ctx.lineTo(bx + bannerW - padX / 2, by + bannerH - 2);
  ctx.stroke();

  // Ride name text
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);

  ctx.restore();
}

/** Draws entrance name banners for all rides whose entrance is connected. */
export function drawEntranceBanners(
  ctx: CanvasRenderingContext2D,
  world: World,
  tool: ToolState,
  frame: LayerFrame,
): void {
  // Don't draw if camera is zoomed far out to keep map clean
  if (frame.scale < 0.6) return;

  const map = world.state.map;
  const w = map.width;
  const h = map.height;

  for (const ride of world.state.rides) {
    if (!ride.entrance) continue;
    const gate = ride.entrance.gate;
    const outside = ride.entrance.outside;
    if (gate < 0 || outside < 0 || gate >= map.content.length || outside >= map.content.length) continue;

    // Show name of ride when path (queue) is built to the entrance or when selected
    const isQueueConnected = !entranceNeedsQueue(world, ride) || map.content[outside] === Content.Queue;
    const isSelected = tool.selectedEntity?.kind === 'ride' && tool.selectedEntity.id === ride.id;

    if (!isQueueConnected && !isSelected) continue;

    const gx = gate % w;
    const gy = Math.floor(gate / w);
    const ox = outside % w;
    const oy = Math.floor(outside / w);

    // Position above the entrance arch slightly biased toward the outside step
    const fx = gx * 0.45 + ox * 0.55 + 0.5;
    const fy = gy * 0.45 + oy * 0.55 + 0.5;
    const groundZ = map.heights[gate] as number;

    const p = mapToViewContinuous(fx, fy, frame.rotation, w, h);
    const sx = (p.u - p.v) * 32 * frame.scale + frame.offX;
    const sy = ((p.u + p.v) * 16 - (groundZ + 3.4) * 8) * frame.scale + frame.offY;

    drawBannerSign(ctx, ride, sx, sy, frame.scale, isSelected);
  }
}
