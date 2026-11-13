/** Boot. Owner: integrator. */
import './styles/main.css';
import { Game } from './game';
import { createCanvasRenderer, type RealOptions } from './render/renderer';
import { artStyle } from './render/artStyle';
import { pageStorage, startRealBuild } from './render/real/storagePrefix';
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

function boot(real?: RealOptions): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui');
  if (!canvas || !uiRoot) throw new Error('Missing #game canvas or #ui root');
  const world = createWorld({ seed: (Date.now() & 0x7fffffff) >>> 0, parkName: 'New Park' });
  const renderer = createCanvasRenderer(canvas, real);
  // Phase 6 §4.9: settings from `tc.settings` (defaults in memory when storage is missing or the data unreadable).
  const game = new Game(world, renderer, new SettingsStore(browserStore()));
  // Phase 6 §4.8 (W4-G): the language is chosen before any UI text is built.
  initI18n(game);
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

// The realistic art test (`?art=real`, stage 1) exists only in a build made with VITE_ART=real (the /real-game/
// deploy): the compile-time check lets Vite drop all of it, the boot chunk and its preload helper from the website
// build. In that build the `tcreal:` storage prefix goes on first, synchronously, for every boot path (`?art=classic`
// and a failed import included), so it never touches the real game's saves. `bootReal` sets the realistic height
// step; without baked art it shows one error line and the game starts with today's look.
if (import.meta.env.VITE_ART === 'real' && startRealBuild(pageStorage(), artStyle())) {
  import('./render/real/boot')
    .then((m) => m.bootReal())
    .catch(() => null)
    .then((real) => boot(real ?? undefined));
} else boot();
