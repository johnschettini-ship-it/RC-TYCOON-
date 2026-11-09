/**
 * Save, load, and autosave actions for the title screen and the in-game menu (Phase 1 §4.7, master §7).
 * Owner: W1-B. No DOM: the backend is the W1-F `SaveStore` in the browser and a fake in tests.
 * Errors from the save module are shown as they are; a failed load keeps the current game.
 */
import { text } from '../data/strings/en';
import type { Game } from '../game';
import type { LoadResult, SlotId, SlotInfo } from '../save';
import type { SimEvent, World } from '../sim/types';
import type { ToastKind } from './toasts';

export interface SaveBackend {
  save(slot: SlotId, world: World): string | null;
  load(slot: SlotId): LoadResult;
  list(): SlotInfo[];
}

export type ManualSlot = '1' | '2' | '3';
export const MANUAL_SLOTS: readonly ManualSlot[] = ['1', '2', '3'];

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class SaveActions {
  constructor(
    private readonly game: Game,
    private readonly backend: SaveBackend,
    private readonly notify: (message: string, kind: ToastKind) => void,
  ) {}

  private infos(): SlotInfo[] {
    try {
      return this.backend.list();
    } catch {
      return [];
    }
  }

  hasAutosave(): boolean {
    return this.infos().some((s) => s.slot === 'auto');
  }

  slots(): Array<{ slot: ManualSlot; info: SlotInfo | null }> {
    const infos = this.infos();
    return MANUAL_SLOTS.map((slot) => ({ slot, info: infos.find((s) => s.slot === slot) ?? null }));
  }

  autosaveInfo(): SlotInfo | null {
    return this.infos().find((s) => s.slot === 'auto') ?? null;
  }

  save(slot: ManualSlot): boolean {
    let error: string | null;
    try {
      error = this.backend.save(slot, this.game.world);
    } catch (e) {
      error = messageOf(e);
    }
    if (error !== null) {
      this.notify(error, 'error');
      return false;
    }
    this.game.dirty = false;
    this.notify(text('ui.save.done', { n: slot }), 'info');
    return true;
  }

  load(slot: SlotId): boolean {
    let result: LoadResult;
    try {
      result = this.backend.load(slot);
    } catch (e) {
      result = { ok: false, error: messageOf(e) };
    }
    return this.applyLoad(result);
  }

  /** Shared by slot loads and file import. */
  applyLoad(result: LoadResult): boolean {
    if (!result.ok) {
      this.notify(result.error, 'error');
      return false;
    }
    this.game.setWorld(result.world);
    this.notify(text('ui.load.done'), 'info');
    return true;
  }

  /** Autosave at each month start (master §7): the sim emits `monthEnded`. Off with Settings → Autosave off. */
  autosave(events: readonly SimEvent[]): void {
    if (!events.some((e) => e.type === 'monthEnded')) return;
    if (!this.game.settings.get('autosave')) return;
    let error: string | null;
    try {
      error = this.backend.save('auto', this.game.world);
    } catch (e) {
      error = messageOf(e);
    }
    if (error !== null) this.notify(text('ui.autosave.failed', { error }), 'warning');
  }
}
