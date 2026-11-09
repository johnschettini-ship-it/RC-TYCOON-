/**
 * Owner: W1-I. Marketing campaigns (Phase 3 §4.7): start rules and effect helpers.
 * Guests, arrivals, and stalls read the effects through these helpers and `weatherHooks`.
 */
import { EXCLUSIVE_CAMPAIGNS, getCampaignDef, type CampaignDef } from '../../data/tuning/management';
import { MANAGEMENT_ERRORS, MSG } from '../../data/strings/management';
import { getFlatRideDef, getTrackRideDef, type RideTag } from '../../data/catalog';
import { canAfford, pay, type CommandContext } from '../economy/ledger';
import { fail, ok, type CommandResult } from '../commands/types';
import type { Guest } from '../guests/types';
import type { Campaign } from '../management/types';
import { notify } from '../notifications';
import type { Ride } from '../rides/types';
import type { Stall } from '../stalls/types';
import type { World } from '../types';
import type { Cents, EntityId } from '../units';

export function isCampaignRunning(world: World, type: string): boolean {
  return world.state.management.campaigns.some((c) => c.type === type);
}

/** Running campaigns with their defs, in start order. */
function running(world: World): { c: Campaign; def: CampaignDef }[] {
  const out: { c: Campaign; def: CampaignDef }[] = [];
  for (const c of world.state.management.campaigns) {
    const def = getCampaignDef(c.type);
    if (def) out.push({ c, def });
  }
  return out;
}

function targetExists(world: World, def: CampaignDef, targetId: EntityId | undefined): boolean {
  if (targetId === undefined) return false;
  if (def.target === 'ride') return world.state.rides.some((r) => r.id === targetId);
  if (def.target === 'stall') return world.state.stalls.some((s) => s.id === targetId);
  return true;
}

export function startCampaign(world: World, type: string, targetId: EntityId | undefined, ctx: CommandContext): CommandResult {
  const def = getCampaignDef(type);
  if (!def) return fail(MANAGEMENT_ERRORS.unknownCampaign);
  if (isCampaignRunning(world, type)) return fail(MANAGEMENT_ERRORS.campaignRunning);
  for (const [a, b] of EXCLUSIVE_CAMPAIGNS) {
    const other = type === a ? b : type === b ? a : null;
    if (other !== null && isCampaignRunning(world, other)) return fail(MANAGEMENT_ERRORS.weekendsExclusive);
  }
  if (def.target !== 'park' && !targetExists(world, def, targetId)) return fail(MANAGEMENT_ERRORS.pickTarget);
  if (!canAfford(world, def.cost, ctx)) return fail(MANAGEMENT_ERRORS.notEnoughCash);
  pay(world, def.cost, 'marketing', ctx);
  world.state.management.campaigns.push({
    type,
    targetId: def.target === 'park' ? -1 : (targetId as EntityId),
    endTick: world.state.tick + def.durationTicks,
  });
  return ok(ctx.setup ? 0 : def.cost);
}

/** A ride or stall was removed: its targeted campaigns end at once with a message. No refund. */
export function endCampaignsForTarget(world: World, entityId: EntityId): void {
  const m = world.state.management;
  const keep: Campaign[] = [];
  for (const c of m.campaigns) {
    const def = getCampaignDef(c.type);
    if (def && def.target !== 'park' && c.targetId === entityId) {
      notify(world, 'marketing', MSG.campaignTargetRemoved, { params: { campaign: def.name } });
    } else keep.push(c);
  }
  m.campaigns = keep;
}

// ---------------------------------------------------------------- effects

/** Entrance fee charged to arriving guests (Open Gate Day: $0). */
export function effectiveEntranceFee(world: World): Cents {
  for (const { def } of running(world)) if (def.freeEntry) return 0;
  return world.state.park.entranceFee;
}

/** Price a guest pays at this stall (Snack Deal: 50%, floored). Stock cost does not change. */
export function campaignStallPrice(world: World, stall: Stall): Cents {
  let price = stall.price;
  for (const { c, def } of running(world)) {
    if (def.stallPricePercent !== undefined && c.targetId === stall.id) price = Math.floor((price * def.stallPricePercent) / 100);
  }
  return price;
}

/** Want-chance multiplier at this stall from campaigns (Snack Deal: ×1.5). */
export function campaignStallWant(world: World, stall: Stall): number {
  let f = 1;
  for (const { c, def } of running(world)) if (def.stallWant !== undefined && c.targetId === stall.id) f *= def.stallWant;
  return f;
}

export function rideTag(ride: Ride): RideTag | undefined {
  return ride.kind === 'track' ? getTrackRideDef(ride.defId)?.tag : getFlatRideDef(ride.defId)?.tag;
}

/** Ride score multiplier from campaigns (Ride Spotlight ×1.6, weekends ×1.2 by tag). */
export function campaignRideScoreFactor(world: World, _guest: Guest, ride: Ride): number {
  let f = 1;
  let tag: RideTag | undefined;
  let tagKnown = false;
  for (const { c, def } of running(world)) {
    if (def.targetRideScore !== undefined && c.targetId === ride.id) f *= def.targetRideScore;
    if (def.tagRideScore) {
      if (!tagKnown) {
        tag = rideTag(ride);
        tagKnown = true;
      }
      if (tag === def.tagRideScore.tag) f *= def.tagRideScore.factor;
    }
  }
  return f;
}

/** Temperament for a new guest (Thrill Weekend +20, Chill Weekend −20, clamped to 0–100). */
export function arrivalTemperament(world: World, temperament: number): number {
  let t = temperament;
  for (const { def } of running(world)) if (def.temperamentShift !== undefined) t += def.temperamentShift;
  return Math.max(0, Math.min(100, t));
}
