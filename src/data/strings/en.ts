/**
 * English string table (master R4, R5). Keys are ids. No final period on messages.
 * Areas own their sections: guests (W1-D), management (W1-H, W1-I), track (W1-G), ui (W1-B).
 * Add keys in your own section file and list it here at integration.
 */
import { guestStrings } from './guests';
import { uiStrings } from './ui';
import { trackStrings } from './track';
import { staffStrings } from './staff';
import { managementStrings } from './management';

export const en: Record<string, string> = {
  ...guestStrings,
  ...uiStrings,
  ...trackStrings,
  ...staffStrings,
  ...managementStrings,
};

export function text(id: string, params?: Record<string, string | number>): string {
  const raw = en[id];
  if (raw === undefined) return id;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] === undefined ? `{${k}}` : String(params[k])));
}
