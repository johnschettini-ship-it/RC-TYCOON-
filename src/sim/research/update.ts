/** Owner: W1-I. Hour start: research budget charge and points (Phase 3 §4.6, master R9, R10, R20). */
import { HOURS_PER_MONTH } from '../../data/tuning/core';
import { RESEARCH_BUDGET_MONTHLY, RESEARCH_POINTS_PER_HOUR } from '../../data/tuning/management';
import { RESEARCH_ORDER, getResearchItem } from '../../data/research';
import { MSG } from '../../data/strings/management';
import { hourlyShare, recordLedger } from '../economy/ledger';
import { emit } from '../events';
import type { ManagementSlice } from '../management/types';
import { notify } from '../notifications';
import { hourOfMonth } from '../time';
import type { World } from '../types';
import { contentInfo } from './api';
import { scenarioContentRule } from '../scenario/api';

type ResearchState = ManagementSlice['research'];

/**
 * The first remaining item (default order) whose category is focused.
 * With no focus, or no focused item left, the first remaining item. Null when all are unlocked.
 * Phase 5 §4.1 (W3-H): `skip` leaves out items the scenario hides or already unlocked at start.
 */
export function pickNextResearch(r: ResearchState, skip: (itemId: string) => boolean = () => false): string | null {
  let firstRemaining: string | null = null;
  for (const item of RESEARCH_ORDER) {
    if (r.unlocked.includes(item.id) || skip(item.id)) continue;
    if (r.focus[item.category]) return item.id;
    if (firstRemaining === null) firstRemaining = item.id;
  }
  return firstRemaining;
}

function unlockMessageId(itemId: string): string {
  const kind = contentInfo(itemId)?.kind;
  if (kind === 'trackRide') return MSG.researchTrackRide;
  if (kind === 'stall') return MSG.researchStall;
  if (kind === 'sceneryTheme') return MSG.researchScenery;
  return MSG.researchRide;
}

function ensureCurrent(r: ResearchState, skip: (itemId: string) => boolean): void {
  if (r.current !== null && getResearchItem(r.current) && !r.unlocked.includes(r.current) && !skip(r.current)) return;
  r.current = pickNextResearch(r, skip);
}

/** Phase 5 §4.1: research never picks an item the scenario hides or unlocked at start (W3-H). */
export function scenarioResearchSkip(world: World): (itemId: string) => boolean {
  return (itemId) => scenarioContentRule(world, itemId) !== 'normal';
}

function notifyComplete(world: World, r: ResearchState): void {
  r.progress = 0;
  if (r.completeNotified) return;
  r.completeNotified = true;
  notify(world, 'research', MSG.researchComplete);
}

/**
 * Hour start (tick order R13): charge this hour's budget share (R20), then add points and unlock.
 * No charge and no points while no item is in progress.
 */
export function hourlyResearch(world: World): void {
  const s = world.state;
  const r = s.management.research;
  const hour = hourOfMonth(s.tick);
  if (hour === 0) r.hoursThisMonth = 0;

  const skip = scenarioResearchSkip(world);
  ensureCurrent(r, skip);
  if (r.current === null) {
    notifyComplete(world, r);
    return;
  }
  if (r.level === 'none') return;

  r.hoursThisMonth += 1;
  const charge = hourlyShare(RESEARCH_BUDGET_MONTHLY[r.level], hour, r.hoursThisMonth === HOURS_PER_MONTH);
  if (charge > 0) recordLedger(world, 'research', -charge);

  r.progress += RESEARCH_POINTS_PER_HOUR[r.level] * s.modifiers.researchSpeed;

  while (r.current !== null) {
    const item = getResearchItem(r.current);
    if (!item || r.progress < item.cost) break;
    r.progress -= item.cost;
    r.unlocked.push(item.id);
    emit(world, { type: 'researchUnlocked', itemId: item.id });
    notify(world, 'research', unlockMessageId(item.id), {
      params: { itemId: item.id, name: contentInfo(item.id)?.name ?? item.id },
    });
    r.current = pickNextResearch(r, skip);
  }
  if (r.current === null) notifyComplete(world, r);
}

/** `setResearchBudget`: a new level restarts the hour count, so the month remainder is not charged. */
export function setResearchLevel(world: World, level: ResearchState['level']): void {
  const r = world.state.management.research;
  if (r.level === level) return;
  r.level = level;
  r.hoursThisMonth = 0;
}
