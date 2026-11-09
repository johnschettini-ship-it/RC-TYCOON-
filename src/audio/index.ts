/**
 * Audio client (Phase 6 §4.1–4.3). Owner: W4-A (W4-B plugs the music player in through `createMusicPlayer`).
 * Called once from `main.ts`. Neutral stub: nothing is created and nothing listens, so the game stays silent.
 *
 * Contract for the real body: unlock the engine on the first `pointerdown` or `keydown` (capture phase, on
 * `window`); volumes from `game.settings` (and on every change); `game.onEvents` and `game.onCommand` feed
 * `requestsForEvents` / `requestsForCommand`; `game.onFrame` runs `engine.update` and the music player;
 * `visibilitychange` → `setHidden`. Expose the engine on `window.__tcAudio` for Playwright (`state()`).
 */
import type { Game } from '../game';
import type { AudioEngine } from './types';
import { createAudioEngine } from './engine';

export function mountAudio(game: Game): AudioEngine {
  void game;
  return createAudioEngine();
}
