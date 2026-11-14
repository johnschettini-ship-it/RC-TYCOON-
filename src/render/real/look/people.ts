import { SHIRT_COLOURS } from '../../palette';
import { mod, type LookCore } from './core';
import type { ItemRec, RealLook } from './types';

/** Guests (shirt-tinted) and staff. */
export function makePeopleGetters(core: LookCore): Pick<RealLook, 'guest' | 'staff'> {
  return {
    guest(guestId, shirt, walk, facing, sitting) {
      const body = mod(guestId, 2);
      const outfit = mod(Math.floor(guestId / 2), 4);
      const hex = SHIRT_COLOURS[mod(shirt, SHIRT_COLOURS.length)] as string;
      return core.sprite('guest', core.guestRecs[body * 4 + outfit] as ItemRec, '', core.curRot, (mod(facing, 4) << 4) | (sitting ? 15 : walk & 15), null, hex);
    },

    staff(staffType, facing, walk) {
      return core.sprite('guest', core.staffRec(staffType), '', core.curRot, (mod(facing, 4) << 4) | (walk & 15), null, null);
    },
  };
}
