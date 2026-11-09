/** Owner: W1-I. Hour start: campaign expiry and target checks (Phase 3 §4.7). */
import { CAMPAIGN_ARRIVAL_CAP, getCampaignDef } from '../../data/tuning/management';
import { MSG } from '../../data/strings/management';
import type { Campaign } from '../management/types';
import { notify } from '../notifications';
import type { World } from '../types';

/**
 * Hour start (tick order R13): end campaigns whose end tick has come, and targeted campaigns
 * whose ride or stall no longer exists (no refund). Each ending posts a `marketing` message.
 */
export function hourlyMarketing(world: World): void {
  const s = world.state;
  const m = s.management;
  if (m.campaigns.length === 0) return;
  const keep: Campaign[] = [];
  for (const c of m.campaigns) {
    const def = getCampaignDef(c.type);
    if (!def) continue;
    const targetGone =
      (def.target === 'ride' && !s.rides.some((r) => r.id === c.targetId)) ||
      (def.target === 'stall' && !s.stalls.some((st) => st.id === c.targetId));
    if (targetGone) notify(world, 'marketing', MSG.campaignTargetRemoved, { params: { campaign: def.name } });
    else if (s.tick >= c.endTick) notify(world, 'marketing', MSG.campaignEnded, { params: { campaign: def.name } });
    else keep.push(c);
  }
  m.campaigns = keep;
}

/** Arrival multiplier from running campaigns: the product, capped at `CAMPAIGN_ARRIVAL_CAP`. */
export function campaignArrivalFactor(world: World): number {
  let f = 1;
  for (const c of world.state.management.campaigns) f *= getCampaignDef(c.type)?.arrivals ?? 1;
  return Math.min(CAMPAIGN_ARRIVAL_CAP, f);
}
