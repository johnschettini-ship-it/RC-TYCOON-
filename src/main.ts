/** Boot. Owner: integrator. */
import './styles/main.css';
import { Game } from './game';
import { createCanvasRenderer } from './render/renderer';
import { tileToScreen } from './render/iso';
import { attachInput } from './input';
import { mountUI } from './ui';
import { createWorld } from './sim/world';

function boot(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui');
  if (!canvas || !uiRoot) throw new Error('Missing #game canvas or #ui root');
  const world = createWorld({ seed: (Date.now() & 0x7fffffff) >>> 0, parkName: 'New Park' });
  const renderer = createCanvasRenderer(canvas);
  const game = new Game(world, renderer);
  const map = world.state.map;
  const c = tileToScreen(map.width / 2, map.height / 2, map.heights[0] ?? 0);
  game.camera.centerX = c.sx;
  game.camera.centerY = c.sy;

  const resize = (): void => {
    const r = canvas.getBoundingClientRect();
    renderer.resize(r.width, r.height, window.devicePixelRatio || 1);
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  attachInput(canvas, game);
  mountUI(uiRoot, game);
  // Debug hook for dev builds and e2e tests only (Phase 4 §4 note).
  (window as unknown as { __tc?: Game }).__tc = game;
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
  game.start();
}

boot();
