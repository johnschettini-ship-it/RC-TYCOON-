/** Boot. Owner: integrator. */
import './styles/main.css';
// The pixel art test shares its website address with the real game, so it must never read, write or clear the
// game's saved data. With the test build (VITE_BENCH=1), every storage key gets the prefix `tc0b:` and clear()
// removes only those keys.
if (import.meta.env.VITE_BENCH === '1') {
  const P = 'tc0b:';
  const proto = Storage.prototype;
  const get = proto.getItem, set = proto.setItem, del = proto.removeItem, keyAt = proto.key;
  const rawLength = Object.getOwnPropertyDescriptor(proto, 'length')?.get as (this: Storage) => number;
  const own = (s: Storage): string[] => {
    const out: string[] = [];
    const n = rawLength.call(s);
    for (let i = 0; i < n; i++) { const k = keyAt.call(s, i); if (k && k.startsWith(P)) out.push(k); }
    return out;
  };
  proto.getItem = function (k: string) { return get.call(this, P + k); };
  proto.setItem = function (k: string, v: string) { set.call(this, P + k, v); };
  proto.removeItem = function (k: string) { del.call(this, P + k); };
  proto.clear = function () { for (const k of own(this)) del.call(this, k); };
  proto.key = function (i: number) { const k = own(this)[i]; return k ? k.slice(P.length) : null; };
  Object.defineProperty(proto, 'length', { configurable: true, get() { return own(this as Storage).length; } });
}
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
import { pixel } from './render/artHook';

function boot(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui');
  if (!canvas || !uiRoot) throw new Error('Missing #game canvas or #ui root');
  const world = createWorld({ seed: (Date.now() & 0x7fffffff) >>> 0, parkName: 'New Park' });
  const renderer = createCanvasRenderer(canvas);
  // Phase 6 §4.9: settings from `tc.settings` (defaults in memory when storage is missing or the data unreadable).
  const game = new Game(world, renderer, new SettingsStore(browserStore()));
  // Phase 6 §4.8 (W4-G): the language is chosen before any UI text is built.
  initI18n(game);
  const map = world.state.map;
  const c = tileToScreen(map.width / 2, map.height / 2, map.heights[0] ?? 0);
  game.camera.centerX = c.sx;
  game.camera.centerY = c.sy;

  const resize = (): void => {
    // Phase 8b stage 0b test: in Pixel the renderer sizes the canvas box, so the size comes from the viewport.
    const r = __TC_APP__ && pixel.rt ? { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight } : canvas.getBoundingClientRect();
    renderer.resize(r.width, r.height, window.devicePixelRatio || 1);
  };
  new ResizeObserver(resize).observe(canvas);
  if (__TC_APP__ && pixel.rt) new ResizeObserver(resize).observe(document.documentElement);
  resize();

  attachInput(canvas, game);
  mountUI(uiRoot, game);
  // Build 3 clients (Wave 4): accessibility (W4-F), audio (W4-A/B), offline play (W4-G).
  mountA11y(game, uiRoot, canvas);
  mountAudio(game);
  // Phase 8b stage 0b test (never merged): the app output ships its files and has no service worker.
  if (import.meta.env.MODE !== 'app') registerOffline(game);
  // Debug hook for dev builds and e2e tests only (Phase 4 §4 note).
  (window as unknown as { __tc?: Game }).__tc = game;
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
  game.start();
}

// Phase 8b stage 0b test (never merged): the app output loads the pixel runtime as its own chunk first (B8: the
// website build never reaches it).
if (import.meta.env.MODE === 'app') void import('./render/pixel/app/runtime').then((m) => m.start(boot));
else boot();
