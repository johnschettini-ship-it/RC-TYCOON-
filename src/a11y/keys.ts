/**
 * Keyboard play keys (Phase 6 §4.7). Owner: W4-F.
 * `C` toggles the map cursor (state in `./cursor.ts`); while it is on, arrows move it, `Enter` acts as a click at the
 * cursor (through the input controller, so tools behave as with a pointer), `Shift` + arrows extend a path drag (let
 * go of `Shift` to build), `Esc` drops that drag. `R` (rotate) and `Esc` (cancel) stay with the key map. `?` opens
 * the shortcut list. Keys typed into fields never reach handlers (`input/index.ts`).
 */
import type { KeyHandler } from '../input/keyHandlers';
import { ARROW_DIRS, cursorChanged, cursorInput, cursorStep, mapCursor, requestShortcutList } from './cursor';

function endDrag(build: boolean): void {
  if (mapCursor.dragFrom < 0) return;
  mapCursor.dragFrom = -1;
  const io = cursorInput();
  if (!io) return;
  if (build) io.dragEnd();
  else io.dragCancel();
}

export const a11yKeys: KeyHandler = {
  keyDown(game, key, mods) {
    if (key === '?') return requestShortcutList();
    const io = cursorInput();
    if (!io) return false;
    const map = game.world.state.map;
    const n = map.width * map.height;
    if (key === 'c' || key === 'C') {
      if (mods.repeat) return true;
      if (mapCursor.on) {
        endDrag(false);
        mapCursor.on = false;
      } else {
        mapCursor.on = true;
        if (mapCursor.tile < 0 || mapCursor.tile >= n) mapCursor.tile = io.centreTile();
        io.reveal(mapCursor.tile);
        io.hover(mapCursor.tile);
      }
      cursorChanged();
      return true;
    }
    if (!mapCursor.on) return false;
    if (mapCursor.tile < 0 || mapCursor.tile >= n) mapCursor.tile = io.centreTile();
    const dir = ARROW_DIRS[key];
    if (dir) {
      const next = cursorStep(map, mapCursor.tile, dir, game.camera.rotation);
      if (mods.shift) {
        const from = mapCursor.dragFrom >= 0 ? mapCursor.dragFrom : mapCursor.tile;
        if (io.dragTo(from, next)) mapCursor.dragFrom = from;
      } else if (mapCursor.dragFrom >= 0) {
        // Shift came up without a key-up (focus moved): build what was dragged first.
        endDrag(true);
      }
      mapCursor.tile = next;
      io.reveal(next);
      if (mapCursor.dragFrom < 0) io.hover(next);
      cursorChanged();
      return true;
    }
    if (key === 'Enter') {
      if (mapCursor.dragFrom >= 0) endDrag(true);
      else io.click(mapCursor.tile);
      cursorChanged();
      return true;
    }
    if ((key === 'Escape' || key === 'Esc') && mapCursor.dragFrom >= 0) {
      endDrag(false);
      return true;
    }
    return false;
  },
  keyUp(_game, key) {
    if (key === 'Shift') endDrag(true);
  },
};
