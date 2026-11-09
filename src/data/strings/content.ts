/**
 * Content names (Phase 6 §4.8, Build 3 gate). One `content.<id>` string per catalog entry, generated from the catalogs
 * when the module loads: flat rides, track ride types, stalls and facilities, path items, staff types, scenery themes
 * (the research items of the Scenery category), scenery items, show sites, marketing campaigns, and track pieces. The
 * catalog `name` fields stay the English source (one place for the content numbers and names); every locale
 * translates the `content.*` ids like any other string, so `en-XA` accents them. Scenario names and descriptions
 * (`src/data/scenarios`, whose `nameKey` was the English name until now) are `content.scenario.<id>` and
 * `content.scenario.<id>.description`.
 *
 * The simulation keeps ids (master R5, R27): it never reads this table. The client shows names through
 * `contentName(id)` (`src/ui/contentName.ts`). Instance names in the state ("Carousel 1", staff names, the park name)
 * are game data, like a name the player types, and stay as they are.
 */
import { FLAT_RIDES, PATH_ITEMS, SCENERY, SCENERY_THEMES, SHOW_SITES, STAFF, STALLS, TRACK_RIDES } from '../catalog';
import { ALL_TRACK_PIECES } from '../track/pieces';
import { SCENARIOS } from '../scenarios';
import { CAMPAIGNS } from '../tuning/management';

export interface NamedContent {
  readonly id: string;
  readonly name: string;
}

/** Every catalog with player-facing names, in a fixed order (ids are unique across all of them; tested). */
export const CONTENT_CATALOGS: Readonly<Record<string, readonly NamedContent[]>> = Object.freeze({
  flatRides: FLAT_RIDES,
  trackRides: TRACK_RIDES,
  stalls: STALLS,
  pathItems: PATH_ITEMS,
  staff: STAFF,
  sceneryThemes: SCENERY_THEMES,
  scenery: SCENERY,
  showSites: SHOW_SITES,
  campaigns: CAMPAIGNS,
  trackPieces: ALL_TRACK_PIECES,
});

/** The string id of a content name. */
export function contentKey(id: string): string {
  return `content.${id}`;
}

/** The string ids of a scenario's name and description. */
export function scenarioNameKey(id: string): string {
  return `content.scenario.${id}`;
}
export function scenarioDescriptionKey(id: string): string {
  return `content.scenario.${id}.description`;
}

function buildContentStrings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const list of Object.values(CONTENT_CATALOGS)) {
    for (const d of list) out[contentKey(d.id)] = d.name;
  }
  for (const s of SCENARIOS) {
    out[scenarioNameKey(s.id)] = s.nameKey;
    out[scenarioDescriptionKey(s.id)] = s.description;
  }
  return out;
}

export const contentStrings: Record<string, string> = buildContentStrings();

/** English name → content id (first catalog wins), for English names inside sim reasons and old message params. */
let byName: Map<string, string> | null = null;

export function contentIdOfName(name: string): string | undefined {
  if (!byName) {
    byName = new Map();
    for (const list of Object.values(CONTENT_CATALOGS)) for (const d of list) if (!byName.has(d.name)) byName.set(d.name, d.id);
  }
  return byName.get(name);
}
