/**
 * Settings → Data (Phase 6 §4.9): export all saves, import progress. Owner: W4-F. No DOM (the screen downloads and
 * picks files). Nothing is ever repaired or filled in: a damaged save is exported as its stored text, and a progress
 * file that does not pass the Phase 5 check changes nothing.
 */
import { SLOT_IDS, slotKey, type KeyValueStore } from '../../save';
import { PROGRESS_KEY, parseProgress } from '../../progress';
import { text } from '../../data/strings/en';

export const SAVES_EXPORT_FORMAT = 'thrills-and-chills-saves';

/**
 * Every stored slot in one document: `{ format, exportedAt, saves: { "1": <save envelope>, …, "auto": … } }`.
 * Each entry is a complete `.tcsave.json` envelope (a damaged slot is kept as its text). Null when no slot is stored.
 */
export function savesExport(store: KeyValueStore | null, exportedAt: string): string | null {
  if (!store) return null;
  const saves: Record<string, unknown> = {};
  for (const slot of SLOT_IDS) {
    let raw: string | null;
    try {
      raw = store.getItem(slotKey(slot));
    } catch {
      raw = null;
    }
    if (raw === null) continue;
    try {
      saves[slot] = JSON.parse(raw) as unknown;
    } catch {
      saves[slot] = raw;
    }
  }
  if (Object.keys(saves).length === 0) return null;
  return JSON.stringify({ format: SAVES_EXPORT_FORMAT, exportedAt, saves }, null, 2);
}

/** Store a progress file the player picked (Phase 5 §4.12 check first). */
export function importProgress(store: KeyValueStore | null, raw: string): { ok: true } | { ok: false; error: string } {
  const r = parseProgress(raw);
  if (!r.ok) return { ok: false, error: r.error };
  if (!store) return { ok: false, error: text('settings.data.storageBlocked') };
  try {
    store.setItem(PROGRESS_KEY, JSON.stringify(r.progress));
  } catch {
    return { ok: false, error: text('settings.data.storageBlocked') };
  }
  return { ok: true };
}
