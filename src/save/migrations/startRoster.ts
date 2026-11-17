/**
 * Starting roster (owner, 2026-11-17): 11 rides that research used to unlock start unlocked and left the research
 * order. Owner: integrator. FROZEN once shipped: the ids are literals, never catalogue lookups.
 *
 * A save written before the change can be researching one of them (`research.current`). Like `retired.ts`, this is not
 * a version step (the save format does not change): the codec runs it on every loaded world after the checks. Research
 * moves on to the item it would pick next (`pickNextResearch`: the focus and the scenario rules count) and keeps its
 * points, so nothing is lost and no "new ride" message comes for a ride the park already has.
 *
 * `research.unlocked` is left as written: a former id there is a true record (the panel lists each name once), and
 * the ride is unlocked at the start anyway.
 */
import { pickNextResearch, scenarioResearchSkip } from '../../sim/research/update';
import type { World } from '../../sim/types';

/** The rides that left the research order for the starting roster. */
export const START_ROSTER_IDS: ReadonlySet<string> = new Set([
  'spiral_slide', 'rocket_rounds', 'pendulum_ship', 'bumper_cars', 'kiddie_cars', 'mirror_maze', 'observation_tower', 'drop_tower',
  'wooden_coaster', 'spinning_mouse', 'log_flume',
]);

/** Moves research off a former research ride; true when it did. The progress stays. */
export function settleStartRoster(world: World): boolean {
  const r = world.state.management.research;
  if (r.current === null || !START_ROSTER_IDS.has(r.current)) return false;
  r.current = pickNextResearch(r, scenarioResearchSkip(world));
  return true;
}
