/**
 * Audio client (Phase 6 §4.1–4.3). Owner: W4-A (W4-B's music player plugs in through `createMusicPlayer`). Called once
 * from `main.ts`.
 *
 * The engine stays silent (no `AudioContext`) until the first user gesture. Volumes come from `game.settings` (and every
 * change); `game.onEvents` and `game.onCommand` feed `requestsForEvents` / `requestsForCommand`; `game.onFrame` runs
 * loops, show cues, and the music player; `visibilitychange` → `setHidden`; button presses and panel opens in `#ui` →
 * `ui_click` / `ui_open`. The engine is on `window.__tcAudio` for Playwright (`state()`, `debug()`).
 */
import type { Game } from '../game';
import { titleOpen } from '../ui/scenario/shared';
import { connectAudio } from './client';
import { watchUi, watchUnlock, watchVisibility } from './dom';
import { createAudioEngine, type WebAudioEngine } from './engine';

export function mountAudio(game: Game): WebAudioEngine {
  const engine = createAudioEngine();
  if (typeof window === 'undefined' || typeof document === 'undefined') return engine;
  const canvas = document.getElementById('game');
  const client = connectAudio(game, {
    engine,
    viewport: () => (canvas ? { width: canvas.clientWidth, height: canvas.clientHeight } : { width: window.innerWidth, height: window.innerHeight }),
    titleOpen,
  });
  watchUnlock(window, () => engine.unlock());
  watchVisibility(document, (hidden) => engine.setHidden(hidden));
  const uiRoot = document.getElementById('ui');
  if (uiRoot) {
    watchUi(
      uiRoot,
      () => client.uiSound('ui_click'),
      () => client.uiSound('ui_open'),
    );
  }
  (window as unknown as { __tcAudio?: WebAudioEngine }).__tcAudio = engine;
  return engine;
}
