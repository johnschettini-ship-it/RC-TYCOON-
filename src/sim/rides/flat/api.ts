/** Owner: W1-E. Flat ride control used by demolish (W1-C) and breakdowns (W1-H). */
import type { Ride } from '../types';
import type { World } from '../../types';

/** Stop at once: unload every rider through finishRide and empty the queue through leaveQueue. */
export function stopRide(_world: World, _ride: Ride): void {}
