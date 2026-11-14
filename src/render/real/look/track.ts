import { paletteColour } from '../../track/colours';
import { CAR_TILT_STEPS, CAR_YAW_STEPS } from '../pose';
import { mod, type LookCore } from './core';
import type { RealLook, SupportPart } from './types';

const SUPPORT_CODE: Record<SupportPart, number> = { foot: 0, seg: 1, top: 2 };

/** Track rides: rails (per piece and tile), cars (per pose) and supports (foot, seg, top), all colour-tinted. */
export function makeTrackGetters(core: LookCore): Pick<RealLook, 'rail' | 'car' | 'support'> {
  return {
    rail(trackType, pieceId, tile, heading, colour) {
      return core.sprite('rail', core.gameRec('rail', trackType), trackType, heading, tile, pieceId, paletteColour(colour));
    },

    car(trackType, yawStep, pitchStep, rollStep, full, colour) {
      const code = (((mod(yawStep, CAR_YAW_STEPS) * CAR_TILT_STEPS + mod(pitchStep, CAR_TILT_STEPS)) * CAR_TILT_STEPS + mod(rollStep, CAR_TILT_STEPS)) << 1) | (full ? 1 : 0);
      return core.sprite('car', core.gameRec('car', trackType), trackType, core.curRot, code, null, paletteColour(colour));
    },

    support(trackType, part, heading, colour) {
      return core.sprite('support', core.gameRec('support', trackType), trackType, heading, SUPPORT_CODE[part], null, paletteColour(colour));
    },
  };
}
