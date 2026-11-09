/**
 * Placement warnings (Phase 1 §4.1). They never block a command. Ride and stall panels call these every
 * frame to keep showing a warning until it is fixed. Owners: W1-C, W3-B (path nodes: a gate connects to the
 * path node outside it at the ride or stall height, Phase 4 §4.2).
 */
import { queueOwner } from '../../pathing';
import { gateNode, nodeKindOf, nodeTileOf, nodeZOf } from '../../paths/nodes';
import type { Ride } from '../../rides/types';
import type { Stall } from '../../stalls/types';
import type { World } from '../../types';
import { BUILD_STRINGS } from './strings';

/** The path node kind outside a gate (`inside` → `outside`), or null when no node connects there. */
function outsideKind(world: World, inside: number, outside: number): { kind: string; tile: number; z: number } | null {
  if (inside < 0 || outside < 0) return null;
  const node = gateNode(world, inside, outside);
  if (node < 0) return null;
  return { kind: nodeKindOf(world, node), tile: nodeTileOf(world, node), z: nodeZOf(world, node) };
}

/** "The entrance needs a queue path" unless the entrance node is a queue of this ride; "The exit needs a footpath" unless the exit node is a footpath. */
export function rideWarnings(world: World, ride: Ride): string[] {
  const out: string[] = [];
  const e = ride.entrance;
  const en = e ? outsideKind(world, e.gate, e.outside) : null;
  if (!en || en.kind !== 'queue' || queueOwner(world, en.tile, en.z) !== ride.id) out.push(BUILD_STRINGS.entranceNeedsQueue);
  const x = ride.exit;
  const ex = x ? outsideKind(world, x.gate, x.outside) : null;
  if (!ex || ex.kind !== 'footpath') out.push(BUILD_STRINGS.exitNeedsFootpath);
  return out;
}

/** "This stall must face a footpath" unless the service side is a footpath node. */
export function stallWarnings(world: World, stall: Stall): string[] {
  const map = world.state.map;
  const sv = outsideKind(world, stall.y * map.width + stall.x, stall.serviceTile);
  return sv && sv.kind === 'footpath' ? [] : [BUILD_STRINGS.stallNeedsFootpath];
}
