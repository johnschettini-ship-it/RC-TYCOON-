/**
 * "Make the poster real" (VITE_ART=real build with the realistic look only; title-to-play bridge §4): the five goals,
 * worked out live from the park with no save field, so a goal turns back off when the player demolishes what it
 * counts. Pure (no DOM); the panel (`./goalPanel.ts`) runs `goalsDone` every `GOAL_CHECK_MS`.
 *
 * | Goal    | Done when                                                                  |
 * |---------|----------------------------------------------------------------------------|
 * | wheel   | a `big_wheel` ride is built                                                |
 * | coaster | a track ride whose catalogue type is a coaster (gravity drive), past its station-only build |
 * | stalls  | `STALLS_NEEDED` or more stalls                                             |
 * | arch    | a scenery item whose id ends in `_arch` (`ticket_arch` and the other arches) |
 * | crowd   | `CROWD_NEEDED` or more guests in the park                                  |
 */
import { getTrackRideDef } from '../../data/catalog';
import type { ScenarioKind } from '../../sim/scenario/types';
import type { GameState } from '../../sim/types';
import { POSTER_GOALS, type CoverIndex, type Ellipse, type PosterGoal, type Rect } from '../titleScreen/real/layout';
import type { ToolbarPlacement } from '../layout';

export const GOAL_IDS = POSTER_GOALS;
export type GoalId = PosterGoal;
export type GoalState = Record<GoalId, boolean>;
export const STALLS_NEEDED = 3;
export const CROWD_NEEDED = 200;
/** The panel works the goals out this often, ms (cheap: one pass over rides and scenery). */
export const GOAL_CHECK_MS = 500;

/** A coaster by its catalogue type: a track ride with a gravity drive. */
export function isCoaster(defId: string): boolean {
  return getTrackRideDef(defId)?.drive === 'gravity';
}

/** An arch: a scenery id ending in `_arch`. */
export function isArchScenery(defId: string): boolean {
  return defId.length > '_arch'.length && defId.endsWith('_arch');
}

export function goalsDone(s: Pick<GameState, 'rides' | 'stalls' | 'scenery' | 'guests'>): GoalState {
  let wheel = false;
  let coaster = false;
  for (const r of s.rides) {
    if (r.kind === 'flat' && r.defId === 'big_wheel') wheel = true;
    else if (r.kind === 'track' && r.status !== 'building' && isCoaster(r.defId)) coaster = true;
  }
  return {
    wheel,
    coaster,
    stalls: s.stalls.length >= STALLS_NEEDED,
    arch: s.scenery.some((x) => isArchScenery(x.defId)),
    crowd: s.guests.length >= CROWD_NEEDED,
  };
}

export function doneCount(g: GoalState): number {
  return GOAL_IDS.reduce((n, id) => n + (g[id] ? 1 : 0), 0);
}

/** New sandbox and free-play parks (and their saves); scenarios have their own objectives, the tutorial its steps. */
export function goalInScope(kind: ScenarioKind): boolean {
  return kind === 'freePlay' || kind === 'sandbox';
}

/** Open on desktop; a collapsed chip on phones. */
export function goalStartsOpen(layout: ToolbarPlacement): boolean {
  return layout !== 'bottom';
}

export type Shape = { ellipse: Ellipse } | { rect: Rect };

/** The poster shapes (wide file px) of the goals that are done. */
export function litShapes(idx: CoverIndex, g: GoalState): Shape[] {
  const out: Shape[] = [];
  for (const id of GOAL_IDS) {
    const a = idx.goals?.[id];
    if (!g[id] || !a) continue;
    if (a.ellipse) out.push({ ellipse: a.ellipse });
    for (const r of a.rect === undefined ? [] : Array.isArray(a.rect) ? a.rect : [a.rect]) out.push({ rect: r });
  }
  return out;
}

/** The stored dismissal (a complete poster goal the player closed): its own key, `tcreal:` prefixed in this build. */
export const DISMISS_KEY = 'tc.posterGoal';
type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

export function readDismissed(store: Store): boolean {
  try {
    return store?.getItem(DISMISS_KEY) === 'dismissed';
  } catch {
    return false;
  }
}

export function storeDismissed(store: Store): void {
  try {
    store?.setItem(DISMISS_KEY, 'dismissed');
  } catch {
    // Blocked storage: dismissed for this page only.
  }
}
