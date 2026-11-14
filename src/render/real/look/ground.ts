import { frameName, type LookCore } from './core';
import type { RealLook, RealSets } from './types';

/** The frame code of a ground piece: path and queue by join mask, other ground by slope mask and variant. */
const groundCode = (terrain: string, slopeMask: number, variant: number, join: number | undefined): number =>
  join !== undefined && (terrain === 'path' || terrain === 'queue') ? -1 - (join & 15) : (slopeMask << 2) | (variant & 3);

/** Ground pieces by terrain, slope mask and variant; path and queue by join mask. */
export function makeGroundGetters(core: LookCore, sets: RealSets): Pick<RealLook, 'groundStandIn' | 'groundBaked' | 'groundPiece'> {
  return {
    groundBaked(terrain, rot) {
      const key = core.resolveAt(core.groundRec(terrain), rot, core.density);
      return key !== undefined && sets.state(key) !== 'failed';
    },

    groundStandIn(terrain, slopeMask, variant, rot, join) {
      const rec = core.groundRec(terrain);
      const own = core.resolveAt(rec, rot, core.density);
      for (const d of [2, 4] as const) {
        const key = core.resolveAt(rec, rot, d);
        if (key === undefined || key === own || sets.state(key) !== 'ready') continue;
        // Peeked, never used or wanted: a stand-in must not pin the other density's set (a pinned set counts in what
        // a decode must fit beside but not in the ladder's pressure, so the wanted set could starve; and the cap
        // could never free a density-4 set standing in). Safe for this frame's draw: sets are freed at endFrame.
        const rs = sets.peek ? sets.peek(key) : null;
        if (!rs) continue;
        const code = groundCode(terrain, slopeMask, variant, join);
        const meta = core.metaOf(rs);
        let r = meta.codes.get(code);
        if (r === undefined) meta.codes.set(code, (r = core.lookup(rs, key, frameName('ground', terrain, code))));
        if (typeof r !== 'string') return r.sprite;
      }
      return null;
    },

    groundPiece(terrain, slopeMask, variant, rot, join) {
      return core.sprite('ground', core.groundRec(terrain), '', rot, groundCode(terrain, slopeMask, variant, join), null, null);
    },
  };
}
