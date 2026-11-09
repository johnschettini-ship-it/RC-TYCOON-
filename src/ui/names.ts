/** Park name rule (Phase 1 §4.7: 1–32 characters). Owner: W1-B. Pure. */
import { text } from '../data/strings/en';

export const PARK_NAME_MAX = 32;

export function validateParkName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim();
  const len = [...name].length;
  if (len < 1 || len > PARK_NAME_MAX) return { ok: false, error: text('ui.park.nameError') };
  return { ok: true, name };
}
