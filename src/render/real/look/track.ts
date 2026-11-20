import { paletteColour } from '../../track/colours';
import { CAR_TILT_STEPS, CAR_YAW_STEPS } from '../pose';
import { carQuadrant, carSplitClass, poseClassOf, railSplitClass } from '../trackClasses';
import { getTrackTypeDef } from '../../../data/track';
import { mod, type LookCore } from './core';
import type { ItemRec, RealLook, SupportPart } from './types';

const SUPPORT_CODE: Record<SupportPart, number> = { foot: 0, seg: 1, top: 2 };

/**
 * The track type whose pose classes a car record's sets were baked with: its item (a track type id, the class split
 * by that type's pieces), or the game type when the item is not one.
 */
export function poseTypeOf(rec: ItemRec | null, trackType: string): string {
  if (!rec) return trackType;
  return getTrackTypeDef(rec.item) ? rec.item : trackType;
}

/**
 * Track rides: rails (per piece and tile), cars (per pose) and supports (foot, seg, top), all colour-tinted. Rails and
 * cars resolve their class set (batch 5 Task 2, `../trackClasses.ts`): a rail by its piece's class (or that class's
 * half, `railSplitClass`, when the art splits it), a car by its pose's
 * class and the yaw quadrant it faces in the view (`carQuadrant`: sets `car:<type>~<class>:d*:r<q>`).
 */
export function makeTrackGetters(core: LookCore): Pick<RealLook, 'rail' | 'car' | 'support' | 'railPart' | 'supportShadow'> {
  /** The pose-class type per car record (made once). */
  const poseType = new WeakMap<ItemRec, string>();
  return {
    rail(trackType, pieceId, tile, heading, colour) {
      const rec = core.gameRec('rail', trackType);
      return core.sprite('rail', rec && core.classRec(rec, railSplitClass(pieceId)), trackType, heading, tile, pieceId, paletteColour(colour));
    },

    car(trackType, yawStep, pitchStep, rollStep, full, colour) {
      const pose = (mod(yawStep, CAR_YAW_STEPS) * CAR_TILT_STEPS + mod(pitchStep, CAR_TILT_STEPS)) * CAR_TILT_STEPS + mod(rollStep, CAR_TILT_STEPS);
      const code = (pose << 1) | (full ? 1 : 0);
      const rec = core.gameRec('car', trackType);
      let cr: ItemRec | null = null;
      if (rec) {
        let t = poseType.get(rec);
        if (t === undefined) poseType.set(rec, (t = poseTypeOf(rec, trackType)));
        cr = core.classRec(rec, carSplitClass(poseClassOf(t, pose), yawStep)); // its class's yaw half, or the whole class
      }
      // Class sets are split by the quadrant of the car's view yaw (`r<q>`); a stage 1 `rall` set serves every quadrant.
      return core.sprite('car', cr, trackType, carQuadrant(yawStep), code, null, paletteColour(colour));
    },

    support(trackType, part, heading, colour) {
      return core.sprite('support', core.gameRec('support', trackType), trackType, heading, SUPPORT_CODE[part], null, paletteColour(colour));
    },

    // Untinted extras (batch 5 Tasks 4-5): a rail tile's shadow or chain trough in its rail's set, a support's shadow.
    railPart(trackType, pieceId, tile, heading, part) {
      const rec = core.gameRec('rail', trackType);
      return core.sprite('rail', rec && core.classRec(rec, railSplitClass(pieceId)), trackType, heading, tile, pieceId, null, part);
    },

    supportShadow(trackType, part, heading) {
      return core.sprite('support', core.gameRec('support', trackType), trackType, heading, SUPPORT_CODE[part] + 3, null, null);
    },
  };
}
