/** Footprint size helper (Phase 4 §4.5). Owner: W3-D. Re-exported from `./api.ts` (the contract location). */
import type { SceneryDef } from '../../data/catalog';
import type { Dir } from '../map';

/** Footprint size of an item at its rotation: 2 × 1 items swap sides at rotation 1 and 3. */
export function sceneryExtent(def: Pick<SceneryDef, 'w' | 'd'>, rotation: Dir): { w: number; d: number } {
  return rotation % 2 === 1 ? { w: def.d, d: def.w } : { w: def.w, d: def.d };
}
