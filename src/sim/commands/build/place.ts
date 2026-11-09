/**
 * `placeRide` and `placeStall` (Phase 1 §4.1). Owner: W1-C.
 * Validation order: content type, research lock, rotation, land, obstacles, cash. Nothing changes on failure.
 * Warnings (no queue at the entrance, no footpath at the exit or service side) never block.
 */
import { getFlatRideDef, getStallDef } from '../../../data/catalog';
import { canAfford, pay } from '../../economy/ledger';
import { flatRideGates, footprintTiles, stallServiceTile } from '../../footprint';
import { allocId } from '../../ids';
import { Content, isOwned, type Dir } from '../../map';
import { insertById, tileAt } from '../../map-ops';
import { markNetworkDirty } from '../../pathing';
import { isUnlocked } from '../../research/api';
import type { Ride } from '../../rides/types';
import type { Stall } from '../../stalls/types';
import type { World } from '../../types';
import { fail, ok, type BuildCommand, type CommandContext, type CommandResult } from '../types';
import { BUILD_STRINGS } from './strings';
import { rideWarnings, stallWarnings } from './warnings';

function isDir(r: unknown): r is Dir {
  return r === 0 || r === 1 || r === 2 || r === 3;
}

/** Land, then obstacles. Null when every tile is owned and empty. */
function checkSite(world: World, tiles: number[] | null): string | null {
  const map = world.state.map;
  if (!tiles) return BUILD_STRINGS.notOwned;
  for (const i of tiles) if (!isOwned(map, i)) return BUILD_STRINGS.notOwned;
  for (const i of tiles) if (map.content[i] !== Content.Empty) return BUILD_STRINGS.inTheWay;
  return null;
}

export function placeRide(world: World, cmd: Extract<BuildCommand, { type: 'placeRide' }>, ctx: CommandContext): CommandResult {
  const def = getFlatRideDef(cmd.defId);
  if (!def) return fail(BUILD_STRINGS.unknownRide);
  if (!isUnlocked(world, def.id)) return fail(BUILD_STRINGS.notUnlocked);
  if (!isDir(cmd.rotation)) return fail(BUILD_STRINGS.badRotation);
  const s = world.state;
  const map = s.map;
  const okCoords = Number.isInteger(cmd.x) && Number.isInteger(cmd.y);
  const tiles = okCoords ? footprintTiles(map, cmd.x, cmd.y, def.w, def.d, cmd.rotation) : null;
  const blocked = checkSite(world, tiles);
  if (blocked) return fail(blocked);
  const cost = def.buildCost;
  if (!canAfford(world, cost, ctx)) return fail(BUILD_STRINGS.notEnoughCash);

  const id = allocId(s);
  for (const i of tiles as number[]) {
    map.content[i] = Content.Building;
    map.contentRef[i] = id;
  }
  const gates = flatRideGates(map, cmd.x, cmd.y, def.w, def.d, cmd.rotation);
  const ride: Ride = {
    id,
    kind: 'flat',
    defId: def.id,
    name: def.name,
    x: cmd.x,
    y: cmd.y,
    rotation: cmd.rotation,
    status: 'closed',
    price: def.defaultPrice,
    entrance: gates.entrance,
    exit: gates.exit,
    stats: { excitement: def.excitement, intensity: def.intensity, nausea: def.nausea },
    queue: [],
    riders: [],
    cycle: { phase: 'waiting', ticks: 0 },
    totals: { riders: 0, income: 0, ridersThisMonth: 0, incomeThisMonth: 0 },
    builtTick: s.tick,
    hoursThisMonth: 0,
    reliability: 100,
    lastInspectionTick: s.tick,
    /** 0 = the Phase 3 default interval. */
    inspectionIntervalTicks: 0,
    breakdownType: null,
    statusBeforeBreakdown: null,
    breakdownsThisMonth: 0,
    lastBreakdownTick: -1,
    assignedMechanicId: null,
    totalBuildCost: cost,
  };
  insertById(s.rides, ride);
  pay(world, cost, 'construction', ctx);
  markNetworkDirty(world);
  return ok(cost, rideWarnings(world, ride), id);
}

export function placeStall(world: World, cmd: Extract<BuildCommand, { type: 'placeStall' }>, ctx: CommandContext): CommandResult {
  const def = getStallDef(cmd.defId);
  if (!def) return fail(BUILD_STRINGS.unknownStall);
  if (!isUnlocked(world, def.id)) return fail(BUILD_STRINGS.notUnlocked);
  if (!isDir(cmd.rotation)) return fail(BUILD_STRINGS.badRotation);
  const s = world.state;
  const map = s.map;
  const i = tileAt(map, cmd.x, cmd.y);
  const blocked = checkSite(world, i < 0 ? null : [i]);
  if (blocked) return fail(blocked);
  const cost = def.buildCost;
  if (!canAfford(world, cost, ctx)) return fail(BUILD_STRINGS.notEnoughCash);

  const id = allocId(s);
  map.content[i] = Content.Building;
  map.contentRef[i] = id;
  const stall: Stall = {
    id,
    defId: def.id,
    name: def.name,
    x: cmd.x,
    y: cmd.y,
    rotation: cmd.rotation,
    serviceTile: stallServiceTile(map, cmd.x, cmd.y, cmd.rotation),
    price: def.defaultPrice,
    open: true,
    servingGuest: -1,
    totals: { sales: 0, income: 0, salesThisMonth: 0, incomeThisMonth: 0 },
    builtTick: s.tick,
    hoursThisMonth: 0,
    totalBuildCost: cost,
  };
  insertById(s.stalls, stall);
  pay(world, cost, 'construction', ctx);
  markNetworkDirty(world);
  return ok(cost, stallWarnings(world, stall), id);
}
