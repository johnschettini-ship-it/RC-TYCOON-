/**
 * Placement warnings (Phase 1 §4.1). They never block a command. Ride and stall panels call these every
 * frame to keep showing a warning until it is fixed. Owner: W1-C.
 */
import { Content } from '../../map';
import { queueOwner } from '../../pathing';
import type { Ride } from '../../rides/types';
import type { Stall } from '../../stalls/types';
import type { World } from '../../types';
import { BUILD_STRINGS } from './strings';

/** "The entrance needs a queue path" unless the entrance outside tile is a queue of this ride; "The exit needs a footpath" unless the exit outside tile is a footpath. */
export function rideWarnings(world: World, ride: Ride): string[] {
  const content = world.state.map.content;
  const out: string[] = [];
  const e = ride.entrance;
  if (!e || e.outside < 0 || content[e.outside] !== Content.Queue || queueOwner(world, e.outside) !== ride.id) {
    out.push(BUILD_STRINGS.entranceNeedsQueue);
  }
  const x = ride.exit;
  if (!x || x.outside < 0 || content[x.outside] !== Content.Footpath) out.push(BUILD_STRINGS.exitNeedsFootpath);
  return out;
}

/** "This stall must face a footpath" unless the service tile is a footpath. */
export function stallWarnings(world: World, stall: Stall): string[] {
  const t = stall.serviceTile;
  return t >= 0 && world.state.map.content[t] === Content.Footpath ? [] : [BUILD_STRINGS.stallNeedsFootpath];
}
