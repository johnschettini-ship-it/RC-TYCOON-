/** `F3` toggles the performance overlay (Phase 6 §4.6). Owner: W4-E. It flips Settings → Performance overlay. */
import type { KeyHandler } from '../input/keyHandlers';

export const PERF_OVERLAY_KEY = 'F3';

export const perfKeys: KeyHandler = {
  keyDown(game, key, mods) {
    if (key !== PERF_OVERLAY_KEY) return false;
    if (!mods.repeat) game.settings.set('perfOverlay', !game.settings.get('perfOverlay'));
    return true;
  },
};
