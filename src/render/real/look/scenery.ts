import type { LookCore } from './core';
import type { RealLook } from './types';

/** Scenery (bench and bin included) and the soft shadows of rides, stalls and scenery. */
export function makeSceneryGetters(core: LookCore): Pick<RealLook, 'scenery' | 'shadow'> {
  return {
    scenery(defId, rot, frame) {
      return core.sprite('scenery', core.gameRec('scenery', defId), defId, rot, frame, null, null);
    },

    shadow(_kind, defId, rot) {
      return core.sprite('shadow', core.gameRec('shadow', defId), defId, rot, 0, null, null);
    },
  };
}
