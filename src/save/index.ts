/** Save API (master §7, Phase 1 §4.7). Owner: W1-F. Signatures are a contract. */
import { version as packageVersion } from '../../package.json';
import type { World } from '../sim/types';
import { formatDate } from '../sim/time';
import { deserializeWith, SAVE_FORMAT, SCHEMA_VERSION, serializeWorld, type LoadResult } from './codec';
import { ERR_EMPTY_SLOT, ERR_NO_STORAGE, ERR_SAVE_FAILED, ERR_UNREADABLE } from './messages';
import { migrations } from './migrations';
import { isRecord } from './schema';

export { SAVE_FORMAT, SCHEMA_VERSION, type LoadResult } from './codec';
export { migrations, type Migration, type Migrations } from './migrations';
export * as saveMessages from './messages';

/** Game version written into every save (from package.json). */
export const GAME_VERSION: string = packageVersion;

export type SlotId = '1' | '2' | '3' | 'auto';
export const SLOT_IDS: readonly SlotId[] = ['1', '2', '3', 'auto'];

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

/** The localStorage key of a slot: `tc.save.1` … `tc.save.3`, `tc.save.auto`. */
export function slotKey(slot: SlotId): string {
  return `tc.save.${slot}`;
}

export function serialize(world: World, gameVersion: string, savedAtIso: string): string {
  return serializeWorld(world, gameVersion, savedAtIso);
}

/** Parse, check, migrate, and validate a save. Never throws; on failure the caller keeps the current game. */
export function deserialize(json: string): LoadResult {
  return deserializeWith(json, { schemaVersion: SCHEMA_VERSION, migrations });
}

/** Browser storage, or null when it is missing or blocked (private mode, disabled cookies). */
export function browserStore(): KeyValueStore | null {
  try {
    const ls = (globalThis as { localStorage?: KeyValueStore }).localStorage;
    if (!ls) return null;
    const probe = 'tc.probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

export class SaveStore {
  constructor(
    private readonly store: KeyValueStore | null,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  /** Error message on failure (storage full or blocked), else null. */
  save(slot: SlotId, world: World): string | null {
    if (this.store === null) return ERR_SAVE_FAILED;
    const json = serialize(world, GAME_VERSION, this.now());
    try {
      this.store.setItem(slotKey(slot), json);
      return null;
    } catch {
      return ERR_SAVE_FAILED;
    }
  }

  load(slot: SlotId): LoadResult {
    if (this.store === null) return { ok: false, error: ERR_NO_STORAGE };
    let json: string | null;
    try {
      json = this.store.getItem(slotKey(slot));
    } catch {
      return { ok: false, error: ERR_NO_STORAGE };
    }
    if (json === null) return { ok: false, error: ERR_EMPTY_SLOT };
    return deserialize(json);
  }

  /** Slots that hold a readable save, in slot order. Unreadable slots are skipped. Never throws. */
  list(): SlotInfo[] {
    const out: SlotInfo[] = [];
    if (this.store === null) return out;
    for (const slot of SLOT_IDS) {
      try {
        const json = this.store.getItem(slotKey(slot));
        if (json === null) continue;
        const info = readSlotInfo(slot, json);
        if (info) out.push(info);
      } catch {
        // Unreadable or blocked: skip the slot.
      }
    }
    return out;
  }

  hasStore(): boolean {
    return this.store !== null;
  }
}

/** Slot info from the envelope only (no full validation), or null when the text is not a readable save. */
function readSlotInfo(slot: SlotId, json: string): SlotInfo | null {
  const raw = JSON.parse(json) as unknown;
  if (!isRecord(raw) || raw.format !== SAVE_FORMAT || typeof raw.savedAt !== 'string') return null;
  const state = raw.state;
  if (!isRecord(state) || !isRecord(state.park) || typeof state.park.name !== 'string') return null;
  const tick = state.tick;
  if (typeof tick !== 'number' || !Number.isSafeInteger(tick) || tick < 0) return null;
  return { slot, parkName: state.park.name, savedAt: raw.savedAt, gameDate: formatDate(tick) };
}

/** File name for an exported save: the park name made safe for file systems. */
export function exportFileName(parkName: string): string {
  const safe = parkName
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 64)
    .trim();
  return `${safe === '' ? 'park' : safe}.tcsave.json`;
}

/** Browser only: download the save as a `.tcsave.json` file. */
export function exportFile(world: World): void {
  const json = serialize(world, GAME_VERSION, new Date().toISOString());
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName(world.state.park.name);
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    // Give the browser a moment to start the download before the URL goes away.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Browser only: read a picked file and deserialize it. */
export async function importFile(file: File): Promise<LoadResult> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: ERR_UNREADABLE };
  }
  return deserialize(text);
}
