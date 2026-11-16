import type { LookCore } from './core';
import type { RealLook } from './types';

/**
 * Rides and stalls: set `ride:<item>` (frame = animation frame and occupancy; `ride:<item>:...:c<colour>` for a ride in
 * a chosen colour) and `stall:<item>`.
 */
export function makeRideGetters(core: LookCore): Pick<RealLook, 'ride' | 'stall'> {
  return {
    ride(defId, rot, frame, occupancy, colour) {
      const rec = core.gameRec('ride', defId);
      let drawn = rec;
      if (rec && colour != null) {
        drawn = core.colourRec(rec, colour);
        // A ride the bake gives no base colour draws Original, listed.
        if (drawn === rec) core.noteFallback(`${rec.missId}:c${colour}`);
      }
      return core.sprite('ride', drawn, defId, rot, ((frame & 0xffff) << 1) | (occupancy > 0 ? 1 : 0), null, null);
    },

    stall(defId, rot) {
      return core.sprite('stall', core.gameRec('stall', defId), defId, rot, 0, null, null);
    },
  };
}
