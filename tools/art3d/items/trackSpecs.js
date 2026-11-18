// The style specs of the baked track types, by type id (batch 5): each type module's SPEC (on the track kit,
// trackKit.js). Read by the card bake (cards.js) and the bake input (bakeNode.ts trackGeometry: the spec's
// straddleHalfM). A type module adds one line here.
import { SPEC as steel_coaster } from './steel_coaster.js';

export const TRACK_SPECS = { steel_coaster };

/**
 * The spec a type is measured with: its own, or, for a type whose module is not written yet, the steel coaster's (its
 * rails stand in until the type's module sets its own numbers, Tasks 6-7, 10-12, 14-15).
 */
export function trackSpecOf(type) {
  return TRACK_SPECS[type] ?? steel_coaster;
}
