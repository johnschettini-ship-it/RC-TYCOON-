/** Boot. Owner: integrator. */
import './styles/main.css';
import { Game } from './game';
import { createCanvasRenderer } from './render/renderer';
import { tileToScreen } from './render/iso';
import { attachInput } from './input';
import { mountUI } from './ui';
import { createWorld } from './sim/world';
import { browserStore } from './save';
import { SettingsStore } from './settings';
import { initI18n } from './i18n';
import { mountA11y } from './a11y';
import { mountAudio } from './audio';
import { registerOffline } from './offline';
import { artStyle, resolveArtStyle, setArtStyle } from './render/pixel/style';
import { viewportCss } from './render/pixel/grid';

function boot(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui');
  if (!canvas || !uiRoot) throw new Error('Missing #game canvas or #ui root');
  const world = createWorld({ seed: (Date.now() & 0x7fffffff) >>> 0, parkName: 'New Park' });
  const renderer = createCanvasRenderer(canvas);
  // Phase 6 §4.9: settings from `tc.settings` (defaults in memory when storage is missing or the data unreadable).
  const game = new Game(world, renderer, new SettingsStore(browserStore()));
  // Phase 8 stage 0 prototype: the art style, read once at boot, before the first resize (§9.2).
  setArtStyle(resolveArtStyle('auto', location.search, import.meta.env.VITE_ART));
  // Phase 6 §4.8 (W4-G): the language is chosen before any UI text is built.
  initI18n(game);
  const map = world.state.map;
  const c = tileToScreen(map.width / 2, map.height / 2, map.heights[0] ?? 0);
  game.camera.centerX = c.sx;
  game.camera.centerY = c.sy;

  // Phase 8 stage 0 prototype (§5.5): in Pixel the canvas box depends on the plan, so the size comes from the viewport.
  const resize = (): void => {
    const r = artStyle() === 'pixel' ? viewportCss() : canvas.getBoundingClientRect();
    renderer.resize(r.width, r.height, window.devicePixelRatio || 1);
  };
  new ResizeObserver(resize).observe(canvas);
  new ResizeObserver(resize).observe(document.documentElement);
  resize();

  attachInput(canvas, game);
  mountUI(uiRoot, game);
  // Build 3 clients (Wave 4): accessibility (W4-F), audio (W4-A/B), offline play (W4-G).
  mountA11y(game, uiRoot, canvas);
  mountAudio(game);
  registerOffline(game);
  // Debug hook for dev builds and e2e tests only (Phase 4 §4 note).
  (window as unknown as { __tc?: Game }).__tc = game;
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
  game.start();
}

boot();
