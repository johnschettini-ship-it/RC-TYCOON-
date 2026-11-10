/**
 * English string table (master R4, R5). Keys are ids. No final period on messages.
 * Areas own their sections: guests (W1-D), management (W1-H, W1-I), track (W1-G), ui (W1-B).
 * Add keys in your own section file and list it here at integration.
 * Phase 6 §4.8: `text()` reads the active locale first (`./resolve.ts`, set by W4-G) and falls back to English;
 * plurals, locales, and formatting live in `./index.ts` (`t`).
 */
import { guestStrings } from './guests';
import { uiStrings } from './ui';
import { interfaceStrings } from './interface';
import { trackStrings } from './track';
import { staffStrings } from './staff';
import { managementStrings } from './management';
import { trackUiStrings } from './trackUi';
// Build 2 sections (Wave 3.0), one per card.
import { landUiStrings } from './landUi';
import { pathStrings } from './paths';
import { waterRideStrings } from './waterRides';
import { sceneryStrings } from './scenery';
import { fieldStrings } from './fields';
import { nightStrings } from './night';
import { landStrings } from './land';
import { scenarioStrings } from './scenario';
import { progressionStrings } from './progression';
// Build 3 sections (Wave 4.0), one per card.
import { showStrings } from './shows';
import { settingsStrings } from './settings';
import { a11yStrings } from './a11y';
import { perfStrings } from './perf';
import { offlineStrings } from './offline';
// Build 3 gate: content names generated from the catalogs (`content.<id>`).
import { contentStrings } from './content';
import { fillParams, lookupString } from './resolve';

export const en: Record<string, string> = {
  ...guestStrings,
  ...uiStrings,
  ...interfaceStrings,
  ...trackStrings,
  ...staffStrings,
  ...managementStrings,
  ...trackUiStrings,
  ...landUiStrings,
  ...pathStrings,
  ...waterRideStrings,
  ...sceneryStrings,
  ...fieldStrings,
  ...nightStrings,
  ...landStrings,
  ...scenarioStrings,
  ...progressionStrings,
  ...showStrings,
  ...settingsStrings,
  ...a11yStrings,
  ...perfStrings,
  ...offlineStrings,
  ...contentStrings,
};

export function text(id: string, params?: Record<string, string | number>): string {
  const raw = lookupString(id, en);
  if (raw === undefined) return id;
  if (!params) return raw;
  return fillParams(raw, params);
}

/**
 * English text regardless of the active locale (master R27): the simulation returns English command reasons and
 * warnings; the client translates them with `localizeReason`.
 */
export function englishText(id: string, params?: Record<string, string | number>): string {
  const raw = en[id];
  if (raw === undefined) return id;
  return params ? fillParams(raw, params) : raw;
}
