/** Track API for other modules. Owner: W1-G. Signatures are a contract. */
import type { CommandContext, CommandResult } from '../../commands/types';
import type { Ride } from '../types';
import type { World } from '../../types';

/** Null when the track ride may open, else the reason (phase-2 §4.6 strings). */
export function canOpenTrackRide(_world: World, _ride: Ride): string | null {
  return 'Not implemented yet';
}

/** Remove a whole track ride: pieces, gates, trains, riders (refund rule master R15). */
export function demolishTrackRide(_world: World, _ride: Ride, _ctx: CommandContext): CommandResult {
  return { ok: false, reason: 'Not implemented yet' };
}
