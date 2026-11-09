/** Research view model (Phase 3 §4.6, §7.1). Owner: W2-B. Pure. */
import { RESEARCH_ORDER } from '../../data/research';
import type { ResearchCategory } from '../../data/catalog/types';
import { TICKS_PER_HOUR } from '../../data/tuning/core';
import { contentInfo, researchStatus } from '../../sim/research/api';
import type { World } from '../../sim/types';

/** Whole percent of `progress` toward `cost`, 0–100 (0 when there is no item). */
export function progressPercent(progress: number, cost: number): number {
  if (cost <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((progress * 100) / cost)));
}

/** Tick at which the current item unlocks at the current budget, or null (no item, no points). */
export function researchEta(world: World): number | null {
  const st = researchStatus(world);
  if (st.current === null || st.hoursLeft === null) return null;
  return world.state.tick + st.hoursLeft * TICKS_PER_HOUR;
}

/** Items of `category` not unlocked yet (Build 1 research order). */
export function itemsLeft(world: World, category: ResearchCategory): number {
  const done = world.state.management.research.unlocked;
  let n = 0;
  for (const it of RESEARCH_ORDER) if (it.category === category && !done.includes(it.id)) n++;
  return n;
}

export interface ResearchView {
  current: string | null;
  name: string | null;
  category: ResearchCategory | null;
  progress: number;
  cost: number;
  percent: number;
  pointsPerHour: number;
  /** Names of researched items, newest first. */
  unlocked: string[];
  complete: boolean;
}

export function researchView(world: World): ResearchView {
  const st = researchStatus(world);
  const r = world.state.management.research;
  const unlocked: string[] = [];
  for (let k = r.unlocked.length - 1; k >= 0; k--) {
    const id = r.unlocked[k] as string;
    unlocked.push(contentInfo(id)?.name ?? id);
  }
  return {
    current: st.current,
    name: st.name,
    category: st.category,
    progress: st.progress,
    cost: st.cost,
    percent: progressPercent(st.progress, st.cost),
    pointsPerHour: st.pointsPerHour,
    unlocked,
    complete: r.current === null,
  };
}
