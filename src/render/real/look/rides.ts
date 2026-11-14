import type { LookCore } from './core';
import type { RealLook } from './types';

/** Rides and stalls: set `ride:<item>` (frame = animation frame and occupancy) and `stall:<item>`. */
export function makeRideGetters(core: LookCore): Pick<RealLook, 'ride' | 'stall'> {
  return {
    ride(defId, rot, frame, occupancy) {
      return core.sprite('ride', core.gameRec('ride', defId), defId, rot, ((frame & 0xffff) << 1) | (occupancy > 0 ? 1 : 0), null, null);
    },

    stall(defId, rot) {
      return core.sprite('stall', core.gameRec('stall', defId), defId, rot, 0, null, null);
    },
  };
}
