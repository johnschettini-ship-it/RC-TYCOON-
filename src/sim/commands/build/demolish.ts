/**
 * `demolish` (Phase 1 §4.1, master R15). Owner: W1-C.
 * The result's `cost` is the signed cash change for the player: 0 for paths, −refund for rides and stalls.
 * Setup mode removes without a ledger line.
 */
import { DEMOLISH_REFUND_PERCENT, PATH_REFUND_PERCENT } from '../../../data/tuning/world';
import { recordLedger } from '../../economy/ledger';
import { forgetDestination } from '../../guests/api';
import { standUpFromBench } from '../../litter/benches';
import { Content } from '../../map';
import { clearEntityTiles, clearPathTile, forgetEntityReferences, tileAt } from '../../map-ops';
import { markNetworkDirty } from '../../pathing';
import { firstElevatedOnTile, nextElevatedOnTile } from '../../paths/nodes';
import type { ElevatedPath } from '../../paths/types';
import { stopRide } from '../../rides/flat/api';
import { demolishTrackRide } from '../../rides/track/api';
import type { Ride } from '../../rides/types';
import type { Stall } from '../../stalls/types';
import type { World } from '../../types';
import type { Cents } from '../../units';
import { fail, ok, type BuildCommand, type CommandContext, type CommandResult } from '../types';
import { elevatedPathCost, pathCost, removeElevatedPath } from './paths';
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

/** Phase 4 §4.2: remove an elevated path (paths refund 0%, master R15). Guests and staff on it re-plan. */
function demolishElevated(world: World, p: ElevatedPath, ctx: CommandContext): CommandResult {
  const map = world.state.map;
  const tile = p.y * map.width + p.x;
  const amount = refundOf(elevatedPathCost(p.kind, p.z, map.heights[tile] as number), PATH_REFUND_PERCENT);
  removeElevatedPath(world, p, (t) => standUpFromBench(world, t));
  refund(world, amount, ctx);
  markNetworkDirty(world);
  return ok(cashIn(amount));
}

/** Remove the ground path of tile `i`. A path item on an elevated path of the same tile stays. */
function clearGroundPath(world: World, i: number): void {
  const map = world.state.map;
  if (map.pathItemLevel[i] === 0) {
    clearPathTile(map, i);
    return;
  }
  map.content[i] = Content.Empty;
  map.contentRef[i] = -1;
}

/** Elevated paths on tile `i`, lowest first. */
function elevatedOn(world: World, i: number): ElevatedPath[] {
  const out: ElevatedPath[] = [];
  for (let k = firstElevatedOnTile(world, i); k >= 0; k = nextElevatedOnTile(world, k)) out.push(world.state.elevatedPaths[k] as ElevatedPath);
  return out;
}

export function demolish(world: World, cmd: Extract<BuildCommand, { type: 'demolish' }>, ctx: CommandContext): CommandResult {
  const s = world.state;
  const map = s.map;
  const i = tileAt(map, cmd.x, cmd.y);
  if (i < 0) return fail(BUILD_STRINGS.nothingToRemove);
  // Phase 4 §6: `z` picks the elevated path at that height (the ground content when `z` is the ground path's).
  if (cmd.z !== undefined) {
    const p = elevatedOn(world, i).find((e) => e.z === cmd.z);
    if (p) return demolishElevated(world, p, ctx);
    if (cmd.z !== map.heights[i]) return fail(BUILD_STRINGS.nothingToRemove);
  }
  const c = map.content[i];
  if (c === Content.ParkEntrance) return fail(BUILD_STRINGS.cannotRemoveEntrance);
  // Phase 4 §4.5: the demolish tool on a centre scenery item removes it (W3-D's handler: 50% refund).
  if (c === Content.Scenery && (map.contentRef[i] as number) >= 0) {
    return sceneryHandlers.removeScenery(world, { type: 'removeScenery', id: map.contentRef[i] as number }, ctx);
  }
  if (c === Content.Footpath || c === Content.Queue) {
    clearGroundPath(world, i);
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
  // Nothing on the ground: the top elevated path (the one the player sees) goes.
  const above = cmd.z === undefined ? elevatedOn(world, i) : [];
  if (above.length > 0) return demolishElevated(world, above[above.length - 1] as ElevatedPath, ctx);
  return fail(BUILD_STRINGS.nothingToRemove);
}
