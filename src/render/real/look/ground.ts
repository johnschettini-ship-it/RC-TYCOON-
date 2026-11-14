import { frameName, type LookCore } from './core';
import type { RealLook, RealSets } from './types';

/** Ground pieces by terrain, slope mask and variant; path and queue by join mask. */
export function makeGroundGetters(core: LookCore, sets: RealSets): Pick<RealLook, 'groundReady' | 'groundPiece'> {
  return {
    groundReady(terrain, slopeMask, variant, rot, join) {
      const key = core.resolveAt(core.groundRec(terrain), rot, core.density);
      if (key === undefined || sets.state(key) !== 'ready') return false;
      const rs = sets.peek ? sets.peek(key) : null;
      if (!rs) return false;
      const code = join !== undefined && (terrain === 'path' || terrain === 'queue') ? -1 - (join & 15) : (slopeMask << 2) | (variant & 3);
      const meta = core.metaOf(rs);
      let r = meta.codes.get(code);
      if (r === undefined) meta.codes.set(code, (r = core.lookup(rs, key, frameName('ground', terrain, code))));
      return typeof r !== 'string';
    },

    groundPiece(terrain, slopeMask, variant, rot, join) {
      const code = join !== undefined && (terrain === 'path' || terrain === 'queue') ? -1 - (join & 15) : (slopeMask << 2) | (variant & 3);
      return core.sprite('ground', core.groundRec(terrain), '', rot, code, null, null);
    },
  };
}
