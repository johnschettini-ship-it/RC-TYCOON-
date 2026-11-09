/** Owner: W1-A. Placeholder renderer so the app boots. Replace it with the real chunked renderer. */
import { tileToScreen, TILE_H, TILE_W } from './iso';
import type { Camera, Renderer, ToolState } from './types';
import type { World } from '../sim/types';
import { Content } from '../sim/map';

export function createCanvasRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  let cssW = 1;
  let cssH = 1;
  let dpr = 1;
  return {
    resize(w, h, d) {
      cssW = w;
      cssH = h;
      dpr = d;
      canvas.width = Math.round(w * d);
      canvas.height = Math.round(h * d);
    },
    draw(world: World, cam: Camera, tool: ToolState) {
      const map = world.state.map;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#1d2b3a';
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.setTransform(
        dpr * cam.zoom, 0, 0, dpr * cam.zoom,
        dpr * (cssW / 2 - cam.centerX * cam.zoom),
        dpr * (cssH / 2 - cam.centerY * cam.zoom),
      );
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const i = y * map.width + x;
          const { sx, sy } = tileToScreen(x, y, map.heights[i] ?? 0);
          const c = map.content[i];
          let fill = '#3f6e3a';
          if (map.owned[i]) {
            if (c === Content.Footpath) fill = '#c9b48a';
            else if (c === Content.ParkEntrance) fill = '#e8603c';
            else fill = (x + y) % 2 ? '#5fae4f' : '#58a548';
          }
          if (tool.hoverTile === i) fill = '#f4e27a';
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + TILE_W / 2, sy + TILE_H / 2);
          ctx.lineTo(sx, sy + TILE_H);
          ctx.lineTo(sx - TILE_W / 2, sy + TILE_H / 2);
          ctx.closePath();
          ctx.fill();
        }
      }
      canvas.dataset.zoom = cam.zoom.toFixed(3);
      canvas.dataset.cameraX = cam.centerX.toFixed(1);
    },
  };
}

/** Sprite preview for UI pickers. W1-A draws the real ride and stall art. */
export function drawPreview(ctx: CanvasRenderingContext2D, _defId: string, w: number, h: number): void {
  ctx.fillStyle = '#8899aa';
  ctx.fillRect(0, 0, w, h);
}
