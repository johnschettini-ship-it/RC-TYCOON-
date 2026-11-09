/**
 * Content names in the current language (Phase 6 §4.8, Build 3 gate). Every picker, panel, status bar, message, and
 * description that shows the name of a catalog entry (ride, track type, track piece, stall, path item, staff type,
 * scenery theme or item, show site, marketing campaign) calls `contentName(id)`, never the catalog `name` field.
 * The simulation keeps ids (master R5, R27); instance names in the state ("Carousel 1") are game data and stay.
 */
import type { ScenarioDef } from '../data/scenarios';
import { contentIdOfName, contentKey, scenarioDescriptionKey, scenarioNameKey } from '../data/strings/content';
import { en, text } from '../data/strings/en';
import type { StringParams } from '../data/strings/types';

/** The name of catalog entry `id` in the current locale; an unknown id is shown as is. */
export function contentName(id: string): string {
  const key = contentKey(id);
  return en[key] === undefined ? id : text(key);
}

/** A scenario's name and description in the current locale (`nameKey` is the English name). */
export function scenarioName(def: Pick<ScenarioDef, 'id' | 'nameKey'>): string {
  const key = scenarioNameKey(def.id);
  return en[key] === undefined ? def.nameKey : text(key);
}
export function scenarioDescription(def: Pick<ScenarioDef, 'id' | 'description'>): string {
  const key = scenarioDescriptionKey(def.id);
  return en[key] === undefined ? def.description : text(key);
}

/** An English content name (from the sim or an older save) in the current locale; other text unchanged. */
export function localizeContentName(name: string): string {
  const id = contentIdOfName(name);
  return id === undefined ? name : contentName(id);
}

/**
 * Message parameters with content names in the current locale: `itemId` (research) names `name`, `campaignId` names
 * `campaign`; without an id (saves from before the gate) an English catalog name is mapped back by its text.
 */
export function localizeContentParams(params: StringParams | undefined): StringParams | undefined {
  if (!params) return params;
  const out: StringParams = { ...params };
  const itemId = params.itemId;
  if (typeof itemId === 'string' && en[contentKey(itemId)] !== undefined) out.name = contentName(itemId);
  else if (typeof params.name === 'string') out.name = localizeContentName(params.name);
  const campaignId = params.campaignId;
  if (typeof campaignId === 'string' && en[contentKey(campaignId)] !== undefined) out.campaign = contentName(campaignId);
  else if (typeof params.campaign === 'string') out.campaign = localizeContentName(params.campaign);
  return out;
}
