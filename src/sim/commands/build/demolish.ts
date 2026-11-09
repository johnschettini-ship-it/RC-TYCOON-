/**
 * `demolish` (Phase 1 §4.1, master R15). Owner: W1-C.
 * The result's `cost` is the signed cash change for the player: 0 for paths, −refund for rides and stalls.
 * Setup mode removes without a ledger line.
 */
import { DEMOLISH_REFUND_PERCENT, PATH_REFUND_PERCENT } from '../../../data/tuning/world';
import { recordLedger } from '../../economy/ledger';
import { forgetDestination } from '../../guests/api';
import { Content } from '../../map';
import { clearEntityTiles, clearPathTile, forgetEntityReferences, tileAt } from '../../map-ops';
import { markNetworkDirty } from '../../pathing';
import { stopRide } from '../../rides/flat/api';
import { demolishTrackRide } from '../../rides/track/api';
import type { Ride } from '../../rides/types';
import type { Stall } from '../../stalls/types';
import type { World } from '../../types';
import type { Cents } from '../../units';
import { fail, ok, type BuildCommand, type CommandContext, type CommandResult } from '../types';
import { pathCost } from './paths';
import { BUILD_STRINGS } from './strings';
import { sceneryHandlers } from '../../scenery/commands';

export function refundOf(buildCost: Cents, percent: number): Cents {
  return Math.max(0, Math.floor((buildCost * percent) / 100));
}

/** A refund as a command cost (negative = cash in), never −0. */
function cashIn(amount: Cents): Cents {
  return amount === 0 ? 0 : -amount;
}

function refund(world: World, amount: Cents, ctx: CommandContext): void {
  if (!ctx.setup && amount > 0) recordLedger(world, 'demolitionRefunds', amount);
}

/** Riders and queue leave through `stopRide` while the ride still exists; guests re-plan once it is gone. */
function demolishFlatRide(world: World, ride: Ride, ctx: CommandContext): CommandResult {
  const s = world.state;
  stopRide(world, ride);
  clearEntityTiles(s.map, ride.id);
  const k = s.rides.indexOf(ride);
  if (k >= 0) s.rides.splice(k, 1);
  forgetEntityReferences(world, ride.id);
  const amount = refundOf(ride.totalBuildCost, DEMOLISH_REFUND_PERCENT);
  refund(world, amount, ctx);
  markNetworkDirty(world);
  forgetDestination(world, `ride:${ride.id}`);
  return ok(cashIn(amount));
}

function demolishStall(world: World, stall: Stall, ctx: CommandContext): CommandResult {
  const s = world.state;
  clearEntityTiles(s.map, stall.id);
  const k = s.stalls.indexOf(stall);
  if (k >= 0) s.stalls.splice(k, 1);
  forgetEntityReferences(world, stall.id);
  const amount = refundOf(stall.totalBuildCost, DEMOLISH_REFUND_PERCENT);
  refund(world, amount, ctx);
  markNetworkDirty(world);
  forgetDestination(world, `stall:${stall.id}`);
  return ok(cashIn(amount));
}

/** Track rides belong to W1-G (refund rule master R15: 100% if never opened). */
function demolishTrack(world: World, ride: Ride, ctx: CommandContext): CommandResult {
  const r = demolishTrackRide(world, ride, ctx);
  if (!r.ok) return r;
  if (!world.state.rides.some((x) => x.id === ride.id)) forgetEntityReferences(world, ride.id);
  markNetworkDirty(world);
  forgetDestination(world, `ride:${ride.id}`);
  return r;
}

export function demolish(world: World, cmd: Extract<BuildCommand, { type: 'demolish' }>, ctx: CommandContext): CommandResult {
  const s = world.state;
  const map = s.map;
  const i = tileAt(map, cmd.x, cmd.y);
  if (i < 0) return fail(BUILD_STRINGS.nothingToRemove);
  const c = map.content[i];
  if (c === Content.ParkEntrance) return fail(BUILD_STRINGS.cannotRemoveEntrance);
  // Phase 4 §4.5: the demolish tool on a centre scenery item removes it (W3-D's handler: 50% refund).
  if (c === Content.Scenery && (map.contentRef[i] as number) >= 0) {
    return sceneryHandlers.removeScenery(world, { type: 'removeScenery', id: map.contentRef[i] as number }, ctx);
  }
  if (c === Content.Footpath || c === Content.Queue) {
    clearPathTile(map, i);
    const amount = refundOf(pathCost(c === Content.Queue ? 'queue' : 'footpath'), PATH_REFUND_PERCENT);
    refund(world, amount, ctx);
    markNetworkDirty(world);
    return ok(cashIn(amount));
  }
  if (c === Content.Building || c === Content.Track) {
    const id = map.contentRef[i] as number;
    const ride = s.rides.find((r) => r.id === id);
    if (ride) return ride.kind === 'track' ? demolishTrack(world, ride, ctx) : demolishFlatRide(world, ride, ctx);
    const stall = s.stalls.find((st) => st.id === id);
    if (stall) return demolishStall(world, stall, ctx);
  }
  return fail(BUILD_STRINGS.nothingToRemove);
}
