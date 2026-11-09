/**
 * Spooky rides (catalog flag `spooky`: Haunted Manor, Ghost Train) for the After Dark bonus and the Boo costume
 * (Phase 4 §4.7, catalog §5). Owner: W3-F. Distances are Chebyshev tile distances, like `spookyItemsNear` (W3-D).
 */
import { getFlatRideDef, getTrackRideDef } from '../../data/catalog';
import { extent } from '../footprint';
import { pieceWorldTiles } from '../rides/track/geometry';
import type { Ride } from '../rides/types';
import type { World } from '../types';

/** Catalog id of a ride's type: the flat ride def, or the track type. */
function rideTypeId(world: World, ride: Ride): string {
  if (ride.kind === 'flat') return ride.defId;
  return world.state.track.rides[String(ride.id)]?.typeId ?? ride.defId;
}

/** The ride's catalog definition has the `spooky` flag. */
export function isSpookyRide(world: World, ride: Ride): boolean {
  const id = rideTypeId(world, ride);
  return (ride.kind === 'flat' ? getFlatRideDef(id)?.flags.spooky : getTrackRideDef(id)?.flags.spooky) === true;
}

/** The tile the spooky-scenery count is taken around: the footprint centre (flat) or the station origin (track). */
export function spookyRideCentre(world: World, ride: Ride): number {
  const map = world.state.map;
  let x = ride.x;
  let y = ride.y;
  if (ride.kind === 'flat') {
    const def = getFlatRideDef(ride.defId);
    if (def) {
      const { ex, ey } = extent(def.w, def.d, ride.rotation);
      x += Math.floor(ex / 2);
      y += Math.floor(ey / 2);
    }
  }
  x = Math.max(0, Math.min(map.width - 1, x));
  y = Math.max(0, Math.min(map.height - 1, y));
  return y * map.width + x;
}

function cheb(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Chebyshev distance from (px, py) to the nearest tile of a spooky ride (footprint or track tiles). */
function distanceTo(world: World, ride: Ride, px: number, py: number, limit: number): number {
  if (ride.kind === 'flat') {
    const def = getFlatRideDef(ride.defId);
    const { ex, ey } = def ? extent(def.w, def.d, ride.rotation) : { ex: 1, ey: 1 };
    const dx = px < ride.x ? ride.x - px : px >= ride.x + ex ? px - (ride.x + ex - 1) : 0;
    const dy = py < ride.y ? ride.y - py : py >= ride.y + ey ? py - (ride.y + ey - 1) : 0;
    return Math.max(dx, dy);
  }
  const data = world.state.track.rides[String(ride.id)];
  if (!data || data.pieces.length === 0) return cheb(px, py, ride.x, ride.y);
  let best = Infinity;
  for (const p of data.pieces) {
    const d = cheb(px, py, p.x, p.y);
    // Pieces span at most a few tiles from their entry tile: check the exact tiles only when one could be in range.
    if (d <= limit) return d;
    if (d <= limit + 4) {
      for (const t of pieceWorldTiles(p)) {
        const dt = cheb(px, py, t.x, t.y);
        if (dt < best) best = dt;
      }
    } else if (d < best) {
      best = d;
    }
  }
  return best;
}

/** A spooky ride (any status) has a tile within Chebyshev distance `radius` of `tile`. */
export function spookyRideWithin(world: World, tile: number, radius: number): boolean {
  const map = world.state.map;
  if (tile < 0 || tile >= map.width * map.height) return false;
  const px = tile % map.width;
  const py = (tile - px) / map.width;
  for (const ride of world.state.rides) {
    if (!isSpookyRide(world, ride)) continue;
    if (distanceTo(world, ride, px, py, radius) <= radius) return true;
  }
  return false;
}
