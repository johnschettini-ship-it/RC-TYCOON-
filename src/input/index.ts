/** Owner: W1-B. Pointer, touch, and keyboard input (Phase 0 §4.10, Phase 1 §4.1). Replace the placeholder. */
import type { Game } from '../game';
import { screenToWorld, zoomAt } from '../render/camera';
import { pickTile } from '../render/iso';

export function attachInput(canvas: HTMLCanvasElement, game: Game): void {
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const w = screenToWorld(game.camera, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    game.tool.hoverTile = pickTile(game.world.state.map, w.x, w.y);
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      zoomAt(game.camera, e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    },
    { passive: false },
  );
}
