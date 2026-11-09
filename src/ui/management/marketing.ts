/** Marketing view model (Phase 3 §4.7, §7.1): targets, effects, durations, time left. Owner: W2-B. Pure. */
import { MANAGEMENT_ERRORS } from '../../data/strings/management';
import { text } from '../../data/strings/en';
import type { CampaignDef } from '../../data/tuning/management';
import type { ManagementCommand } from '../../sim/commands/types';
import type { Campaign } from '../../sim/management/types';
import type { World } from '../../sim/types';
import type { EntityId } from '../../sim/units';
import { formatDuration, formatSpan } from './time';

export interface TargetOption {
  id: EntityId;
  name: string;
}

/** Rides (Ride Spotlight) or stalls (Snack Deal) the campaign can target, in id order. Park campaigns: none. */
export function campaignTargets(world: World, def: CampaignDef): TargetOption[] {
  if (def.target === 'ride') return world.state.rides.map((r) => ({ id: r.id, name: r.name }));
  if (def.target === 'stall') return world.state.stalls.map((s) => ({ id: s.id, name: s.name }));
  return [];
}

/** Null when the campaign may start with this target; else the command's exact refusal ("Pick a target"). */
export function validateCampaignTarget(world: World, def: CampaignDef, targetId: EntityId | undefined): string | null {
  if (def.target === 'park') return null;
  if (targetId === undefined) return MANAGEMENT_ERRORS.pickTarget;
  return campaignTargets(world, def).some((t) => t.id === targetId) ? null : MANAGEMENT_ERRORS.pickTarget;
}

export function campaignStartCommand(def: CampaignDef, targetId: EntityId | undefined): ManagementCommand {
  return def.target === 'park' || targetId === undefined
    ? { type: 'startCampaign', campaignType: def.id }
    : { type: 'startCampaign', campaignType: def.id, targetId };
}

/** Ticks until the campaign expires (it ends at the first hour start with tick ≥ endTick). */
export function campaignTimeLeft(world: World, c: Campaign): number {
  return Math.max(0, c.endTick - world.state.tick);
}

export function campaignTimeLeftText(world: World, c: Campaign): string {
  return formatDuration(campaignTimeLeft(world, c));
}

export function campaignDurationText(ticks: number): string {
  return formatSpan(ticks);
}

const fmt = (f: number): string => String(Math.round(f * 100) / 100);

/** Effect text built from the campaign numbers, so it always matches the tuning. */
export function campaignEffectText(def: CampaignDef): string {
  const parts: string[] = [];
  if (def.freeEntry) parts.push(text('ui.marketing.fx.freeEntry'));
  if (def.targetRideScore !== undefined) parts.push(text('ui.marketing.fx.rideScore', { f: fmt(def.targetRideScore) }));
  if (def.stallPricePercent !== undefined) parts.push(text('ui.marketing.fx.stallPrice', { pct: def.stallPricePercent }));
  if (def.stallWant !== undefined) parts.push(text('ui.marketing.fx.stallWant', { f: fmt(def.stallWant) }));
  if (def.temperamentShift !== undefined) {
    const n = Math.abs(def.temperamentShift);
    parts.push(text(def.temperamentShift > 0 ? 'ui.marketing.fx.leanThrill' : 'ui.marketing.fx.leanChill', { n }));
  }
  if (def.tagRideScore) parts.push(text(`ui.marketing.fx.tagScore.${def.tagRideScore.tag}`, { f: fmt(def.tagRideScore.factor) }));
  parts.push(text('ui.marketing.fx.arrivals', { f: fmt(def.arrivals) }));
  return parts.join(' · ');
}

export function runningCampaign(world: World, type: string): Campaign | undefined {
  return world.state.management.campaigns.find((c) => c.type === type);
}
