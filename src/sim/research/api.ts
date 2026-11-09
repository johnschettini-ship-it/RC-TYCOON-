/** Owner: W1-I. Content availability for pickers and commands (Phase 3 §4.6). */
import {
  FLAT_RIDES,
  getSceneryDef,
  getSceneryTheme,
  PATH_ITEMS,
  STAFF,
  STALLS,
  TRACK_RIDES,
  type Phase,
  type ResearchCategory,
  type SceneryThemeId,
  type Unlock,
} from '../../data/catalog';
import { getResearchItem } from '../../data/research';
import { BUILD_MAX_PHASE, RESEARCH_POINTS_PER_HOUR } from '../../data/tuning/management';
import { scenarioContentRule } from '../scenario/api';
import type { World } from '../types';

/** `sceneryTheme`: a whole theme (its research item id = the theme id); `scenery`: one item of a theme (Phase 4). */
export type ContentKind = 'flatRide' | 'trackRide' | 'stall' | 'pathItem' | 'staff' | 'sceneryTheme' | 'scenery';

export interface ContentInfo {
  id: string;
  name: string;
  kind: ContentKind;
  phase: Phase;
  unlock: Unlock;
}

/** Catalog lookup across every kind of buildable or hireable content. */
export function contentInfo(id: string): ContentInfo | undefined {
  const flat = FLAT_RIDES.find((d) => d.id === id);
  if (flat) return { id, name: flat.name, kind: 'flatRide', phase: flat.phase, unlock: flat.unlock };
  const track = TRACK_RIDES.find((d) => d.id === id);
  if (track) return { id, name: track.name, kind: 'trackRide', phase: track.phase, unlock: track.unlock };
  const stall = STALLS.find((d) => d.id === id);
  if (stall) return { id, name: stall.name, kind: 'stall', phase: stall.phase, unlock: stall.unlock };
  const item = PATH_ITEMS.find((d) => d.id === id);
  if (item) return { id, name: item.name, kind: 'pathItem', phase: item.phase, unlock: item.unlock };
  const staff = STAFF.find((d) => d.id === id);
  if (staff) return { id, name: staff.name, kind: 'staff', phase: 3, unlock: 'start' };
  const theme = getSceneryTheme(id as SceneryThemeId);
  if (theme) return { id, name: theme.name, kind: 'sceneryTheme', phase: 4, unlock: theme.unlock };
  const scenery = getSceneryDef(id);
  if (scenery) {
    const t = getSceneryTheme(scenery.theme);
    return { id, name: scenery.name, kind: 'scenery', phase: 4, unlock: t ? t.unlock : 'start' };
  }
  return undefined;
}

/**
 * True for `start` items and Phase 1–2 content, for research items once researched (a scenery item once its theme
 * is researched), and false for content of phases after `BUILD_MAX_PHASE` and unknown ids.
 * Phase 5 §4.1: the scenario's research rules (`scenarioContentRule`, W3-H) can hide an item or unlock it at start.
 */
export function isUnlocked(world: World, itemId: string): boolean {
  const rule = scenarioContentRule(world, itemId);
  if (rule === 'hidden') return false;
  const info = contentInfo(itemId);
  if (!info || info.phase > BUILD_MAX_PHASE) return false;
  if (rule === 'unlocked' || info.phase <= 2 || info.unlock === 'start') return true;
  const researchId = info.kind === 'scenery' ? (getSceneryDef(itemId)?.theme ?? itemId) : itemId;
  return world.state.management.research.unlocked.includes(researchId);
}

export interface ResearchStatus {
  current: string | null;
  name: string | null;
  category: ResearchCategory | null;
  progress: number;
  cost: number;
  pointsPerHour: number;
  /** Game hours until the current item unlocks at the current level, or null when no points come in. */
  hoursLeft: number | null;
}

/** Read model for the Office Research tab. */
export function researchStatus(world: World): ResearchStatus {
  const r = world.state.management.research;
  const item = r.current === null ? undefined : getResearchItem(r.current);
  const pointsPerHour = RESEARCH_POINTS_PER_HOUR[r.level] * world.state.modifiers.researchSpeed;
  const cost = item?.cost ?? 0;
  const hoursLeft = item && pointsPerHour > 0 ? Math.max(0, Math.ceil((cost - r.progress) / pointsPerHour)) : null;
  return {
    current: item?.id ?? null,
    name: item ? (contentInfo(item.id)?.name ?? item.id) : null,
    category: item?.category ?? null,
    progress: r.progress,
    cost,
    pointsPerHour,
    hoursLeft,
  };
}
