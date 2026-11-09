/**
 * Autosave before the update reload (Phase 6 §4.10 "Reload runs after an autosave"). Owner: W4-G. No DOM.
 * A park with unsaved changes goes to the autosave slot first. Nothing is saved when nothing changed or when the
 * title screen is open (the player left the park). A failed save stops the reload, so no progress is lost.
 */
import type { Game } from '../../game';
import type { World } from '../../sim/types';

export interface AutosaveBackend {
  /** Null on success, else the error text (the `SaveStore.save` contract). */
  save(slot: 'auto', world: World): string | null;
}

export type AutosaveResult = { ok: true } | { ok: false; error: string };

export function autosaveBeforeReload(game: Game, backend: AutosaveBackend, titleOpen: boolean): AutosaveResult {
  if (!game.dirty || titleOpen) return { ok: true };
  let error: string | null;
  try {
    error = backend.save('auto', game.world);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  if (error !== null) return { ok: false, error };
  game.dirty = false;
  return { ok: true };
}
