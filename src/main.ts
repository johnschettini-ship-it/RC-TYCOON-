/** Boot. Owner: integrator. */
import './styles/main.css';
import { Game } from './game';
import { createCanvasRenderer, type RealOptions } from './render/renderer';
import { artStyle } from './render/artStyle';
import { pageStorage, startRealBuild } from './render/real/storagePrefix';
import { benchMode } from './render/real/benchParam';
import { tileToScreen } from './render/iso';
import { spriteMemory } from './render/spriteCache';
import { realGroundCover } from './render/terrain';
import { attachInput } from './input';
import { mountUI } from './ui';
import { createWorld } from './sim/world';
import { browserStore, deserialize } from './save';
import { centerOnTile } from './input/camera';
import type { ViewRotation } from './render/view';
import { SettingsStore } from './settings';
import { initI18n } from './i18n';
import { mountA11y } from './a11y';
import { mountAudio } from './audio';
import { registerOffline } from './offline';

/** The realistic build's debug hook (`window.__tcReal`). */
interface RealDebug extends Partial<RealOptions> {
  load(json: string, focus: { x: number; y: number }, zoom?: number, rotation?: ViewRotation): string | null;
  /** Today's picture caches by label (`spriteMemory.breakdown()`: chunks, static, sprites, other), bytes. */
  memory(): Record<string, number>;
  /** Placeholder chunks today's terrain drew so far (a chunk not built in time). */
  placeholders(): number;
}

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
  // The realistic test build registers no service worker: it shares the website's origin, so its worker would
  // delete the main game's offline cache (CacheStorage is per origin; `public/sw.js` deletes other `tc-*` caches).
  if (import.meta.env.VITE_ART !== 'real') registerOffline(game);
  // A worker an earlier test deploy registered for this page's scope goes too, so it neither serves an old build
  // nor clears the main game's cache on its next update.
  else if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    const scope = new URL(import.meta.env.BASE_URL, location.href).href;
    navigator.serviceWorker.getRegistrations().then((rs) => rs.filter((r) => r.scope.startsWith(scope)).forEach((r) => void r.unregister()), () => undefined);
  }
  // Debug hook for dev builds and e2e tests only (Phase 4 §4 note).
  (window as unknown as { __tc?: Game }).__tc = game;
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
  if (import.meta.env.VITE_ART === 'real') {
    if (artStyle() === 'real') {
      // Debug hook for the realistic art check (headless screenshots, Task 9b): the look, set manager and ground of
      // this boot, and `load`, which loads a save text through the game (never through storage) and frames it like
      // the bench.
      (window as unknown as { __tcReal?: RealDebug }).__tcReal = {
        ...real,
        memory: () => spriteMemory.breakdown(),
        placeholders: () => realGroundCover.placeholders,
        load(json, focus, zoom = 1, rotation = 0) {
          const loaded = deserialize(json);
          if (!loaded.ok) return loaded.error;
          game.setWorld(loaded.world);
          const m = loaded.world.state.map;
          game.camera.rotation = rotation;
          game.camera.zoom = zoom;
          centerOnTile(game.camera, m, focus.y * m.width + focus.x);
          return null;
        },
      };
    }
    // Stage 1 benchmark (`?bench=1`; `?bench=quick` for the e2e smoke; `?bench=scale` the scale park only), in the
    // VITE_ART=real build only: with the
    // realistic look (`?art=real`), or with today's look for comparison (`?art=classic`: no look, set manager or
    // ground, so the memory, turn and start bands read n/a while the frame times are measured the same way).
    const bench = benchMode(location.search);
    if (bench) {
      // S4's first part: the boot's first drawn frame (art not awaited: in the app it is local, here it downloads).
      // Also the boot's first complete frame (network included), shown for information.
      const boot: { firstFrameMs?: number; completeMs?: number } = {};
      game.onFrame(() => {
        boot.firstFrameMs ??= performance.now();
        // Complete as the renderer counts it: no object skipped and the realistic ground laid.
        if (boot.completeMs === undefined && (real?.look?.incomplete() ?? 0) === 0 && (real?.ground?.complete ?? true)) boot.completeMs = performance.now();
      });
      void import('./perf/realBenchCard').then((m) => m.mountRealBench(game, real, () => boot, bench));
    }
  }
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
