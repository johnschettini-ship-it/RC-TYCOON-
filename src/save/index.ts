/** Save API (master §7, Phase 1 §4.7). Owner: W1-F. Signatures are a contract; replace the stub bodies. */
import type { World } from '../sim/types';

export const SAVE_FORMAT = 'thrills-and-chills-save';
export const SCHEMA_VERSION = 1;
export type SlotId = '1' | '2' | '3' | 'auto';

export type LoadResult = { ok: true; world: World } | { ok: false; error: string };

export interface SlotInfo {
  slot: SlotId;
  parkName: string;
  savedAt: string;
  gameDate: string;
}

/** Minimal storage interface so tests can inject a fake (Node has no localStorage). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function serialize(_world: World, _gameVersion: string, _savedAtIso: string): string {
  throw new Error('Not implemented yet');
}

export function deserialize(_json: string): LoadResult {
  return { ok: false, error: 'Not implemented yet' };
}

export class SaveStore {
  constructor(private readonly store: KeyValueStore | null) {}

  /** Error message on failure (storage full or blocked), else null. */
  save(_slot: SlotId, _world: World): string | null {
    return 'Not implemented yet';
  }

  load(_slot: SlotId): LoadResult {
    return { ok: false, error: 'Not implemented yet' };
  }

  list(): SlotInfo[] {
    return [];
  }

  hasStore(): boolean {
    return this.store !== null;
  }
}

/** Browser only: download the save as a `.tcsave.json` file. */
export function exportFile(_world: World): void {}

/** Browser only: read a picked file and deserialize it. */
export async function importFile(_file: File): Promise<LoadResult> {
  return { ok: false, error: 'Not implemented yet' };
}
