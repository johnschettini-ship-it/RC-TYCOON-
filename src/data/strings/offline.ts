/**
 * Owner: W4-G. Offline play, language, number, date, and command reason strings (Phase 6 §4.8, §4.10, §7; master R27).
 * Keys start with `offline.`, `lang.`, `money.`, `date.`, `reason.`. Master R4: no final period. Texts the spec gives
 * are exact.
 */
import { LAND_ERR } from './land';
import { MANAGEMENT_ERRORS } from './management';
import { PATH_ERR } from './paths';
import { SCENARIO_ERR } from './scenario';
import { SCENERY_ERR } from './scenery';
import { STAFF_ERRORS } from './staff';
import { TERRAIN_ERR, TERRAIN_INPUT_ERR } from './terrain';
import { TRACK_ERR, TRACK_RATING_WARN, TRACK_WARN } from './track';

/**
 * Keys whose value is a format choice, not text: translations pick one of the listed values, and the pseudo-locale
 * copies them unchanged. `date.clock`: `24` = "21:30", `12` = "9:30 PM" (`date.time24` / `date.time12`).
 */
export const FORMAT_KEYS: Readonly<Record<string, readonly string[]>> = {
  'date.clock': ['24', '12'],
};

/**
 * Command reasons and warnings that the simulation returns as English text (master R27). The client maps a reason
 * back to its id with `localizeReason` (`src/i18n`) and shows it in the current locale.
 *
 * Groups from the data tables are listed by reference, so a new reason in one of them gets an id automatically.
 * Reasons written in `src/sim/` and save messages from `src/save/messages.ts` (which `data/` cannot import) are
 * copied here; `tests/unit/i18n/reasons.test.ts` checks that each of them still has an id.
 */
const DATA_REASONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  track: TRACK_ERR,
  trackWarn: TRACK_WARN,
  trackRating: TRACK_RATING_WARN,
  land: LAND_ERR,
  terrain: TERRAIN_ERR,
  terrainInput: TERRAIN_INPUT_ERR,
  scenery: SCENERY_ERR,
  staff: STAFF_ERRORS,
  scenario: SCENARIO_ERR,
  path: PATH_ERR,
  management: MANAGEMENT_ERRORS,
};

/** Copies of the reason constants in `src/sim/` (build, prices, land, command registry) and `src/save/messages.ts`. */
const COPIED_REASONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  build: {
    notEnoughCash: 'Not enough cash',
    inTheWay: 'Something is in the way',
    notOwned: 'You do not own this land',
    cannotRemoveEntrance: 'You cannot remove the park entrance',
    entranceNeedsQueue: 'The entrance needs a queue path',
    exitNeedsFootpath: 'The exit needs a footpath',
    stallNeedsFootpath: 'This stall must face a footpath',
    nothingToRemove: 'Nothing to remove',
    notUnlocked: 'Not unlocked',
    unknownRide: 'Unknown ride',
    unknownStall: 'Unknown stall',
    badRotation: 'Unknown rotation',
  },
  price: {
    rideNotFound: 'Ride not found',
    stallNotFound: 'Stall not found',
    priceRange: 'Price must be between $0 and $20',
    priceStep: 'Price must be in steps of $0.10',
    feeRange: 'Entrance fee must be between $0 and $50',
    feeStep: 'Entrance fee must be in whole dollars',
    parkName: 'Park name must be 1 to 32 characters',
  },
  land: {
    outsidePark: 'Outside the park',
    onlyRights: 'You only have construction rights here',
  },
  command: {
    notImplemented: 'Not implemented yet',
    unknown: 'Unknown command {type}',
  },
  save: {
    notASave: 'This file is not a Thrills & Chills save',
    unreadable: 'This save could not be read',
    newer: 'This save comes from a newer version of the game',
    tooOld: 'This save comes from an older version that this game cannot load',
    saveFailed: 'Could not save. Storage is full or blocked. Use Export instead',
    noStorage: 'Saved games are not available in this browser. Use Import instead',
    emptySlot: 'This save slot is empty',
    upgrade: 'This save could not be upgraded',
    invalid: 'Could not save. The park data has a problem: {reason}',
    damaged: 'This save is damaged: {reason}',
  },
};

/** `reason.<group>.<key>` for each distinct reason text (the first group that has the text names it). */
function reasonTable(): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  for (const groups of [DATA_REASONS, COPIED_REASONS]) {
    for (const [group, entries] of Object.entries(groups)) {
      for (const [key, value] of Object.entries(entries)) {
        if (typeof value !== 'string' || seen.has(value)) continue;
        seen.add(value);
        out[`reason.${group}.${key}`] = value;
      }
    }
  }
  return out;
}

export const offlineStrings: Record<string, string> = {
  // Phase 6 §4.10, §7: the update toast stays until Reload or Later.
  'offline.updateReady': 'Update ready',
  'offline.reload': 'Reload',
  'offline.later': 'Later',
  // Phase 6 §4.8: the game currency sign comes from the string table.
  'money.format': '${amount}',
  // Phase 6 §4.8: month names and the clock format come from the string table (the game calendar is not a real one).
  'date.full': '{month} · Year {year} · {time}',
  'date.clock': '24',
  'date.time24': '{hh}:{mm}',
  'date.time12': '{h}:{mm} {ampm}',
  'date.am': 'AM',
  'date.pm': 'PM',
  'date.month.0': 'Mar',
  'date.month.1': 'Apr',
  'date.month.2': 'May',
  'date.month.3': 'Jun',
  'date.month.4': 'Jul',
  'date.month.5': 'Aug',
  'date.month.6': 'Sep',
  'date.month.7': 'Oct',
  'date.month.8': 'Nov',
  'date.month.9': 'Dec',
  'date.month.10': 'Jan',
  'date.month.11': 'Feb',
  // Settings → Language (W4-F shows the list from `LOCALES`).
  'lang.auto': 'Device language',
  'lang.reloadHint': 'Some text changes after the next reload',
  ...reasonTable(),
};
