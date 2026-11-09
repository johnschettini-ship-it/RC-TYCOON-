/**
 * Offline play (Phase 6 §4.10). Owner: W4-G. Called once from `main.ts`. Neutral stub: no service worker.
 *
 * Contract for the real body: off in `npm run dev` (`import.meta.env.DEV`); with Settings → Offline play on (default),
 * register `sw.js` (hand-written, `public/sw.js`) with the Pages base path as scope; a waiting worker shows the
 * "Update ready" toast (Reload / Later; it stays until the player picks); Reload autosaves first, then skips waiting
 * and reloads; turning the setting off unregisters the worker. Saves stay in `localStorage`, never in the cache.
 */
import type { Game } from '../game';

export function registerOffline(game: Game): void {
  void game;
}
