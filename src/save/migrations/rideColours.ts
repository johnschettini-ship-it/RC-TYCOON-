/** Ride colours the game does not offer load as Original. Loose-typed, in place, never throws. */
import { RIDE_COLOUR_CHOICES } from '../../data/catalog/flatRides';

/** Resets every bad ride colour (not a listed index, or set on a track ride) to null; returns how many. */
export function resetBadRideColours(state: unknown): number {
  if (typeof state !== 'object' || state === null) return 0;
  const rides = (state as { rides?: unknown }).rides;
  if (!Array.isArray(rides)) return 0;
  let n = 0;
  for (const r of rides) {
    if (typeof r !== 'object' || r === null) continue;
    const ride = r as { kind?: unknown; colour?: unknown };
    if (ride.colour === undefined || ride.colour === null) continue;
    const good = ride.kind === 'flat' && typeof ride.colour === 'number' && RIDE_COLOUR_CHOICES.includes(ride.colour);
    if (!good) {
      ride.colour = null;
      n++;
    }
  }
  return n;
}
