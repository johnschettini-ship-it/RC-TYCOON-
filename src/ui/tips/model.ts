/** Tip model (Phase 7 §4.8). Pure: no DOM. */
import { getFlatRideDef, getTrackRideDef } from '../../data/catalog';
import { TIP_GAP_POINTS, TIP_MIN_GUESTS } from '../../data/tuning/interface';
import type { World } from '../../sim/types';
import { sharePercents, temperamentShares } from '../format';
import type { Group, SharePercents } from '../mood/model';

export type TipId = 'cashLow' | 'noRide' | 'underServed.chill' | 'underServed.family' | 'underServed.thrill';

export interface TipInput {
  cash: number;
  tutorial: boolean;
  tipsOn: boolean;
  guestPercents: SharePercents;
  guestTotal: number;
  openRides: Record<Group, number>;
}

export interface Tip {
  id: TipId;
  speaker: 'frost' | 'spark' | 'both';
  mood: 'happy' | 'sad';
  group: Group | null;
}

const GROUPS: readonly Group[] = ['chill', 'family', 'thrill'];

const UNDER_SERVED: Record<Group, Tip> = {
  chill: { id: 'underServed.chill', speaker: 'frost', mood: 'sad', group: 'chill' },
  family: { id: 'underServed.family', speaker: 'both', mood: 'happy', group: 'family' },
  thrill: { id: 'underServed.thrill', speaker: 'spark', mood: 'sad', group: 'thrill' },
};

/** The group whose guest share most exceeds its share of open rides, by at least the gap; null if none. */
export function underServedGroup(i: TipInput): Group | null {
  if (i.guestTotal < TIP_MIN_GUESTS) return null;
  const totalOpen = GROUPS.reduce((n, g) => n + i.openRides[g], 0);
  if (totalOpen === 0) return null;
  let best: Group | null = null;
  let bestGap = 0;
  for (const g of GROUPS) {
    const gap = i.guestPercents[g] * totalOpen - i.openRides[g] * 100;
    if (gap >= TIP_GAP_POINTS * totalOpen && (best === null || gap > bestGap)) {
      best = g;
      bestGap = gap;
    }
  }
  return best;
}

export function matchingTips(i: TipInput): Tip[] {
  if (i.tutorial || !i.tipsOn) return [];
  const out: Tip[] = [];
  if (i.cash < 0) out.push({ id: 'cashLow', speaker: 'both', mood: 'sad', group: null });
  if (GROUPS.every((g) => i.openRides[g] === 0)) out.push({ id: 'noRide', speaker: 'both', mood: 'happy', group: null });
  const g = underServedGroup(i);
  if (g) out.push(UNDER_SERVED[g]);
  return out;
}

/** Keeps only the closed ids that still match, so a tip returns once its rule stops and starts again. */
export function dropStale(closed: ReadonlySet<TipId>, matching: readonly Tip[]): Set<TipId> {
  const live = new Set(matching.map((t) => t.id));
  return new Set([...closed].filter((id) => live.has(id)));
}

export function shownTip(matching: readonly Tip[], closed: ReadonlySet<TipId>): Tip | null {
  return matching.find((t) => !closed.has(t.id)) ?? null;
}

export function tipInput(world: World, tipsOn: boolean): TipInput {
  const s = world.state;
  const openRides: Record<Group, number> = { chill: 0, family: 0, thrill: 0 };
  for (const r of s.rides) {
    if (r.status !== 'open') continue;
    const def = getFlatRideDef(r.defId) ?? getTrackRideDef(r.defId);
    if (def) openRides[def.tag]++;
  }
  return {
    cash: s.park.cash,
    tutorial: s.scenario.kind === 'tutorial',
    tipsOn,
    guestPercents: sharePercents(temperamentShares(s.guests)),
    guestTotal: s.guests.length,
    openRides,
  };
}
